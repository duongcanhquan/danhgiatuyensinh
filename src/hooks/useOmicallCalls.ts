import { useEffect, useMemo, useState } from 'react'
import {
  collection,
  collectionGroup,
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
  | { mode: 'team'; teamLeadUid: string }
  | { mode: 'global' }

export type UseOmicallCallsOpts = {
  scope: OmicallCallsScope
  from: Date
  to: Date
  maxRows?: number
  /** Máy lẻ OMICall của người xem — bù khi doc chưa có counselorUid. */
  viewerSipUser?: string
}

const CHUNK_DAYS = 7
const CHUNK_QUERY_LIMIT = 1200

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

function filterCallsByScope(
  calls: OmicallCallRecord[],
  scope: OmicallCallsScope,
  viewerSipUser?: string,
): OmicallCallRecord[] {
  if (scope.mode === 'global') return calls

  if (scope.mode === 'counselor') {
    const sip = viewerSipUser?.trim()
    return calls.filter((c) => {
      if (c.counselorUid === scope.counselorUid) return true
      if (!c.counselorUid && sip && c.sipUser?.trim() === sip) return true
      return false
    })
  }

  return calls.filter((c) => c.teamLeadUid === scope.teamLeadUid)
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
): QueryConstraint[] {
  return [where(field, '>=', fromTs), where(field, '<=', toTs), orderBy(field, 'desc'), limit(limitN)]
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
): Promise<{ rows: OmicallCallRecord[]; hitLimit: boolean; indexMissing: boolean }> {
  try {
    const batch = await runOmicallQuery(
      db,
      dateRangeConstraints(field, fromTs, toTs, CHUNK_QUERY_LIMIT),
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

    const ended = await fetchChunkByField(db, 'endedAt', chunkFrom, chunkTo)
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

    const started = await fetchChunkByField(db, 'startedAt', chunkFrom, chunkTo)
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

  if (startedAtIndexMissing && merged.size === 0 && !startedAtFallback) {
    startedAtFallback = false
  }

  const rows = [...merged.values()].sort(
    (a, b) => tsMsCall(b.endedAt ?? b.startedAt ?? b.createdAt) - tsMsCall(a.endedAt ?? a.startedAt ?? a.createdAt),
  )
  return { rows: rows.slice(0, cap), truncated, startedAtFallback }
}

function inferDirectionFromNote(note: string): 'inbound' | 'outbound' {
  const n = note.toLowerCase()
  if (n.includes('gọi vào')) return 'inbound'
  return 'outbound'
}

function mapInteractionToCallFallback(
  id: string,
  data: Record<string, unknown>,
): OmicallCallRecord | null {
  const provider = String(data.provider ?? '').toUpperCase()
  if (provider !== 'OMICALL') return null
  const ts = data.timestamp as Timestamp | undefined
  if (!ts) return null
  const transactionId = String(data.providerCallId ?? id).trim()
  const note = String(data.counselorNote ?? '')
  const outcomeRaw = String(data.callOutcome ?? '').toUpperCase()
  const outcome: OmicallCallRecord['outcome'] =
    outcomeRaw === 'CONNECTED' ? 'CONNECTED' : outcomeRaw === 'NO_ANSWER' ? 'NO_ANSWER' : 'OTHER'
  const answerSeconds = Number(data.answerSeconds ?? data.durationSeconds ?? 0) || 0
  const billSeconds = Number(data.billSeconds ?? data.durationSeconds ?? 0) || 0

  return {
    id: `int-${id}`,
    transactionId,
    direction: inferDirectionFromNote(note),
    phoneNumber: String(data.phone ?? ''),
    displayNumber: String(data.displayNumber ?? ''),
    hotline: String(data.hotline ?? '') || undefined,
    sipUser: String(data.sipUser ?? '') || undefined,
    leadId: String(data.leadId ?? '') || undefined,
    counselorUid: String(data.authorUid ?? '') || undefined,
    teamLeadUid: undefined,
    startedAt: ts,
    answeredAt: undefined,
    endedAt: ts,
    createdAt: ts,
    answerSeconds,
    billSeconds,
    durationSeconds: Math.max(answerSeconds, billSeconds),
    recordSeconds: Number(data.recordSeconds ?? 0) || 0,
    recordingFileUrl: String(data.recordingUrl ?? '') || undefined,
    hangupCause: undefined,
    endByName: undefined,
    provider: 'OMICALL',
    outcome,
    state: 'ended',
    isFinal: true,
    syncSource: 'history_sync',
    syncedAt: undefined,
    interactionId: id,
    kpiAppliedAt: undefined,
    isValidCall: false,
    invalidReason: 'interaction_fallback',
    aiAnalysisId: undefined,
    aiAnalysisSyncedAt: undefined,
    aiAnalysisSummary: undefined,
    disposition: undefined,
    agentId: undefined,
    agentName: undefined,
    customerName: undefined,
    callNote: note || undefined,
    isAutoCall: false,
    evaluationScore: undefined,
  }
}

async function fetchCallsFromInteractionsFallback(
  db: NonNullable<ReturnType<typeof getFirestoreDb>>,
  fromTs: Timestamp,
  toTs: Timestamp,
  cap: number,
): Promise<OmicallCallRecord[]> {
  // Query theo timestamp trước (không ép composite index provider+timestamp),
  // rồi lọc provider OMICALL ở client để tăng khả năng chạy được trên môi trường chưa đủ index.
  const fetchLimit = Math.min(Math.max(cap * 4, 600), 4000)
  const q = query(
    collectionGroup(db, FS_COLLECTIONS.interactions),
    where('timestamp', '>=', fromTs),
    where('timestamp', '<=', toTs),
    limit(fetchLimit),
  )
  const snap = await getDocs(q)
  const rows: OmicallCallRecord[] = []
  snap.forEach((d) => {
    const mapped = mapInteractionToCallFallback(d.id, d.data() as Record<string, unknown>)
    if (mapped) rows.push(mapped)
  })
  rows.sort((a, b) => tsMsCall(b.endedAt ?? b.startedAt ?? b.createdAt) - tsMsCall(a.endedAt ?? a.startedAt ?? a.createdAt))
  if (rows.length > cap) return rows.slice(0, cap)
  return rows
}

export function useOmicallCalls({
  scope,
  from,
  to,
  maxRows = 500,
  viewerSipUser,
}: UseOmicallCallsOpts) {
  const [calls, setCalls] = useState<OmicallCallRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const fromTs = useMemo(() => Timestamp.fromDate(from), [from.getTime()])
  const toTs = useMemo(() => Timestamp.fromDate(to), [to.getTime()])

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
        ? Math.min(Math.max(maxRows * 3, 3000), 8000)
        : Math.min(Math.max(maxRows * 4, 2000), 6000)

    ;(async () => {
      try {
        const { rows: rawPrimary, truncated, startedAtFallback } = await fetchCallsByDateChunks(
          db,
          fromTs,
          toTs,
          fetchCap,
        )
        if (cancelled) return

        let raw = rawPrimary
        let fallbackSource: FallbackSource = 'none'
        let interactionFallbackError = false
        let serverFallbackError: string | null = null
        let serverFallbackWarning: string | null = null
        let serverFallbackUsed = false

        const serverScope =
          scope.mode === 'global'
            ? ({ mode: 'global' } as const)
            : scope.mode === 'team'
              ? ({ mode: 'team', teamLeadUid: scope.teamLeadUid } as const)
              : ({ mode: 'counselor', counselorUid: scope.counselorUid } as const)

        // Ưu tiên Cloud Function (Admin SDK + database warmlist) khi client không có dữ liệu.
        if (raw.length === 0) {
          try {
            const serverRes = await fetchOmicallCallsViaFunction({
              fromMs: fromTs.toMillis(),
              toMs: toTs.toMillis(),
              maxRows: fetchCap,
              scope: serverScope,
            })
            if (serverRes.calls.length > 0) {
              raw = serverRes.calls
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
          try {
            const fallbackRows = await fetchCallsFromInteractionsFallback(db, fromTs, toTs, fetchCap)
            if (fallbackRows.length > 0) {
              raw = fallbackRows
              fallbackSource = 'interactions'
            }
          } catch {
            interactionFallbackError = true
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
        if (truncated) {
          notices.push(
            `Đã tải tối đa ${fetchCap.toLocaleString('vi-VN')} cuộc trong kỳ — thu hẹp khoảng ngày nếu thiếu cuộc cũ.`,
          )
        }
        if (startedAtFallback) {
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
            'Đang hiển thị dữ liệu cuộc gọi từ tương tác hồ sơ (fallback) do lịch sử OMICall chưa đồng bộ đầy đủ.',
          )
        } else if (serverFallbackUsed) {
          notices.push('Đang hiển thị dữ liệu cuộc gọi qua Cloud Function (đồng bộ từ Firestore warmlist).')
        } else if (serverFallbackError) {
          notices.push(`Không tải được lịch sử gọi từ server: ${serverFallbackError}`)
        } else if (serverFallbackWarning) {
          notices.push(serverFallbackWarning)
        } else if (interactionFallbackError && raw.length === 0) {
          notices.push('Chưa đọc được tương tác OMICall trên trình duyệt — thử thu hẹp khoảng ngày hoặc gọi từ nút OMICall trên hồ sơ.')
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
  }, [scope, fromTs, toTs, maxRows, viewerSipUser])

  return { calls, loading, error, notice }
}
