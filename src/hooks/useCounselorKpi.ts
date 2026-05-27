import { useEffect, useMemo, useState } from 'react'
import { collection, doc, getDoc, getDocs } from 'firebase/firestore'
import type { CounselorDailyKpi } from '../types'
import { FS_COLLECTIONS } from '../types'
import { getFirestoreDb, isFirebaseConfigured } from '../services/firebase'
import { useAuth } from './useAuth'
import { foldKpiRows, mapKpiDoc, sumKpiSummaries, type CounselorKpiSummary } from '../utils/kpiMap'
import { foldOmicallCallsToKpiSummaries, kpiDayKeyFromDate, mergeCallKpiFromOmicall } from '../utils/kpiFromOmicallCalls'
import { resolveKpiCallDataSource, type KpiCallDataSource } from '../utils/kpiDisplaySource'
import { useOmicallCallsForKpi } from './useOmicallCallsForKpi'

export type KpiRangePreset = 'today' | '7d' | '30d'
export type { CounselorKpiSummary, KpiCallDataSource }

function dateKey(d: Date): string {
  return kpiDayKeyFromDate(d)
}

export function kpiDateKeys(preset: KpiRangePreset, singleDate?: string): string[] {
  if (preset === 'today') return [singleDate ?? dateKey(new Date())]
  const days = preset === '30d' ? 30 : 7
  const out: string[] = []
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    d.setDate(d.getDate() - i)
    out.push(dateKey(d))
  }
  return out
}

export function useCounselorKpi(range: KpiRangePreset, singleDate?: string) {
  const { firebaseUser, profile, can } = useAuth()
  const [rows, setRows] = useState<CounselorDailyKpi[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const dates = useMemo(() => kpiDateKeys(range, singleDate), [range, singleDate])
  const canGlobal = can('analytics:advanced') || can('leads:read:global')
  const canTeam = can('leads:read:team_scope')

  useEffect(() => {
    const db = getFirestoreDb()
    if (!db || !isFirebaseConfigured() || !firebaseUser) {
      setRows([])
      setLoading(false)
      setError(null)
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
        if (!cancelled) setError(e instanceof Error ? e.message : 'Không đọc được KPI OMICall.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [canGlobal, canTeam, dates, firebaseUser, profile?.id])

  const from = dates[0] ?? dateKey(new Date())
  const to = dates[dates.length - 1] ?? from
  const { calls: omicallCalls, loading: callsLoading } = useOmicallCallsForKpi(from, to)

  const rawKpiSummaries = useMemo(() => foldKpiRows(rows, range), [rows, range])
  const callSummaries = useMemo(
    () => foldOmicallCallsToKpiSummaries(omicallCalls, dates),
    [omicallCalls, dates],
  )
  const summaries = useMemo(
    () => mergeCallKpiFromOmicall(rawKpiSummaries, callSummaries),
    [rawKpiSummaries, callSummaries],
  )
  const totals = useMemo(() => sumKpiSummaries(summaries), [summaries])
  const kpiCallSource = useMemo((): KpiCallDataSource => {
    const kpiCalls = sumKpiSummaries(rawKpiSummaries).totalCalls
    const liveCalls = sumKpiSummaries(callSummaries).totalCalls
    return resolveKpiCallDataSource(kpiCalls, liveCalls)
  }, [rawKpiSummaries, callSummaries])

  return {
    dates,
    rows,
    summaries,
    totals,
    kpiCallSource,
    loading: loading || callsLoading,
    error,
  }
}
