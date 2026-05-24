import { useEffect, useState } from 'react'
import { collection, limit, onSnapshot, query, where } from 'firebase/firestore'
import type { OmicallCallRecord } from '../types'
import { FS_COLLECTIONS } from '../types'
import { getFirestoreDb, isFirebaseConfigured } from '../services/firebase'
import { mapOmicallCallDoc, tsMsCall } from '../utils/omicallCallMap'

const FETCH_CAP = 80

/** Cuộc gọi OMICall gắn với một lead — sort client theo `endedAt` mới nhất. */
export function useLeadOmicallCalls(leadId: string | null) {
  const [calls, setCalls] = useState<OmicallCallRecord[]>([])
  const [loading, setLoading] = useState(Boolean(leadId))
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!leadId) {
      setCalls([])
      setLoading(false)
      setError(null)
      return
    }
    const db = getFirestoreDb()
    if (!db || !isFirebaseConfigured()) {
      setCalls([])
      setLoading(false)
      setError('Chưa cấu hình Firebase.')
      return
    }

    setLoading(true)
    setError(null)
    const q = query(
      collection(db, FS_COLLECTIONS.omicallCalls),
      where('leadId', '==', leadId),
      limit(FETCH_CAP),
    )

    const unsub = onSnapshot(
      q,
      (snap) => {
        const rows: OmicallCallRecord[] = []
        snap.forEach((d) => rows.push(mapOmicallCallDoc(d.id, d.data() as Record<string, unknown>)))
        rows.sort((a, b) => tsMsCall(b.endedAt ?? b.createdAt) - tsMsCall(a.endedAt ?? a.createdAt))
        setCalls(rows)
        setLoading(false)
      },
      (e) => {
        setError(e.message || 'Không đọc được lịch sử gọi.')
        setLoading(false)
      },
    )
    return () => unsub()
  }, [leadId])

  return { calls, loading, error }
}
