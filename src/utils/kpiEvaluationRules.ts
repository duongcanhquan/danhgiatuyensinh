import type { CounselorMonthlyKpi, KpiBonusTier, KpiEvaluationConfigPersisted } from '../types'
import type { CounselorKpiSummary } from './kpiMap'

export type KpiEvaluationRuntime = KpiEvaluationConfigPersisted & {
  validCallDedupWindowMs: number
}

function clamp(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min
  return Math.max(min, Math.min(max, n))
}

function str(v: unknown, fallback: string): string {
  const s = String(v ?? '').trim()
  return s || fallback
}

export function getDefaultKpiEvaluationRules(): KpiEvaluationConfigPersisted {
  return {
    schemaVersion: 1,
    validCall: {
      minBillSeconds: 45,
      dedupWindowHours: 4,
    },
    warnings: {
      spam: { minTotalCalls: 50, minValidRatio: 0.35, label: 'Nghi spam' },
      noDeposit: { minTotalCalls: 80, label: 'Chưa cọc' },
      lowConnect: { maxConnectRatio: 0.25, label: 'Bắt máy thấp' },
    },
    monthlyScore: {
      capCalls: 20,
      capConversion: 15,
      capDeposit: 25,
      capRevenue: 30,
      capInterested: 10,
      targetValidCalls: 120,
      pointsPerWarmHot: 2,
      pointsPerDeposit: 5,
      revenueDenominatorVnd: 50_000_000,
      pointsPerInterested: 1,
    },
    bonusTiers: {
      goldMaxPercentile: 0.1,
      silverMaxPercentile: 0.35,
      bronzeMaxPercentile: 0.65,
      labelGold: 'Vàng (top 10%)',
      labelSilver: 'Bạc (top 35%)',
      labelBronze: 'Đồng (top 65%)',
      labelNone: '—',
    },
    finance: {
      approvalStatus: 'ĐỒNG Ý',
      fullNeStatus: 'ĐÃ FULL NE',
    },
  }
}

