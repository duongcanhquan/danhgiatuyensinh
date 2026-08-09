import { useEffect, useMemo, useState } from 'react'
import {
  collection,
  getDocs,
  limit,
  orderBy,
  query,
  where,
  Timestamp,
  type QueryConstraint,
} from 'firebase/firestore'
import type { OmicallCallRecord } from '../types'
import { FS_COLLECTIONS } from '../types'
import { getFirestoreDb, isFirebaseConfigured } from '../services/firebase'
import { fetchOmicallCallsViaFunction } from '../services/fetchOmicallCallsViaFunction'
import { mapOmicallCallDoc, tsMsCall } from '../utils/omicallCallMap'
import { firestoreDatabaseMismatchHint } from '../utils/firestoreDatabaseHint'

export type OmicallCallsScope =
  | { mode: 'counselor'; counselorUid: string }
  /** `counselorUids`: roster nhóm — bù khi doc gọi thiếu teamLeadUid. */
  | { mode: 'team'; teamLeadUid: string; counselorUids?: string[] }
  | { mode: 'global' }

export type UseOmicallCallsOpts = {
  scope: OmicallCallsScope
  from: Date
  to: Date
  maxRows?: number
  /** Máy lẻ OMICall của người xem — bù khi doc chưa có counselorUid. */
  viewerSipUser?: string
  /** Lọc theo trường (client) khi doc đã có orgId. */
  orgId?: string
}

const CHUNK_DAYS = 7
/** Mỗi tuần một lần đọc — giữ vừa để không vượt trần khi kỳ dài. */
const CHUNK_QUERY_LIMIT = 600

type DateField = 'endedAt' | 'startedAt'
type FallbackSource = 'none' | 'interactions'

function isMissingIndexError(e: unknown): boolean {
  if (!(e instanceof Error)) return false
  return e.message.includes('requires an index') || e.message.includes('FAILED_PRECONDITION')
}

function isPermissionError(e: unknown): boolean {
  if (!(e instanceof Error)) return false
  const m = e.message.toLowerCase()
  return m.includes('permission') || m.includes('insufficient')
}

function userFacingLoadError(e: unknown): string {
  if (isPermissionError(e)) {
    return 'Bạn chưa có quyền xem lịch sử gọi toàn hệ thống. Liên hệ quản trị nếu cần xem nhóm hoặc toàn trường.'
  }
  if (isMissingIndexError(e)) {
    return 'Hệ thống chưa sẵn sàng hiển thị lịch sử gọi theo kỳ. Vui lòng báo quản trị viên chạy deploy index Firestore (database warmlist).'
  }
  if (e instanceof Error) return e.message || 'Không đọc được lịch sử cuộc gọi.'
  return 'Không đọc được lịch sử cuộc gọi.'
}

type OmicallServerScopeFilter =
  | { kind: 'none' }
  | { kind: 'counselor'; counselorUid: string }
  | { kind: 'team'; teamLeadUid: string }

function callMatchesServerScopeFilter(
  c: OmicallCallRecord,
  scopeFilter: OmicallServerScopeFilter,
): boolean {
  if (scopeFilter.kind === 'none') return true
  if (scopeFilter.kind === 'counselor') return c.counselorUid === scopeFilter.counselorUid
  return c.teamLeadUid === scopeFilter.teamLeadUid
}

function filterCallsByScope(
  calls: OmicallCallRecord[],
  scope: OmicallCallsScope,
  viewerSipUser?: string,
): OmicallCallRecord[] {
  if (scope.mode === 'global') return calls

  if (scope.mode === 'counselor') {
    const sip = viewerSipUser?.trim()
    const uid = scope.counselorUid
    return calls.flatMap((c) => {
      if (c.counselorUid === uid) return [c]
      // Gọi chỉ có SIP (thiếu counselorUid) → gắn TVV đang xem để KPI đếm được.
      if (!c.counselorUid && sip && c.sipUser?.trim() === sip) {
        return [{ ...c, counselorUid: uid }]
      }
      return []
    })
  }

  const roster = new Set((scope.counselorUids ?? []).map(String).filter(Boolean))
  roster.add(scope.teamLeadUid)
  return calls.filter((c) => {
    if (c.teamLeadUid === scope.teamLeadUid) return true
    if (c.counselorUid && roster.has(c.counselorUid)) return true
    return false
  })
}

