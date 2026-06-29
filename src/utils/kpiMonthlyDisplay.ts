import type { KpiBonusTier } from '../types'
import type { KpiEvaluationRuntime } from './kpiEvaluationRules'
import { bonusTierFromPercentile } from './kpiEvaluationRules'

export type MonthlyKpiRowLike = {
  counselorUid: string
  compositeScore: number
  approvedRevenueVnd: number
  bonusTier?: KpiBonusTier | string | null
}

/** Gán hạng hiển thị: theo điểm KPI tổng hợp hoặc doanh thu (server). */
export function enrichMonthlyKpiDisplay<T extends MonthlyKpiRowLike>(
  rows: T[],
  runtime: KpiEvaluationRuntime,
  opts?: { rankByScoreOnly?: boolean },
): (T & { displayTier: KpiBonusTier; revenueTier: KpiBonusTier; displayRank: number })[] {
  const revenueTierOf = (r: T): KpiBonusTier => (r.bonusTier as KpiBonusTier) ?? 'none'
  const rankByComposite = opts?.rankByScoreOnly ?? runtime.composite.rankBy === 'composite'

  const sortedForRank = [...rows].sort((a, b) =>
    rankByComposite
      ? b.compositeScore - a.compositeScore || b.approvedRevenueVnd - a.approvedRevenueVnd
      : b.approvedRevenueVnd - a.approvedRevenueVnd || b.compositeScore - a.compositeScore,
  )

  const rankMap = new Map<string, number>()
  sortedForRank.forEach((r, i) => rankMap.set(r.counselorUid, i + 1))

  const sortedForTier = rankByComposite
    ? sortedForRank
    : [...rows].sort((a, b) => b.approvedRevenueVnd - a.approvedRevenueVnd)

  const tierMap = new Map<string, KpiBonusTier>()
  sortedForTier.forEach((r, i) => {
    const pct = sortedForTier.length > 1 ? i / (sortedForTier.length - 1) : 0
    tierMap.set(r.counselorUid, bonusTierFromPercentile(pct, runtime))
  })

  return rows.map((r) => {
    const revenueTier = revenueTierOf(r)
    const performanceTier = tierMap.get(r.counselorUid) ?? 'none'
    return {
      ...r,
      revenueTier,
      displayTier: rankByComposite ? performanceTier : revenueTier,
      displayRank: rankMap.get(r.counselorUid) ?? 99,
    }
  })
}