export function mergeKpiEvaluationRules(
  remote: KpiEvaluationConfigPersisted | null | undefined,
): KpiEvaluationConfigPersisted {
  const d = getDefaultKpiEvaluationRules()
  if (!remote || remote.schemaVersion !== 1) return d
  return {
    schemaVersion: 1,
    validCall: {
      minBillSeconds: clamp(Math.round(remote.validCall?.minBillSeconds ?? d.validCall.minBillSeconds), 10, 600),
      dedupWindowHours: clamp(Math.round(remote.validCall?.dedupWindowHours ?? d.validCall.dedupWindowHours), 1, 24),
    },
    warnings: {
      spam: {
        minTotalCalls: clamp(Math.round(remote.warnings?.spam?.minTotalCalls ?? d.warnings.spam.minTotalCalls), 1, 500),
        minValidRatio: clamp(Number(remote.warnings?.spam?.minValidRatio ?? d.warnings.spam.minValidRatio), 0.05, 1),
        label: str(remote.warnings?.spam?.label, d.warnings.spam.label),
      },
      noDeposit: {
        minTotalCalls: clamp(
          Math.round(remote.warnings?.noDeposit?.minTotalCalls ?? d.warnings.noDeposit.minTotalCalls),
          1,
          500,
        ),
        label: str(remote.warnings?.noDeposit?.label, d.warnings.noDeposit.label),
      },
      lowConnect: {
        maxConnectRatio: clamp(
          Number(remote.warnings?.lowConnect?.maxConnectRatio ?? d.warnings.lowConnect.maxConnectRatio),
          0.05,
          1,
        ),
        label: str(remote.warnings?.lowConnect?.label, d.warnings.lowConnect.label),
      },
    },
    monthlyScore: {
      capCalls: clamp(Math.round(remote.monthlyScore?.capCalls ?? d.monthlyScore.capCalls), 0, 100),
      capConversion: clamp(Math.round(remote.monthlyScore?.capConversion ?? d.monthlyScore.capConversion), 0, 100),
      capDeposit: clamp(Math.round(remote.monthlyScore?.capDeposit ?? d.monthlyScore.capDeposit), 0, 100),
      capRevenue: clamp(Math.round(remote.monthlyScore?.capRevenue ?? d.monthlyScore.capRevenue), 0, 100),
      capInterested: clamp(Math.round(remote.monthlyScore?.capInterested ?? d.monthlyScore.capInterested), 0, 100),
      targetValidCalls: clamp(
        Math.round(remote.monthlyScore?.targetValidCalls ?? d.monthlyScore.targetValidCalls),
        1,
        10_000,
      ),
      pointsPerWarmHot: clamp(Number(remote.monthlyScore?.pointsPerWarmHot ?? d.monthlyScore.pointsPerWarmHot), 0, 50),
      pointsPerDeposit: clamp(Number(remote.monthlyScore?.pointsPerDeposit ?? d.monthlyScore.pointsPerDeposit), 0, 50),
      revenueDenominatorVnd: clamp(
        Math.round(remote.monthlyScore?.revenueDenominatorVnd ?? d.monthlyScore.revenueDenominatorVnd),
        1_000_000,
        1_000_000_000_000,
      ),
      pointsPerInterested: clamp(
        Number(remote.monthlyScore?.pointsPerInterested ?? d.monthlyScore.pointsPerInterested),
        0,
        50,
      ),
    },
    bonusTiers: {
      goldMaxPercentile: clamp(Number(remote.bonusTiers?.goldMaxPercentile ?? d.bonusTiers.goldMaxPercentile), 0.01, 0.5),
      silverMaxPercentile: clamp(
        Number(remote.bonusTiers?.silverMaxPercentile ?? d.bonusTiers.silverMaxPercentile),
        0.05,
        0.9,
      ),
      bronzeMaxPercentile: clamp(
        Number(remote.bonusTiers?.bronzeMaxPercentile ?? d.bonusTiers.bronzeMaxPercentile),
        0.1,
        1,
      ),
      labelGold: str(remote.bonusTiers?.labelGold, d.bonusTiers.labelGold),
      labelSilver: str(remote.bonusTiers?.labelSilver, d.bonusTiers.labelSilver),
      labelBronze: str(remote.bonusTiers?.labelBronze, d.bonusTiers.labelBronze),
      labelNone: str(remote.bonusTiers?.labelNone, d.bonusTiers.labelNone),
    },
    finance: {
      approvalStatus: str(remote.finance?.approvalStatus, d.finance.approvalStatus),
      fullNeStatus: str(remote.finance?.fullNeStatus, d.finance.fullNeStatus),
    },
  }
}

export function buildKpiEvaluationRuntime(merged: KpiEvaluationConfigPersisted): KpiEvaluationRuntime {
  const m = mergeKpiEvaluationRules(merged)
  let { goldMaxPercentile, silverMaxPercentile, bronzeMaxPercentile } = m.bonusTiers
  if (silverMaxPercentile <= goldMaxPercentile) silverMaxPercentile = goldMaxPercentile + 0.05
  if (bronzeMaxPercentile <= silverMaxPercentile) bronzeMaxPercentile = silverMaxPercentile + 0.05
  return {
    ...m,
    bonusTiers: { ...m.bonusTiers, goldMaxPercentile, silverMaxPercentile, bronzeMaxPercentile },
    validCallDedupWindowMs: m.validCall.dedupWindowHours * 60 * 60 * 1000,
  }
}

export function parseKpiEvaluationDoc(raw: Record<string, unknown>): KpiEvaluationConfigPersisted | null {
  if (Number(raw.schemaVersion) !== 1) return null
  return mergeKpiEvaluationRules(raw as unknown as KpiEvaluationConfigPersisted)
}

