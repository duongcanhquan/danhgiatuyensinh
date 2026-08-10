import { useEffect, useMemo, useState } from 'react'
import type { CounselorDailyKpi } from '../types'
import { getFirestoreDb, isFirebaseConfigured } from '../services/firebase'
import { useAuth } from './useAuth'
import { useCounselorDirectory } from './useCounselorDirectory'
import { foldKpiRows, sumKpiSummaries } from '../utils/kpiMap'
import { foldOmicallCallsToKpiSummaries, kpiDayKeyFromDate, mergeCallKpiFromOmicall, vnDayRangeFromKeys } from '../utils/kpiFromOmicallCalls'
import { resolveKpiCallDataSource, type KpiCallDataSource } from '../utils/kpiDisplaySource'
import { enrichTeamLeadUidOnRows, counselorInTeamLeadScope } from '../utils/kpiTeamLeadEnrich'
import { counselorIdsInManagerScope } from '../utils/teamScope'
import { fetchKpiDailyCounselorRows } from '../utils/fetchKpiDailyCounselorRows'
import { resolveKpiDailyTargetUids } from '../utils/resolveKpiDailyTargetUids'
import { useOmicallCallsForKpi } from './useOmicallCallsForKpi'

function dateKeysBetween(from: string, to: string): string[] {
  const { from: start, to: end } = vnDayRangeFromKeys(from, to)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) return []
  const out: string[] = []
  const cur = new Date(start)
  const endDay = kpiDayKeyFromDate(end)
  while (true) {
    const key = kpiDayKeyFromDate(cur)
    out.push(key)
    if (key >= endDay) break
    cur.setDate(cur.getDate() + 1)
  }
  return out
}

/** KPI daily gộp theo khoảng ngày tùy chọn (admin / team). */
export function useCounselorKpiDateRange(
  from: string,
  to: string,
  counselorUidFilter?: string,
  options?: { enabled?: boolean; includeOmicallCalls?: boolean },
) {
  const { firebaseUser, profile, can } = useAuth()
  const { users: directory } = useCounselorDirectory()
  const [rows, setRows] = useState<CounselorDailyKpi[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const dates = useMemo(() => dateKeysBetween(from, to), [from, to])
  const enabled = options?.enabled !== false
  const includeOmicallCalls = options?.includeOmicallCalls !== false
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
        counselorUidFilter,
      }),
    [canGlobal, canTeam, firebaseUser?.uid, directoryIds, counselorUidFilter],
  )

  const targetKey = targetUids === null ? 'all' : targetUids.join(',')

  useEffect(() => {
    const db = getFirestoreDb()
    if (!enabled || !db || !isFirebaseConfigured() || !firebaseUser || dates.length === 0) {
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
              ? 'Chưa có quyền đọc KPI theo kỳ. Kiểm tra đăng nhập / trường còn hoạt động, hoặc báo quản trị rules Firestore.'
              : raw || 'Không đọc KPI.',
          )
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [dates, enabled, firebaseUser, targetKey, targetUids])

  const { calls: omicallCalls, loading: callsLoading } = useOmicallCallsForKpi(
    from,
    to,
    counselorUidFilter,
    enabled && includeOmicallCalls,
  )

  const rawKpiSummaries = useMemo(() => {
    const folded = foldKpiRows(enrichTeamLeadUidOnRows(rows, directory), '30d')
    let list = folded
    if (!canGlobal) {
      if (!canTeam || !profile) {
        list = folded.filter((s) => s.counselorUid === firebaseUser?.uid)
      } else {
        list = folded.filter((s) =>
          counselorInTeamLeadScope(s.counselorUid, profile, directory, s.teamLeadUid),
        )
      }
    }
    if (counselorUidFilter) list = list.filter((s) => s.counselorUid === counselorUidFilter)
    return list
  }, [rows, directory, canGlobal, canTeam, profile, firebaseUser?.uid, counselorUidFilter])

  const callSummaries = useMemo(() => {
    const folded = enrichTeamLeadUidOnRows(foldOmicallCallsToKpiSummaries(omicallCalls, dates), directory)
    let list = folded
    if (!canGlobal) {
      if (!canTeam || !profile) {
        list = folded.filter((s) => s.counselorUid === firebaseUser?.uid)
      } else {
        list = folded.filter((s) =>
          counselorInTeamLeadScope(s.counselorUid, profile, directory, s.teamLeadUid),
        )
      }
    }
    if (counselorUidFilter) list = list.filter((s) => s.counselorUid === counselorUidFilter)
    return list
  }, [omicallCalls, dates, directory, canGlobal, canTeam, profile, firebaseUser?.uid, counselorUidFilter])

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
  }
}
