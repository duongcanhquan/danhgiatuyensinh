import { useEffect, useMemo, useState } from 'react'
import { collection, onSnapshot, orderBy, query, type DocumentData } from 'firebase/firestore'
import type { ScholarshipRecord } from '../types'
import { FS_COLLECTIONS } from '../types'
import { getFirestoreDb, isFirebaseConfigured } from '../services/firebase'
import { activeScholarships, mapScholarshipDoc } from '../utils/leadProfileCatalog'

export function useScholarships() {
  const [items, setItems] = useState<ScholarshipRecord[]>([])
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
    const q = query(collection(db, FS_COLLECTIONS.scholarships), orderBy('sortOrder', 'asc'))
    const unsub = onSnapshot(
      q,
      (snap) => {
        const rows = snap.docs.map((d) => mapScholarshipDoc(d.id, d.data() as DocumentData))
        setItems(rows)
        setLoading(false)
        setError(null)
      },
      (e) => {
        console.error(e)
        setError(e instanceof Error ? e.message : 'Không tải được danh mục học bổng.')
        setLoading(false)
      },
    )
    return () => unsub()
  }, [configured])

  const active = useMemo(() => activeScholarships(items), [items])

  const byId = useMemo(() => {
    const m = new Map<string, ScholarshipRecord>()
    for (const s of items) m.set(s.id, s)
    return m
  }, [items])

  return { items, active, byId, loading, error }
}
