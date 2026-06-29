import { startTransition, useEffect, useMemo, useRef, useState } from 'react'
import { collection, onSnapshot, query, type QuerySnapshot, type DocumentData } from 'firebase/firestore'
import type { MasterCatalogDefinition, MasterDataEntry } from '../types'
import { FS_COLLECTIONS } from '../types'
import { getFirestoreDb, isFirebaseConfigured } from '../services/firebase'
import { processMasterDataDocs } from '../utils/masterDataRegistry'

/** Gom nhiều snapshot liên tiếp (mỗi lần setDoc) — tránh xử lý + re-render lặp. */
const MASTER_SNAPSHOT_DEBOUNCE_MS = 80

function snapshotSignatureFromDocs(docs: Array<{ id: string; data: Record<string, unknown> }>): string {
  return docs
    .map(({ id, data }) => {
      const u = data.updatedAt as { seconds?: number; nanoseconds?: number } | undefined
      const sec = u && typeof u.seconds === 'number' ? u.seconds : 0
      const nano = u && typeof u.nanoseconds === 'number' ? u.nanoseconds : 0
      const raw = data.entries
      const n = Array.isArray(raw) ? raw.length : 0
      const cats = data.catalogs
      const c = Array.isArray(cats) ? cats.length : 0
      return `${id}:${sec}.${nano}:${n}:${c}`
    })
    .sort()
    .join('|')
}

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
  const lastSigRef = useRef<string | null>(null)
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingSnapRef = useRef<QuerySnapshot<DocumentData> | null>(null)
  const isFirstMasterSnapRef = useRef(true)

  const regionLabels = useMemo(() => (byKind.regions ?? []).map((e) => e.label), [byKind])
  const hanoiAreaLabels = useMemo(() => (byKind.hanoi_areas ?? []).map((e) => e.label), [byKind])
  const highSchoolLabels = useMemo(() => (byKind.high_schools ?? []).map((e) => e.label), [byKind])
  const majorLabels = useMemo(() => (byKind.majors ?? []).map((e) => e.label), [byKind])
  const trainingProgramLabels = useMemo(
    () => (byKind.training_programs ?? []).map((e) => e.label),
    [byKind],
  )
  const schoolTypeLabels = useMemo(() => (byKind.school_types ?? []).map((e) => e.label), [byKind])
  const financialProfileLabels = useMemo(
    () => (byKind.financial_profiles ?? []).map((e) => e.label),
    [byKind],
  )
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

    const applySnapshot = (snap: QuerySnapshot<DocumentData>) => {
      const docs = snap.docs.map((d) => ({ id: d.id, data: d.data() as Record<string, unknown> }))
      const sig = snapshotSignatureFromDocs(docs)
      if (sig === lastSigRef.current) {
        setLoading(false)
        return
      }
      lastSigRef.current = sig
      const { catalogs: nextCatalogs, byKind: nextByKind } = processMasterDataDocs(docs)
      startTransition(() => {
        setCatalogs(nextCatalogs)
        setByKind(nextByKind)
        setLoading(false)
        setError(null)
      })
    }

    const unsub = onSnapshot(
      q,
      (snap) => {
        pendingSnapRef.current = snap
        if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current)
        const flush = () => {
          debounceTimerRef.current = null
          const latest = pendingSnapRef.current
          pendingSnapRef.current = null
          if (latest) applySnapshot(latest)
        }
        if (isFirstMasterSnapRef.current) {
          isFirstMasterSnapRef.current = false
          flush()
          return
        }
        debounceTimerRef.current = setTimeout(flush, MASTER_SNAPSHOT_DEBOUNCE_MS)
      },
      (err) => {
        console.error(err)
        if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current)
        debounceTimerRef.current = null
        setError(err.message || 'Lỗi đọc masterData')
        setLoading(false)
      },
    )
    return () => {
      unsub()
      isFirstMasterSnapRef.current = true
      lastSigRef.current = null
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current)
    }
  }, [configured])

  return {
    catalogs,
    byKind,
    regionLabels,
    hanoiAreaLabels,
    highSchoolLabels,
    majorLabels,
    trainingProgramLabels,
    schoolTypeLabels,
    financialProfileLabels,
    academicPerformanceLabels,
    studyIntentionLabels,
    loading,
    error,
    configured,
  }
}