export function validCallRuleHint(cfg: KpiEvaluationRuntime): string {
  return `HL = ≥${cfg.validCall.minBillSeconds}s + có hồ sơ, không trùng lead trong ${cfg.validCall.dedupWindowHours}h`
}

export type KpiRowWarning = { id: 'spam' | 'no_deposit' | 'low_connect'; label: string }

export function evaluateKpiRowWarnings(
  row: CounselorKpiSummary,
  cfg: KpiEvaluationRuntime,
): KpiRowWarning | null {
  const { warnings } = cfg
  const validRatio = row.totalCalls > 0 ? row.validCalls / row.totalCalls : 1
  const connectRatio = row.totalCalls > 0 ? row.connectedCalls / row.totalCalls : 1

  if (row.totalCalls >= warnings.spam.minTotalCalls && validRatio < warnings.spam.minValidRatio) {
    return { id: 'spam', label: warnings.spam.label }
  }
  if (row.totalCalls >= warnings.noDeposit.minTotalCalls && row.depositPaidCount === 0) {
    return { id: 'no_deposit', label: warnings.noDeposit.label }
  }
  if (row.totalCalls > 0 && connectRatio < warnings.lowConnect.maxConnectRatio) {
    return { id: 'low_connect', label: warnings.lowConnect.label }
  }
  return null
}

export function monthlyPerformanceScore(
  k: Pick<
    CounselorMonthlyKpi,
    'validCalls' | 'warmNew' | 'hotNew' | 'depositPaidCount' | 'approvedRevenueVnd' | 'newToInterested'
  >,
  cfg: KpiEvaluationRuntime,
): number {
  const s = cfg.monthlyScore
  const callPts =
    s.targetValidCalls > 0
      ? Math.min(s.capCalls, Math.round((k.validCalls / s.targetValidCalls) * s.capCalls))
      : 0
  const convPts = Math.min(s.capConversion, (k.warmNew + k.hotNew) * s.pointsPerWarmHot)
  const depositPts = Math.min(s.capDeposit, k.depositPaidCount * s.pointsPerDeposit)
  const revenuePts =
    s.revenueDenominatorVnd > 0
      ? Math.min(s.capRevenue, Math.round((k.approvedRevenueVnd / s.revenueDenominatorVnd) * s.capRevenue))
      : 0
  const interestedPts = Math.min(s.capInterested, k.newToInterested * s.pointsPerInterested)
  const total = callPts + convPts + depositPts + revenuePts + interestedPts
  const maxTotal = s.capCalls + s.capConversion + s.capDeposit + s.capRevenue + s.capInterested
  return Math.min(maxTotal > 0 ? maxTotal : 100, total)
}

export function bonusTierFromPercentile(pct: number, cfg: KpiEvaluationRuntime): KpiBonusTier {
  const t = cfg.bonusTiers
  if (pct <= t.goldMaxPercentile) return 'gold'
  if (pct <= t.silverMaxPercentile) return 'silver'
  if (pct <= t.bronzeMaxPercentile) return 'bronze'
  return 'none'
}

export function bonusTierLabels(cfg: KpiEvaluationRuntime): Record<KpiBonusTier, string> {
  return {
    gold: cfg.bonusTiers.labelGold,
    silver: cfg.bonusTiers.labelSilver,
    bronze: cfg.bonusTiers.labelBronze,
    none: cfg.bonusTiers.labelNone,
  }
}

export const KPI_SCORE_BREAKDOWN_LABELS = [
  { key: 'calls' as const, label: 'Gọi hợp lệ', capKey: 'capCalls' as const },
  { key: 'conversion' as const, label: 'WARM+ / HOT+', capKey: 'capConversion' as const },
  { key: 'deposit' as const, label: 'Cọc', capKey: 'capDeposit' as const },
  { key: 'revenue' as const, label: 'Doanh thu', capKey: 'capRevenue' as const },
  { key: 'interested' as const, label: 'NEW→Quan tâm', capKey: 'capInterested' as const },
]