function callInDateRange(c: OmicallCallRecord, fromMs: number, toMs: number): boolean {
  const ms = tsMsCall(c.endedAt ?? c.startedAt ?? c.createdAt)
  if (!ms) return false
  return ms >= fromMs && ms <= toMs
}

/** Bỏ event webhook dở (ringing) không có thời lượng — tránh làm nhiễu báo cáo. */
function isDisplayableCall(c: OmicallCallRecord): boolean {
  if (c.isFinal === false && !c.endedAt && (c.billSeconds ?? 0) === 0 && (c.answerSeconds ?? 0) === 0) {
    return false
  }
  return true
}

function dateRangeConstraints(
  field: DateField,
  fromTs: Timestamp,
  toTs: Timestamp,
  limitN: number,
  scopeFilter: OmicallServerScopeFilter,
): QueryConstraint[] {
  const parts: QueryConstraint[] = []
  if (scopeFilter.kind === 'counselor') {
    parts.push(where('counselorUid', '==', scopeFilter.counselorUid))
  } else if (scopeFilter.kind === 'team') {
    parts.push(where('teamLeadUid', '==', scopeFilter.teamLeadUid))
  }
  parts.push(where(field, '>=', fromTs), where(field, '<=', toTs), orderBy(field, 'desc'), limit(limitN))
  return parts
}

async function runOmicallQuery(
  db: NonNullable<ReturnType<typeof getFirestoreDb>>,
  constraints: QueryConstraint[],
): Promise<OmicallCallRecord[]> {
  const q = query(collection(db, FS_COLLECTIONS.omicallCalls), ...constraints)
  const snap = await getDocs(q)
  const rows: OmicallCallRecord[] = []
  snap.forEach((d) => rows.push(mapOmicallCallDoc(d.id, d.data() as Record<string, unknown>)))
  return rows
}

async function fetchChunkByField(
  db: NonNullable<ReturnType<typeof getFirestoreDb>>,
  field: DateField,
  fromTs: Timestamp,
  toTs: Timestamp,
  scopeFilter: OmicallServerScopeFilter,
): Promise<{ rows: OmicallCallRecord[]; hitLimit: boolean; indexMissing: boolean }> {
  try {
    const batch = await runOmicallQuery(
      db,
      dateRangeConstraints(field, fromTs, toTs, CHUNK_QUERY_LIMIT, scopeFilter),
    )
    return { rows: batch, hitLimit: batch.length >= CHUNK_QUERY_LIMIT, indexMissing: false }
  } catch (e) {
    if (isMissingIndexError(e)) return { rows: [], hitLimit: false, indexMissing: true }
    throw e
  }
}

