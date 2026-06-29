import type { CounselorMonthlyKpi } from '../types'
import type { CounselorKpiSummary } from './kpiMap'

const TEAM_SUM_KEYS = [
  'totalCalls',
  'validCalls',
  'connectedCalls',
  'uniqueLeadsCalled',
  'depositPaidCount',
  'approvedRevenueVnd',
  'fullNeCount',
  'warmNew',
  'hotNew',
  'crmActions',
] as const satisfies readonly (keyof TeamMonthlyKpiAggregate)[]

export type TeamMonthlyKpiAggregate = {
  teamLeadUid: string | null
  counselorCount: number
  totalCalls: number
  validCalls: number
  connectedCalls: number
  uniqueLeadsCalled: number
  depositPaidCount: number
  approvedRevenueVnd: number
  fullNeCount: number
  warmNew: number
  hotNew: number
  crmActions: number
  avgCompositeScore: number
}

function emptyTeamAggregate(teamLeadUid: string | null): TeamMonthlyKpiAggregate {
  return {
    teamLeadUid,
    counselorCount: 0,
    totalCalls: 0,
    validCalls: 0,
    connectedCalls: 0,
    uniqueLeadsCalled: 0,
    depositPaidCount: 0,
    approvedRevenueVnd: 0,
    fullNeCount: 0,
    warmNew: 0,
    hotNew: 0,
    crmActions: 0,
    avgCompositeScore: 0,
  }
}

export function aggregateMonthlyKpiByTeam(
  rows: Array<
    CounselorMonthlyKpi & {
      compositeScore?: number
    }
  >,
): TeamMonthlyKpiAggregate[] {
  const map = new Map<string, TeamMonthlyKpiAggregate & { compositeSum: number }>()

  for (const row of rows) {
    const key = row.teamLeadUid ?? '__none__'
    const agg = map.get(key) ?? { ...emptyTeamAggregate(row.teamLeadUid ?? null), compositeSum: 0 }
    agg.counselorCount += 1
    for (const k of TEAM_SUM_KEYS) {
      agg[k] += Number(row[k] ?? 0)
    }
    agg.compositeSum += row.compositeScore ?? 0
    map.set(key, agg)
  }

  return [...map.values()]
    .map(({ compositeSum, ...rest }) => ({
      ...rest,
      avgCompositeScore: rest.counselorCount ? Math.round(compositeSum / rest.counselorCount) : 0,
    }))
    .sort((a, b) => b.approvedRevenueVnd - a.approvedRevenueVnd || b.validCalls - a.validCalls)
}

export function aggregateKpiSummariesByTeam(rows: CounselorKpiSummary[]): TeamMonthlyKpiAggregate[] {
  const map = new Map<string, TeamMonthlyKpiAggregate>()

  for (const row of rows) {
    const key = row.teamLeadUid ?? '__none__'
    const agg = map.get(key) ?? emptyTeamAggregate(row.teamLeadUid ?? null)
    agg.counselorCount += 1
    for (const k of TEAM_SUM_KEYS) {
      agg[k] += Number(row[k] ?? 0)
    }
    map.set(key, agg)
  }

  return [...map.values()].sort((a, b) => b.approvedRevenueVnd - a.approvedRevenueVnd || b.validCalls - a.validCalls)
}
