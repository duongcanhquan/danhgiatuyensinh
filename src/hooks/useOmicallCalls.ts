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

export function useOmicallCalls({ scope, from, to, maxRows = 500 }: UseOmicallCallsOpts) {
  const [calls, setCalls] = useState<OmicallCallRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fromTs = useMemo(() => Timestamp.fromDate(from), [from.getTime()])
  const toTs = useMemo(() => Timestamp.fromDate(to), [to.getTime()])

  useEffect(() => {
    const db = getFirestoreDb()
    if (!db || !isFirebaseConfigured()) {
      setCalls([])
      setLoading(false)
      setError('Chưa cấu hình Firebase.')
      return
    }

    let cancelled = false
    setLoading(true)
    setError(null)

    const constraints: QueryConstraint[] = [where('endedAt', '>=', fromTs), where('endedAt', '<=', toTs)]

    if (scope.mode === 'counselor') {
      constraints.unshift(where('counselorUid', '==', scope.counselorUid))
    } else if (scope.mode === 'team') {
      constraints.unshift(where('teamLeadUid', '==', scope.teamLeadUid))
    }

    constraints.push(orderBy('endedAt', 'desc'), limit(maxRows))

    ;(async () => {
      try {
        const q = query(collection(db, FS_COLLECTIONS.omicallCalls), ...constraints)
        const snap = await getDocs(q)
        const rows: OmicallCallRecord[] = []
        snap.forEach((d) => rows.push(mapOmicallCallDoc(d.id, d.data() as Record<string, unknown>)))
        rows.sort((a, b) => tsMsCall(b.endedAt ?? b.createdAt) - tsMsCall(a.endedAt ?? a.createdAt))
        if (!cancelled) setCalls(rows)
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Không đọc lịch sử cuộc gọi.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [scope, fromTs, toTs, maxRows])

  return { calls, loading, error }
}
