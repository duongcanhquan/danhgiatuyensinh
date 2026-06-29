import type { CounselorMonthlyKpi, KpiBonusTier, KpiManualScoreRecord, KpiMetricTargets } from '../types'
import type { KpiEvaluationRuntime } from './kpiEvaluationRules'
import {
  bonusTierLabels,
  getDefaultKpiEvaluationRules,
  buildKpiEvaluationRuntime,
  monthlyPerformanceScore as scoreWithConfig,
} from './kpiEvaluationRules'
import { computeCompositeForCounselor } from './kpiCompositeScore'

const defaultRuntime = buildKpiEvaluationRuntime(getDefaultKpiEvaluationRules())

/** Điểm tổng hợp tháng legacy — công thức cũ. */
export function monthlyPerformanceScore(
  k: Pick<
    CounselorMonthlyKpi,
    'validCalls' | 'warmNew' | 'hotNew' | 'depositPaidCount' | 'approvedRevenueVnd' | 'newToInterested'
  >,
  cfg: KpiEvaluationRuntime = defaultRuntime,
): number {
  return scoreWithConfig(k, cfg)
}

/** Điểm KPI tổng hợp 40/30/10/20 — dùng mục tiêu tháng + ghi đè TVV. */
export function compositePerformanceScore(
  k: CounselorMonthlyKpi & { notesAdded?: number },
  cfg: KpiEvaluationRuntime = defaultRuntime,
  monthDefaults?: Partial<KpiMetricTargets> | null,
  counselorOverrides?: Partial<KpiMetricTargets> | null,
  manual?: KpiManualScoreRecord | null,
): number {
  return computeCompositeForCounselor(
    { ...k, notesAdded: k.notesAdded ?? 0 },
    cfg,
    monthDefaults,
    counselorOverrides,
    manual,
  ).total
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
