import { useEffect, useMemo, useState } from 'react'
import type { CounselorDailyKpi } from '../types'
import { getFirestoreDb, isFirebaseConfigured } from '../services/firebase'
import { useAuth } from './useAuth'
import { useCounselorDirectory } from './useCounselorDirectory'
import { foldKpiRows, sumKpiSummaries, type CounselorKpiSummary } from '../utils/kpiMap'
import { foldOmicallCallsToKpiSummaries, mergeCallKpiFromOmicall } from '../utils/kpiFromOmicallCalls'
import { resolveKpiCallDataSource, type KpiCallDataSource } from '../utils/kpiDisplaySource'
import { enrichTeamLeadUidOnRows, counselorInTeamLeadScope } from '../utils/kpiTeamLeadEnrich'
import { counselorIdsInManagerScope } from '../utils/teamScope'
import { shiftVnDateKey, todayDateKey } from '../utils/kpiDisplay'
import { fetchKpiDailyCounselorRows } from '../utils/fetchKpiDailyCounselorRows'
import { resolveKpiDailyTargetUids } from '../utils/resolveKpiDailyTargetUids'
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

  const directoryIds = useMemo(() => {
    if (canGlobal) {
      return directory
        .filter((u) => u.isActive && (u.role === 'counselor' || u.role === 'ctv' || u.role === 'team_lead'))
        .map((u) => u.id)
    }
    if (canTeam && profile) {
      return counselorIdsInManagerScope(profile, directory)
    }
    return []
  }, [canGlobal, canTeam, directory, profile])

  const targetUids = useMemo(
    () =>
      resolveKpiDailyTargetUids({
        canGlobal,
        canTeam,
        selfUid: firebaseUser?.uid,
        directoryIds,
      }),
    [canGlobal, canTeam, firebaseUser?.uid, directoryIds],
  )
  const targetKey = targetUids === null ? 'all' : targetUids.join(',')

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
        const next = await fetchKpiDailyCounselorRows(db, dates, targetUids)
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
  }, [dates, firebaseUser, targetKey, targetUids])

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
    rows,
    summaries,
    totals,
    kpiCallSource,
    loading: loading || callsLoading,
    error,
    dayCount: dates.length,
    dates,
  }
}
