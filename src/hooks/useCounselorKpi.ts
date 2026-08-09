import { useEffect, useMemo, useState } from 'react'
import { collection, doc, getDoc, getDocs } from 'firebase/firestore'
import type { CounselorDailyKpi } from '../types'
import { FS_COLLECTIONS } from '../types'
import { getFirestoreDb, isFirebaseConfigured } from '../services/firebase'
import { useAuth } from './useAuth'
import { useCounselorDirectory } from './useCounselorDirectory'
import { foldKpiRows, mapKpiDoc, sumKpiSummaries, type CounselorKpiSummary } from '../utils/kpiMap'
import { foldOmicallCallsToKpiSummaries, mergeCallKpiFromOmicall } from '../utils/kpiFromOmicallCalls'
import { resolveKpiCallDataSource, type KpiCallDataSource } from '../utils/kpiDisplaySource'
import { enrichTeamLeadUidOnRows, counselorInTeamLeadScope } from '../utils/kpiTeamLeadEnrich'
import { shiftVnDateKey, todayDateKey } from '../utils/kpiDisplay'
import { useOmicallCallsForKpi } from './useOmicallCallsForKpi'

export type KpiRangePreset = 'today' | '7d' | '30d'
export type { CounselorKpiSummary, KpiCallDataSource }

export function kpiDateKeys(preset: KpiRangePreset, singleDate?: string): string[] {
  if (preset === 'today') return [singleDate ?? todayDateKey()]
  const days = preset === '30d' ? 30 : 7
  const end = todayDateKey()
  const out: string[] = []
  for (let i = days - 1; i >= 0; i--) {
    out.push(shiftVnDateKey(end, -i))
  }
  return out
}

export function useCounselorKpi(range: KpiRangePreset, singleDate?: string) {
  const { firebaseUser, profile, can } = useAuth()
  const { users: directory } = useCounselorDirectory()
  const [rows, setRows] = useState<CounselorDailyKpi[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const dates = useMemo(() => kpiDateKeys(range, singleDate), [range, singleDate])
  const canGlobal = can('analytics:advanced') || can('leads:read:global')
  const canTeam = can('leads:read:team_scope') || can('dashboard:team_lead')

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
            next.push(mapKpiDoc(d.id, d.data() as Record<string, unknown>))
          })
        }
        if (!cancelled) setRows(next)
      } catch (e) {
        if (!cancelled) {
          const raw = e instanceof Error ? e.message : ''
          const denied = /permission|insufficient/i.test(raw)
          setError(
            denied
              ? 'Chưa có quyền đọc KPI ngày. Kiểm tra đăng nhập / trường còn hoạt động, hoặc báo quản trị rules Firestore.'
              : raw || 'Không đọc được KPI OMICall.',
          )
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [canGlobal, canTeam, dates, firebaseUser])

  const from = dates[0] ?? todayDateKey()
  const to = dates[dates.length - 1] ?? from
  const { calls: omicallCalls, loading: callsLoading } = useOmicallCallsForKpi(from, to)

  const rawKpiSummaries = useMemo(() => {
    const folded = foldKpiRows(enrichTeamLeadUidOnRows(rows, directory), range)
    if (canGlobal) return folded
    if (!canTeam || !profile) {
      return folded.filter((s) => s.counselorUid === firebaseUser?.uid)
    }
    return folded.filter((s) =>
      counselorInTeamLeadScope(s.counselorUid, profile, directory, s.teamLeadUid),
    )
  }, [rows, range, directory, canGlobal, canTeam, profile, firebaseUser?.uid])

  const callSummaries = useMemo(() => {
    const folded = foldOmicallCallsToKpiSummaries(omicallCalls, dates)
    const enriched = enrichTeamLeadUidOnRows(folded, directory)
    if (canGlobal) return enriched
    if (!canTeam || !profile) {
      return enriched.filter((s) => s.counselorUid === firebaseUser?.uid)
    }
    return enriched.filter((s) =>
      counselorInTeamLeadScope(s.counselorUid, profile, directory, s.teamLeadUid),
    )
  }, [omicallCalls, dates, directory, canGlobal, canTeam, profile, firebaseUser?.uid])

  const summaries = useMemo(
    () => mergeCallKpiFromOmicall(rawKpiSummaries, callSummaries),
    [rawKpiSummaries, callSummaries],
  )
  const totals = useMemo(() => sumKpiSummaries(summaries), [summaries])
  const kpiCallSource = useMemo((): KpiCallDataSource => {
    const kpiCalls = sumKpiSummaries(rawKpiSummaries).totalCalls
    const liveCalls = sumKpiSummaries(callSummaries).totalCalls
    const mergedCalls = sumKpiSummaries(summaries).totalCalls
    return resolveKpiCallDataSource(kpiCalls, liveCalls, mergedCalls)
  }, [rawKpiSummaries, callSummaries, summaries])

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
