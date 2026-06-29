import type { CounselorMonthlyKpi } from '../types'
import type { KpiStaffRole, KpiV2ConfigPersisted } from '../types'
import { countBusinessDaysInMonth } from './businessDays'
import { ratioToScore } from './kpiCompositeScore'

export type KpiV2ScoreBreakdown = {
  total: number
  validCalls: number
  leadCham: number
  warm: number
  deposit: number
  enrolled: number
}

type MetricsLike = Pick<
  CounselorMonthlyKpi,
  | 'validCalls'
  | 'warmNew'
  | 'hotNew'
  | 'depositPaidCount'
  | 'toEnrolled'
  | 'fullNeCount'
> & { leadCham?: number; lpxtCount?: number }

export function computeKpiV2MonthlyScore(
  metrics: MetricsLike,
  role: KpiStaffRole,
  cfg: KpiV2ConfigPersisted,
  monthKey: string,
): KpiV2ScoreBreakdown {
  const w = cfg.monthlyScoreWeights[role]
  const bizDays = Math.max(1, countBusinessDaysInMonth(monthKey, cfg.businessHolidays))
  const daily = cfg.dailyTargets[role].all

  const hlTarget = cfg.monthlyCallTargets[role].perDay * bizDays
  const lcTarget = Math.max(1, (daily.leadCham ?? 0) * bizDays)
  const warmTarget = Math.max(1, (daily.warmHot ?? 0) * bizDays)
  const depTarget = Math.max(1, (daily.depositPaidCount ?? 0) * bizDays)
  const enrTarget = Math.max(1, (daily.toEnrolled ?? daily.depositPaidCount ?? 0) * bizDays)

  const validCalls = ratioToScore(metrics.validCalls, hlTarget)
  const leadCham = ratioToScore(metrics.leadCham ?? 0, lcTarget)
  const warm = ratioToScore((metrics.warmNew ?? 0) + (metrics.hotNew ?? 0), warmTarget)
  const deposit = ratioToScore(metrics.depositPaidCount ?? 0, depTarget)
  const enrolled = ratioToScore((metrics.toEnrolled ?? 0) + (metrics.fullNeCount ?? 0), enrTarget)

  const parts = [
    { score: validCalls, weight: w.validCalls },
    { score: leadCham, weight: w.leadCham },
    { score: warm, weight: w.warm },
    { score: deposit, weight: w.deposit },
  ]
  if (w.enrolled != null && w.enrolled > 0) parts.push({ score: enrolled, weight: w.enrolled })

  const totalW = parts.reduce((s, p) => s + p.weight, 0)
  const total =
    totalW > 0
      ? Math.round(parts.reduce((s, p) => s + (p.score * p.weight) / totalW, 0))
      : 0

  return { total, validCalls, leadCham, warm, deposit, enrolled }
}

export const KPI_V2_SCORE_LABELS: Record<keyof Omit<KpiV2ScoreBreakdown, 'total'>, string> = {
  validCalls: 'Gọi HL',
  leadCham: 'Lead chạm',
  warm: 'Warm/Hot',
  deposit: 'Cọc',
  enrolled: 'Nhập học',
}
