import { useCallback, useEffect, useState } from 'react'
import { collection, getDocs, limit, orderBy, query } from 'firebase/firestore'
import type { Lead } from '../types'
import { FS_COLLECTIONS } from '../types'
import { getFirestoreDb } from '../services/firebase'
import { mapDoc } from './useLeads'

const ACCOUNTANT_LEAD_LIMIT = 600

export function useAccountantLeads(enabled: boolean) {
  const [leads, setLeads] = useState<Lead[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    const db = getFirestoreDb()
    if (!db || !enabled) return
    setLoading(true)
    setError(null)
    try {
      const q = query(
        collection(db, FS_COLLECTIONS.leads),
        orderBy('updatedAt', 'desc'),
        limit(ACCOUNTANT_LEAD_LIMIT),
      )
      const snap = await getDocs(q)
      const rows: Lead[] = []
      for (const d of snap.docs) {
        const lead = mapDoc(d.id, d.data() as Record<string, unknown>)
        if (lead) rows.push(lead)
      }
      setLeads(rows)
    } catch (e) {
      console.error(e)
      setError(e instanceof Error ? e.message : 'Không tải được danh sách hồ sơ.')
    } finally {
      setLoading(false)
    }
  }, [enabled])

  useEffect(() => {
    void reload()
  }, [reload])

  return { leads, loading, error, reload }
}
