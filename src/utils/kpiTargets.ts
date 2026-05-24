import type { KpiMetricTargets } from '../types'

export function getDefaultKpiMetricTargets(): KpiMetricTargets {
  return {
    validCalls: 120,
    uniqueLeadsCalled: 80,
    warmHot: 8,
    newToInterested: 10,
    crmActions: 200,
    depositPaidCount: 3,
    enrolled: 2,
    approvedRevenueVnd: 50_000_000,
  }
}

function num(v: unknown, fallback: number): number {
  const n = Number(v ?? fallback)
  return Number.isFinite(n) ? n : fallback
}

export function mergeKpiMetricTargets(
  base: KpiMetricTargets,
  partial?: Partial<KpiMetricTargets> | null,
): KpiMetricTargets {
  if (!partial) return { ...base }
  return {
    validCalls: Math.max(1, Math.round(num(partial.validCalls, base.validCalls))),
    uniqueLeadsCalled: Math.max(1, Math.round(num(partial.uniqueLeadsCalled, base.uniqueLeadsCalled))),
    warmHot: Math.max(0, Math.round(num(partial.warmHot, base.warmHot))),
    newToInterested: Math.max(0, Math.round(num(partial.newToInterested, base.newToInterested))),
    crmActions: Math.max(0, Math.round(num(partial.crmActions, base.crmActions))),
    depositPaidCount: Math.max(0, Math.round(num(partial.depositPaidCount, base.depositPaidCount))),
    enrolled: Math.max(0, Math.round(num(partial.enrolled, base.enrolled))),
    approvedRevenueVnd: Math.max(0, Math.round(num(partial.approvedRevenueVnd, base.approvedRevenueVnd))),
  }
}

export function parseKpiMetricTargets(raw: unknown): KpiMetricTargets | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  return mergeKpiMetricTargets(getDefaultKpiMetricTargets(), o as Partial<KpiMetricTargets>)
}

export function resolveCounselorTargets(
  globalFromConfig: KpiMetricTargets,
  monthDefaults: Partial<KpiMetricTargets> | null | undefined,
  counselorOverrides: Partial<KpiMetricTargets> | null | undefined,
): KpiMetricTargets {
  const monthBase = mergeKpiMetricTargets(globalFromConfig, monthDefaults)
  return mergeKpiMetricTargets(monthBase, counselorOverrides)
}
