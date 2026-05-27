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
import { mapOmicallCallDoc, tsMsCall } from '../utils/omicallCallMap'

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
    return 'Hệ thống chưa sẵn sàng hiển thị lịch sử gọi theo kỳ. Vui lòng báo quản trị viên (không cần thao tác trên Firebase).'
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

function dateRangeConstraints(fromTs: Timestamp, toTs: Timestamp, limitN: number): QueryConstraint[] {
  return [
    where('endedAt', '>=', fromTs),
    where('endedAt', '<=', toTs),
    orderBy('endedAt', 'desc'),
    limit(limitN),
  ]
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

/** Tải theo từng đoạn ngày — chỉ cần index `endedAt`, không phụ thuộc counselorUid/teamLeadUid. */
async function fetchCallsByDateChunks(
  db: NonNullable<ReturnType<typeof getFirestoreDb>>,
  fromTs: Timestamp,
  toTs: Timestamp,
  cap: number,
): Promise<{ rows: OmicallCallRecord[]; truncated: boolean }> {
  const fromMs = fromTs.toMillis()
  const toMs = toTs.toMillis()
  if (fromMs > toMs) return { rows: [], truncated: false }

  const chunkMs = CHUNK_DAYS * 86400000
  const merged = new Map<string, OmicallCallRecord>()
  let truncated = false

  for (let start = fromMs; start <= toMs && merged.size < cap; start += chunkMs) {
    const end = Math.min(start + chunkMs - 1, toMs)
    const batch = await runOmicallQuery(
      db,
      dateRangeConstraints(Timestamp.fromMillis(start), Timestamp.fromMillis(end), CHUNK_QUERY_LIMIT),
    )
    for (const row of batch) {
      merged.set(row.id, row)
      if (merged.size >= cap) {
        truncated = true
        break
      }
    }
    if (batch.length >= CHUNK_QUERY_LIMIT) truncated = true
  }

  const rows = [...merged.values()].sort(
    (a, b) => tsMsCall(b.endedAt ?? b.createdAt) - tsMsCall(a.endedAt ?? a.createdAt),
  )
  return { rows: rows.slice(0, cap), truncated }
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
        const { rows: raw, truncated } = await fetchCallsByDateChunks(db, fromTs, toTs, fetchCap)
        if (cancelled) return

        const scoped = filterCallsByScope(raw, scope, viewerSipUser)
        scoped.sort((a, b) => tsMsCall(b.endedAt ?? b.createdAt) - tsMsCall(a.endedAt ?? a.createdAt))
        const visible = scoped.slice(0, maxRows)

        setCalls(visible)

        const notices: string[] = []
        if (truncated) {
          notices.push(
            `Đã tải tối đa ${fetchCap.toLocaleString('vi-VN')} cuộc trong kỳ — thu hẹp khoảng ngày nếu thiếu cuộc cũ.`,
          )
        }
        if (scope.mode !== 'global' && raw.length > 0 && scoped.length === 0) {
          notices.push(
            'Có cuộc gọi trong kỳ nhưng chưa gắn đúng TVV/nhóm — hãy gọi từ nút OMICall trên hồ sơ; quản trị có thể «Đồng bộ lịch sử» / «Bù KPI» trong Cài đặt.',
          )
        }
        if (scope.mode !== 'global' && scoped.length < raw.length && scoped.length > 0) {
          notices.push(
            `Hiển thị ${visible.length.toLocaleString('vi-VN')} cuộc thuộc phạm vi đã chọn (đã lọc từ ${raw.length.toLocaleString('vi-VN')} cuộc trong kỳ).`,
          )
        }
        setNotice(notices.length ? notices.join(' ') : null)
        setError(null)
      } catch (e) {
        if (cancelled) return
        setCalls([])
        setNotice(null)
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
