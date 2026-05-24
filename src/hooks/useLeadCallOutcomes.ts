import { useEffect, useState } from 'react'
import { doc, getDoc } from 'firebase/firestore'
import type { Lead } from '../types'
import { FS_COLLECTIONS } from '../types'
import { getFirestoreDb, isFirebaseConfigured } from '../services/firebase'
import { snapshotLeadCallOutcome, type LeadCallOutcomeSnapshot } from '../utils/leadFinanceHelpers'

/** Đọc trạng thái hồ sơ (cọc / NE) cho các leadId từ lịch sử gọi. */
export function useLeadCallOutcomes(leadIds: string[]) {
  const [snapshots, setSnapshots] = useState<Map<string, LeadCallOutcomeSnapshot>>(new Map())
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const db = getFirestoreDb()
    const ids = [...new Set(leadIds.filter(Boolean))].slice(0, 120)
    if (!db || !isFirebaseConfigured() || ids.length === 0) {
      setSnapshots(new Map())
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    ;(async () => {
      const map = new Map<string, LeadCallOutcomeSnapshot>()
      for (const id of ids) {
        try {
          const snap = await getDoc(doc(db, FS_COLLECTIONS.leads, id))
          if (!snap.exists()) continue
          map.set(id, snapshotLeadCallOutcome(id, snap.data() as Lead))
        } catch {
          /* skip */
        }
      }
      if (!cancelled) {
        setSnapshots(map)
        setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [leadIds.join('|')])

  return { snapshots, loading }
}