/** Tải theo từng đoạn ngày — `endedAt` + `startedAt` (bù doc thiếu giờ kết thúc). */
async function fetchCallsByDateChunks(
  db: NonNullable<ReturnType<typeof getFirestoreDb>>,
  fromTs: Timestamp,
  toTs: Timestamp,
  cap: number,
  scopeFilter: OmicallServerScopeFilter = { kind: 'none' },
): Promise<{ rows: OmicallCallRecord[]; truncated: boolean; startedAtFallback: boolean }> {
  const fromMs = fromTs.toMillis()
  const toMs = toTs.toMillis()
  if (fromMs > toMs) return { rows: [], truncated: false, startedAtFallback: false }

  const chunkMs = CHUNK_DAYS * 86400000
  const merged = new Map<string, OmicallCallRecord>()
  let truncated = false
  let startedAtFallback = false
  let startedAtIndexMissing = false

  for (let start = fromMs; start <= toMs && merged.size < cap; start += chunkMs) {
    const end = Math.min(start + chunkMs - 1, toMs)
    const chunkFrom = Timestamp.fromMillis(start)
    const chunkTo = Timestamp.fromMillis(end)

    const ended = await fetchChunkByField(db, 'endedAt', chunkFrom, chunkTo, scopeFilter)
    if (ended.hitLimit) truncated = true
    for (const row of ended.rows) {
      if (!callInDateRange(row, fromMs, toMs) || !isDisplayableCall(row)) continue
      merged.set(row.id, row)
      if (merged.size >= cap) {
        truncated = true
        break
      }
    }
    if (merged.size >= cap) break

    // startedAt + counselorUid/teamLeadUid có thể thiếu composite index → bỏ qua nếu lỗi.
    const started = await fetchChunkByField(db, 'startedAt', chunkFrom, chunkTo, scopeFilter)
    if (started.indexMissing && scopeFilter.kind !== 'none') {
      const startedGlobal = await fetchChunkByField(db, 'startedAt', chunkFrom, chunkTo, { kind: 'none' })
      if (startedGlobal.indexMissing) startedAtIndexMissing = true
      else if (startedGlobal.rows.length > 0) startedAtFallback = true
      if (startedGlobal.hitLimit) truncated = true
      for (const row of startedGlobal.rows) {
        if (merged.has(row.id)) continue
        if (!callMatchesServerScopeFilter(row, scopeFilter)) continue
        if (!callInDateRange(row, fromMs, toMs) || !isDisplayableCall(row)) continue
        merged.set(row.id, row)
        if (merged.size >= cap) {
          truncated = true
          break
        }
      }
    } else {
      if (started.indexMissing) startedAtIndexMissing = true
      else if (started.rows.length > 0) startedAtFallback = true
      if (started.hitLimit) truncated = true
      for (const row of started.rows) {
        if (merged.has(row.id)) continue
        if (!callInDateRange(row, fromMs, toMs) || !isDisplayableCall(row)) continue
        merged.set(row.id, row)
        if (merged.size >= cap) {
          truncated = true
          break
        }
      }
    }
  }

  if (startedAtIndexMissing && merged.size === 0 && !startedAtFallback) {
    startedAtFallback = false
  }

  const rows = [...merged.values()].sort(
    (a, b) => tsMsCall(b.endedAt ?? b.startedAt ?? b.createdAt) - tsMsCall(a.endedAt ?? a.startedAt ?? a.createdAt),
  )
  return { rows: rows.slice(0, cap), truncated, startedAtFallback }
}

