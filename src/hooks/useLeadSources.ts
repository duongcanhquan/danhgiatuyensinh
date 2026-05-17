import { useEffect, useMemo, useState } from 'react'
import { collection, onSnapshot, orderBy, query, type DocumentData } from 'firebase/firestore'
import type { LeadSourceRecord } from '../types'
import { FS_COLLECTIONS } from '../types'
import { getFirestoreDb, isFirebaseConfigured } from '../services/firebase'
import { activeLeadSources, mapLeadSourceDoc } from '../utils/leadProfileCatalog'

export function useLeadSources() {
  const [items, setItems] = useState<LeadSourceRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const configured = isFirebaseConfigured()

  useEffect(() => {
    const db = getFirestoreDb()
    if (!db) {
      setItems([])
      setLoading(false)
      setError(configured ? null : 'Chưa cấu hình Firebase.')
      return
    }
    const q = query(collection(db, FS_COLLECTIONS.leadSources), orderBy('sortOrder', 'asc'))
    const unsub = onSnapshot(
      q,
      (snap) => {
        const rows = snap.docs.map((d) => mapLeadSourceDoc(d.id, d.data() as DocumentData))
        setItems(rows)
        setLoading(false)
        setError(null)
      },
      (e) => {
        console.error(e)
        setError(e instanceof Error ? e.message : 'Không tải được danh mục nguồn.')
        setLoading(false)
      },
    )
    return () => unsub()
  }, [configured])

  const active = useMemo(() => activeLeadSources(items), [items])

  return { items, active, loading, error }
}
