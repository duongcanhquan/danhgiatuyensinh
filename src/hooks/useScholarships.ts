import { useCallback, useEffect, useMemo, useState } from 'react'
import { collection, onSnapshot, orderBy, query, type DocumentData } from 'firebase/firestore'
import type { ScholarshipApplySlot, ScholarshipRecord } from '../types'
import { FS_COLLECTIONS } from '../types'
import { getFirestoreDb, isFirebaseConfigured } from '../services/firebase'
import { activeScholarships, mapScholarshipDoc } from '../utils/leadProfileCatalog'
import { activeScholarshipsForSlot } from '../utils/scholarshipEligibility'

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

  const activeForSlot1 = useMemo(() => activeScholarshipsForSlot(items, 'slot1'), [items])
  const activeForSlot2 = useMemo(() => activeScholarshipsForSlot(items, 'slot2'), [items])

  const activeForSlot = useCallback(
    (slot: ScholarshipApplySlot, includeIds: readonly string[] = []) =>
      activeScholarshipsForSlot(items, slot, new Date(), includeIds),
    [items],
  )

  const byId = useMemo(() => {
    const m = new Map<string, ScholarshipRecord>()
    for (const s of items) m.set(s.id, s)
    return m
  }, [items])

  return { items, active, activeForSlot1, activeForSlot2, activeForSlot, byId, loading, error }
}
