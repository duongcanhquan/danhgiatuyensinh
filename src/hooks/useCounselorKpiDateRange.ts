import { useEffect, useMemo, useState } from 'react'
import { collection, getDocs } from 'firebase/firestore'
import type { CounselorDailyKpi } from '../types'
import { FS_COLLECTIONS } from '../types'
import { getFirestoreDb, isFirebaseConfigured } from '../services/firebase'
import { useAuth } from './useAuth'
import { foldKpiRows, mapKpiDoc, sumKpiSummaries } from '../utils/kpiMap'
import { foldOmicallCallsToKpiSummaries, kpiDayKeyFromDate, mergeCallKpiFromOmicall } from '../utils/kpiFromOmicallCalls'
import { resolveKpiCallDataSource, type KpiCallDataSource } from '../utils/kpiDisplaySource'
import { useOmicallCallsForKpi } from './useOmicallCallsForKpi'

function dateKeysBetween(from: string, to: string): string[] {
  const start = new Date(`${from}T00:00:00`)
  const end = new Date(`${to}T00:00:00`)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) return []
  const out: string[] = []
  const cur = new Date(start)
  while (cur <= end) {
    out.push(kpiDayKeyFromDate(cur))
    cur.setDate(cur.getDate() + 1)
  }
  return out
}

/** KPI daily gộp theo khoảng ngày tùy chọn (admin / team). */
export function useCounselorKpiDateRange(from: string, to: string, counselorUidFilter?: string) {
  const { firebaseUser, profile, can } = useAuth()
  const [rows, setRows] = useState<CounselorDailyKpi[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const dates = useMemo(() => dateKeysBetween(from, to), [from, to])
  const canGlobal = can('analytics:advanced') || can('leads:read:global')
  const canTeam = can('leads:read:team_scope')

  useEffect(() => {
    const db = getFirestoreDb()
    if (!db || !isFirebaseConfigured() || !firebaseUser || dates.length === 0) {
      setRows([])
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)
    ;(async () => {
      try {
        const next: CounselorDailyKpi[] = []
        for (const date of dates) {
          if (!canGlobal && !canTeam) {
            const { getDoc, doc } = await import('firebase/firestore')
            const snap = await getDoc(doc(db, FS_COLLECTIONS.kpiDaily, date, 'counselors', firebaseUser.uid))
            if (snap.exists()) next.push(mapKpiDoc(snap.id, snap.data() as Record<string, unknown>))
            continue
          }
          const snap = await getDocs(collection(db, FS_COLLECTIONS.kpiDaily, date, 'counselors'))
          snap.forEach((d) => {
            const row = mapKpiDoc(d.id, d.data() as Record<string, unknown>)
            if (!canGlobal && canTeam && row.teamLeadUid !== profile?.id) return
            next.push(row)
          })
        }
        if (!cancelled) setRows(next)
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Không đọc KPI.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [canGlobal, canTeam, dates, firebaseUser, profile?.id])

  const { calls: omicallCalls, loading: callsLoading } = useOmicallCallsForKpi(from, to, counselorUidFilter)

  const rawKpiSummaries = useMemo(() => foldKpiRows(rows, '30d'), [rows])
  const callSummaries = useMemo(
    () => foldOmicallCallsToKpiSummaries(omicallCalls, dates),
    [omicallCalls, dates],
  )
  const summaries = useMemo(() => {
    const merged = mergeCallKpiFromOmicall(rawKpiSummaries, callSummaries)
    if (!counselorUidFilter) return merged
    return merged.filter((s) => s.counselorUid === counselorUidFilter)
  }, [rawKpiSummaries, callSummaries, counselorUidFilter])
  const totals = useMemo(() => sumKpiSummaries(summaries), [summaries])
  const kpiCallSource = useMemo((): KpiCallDataSource => {
    const kpiCalls = sumKpiSummaries(rawKpiSummaries).totalCalls
    const liveCalls = sumKpiSummaries(callSummaries).totalCalls
    return resolveKpiCallDataSource(kpiCalls, liveCalls)
  }, [rawKpiSummaries, callSummaries])

  return {
    rows,
    summaries,
    totals,
    kpiCallSource,
    loading: loading || callsLoading,
    error,
    dayCount: dates.length,
  }
}
