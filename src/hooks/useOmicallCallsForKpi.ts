import { useMemo } from 'react'
import { useAuth } from './useAuth'
import { useOmicallCalls, type OmicallCallsScope } from './useOmicallCalls'

/** Tải omicallCalls trong khoảng ngày để bù KPI khi kpiDaily chưa đồng bộ. */
export function useOmicallCallsForKpi(from: string, to: string, counselorUidFilter?: string) {
  const { firebaseUser, profile, can } = useAuth()
  const viewerSip = profile?.omicallSipUser ?? undefined
  const [fromDate, toDate] = useMemo(() => {
    return [new Date(`${from}T00:00:00`), new Date(`${to}T23:59:59`)] as const
  }, [from, to])

  const canGlobal = can('analytics:advanced') || can('leads:read:global')
  const canTeam = can('leads:read:team_scope')

  const scope = useMemo((): OmicallCallsScope => {
    if (counselorUidFilter) return { mode: 'counselor', counselorUid: counselorUidFilter }
    if (canGlobal) return { mode: 'global' }
    if (canTeam && profile?.id) return { mode: 'team', teamLeadUid: profile.id }
    const uid = profile?.id || firebaseUser?.uid || ''
    return { mode: 'counselor', counselorUid: uid }
  }, [canGlobal, canTeam, counselorUidFilter, profile?.id, firebaseUser?.uid])

  const maxRows = scope.mode === 'global' ? 3000 : 1500
  return useOmicallCalls({ scope, from: fromDate, to: toDate, maxRows, viewerSipUser: viewerSip })
}
