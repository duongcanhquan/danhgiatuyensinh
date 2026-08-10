import { useEffect, useState } from 'react'
import { collection, limit, onSnapshot, query, where } from 'firebase/firestore'
import type { Timestamp } from 'firebase/firestore'
import { FS_COLLECTIONS } from '../types'
import { getFirestoreDb, isFirebaseConfigured } from '../services/firebase'
import { useOrg } from './useOrg'
import { DEFAULT_ORG_ID } from '../tenancy/orgConstants'

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

function startedAtMs(row: OmicallSyncRun): number {
  const t = row.startedAt
  if (!t || typeof t.seconds !== 'number') return 0
  return t.seconds * 1000
}

export function useOmicallSyncRuns(max = 5) {
  const { effectiveOrgId } = useOrg()
  const orgKey = effectiveOrgId.trim() || DEFAULT_ORG_ID
  const [runs, setRuns] = useState<OmicallSyncRun[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const db = getFirestoreDb()
    if (!db || !isFirebaseConfigured()) {
      setRuns([])
      setLoading(false)
      return
    }
    const q = query(
      collection(db, FS_COLLECTIONS.omicallSyncRuns),
      where('orgId', '==', orgKey),
      limit(Math.max(max, 20)),
    )
    const unsub = onSnapshot(
      q,
      (snap) => {
        const rows: OmicallSyncRun[] = []
        snap.forEach((d) => rows.push({ id: d.id, ...(d.data() as Omit<OmicallSyncRun, 'id'>) }))
        rows.sort((a, b) => startedAtMs(b) - startedAtMs(a))
        setRuns(rows.slice(0, max))
        setLoading(false)
      },
      () => {
        setRuns([])
        setLoading(false)
      },
    )
    return () => unsub()
  }, [max, orgKey])

  return { runs, loading, lastRun: runs[0] ?? null }
}
