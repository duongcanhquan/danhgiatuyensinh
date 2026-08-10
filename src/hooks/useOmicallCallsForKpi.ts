import { useMemo } from 'react'
import { useAuth } from './useAuth'
import { useCounselorDirectory } from './useCounselorDirectory'
import { useOmicallCalls, type OmicallCallsScope } from './useOmicallCalls'
import { vnDayRangeFromKeys } from '../utils/kpiFromOmicallCalls'
import { counselorIdsInManagerScope } from '../utils/teamScope'
import { canSchoolWideReportScope } from '../utils/reportScope'

/** Tải omicallCalls trong khoảng ngày để bù KPI khi kpiDaily chưa đồng bộ. */
export function useOmicallCallsForKpi(
  from: string,
  to: string,
  counselorUidFilter?: string,
  enabled = true,
) {
  const { firebaseUser, profile, can } = useAuth()
  const { users: directory } = useCounselorDirectory()
  const viewerSip = profile?.omicallSipUser ?? undefined
  const rangeOk = Boolean(from.trim() && to.trim())
  const [fromDate, toDate] = useMemo(() => {
    if (!rangeOk) {
      const epoch = new Date(0)
      return [epoch, epoch] as const
    }
    const range = vnDayRangeFromKeys(from, to)
    return [range.from, range.to] as const
  }, [from, to, rangeOk])

  const canGlobal = canSchoolWideReportScope(can, profile?.role)
  const canTeam = can('leads:read:team_scope') || can('dashboard:team_lead')

  const scope = useMemo((): OmicallCallsScope => {
    if (counselorUidFilter) return { mode: 'counselor', counselorUid: counselorUidFilter }
    if (canGlobal) return { mode: 'global' }
    if (canTeam && profile?.id) {
      const counselorUids = counselorIdsInManagerScope(profile, directory)
      return { mode: 'team', teamLeadUid: profile.id, counselorUids }
    }
    const uid = profile?.id || firebaseUser?.uid || ''
    return { mode: 'counselor', counselorUid: uid }
  }, [canGlobal, canTeam, counselorUidFilter, profile, directory, firebaseUser?.uid])

  const maxRows = scope.mode === 'global' ? 1500 : 800
  return useOmicallCalls({
    scope,
    from: fromDate,
    to: toDate,
    enabled: enabled && rangeOk,
    maxRows,
    viewerSipUser: viewerSip,
  })
}
