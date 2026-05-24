import { useEffect, useState } from 'react'
import { collection, limit, onSnapshot, orderBy, query } from 'firebase/firestore'
import type { Timestamp } from 'firebase/firestore'
import { FS_COLLECTIONS } from '../types'
import { getFirestoreDb, isFirebaseConfigured } from '../services/firebase'

export type OmicallSyncRun = {
  id: string
  startedAt?: Timestamp
  finishedAt?: Timestamp
  processed?: number
  analysesProcessed?: number
  status?: string
  error?: string
  analysisError?: string
  lookbackMinutes?: number
  apiVersion?: string
  manual?: boolean
  reason?: string
}

export function useOmicallSyncRuns(max = 5) {
  const [runs, setRuns] = useState<OmicallSyncRun[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const db = getFirestoreDb()
    if (!db || !isFirebaseConfigured()) {
      setRuns([])
      setLoading(false)
      return
    }
    const q = query(collection(db, FS_COLLECTIONS.omicallSyncRuns), orderBy('startedAt', 'desc'), limit(max))
    const unsub = onSnapshot(
      q,
      (snap) => {
        const rows: OmicallSyncRun[] = []
        snap.forEach((d) => rows.push({ id: d.id, ...(d.data() as Omit<OmicallSyncRun, 'id'>) }))
        setRuns(rows)
        setLoading(false)
      },
      () => setLoading(false),
    )
    return () => unsub()
  }, [max])

  return { runs, loading, lastRun: runs[0] ?? null }
}
