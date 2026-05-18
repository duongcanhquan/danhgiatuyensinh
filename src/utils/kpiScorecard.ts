import type { CounselorMonthlyKpi, KpiBonusTier } from '../types'
import type { KpiEvaluationRuntime } from './kpiEvaluationRules'
import {
  bonusTierLabels,
  getDefaultKpiEvaluationRules,
  buildKpiEvaluationRuntime,
  monthlyPerformanceScore as scoreWithConfig,
} from './kpiEvaluationRules'

const defaultRuntime = buildKpiEvaluationRuntime(getDefaultKpiEvaluationRules())

/** Điểm tổng hợp tháng — dùng cấu hình runtime (mặc định nếu không truyền). */
export function monthlyPerformanceScore(
  k: Pick<
    CounselorMonthlyKpi,
    'validCalls' | 'warmNew' | 'hotNew' | 'depositPaidCount' | 'approvedRevenueVnd' | 'newToInterested'
  >,
  cfg: KpiEvaluationRuntime = defaultRuntime,
): number {
  return scoreWithConfig(k, cfg)
}

export function getBonusTierLabels(cfg: KpiEvaluationRuntime = defaultRuntime): Record<KpiBonusTier, string> {
  return bonusTierLabels(cfg)
}

export const BONUS_TIER_LABELS: Record<KpiBonusTier, string> = bonusTierLabels(defaultRuntime)

export const BONUS_TIER_STYLES: Record<KpiBonusTier, string> = {
  gold: 'bg-amber-100 text-amber-950 border-amber-300',
  silver: 'bg-slate-200 text-slate-900 border-slate-400',
  bronze: 'bg-orange-100 text-orange-950 border-orange-300',
  none: 'bg-slate-50 text-slate-500 border-slate-200',
}
