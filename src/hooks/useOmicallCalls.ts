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
}

function isMissingIndexError(e: unknown): boolean {
  if (!(e instanceof Error)) return false
  return e.message.includes('requires an index') || e.message.includes('FAILED_PRECONDITION')
}

export function extractFirestoreIndexUrl(message: string): string | null {
  const m = message.match(/https:\/\/console\.firebase\.google\.com[^\s)]+/)
  return m?.[0] ?? null
}

function filterCallsByScope(calls: OmicallCallRecord[], scope: OmicallCallsScope): OmicallCallRecord[] {
  if (scope.mode === 'counselor') {
    return calls.filter((c) => c.counselorUid === scope.counselorUid)
  }
  if (scope.mode === 'team') {
    return calls.filter((c) => c.teamLeadUid === scope.teamLeadUid)
  }
  return calls
}

/** Truy vấn theo khoảng ngày — không cần index ghép counselorUid/teamLeadUid. */
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

export function useOmicallCalls({ scope, from, to, maxRows = 500 }: UseOmicallCallsOpts) {
  const [calls, setCalls] = useState<OmicallCallRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [indexUrl, setIndexUrl] = useState<string | null>(null)

  const fromTs = useMemo(() => Timestamp.fromDate(from), [from.getTime()])
  const toTs = useMemo(() => Timestamp.fromDate(to), [to.getTime()])
  useEffect(() => {
    const db = getFirestoreDb()
    if (!db || !isFirebaseConfigured()) {
      setCalls([])
      setLoading(false)
      setError('Chưa cấu hình Firebase.')
      setIndexUrl(null)
      return
    }

    if (scope.mode === 'counselor' && !scope.counselorUid.trim()) {
      setCalls([])
      setLoading(false)
      setError('Chưa chọn tư vấn viên.')
      setIndexUrl(null)
      return
    }

    if (scope.mode === 'team' && !scope.teamLeadUid.trim()) {
      setCalls([])
      setLoading(false)
      setError('Chưa xác định trưởng nhóm.')
      setIndexUrl(null)
      return
    }

    let cancelled = false
    setLoading(true)
    setError(null)
    setIndexUrl(null)

    const scopedConstraints: QueryConstraint[] = []
    if (scope.mode === 'counselor') {
      scopedConstraints.push(where('counselorUid', '==', scope.counselorUid))
    } else if (scope.mode === 'team') {
      scopedConstraints.push(where('teamLeadUid', '==', scope.teamLeadUid))
    }
    scopedConstraints.push(where('endedAt', '>=', fromTs), where('endedAt', '<=', toTs))
    scopedConstraints.push(orderBy('endedAt', 'desc'), limit(maxRows))

    const globalConstraints = dateRangeConstraints(fromTs, toTs, maxRows)

    ;(async () => {
      const finish = (rows: OmicallCallRecord[], err: string | null, url: string | null) => {
        if (cancelled) return
        rows.sort((a, b) => tsMsCall(b.endedAt ?? b.createdAt) - tsMsCall(a.endedAt ?? a.createdAt))
        setCalls(rows.slice(0, maxRows))
        setError(err)
        setIndexUrl(url)
      }

      try {
        const constraints = scope.mode === 'global' ? globalConstraints : scopedConstraints
        const rows = await runOmicallQuery(db, constraints)
        finish(rows, null, null)
        return
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Không đọc lịch sử cuộc gọi.'
        const url = extractFirestoreIndexUrl(msg)

        if (isMissingIndexError(e) && scope.mode !== 'global') {
          try {
            const fetchLimit = Math.min(Math.max(maxRows * 8, 2000), 5000)
            let rows = filterCallsByScope(await runOmicallQuery(db, dateRangeConstraints(fromTs, toTs, fetchLimit)), scope)
            rows = rows.slice(0, maxRows)
            finish(
              rows,
              url
                ? 'Đang hiển thị theo cách dự phòng (lọc sau khi tải). Nên tạo index Firestore (warmlist) để nhanh và đủ dữ liệu khi kỳ dài.'
                : 'Đang hiển thị theo cách dự phòng — chạy npm run deploy:firestore-indexes (database warmlist).',
              url,
            )
            return
          } catch (fallbackErr) {
            const fallbackMsg = fallbackErr instanceof Error ? fallbackErr.message : msg
            const fallbackUrl = extractFirestoreIndexUrl(fallbackMsg) ?? url
            if (!cancelled) {
              setError(fallbackUrl ? `${fallbackMsg}\n\nTạo index: ${fallbackUrl}` : fallbackMsg)
              setIndexUrl(fallbackUrl)
              setCalls([])
            }
            return
          }
        }

        if (!cancelled) {
          setError(url ? `${msg}\n\nTạo index: ${url}` : msg)
          setIndexUrl(url)
          setCalls([])
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [scope, fromTs, toTs, maxRows])

  return { calls, loading, error, indexUrl }
}
