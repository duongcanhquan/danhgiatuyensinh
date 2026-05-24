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

function filterCallsByDate(calls: OmicallCallRecord[], fromMs: number, toMs: number): OmicallCallRecord[] {
  return calls.filter((c) => {
    const ms = tsMsCall(c.endedAt ?? c.createdAt)
    return ms >= fromMs && ms <= toMs
  })
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
  const fromMs = from.getTime()
  const toMs = to.getTime()

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

    const primaryConstraints: QueryConstraint[] = []
    if (scope.mode === 'counselor') {
      primaryConstraints.push(where('counselorUid', '==', scope.counselorUid))
    } else if (scope.mode === 'team') {
      primaryConstraints.push(where('teamLeadUid', '==', scope.teamLeadUid))
    }
    primaryConstraints.push(where('endedAt', '>=', fromTs), where('endedAt', '<=', toTs))
    primaryConstraints.push(orderBy('endedAt', 'desc'), limit(maxRows))

    ;(async () => {
      try {
        let rows = await runOmicallQuery(db, primaryConstraints)
        rows.sort((a, b) => tsMsCall(b.endedAt ?? b.createdAt) - tsMsCall(a.endedAt ?? a.createdAt))
        if (!cancelled) setCalls(rows)
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Không đọc lịch sử cuộc gọi.'
        const url = extractFirestoreIndexUrl(msg)
        if (isMissingIndexError(e) && scope.mode !== 'global') {
          try {
            const fallback: QueryConstraint[] = []
            if (scope.mode === 'counselor') {
              fallback.push(where('counselorUid', '==', scope.counselorUid))
            } else {
              fallback.push(where('teamLeadUid', '==', scope.teamLeadUid))
            }
            fallback.push(orderBy('endedAt', 'desc'), limit(Math.max(maxRows * 3, 1500)))
            let rows = filterCallsByDate(await runOmicallQuery(db, fallback), fromMs, toMs)
            rows = rows.slice(0, maxRows)
            rows.sort((a, b) => tsMsCall(b.endedAt ?? b.createdAt) - tsMsCall(a.endedAt ?? a.createdAt))
            if (!cancelled) {
              setCalls(rows)
              setError(
                url
                  ? 'Đang dùng dữ liệu dự phòng — cần tạo index Firestore (warmlist) để truy vấn đầy đủ theo ngày.'
                  : 'Đang dùng dữ liệu dự phòng — triển khai firestore.indexes.json lên database warmlist.',
              )
              setIndexUrl(url)
            }
            return
          } catch {
            /* fall through */
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
  }, [scope, fromTs, toTs, fromMs, toMs, maxRows])

  return { calls, loading, error, indexUrl }
}
