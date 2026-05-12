import { useEffect, useMemo, useState } from 'react'
import { collection, onSnapshot, query } from 'firebase/firestore'
import type { MasterCatalogDefinition, MasterDataEntry } from '../types'
import { FS_COLLECTIONS } from '../types'
import { getFirestoreDb, isFirebaseConfigured } from '../services/firebase'
import { processMasterDataDocs } from '../utils/masterDataRegistry'

/**
 * Master data — catalog động (`masterData/_registry` + `masterData/{catalogId}`).
 * Tương thích legacy `partner_schools` → high_schools, `priority_regions` → regions.
 */
export function useMasterData() {
  const [byKind, setByKind] = useState<Record<string, MasterDataEntry[]>>({})
  const [catalogs, setCatalogs] = useState<MasterCatalogDefinition[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const configured = useMemo(() => isFirebaseConfigured(), [])

  const regionLabels = useMemo(() => (byKind.regions ?? []).map((e) => e.label), [byKind])
  const hanoiAreaLabels = useMemo(() => (byKind.hanoi_areas ?? []).map((e) => e.label), [byKind])
  const highSchoolLabels = useMemo(() => (byKind.high_schools ?? []).map((e) => e.label), [byKind])
  const majorLabels = useMemo(() => (byKind.majors ?? []).map((e) => e.label), [byKind])
  const academicPerformanceLabels = useMemo(
    () => (byKind.academic_performance ?? []).map((e) => e.label),
    [byKind],
  )
  const studyIntentionLabels = useMemo(
    () => (byKind.study_intentions ?? []).map((e) => e.label),
    [byKind],
  )

  useEffect(() => {
    const firestore = getFirestoreDb()
    if (!firestore) {
      queueMicrotask(() => {
        setByKind({})
        setCatalogs([])
        setLoading(false)
        setError(configured ? null : 'Chưa cấu hình Firebase. Không thể tải master data.')
      })
      return
    }

    const q = query(collection(firestore, FS_COLLECTIONS.masterData))
    const unsub = onSnapshot(
      q,
      (snap) => {
        const docs = snap.docs.map((d) => ({ id: d.id, data: d.data() as Record<string, unknown> }))
        const { catalogs: nextCatalogs, byKind: nextByKind } = processMasterDataDocs(docs)
        setCatalogs(nextCatalogs)
        setByKind(nextByKind)
        setLoading(false)
        setError(null)
      },
      (err) => {
        console.error(err)
        setError(err.message || 'Lỗi đọc masterData')
        setLoading(false)
      },
    )
    return () => unsub()
  }, [configured])

  return {
    catalogs,
    byKind,
    regionLabels,
    hanoiAreaLabels,
    highSchoolLabels,
    majorLabels,
    academicPerformanceLabels,
    studyIntentionLabels,
    loading,
    error,
    configured,
  }
}