export function useOmicallCalls({
  scope,
  from,
  to,
  maxRows = 500,
  viewerSipUser,
  orgId,
}: UseOmicallCallsOpts) {
  const [calls, setCalls] = useState<OmicallCallRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const fromMs = from.getTime()
  const toMs = to.getTime()
  const fromTs = useMemo(() => Timestamp.fromDate(new Date(fromMs)), [fromMs])
  const toTs = useMemo(() => Timestamp.fromDate(new Date(toMs)), [toMs])
  const orgFilter = orgId?.trim() || ''

  useEffect(() => {
    const db = getFirestoreDb()
    if (!db || !isFirebaseConfigured()) {
      setCalls([])
      setLoading(false)
      setError('Chưa cấu hình Firebase.')
      setNotice(null)
      return
    }

    if (scope.mode === 'counselor' && !scope.counselorUid.trim()) {
      setCalls([])
      setLoading(false)
      setError('Chưa chọn tư vấn viên.')
      setNotice(null)
      return
    }

    if (scope.mode === 'team' && !scope.teamLeadUid.trim()) {
      setCalls([])
      setLoading(false)
      setError('Chưa xác định trưởng nhóm.')
      setNotice(null)
      return
    }

    let cancelled = false
    setLoading(true)
    setError(null)
    setNotice(null)

    const fetchCap =
      scope.mode === 'global'
        ? Math.min(Math.max(maxRows * 2, maxRows), 1200)
        : Math.min(Math.max(maxRows * 2, maxRows), 1000)

    const scopeFilter: OmicallServerScopeFilter =
      scope.mode === 'counselor'
        ? { kind: 'counselor', counselorUid: scope.counselorUid }
        : scope.mode === 'team'
          ? { kind: 'team', teamLeadUid: scope.teamLeadUid }
          : { kind: 'none' }

    const applyOrgFilter = (rows: OmicallCallRecord[]) => {
      if (!orgFilter) return rows
      return rows.filter((c) => !c.orgId || c.orgId === orgFilter)
    }

    ;(async () => {
      try {
        let raw: OmicallCallRecord[] = []
        let truncatedOut = false
        let startedAtFallbackOut = false
        let fallbackSource: FallbackSource = 'none'
        let serverFallbackError: string | null = null
        let serverFallbackWarning: string | null = null
        let serverFallbackUsed = false

        const serverScope =
          scope.mode === 'global'
            ? ({ mode: 'global' } as const)
            : scope.mode === 'team'
              ? ({
                  mode: 'team',
                  teamLeadUid: scope.teamLeadUid,
                  counselorUids: scope.counselorUids,
                } as const)
              : ({ mode: 'counselor', counselorUid: scope.counselorUid } as const)

        // Admin global: ưu tiên CF (một round-trip) trước khi quét chunk trên client.
        if (scope.mode === 'global') {
          try {
            const serverRes = await fetchOmicallCallsViaFunction({
              fromMs: fromTs.toMillis(),
              toMs: toTs.toMillis(),
              maxRows,
              scope: serverScope,
            })
            if (serverRes.calls.length > 0) {
              raw = applyOrgFilter(serverRes.calls)
              serverFallbackUsed = true
              fallbackSource = serverRes.source === 'interactions_fallback' ? 'interactions' : 'none'
            } else if (serverRes.warning) {
              serverFallbackWarning = serverRes.warning
            }
          } catch (e) {
            serverFallbackError =
              e instanceof Error ? e.message : 'Không gọi được Cloud Function fetchOmicallCallsForClient.'
          }
        }

        if (raw.length === 0) {
          const { rows: rawPrimary, truncated, startedAtFallback } = await fetchCallsByDateChunks(
            db,
            fromTs,
            toTs,
            fetchCap,
            scopeFilter,
          )
          if (cancelled) return
          raw = applyOrgFilter(rawPrimary)
          truncatedOut = truncated
          startedAtFallbackOut = startedAtFallback

          // Nhóm: doc thiếu teamLeadUid → query theo teamLeadUid trống; quét rộng rồi lọc roster.
          if (
            raw.length === 0 &&
            scope.mode === 'team' &&
            (scope.counselorUids?.length ?? 0) > 0
          ) {
            const fill = await fetchCallsByDateChunks(db, fromTs, toTs, fetchCap, { kind: 'none' })
            if (fill.truncated) truncatedOut = true
            if (fill.startedAtFallback) startedAtFallbackOut = true
            raw = applyOrgFilter(fill.rows)
          }
        }

        // Doc cũ có thể chỉ có sipUser, chưa gắn counselorUid — bù nhẹ theo SIP (trần thấp).
        const sip = viewerSipUser?.trim()
        if (scope.mode === 'counselor' && sip && raw.length < maxRows) {
          const sipCap = Math.min(300, fetchCap)
          const sipFill = await fetchCallsByDateChunks(db, fromTs, toTs, sipCap, { kind: 'none' })
          if (sipFill.truncated) truncatedOut = true
          if (sipFill.startedAtFallback) startedAtFallbackOut = true
          const seen = new Set(raw.map((r) => r.id))
          for (const row of applyOrgFilter(sipFill.rows)) {
            if (seen.has(row.id)) continue
            if (row.counselorUid) continue
            if (row.sipUser?.trim() !== sip) continue
            raw.push(row)
            seen.add(row.id)
            if (raw.length >= fetchCap) {
              truncatedOut = true
              break
            }
          }
        }

        // Khi client trống (không phải global đã thử CF): nhờ Cloud Function.
        if (raw.length === 0 && scope.mode !== 'global') {
          try {
            const serverRes = await fetchOmicallCallsViaFunction({
              fromMs: fromTs.toMillis(),
              toMs: toTs.toMillis(),
              maxRows,
              scope: serverScope,
            })
            if (serverRes.calls.length > 0) {
              raw = applyOrgFilter(serverRes.calls)
              serverFallbackUsed = true
              fallbackSource = serverRes.source === 'interactions_fallback' ? 'interactions' : 'none'
            } else if (serverRes.warning) {
              serverFallbackWarning = serverRes.warning
            }
          } catch (e) {
            serverFallbackError =
              e instanceof Error ? e.message : 'Không gọi được Cloud Function fetchOmicallCallsForClient.'
          }
        }

        const scoped = filterCallsByScope(raw, scope, viewerSipUser)
        scoped.sort(
          (a, b) =>
            tsMsCall(b.endedAt ?? b.startedAt ?? b.createdAt) - tsMsCall(a.endedAt ?? a.startedAt ?? a.createdAt),
        )
        const visible = scoped.slice(0, maxRows)

        setCalls(visible)

        const notices: string[] = []
        const dbHint = firestoreDatabaseMismatchHint()
        if (dbHint && raw.length === 0) notices.push(dbHint)
        if (truncatedOut) {
          notices.push(
            `Đã tải tối đa ${fetchCap.toLocaleString('vi-VN')} cuộc trong kỳ — thu hẹp khoảng ngày nếu thiếu cuộc cũ.`,
          )
        }
        if (startedAtFallbackOut) {
          notices.push('Đã bù thêm cuộc gọi theo giờ bắt đầu (một số bản ghi chưa có giờ kết thúc).')
        }
        if (scope.mode !== 'global' && raw.length > 0 && scoped.length === 0) {
          notices.push(
            'Có cuộc gọi trong kỳ nhưng chưa gắn đúng TVV/nhóm — hãy gọi từ nút OMICall trên hồ sơ để hệ thống tự đồng bộ đúng phạm vi.',
          )
        }
        if (scope.mode !== 'global' && scoped.length < raw.length && scoped.length > 0) {
          notices.push(
            `Hiển thị ${visible.length.toLocaleString('vi-VN')} cuộc thuộc phạm vi đã chọn (đã lọc từ ${raw.length.toLocaleString('vi-VN')} cuộc trong kỳ).`,
          )
        }
        if (fallbackSource === 'interactions') {
          notices.push(
            'Dữ liệu cuộc gọi lấy từ dòng thời gian hồ sơ (tương tác OMICall) — cùng nguồn với tab hoạt động khi bạn gọi từ hồ sơ tư vấn.',
          )
        } else if (serverFallbackUsed) {
          notices.push('Đang hiển thị dữ liệu cuộc gọi qua Cloud Function (đồng bộ từ Firestore warmlist).')
        } else if (serverFallbackError) {
          notices.push(`Không tải được lịch sử gọi từ server: ${serverFallbackError}`)
        } else if (serverFallbackWarning) {
          notices.push(serverFallbackWarning)
        }
        if (raw.length === 0 && !dbHint && !serverFallbackError && !serverFallbackWarning) {
          notices.push(
            'Nếu vừa gọi xong, hệ thống sẽ tự cập nhật sau ít phút. Bạn chỉ cần đăng nhập và gọi từ nút OMICall trong hồ sơ.',
          )
        }
        setNotice(notices.length ? notices.join(' ') : null)
        setError(null)
      } catch (e) {
        if (cancelled) return
        setCalls([])
        setNotice(firestoreDatabaseMismatchHint())
        setError(userFacingLoadError(e))
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [scope, fromTs, toTs, maxRows, viewerSipUser, orgFilter])

  return { calls, loading, error, notice }
}
