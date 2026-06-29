import { useCallback, useEffect, useState } from 'react'
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  deleteDoc,
  Timestamp,
} from 'firebase/firestore'
import type { KpiMetricTargets } from '../types'
import { FS_COLLECTIONS } from '../types'
import { getFirestoreDb, isFirebaseConfigured } from '../services/firebase'
import { mergeKpiMetricTargets } from '../utils/kpiTargets'

export type KpiCounselorTargetOverride = {
  counselorUid: string
  overrides: Partial<KpiMetricTargets>
  label?: string
}

export function useKpiTargets(month: string, globalDefaults: KpiMetricTargets) {
  const [monthDefaults, setMonthDefaults] = useState<Partial<KpiMetricTargets> | null>(null)
  const [counselorOverrides, setCounselorOverrides] = useState<Map<string, Partial<KpiMetricTargets>>>(new Map())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const db = getFirestoreDb()
    if (!db || !isFirebaseConfigured() || !month) {
      setMonthDefaults(null)
      setCounselorOverrides(new Map())
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)
    ;(async () => {
      try {
        const monthRef = doc(db, FS_COLLECTIONS.kpiTargets, month)
        const monthSnap = await getDoc(monthRef)
        const defaultsRaw = monthSnap.exists() ? monthSnap.data().defaults : null
        const parsed =
          defaultsRaw && typeof defaultsRaw === 'object'
            ? (defaultsRaw as Partial<KpiMetricTargets>)
            : null
        if (!cancelled) setMonthDefaults(parsed)

        const snap = await getDocs(collection(db, FS_COLLECTIONS.kpiTargets, month, 'counselors'))
        const m = new Map<string, Partial<KpiMetricTargets>>()
        snap.forEach((d) => {
          const o = d.data().overrides as Partial<KpiMetricTargets> | undefined
          if (o && typeof o === 'object') m.set(d.id, o)
        })
        if (!cancelled) setCounselorOverrides(m)
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Không đọc mục tiêu KPI.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [month])

  const resolveFor = useCallback(
    (counselorUid: string): KpiMetricTargets => {
      const monthBase = mergeKpiMetricTargets(globalDefaults, monthDefaults)
      return mergeKpiMetricTargets(monthBase, counselorOverrides.get(counselorUid))
    },
    [globalDefaults, monthDefaults, counselorOverrides],
  )

  const saveMonthDefaults = useCallback(
    async (next: Partial<KpiMetricTargets>) => {
      const db = getFirestoreDb()
      if (!db || !month) return
      const ref = doc(db, FS_COLLECTIONS.kpiTargets, month)
      await setDoc(ref, { defaults: next, updatedAt: Timestamp.now() }, { merge: true })
      setMonthDefaults(next)
    },
    [month],
  )

  const saveCounselorOverride = useCallback(
    async (counselorUid: string, overrides: Partial<KpiMetricTargets>) => {
      const db = getFirestoreDb()
      if (!db || !month) return
      const ref = doc(db, FS_COLLECTIONS.kpiTargets, month, 'counselors', counselorUid)
      await setDoc(ref, { overrides, updatedAt: Timestamp.now() }, { merge: true })
      setCounselorOverrides((prev) => new Map(prev).set(counselorUid, overrides))
    },
    [month],
  )

  const clearCounselorOverride = useCallback(
    async (counselorUid: string) => {
      const db = getFirestoreDb()
      if (!db || !month) return
      await deleteDoc(doc(db, FS_COLLECTIONS.kpiTargets, month, 'counselors', counselorUid))
      setCounselorOverrides((prev) => {
        const n = new Map(prev)
        n.delete(counselorUid)
        return n
      })
    },
    [month],
  )

  return {
    monthDefaults,
    counselorOverrides,
    loading,
    error,
    resolveFor,
    saveMonthDefaults,
    saveCounselorOverride,
    clearCounselorOverride,
  }
}
