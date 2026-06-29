import type { CounselorMonthlyKpi, KpiBonusTier, KpiStaffRole, VietMyUserProfile } from '../types'
import type { KpiEvaluationRuntime } from './kpiEvaluationRules'
import type { KpiV2ScoreBreakdown } from './kpiV2Score'
import { computeKpiV2MonthlyScore } from './kpiV2Score'
import { userRoleToKpiStaffRole } from './kpiV2Config'
import { enrichMonthlyKpiDisplay } from './kpiMonthlyDisplay'
import type { KpiV2ConfigPersisted } from '../types'

export type EnrichedMonthlyKpiRow = CounselorMonthlyKpi & {
  name: string
  compositeScore: number
  v2Breakdown: KpiV2ScoreBreakdown
  kpiStaffRole: KpiStaffRole
  displayTier: KpiBonusTier
  revenueTier: KpiBonusTier
  displayRank: number
}

export function buildEnrichedMonthlyKpiRows(options: {
  rows: CounselorMonthlyKpi[]
  month: string
  users: VietMyUserProfile[]
  runtime: KpiEvaluationRuntime
  v2Config: KpiV2ConfigPersisted
}): EnrichedMonthlyKpiRow[] {
  const { rows, month, users, runtime, v2Config } = options
  const labels = new Map(users.map((u) => [u.id, u.displayName || u.email || u.id]))
  const roles = new Map(
    users.map((u) => [u.id, userRoleToKpiStaffRole(u.role) ?? ('counselor' as KpiStaffRole)]),
  )

  const base = rows.map((r) => {
    const kpiStaffRole = roles.get(r.counselorUid) ?? 'counselor'
    const v2Breakdown = computeKpiV2MonthlyScore(r, kpiStaffRole, v2Config, month)
    return {
      ...r,
      v2Breakdown,
      compositeScore: v2Breakdown.total,
      name: labels.get(r.counselorUid) ?? r.counselorUid,
      kpiStaffRole,
    }
  })

  return enrichMonthlyKpiDisplay(base, runtime, {
    rankByScoreOnly: v2Config.rankByKpiScoreOnly,
  }) as EnrichedMonthlyKpiRow[]
}
