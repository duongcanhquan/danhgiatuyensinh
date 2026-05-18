import type { Firestore } from 'firebase-admin/firestore'

export type KpiEvalConfig = {
  schemaVersion: 1
  validCall: { minBillSeconds: number; dedupWindowHours: number }
  validCallDedupWindowMs: number
  warnings: {
    spam: { minTotalCalls: number; minValidRatio: number; label: string }
    noDeposit: { minTotalCalls: number; label: string }
    lowConnect: { maxConnectRatio: number; label: string }
  }
  monthlyScore: {
    capCalls: number
    capConversion: number
    capDeposit: number
    capRevenue: number
    capInterested: number
    targetValidCalls: number
    pointsPerWarmHot: number
    pointsPerDeposit: number
    revenueDenominatorVnd: number
    pointsPerInterested: number
  }
  bonusTiers: {
    goldMaxPercentile: number
    silverMaxPercentile: number
    bronzeMaxPercentile: number
  }
  finance: { approvalStatus: string; fullNeStatus: string }
}

const SCORING_AUX = 'scoringAux'
const KPI_EVAL_DOC_ID = 'kpiEvaluationConfig'

function clamp(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min
  return Math.max(min, Math.min(max, n))
}

export function getDefaultKpiEvalConfig(): KpiEvalConfig {
  const validCall = { minBillSeconds: 45, dedupWindowHours: 4 }
  return {
    schemaVersion: 1,
    validCall,
    validCallDedupWindowMs: validCall.dedupWindowHours * 60 * 60 * 1000,
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
    },
    finance: { approvalStatus: 'ĐỒNG Ý', fullNeStatus: 'ĐÃ FULL NE' },
  }
}

function mergeRemote(raw: Record<string, unknown>): KpiEvalConfig {
  const d = getDefaultKpiEvalConfig()
  const vc = (raw.validCall ?? {}) as Record<string, unknown>
  const validCall = {
    minBillSeconds: clamp(Math.round(Number(vc.minBillSeconds ?? d.validCall.minBillSeconds)), 10, 600),
    dedupWindowHours: clamp(Math.round(Number(vc.dedupWindowHours ?? d.validCall.dedupWindowHours)), 1, 24),
  }
  const bt = (raw.bonusTiers ?? {}) as Record<string, unknown>
  let goldMaxPercentile = clamp(Number(bt.goldMaxPercentile ?? d.bonusTiers.goldMaxPercentile), 0.01, 0.5)
  let silverMaxPercentile = clamp(Number(bt.silverMaxPercentile ?? d.bonusTiers.silverMaxPercentile), 0.05, 0.9)
  let bronzeMaxPercentile = clamp(Number(bt.bronzeMaxPercentile ?? d.bonusTiers.bronzeMaxPercentile), 0.1, 1)
  if (silverMaxPercentile <= goldMaxPercentile) silverMaxPercentile = goldMaxPercentile + 0.05
  if (bronzeMaxPercentile <= silverMaxPercentile) bronzeMaxPercentile = silverMaxPercentile + 0.05
  const fin = (raw.finance ?? {}) as Record<string, unknown>
  return {
    schemaVersion: 1,
    validCall,
    validCallDedupWindowMs: validCall.dedupWindowHours * 60 * 60 * 1000,
    warnings: d.warnings,
    monthlyScore: d.monthlyScore,
    bonusTiers: { goldMaxPercentile, silverMaxPercentile, bronzeMaxPercentile },
    finance: {
      approvalStatus: String(fin.approvalStatus ?? d.finance.approvalStatus).trim() || d.finance.approvalStatus,
      fullNeStatus: String(fin.fullNeStatus ?? d.finance.fullNeStatus).trim() || d.finance.fullNeStatus,
    },
  }
}

let cached: KpiEvalConfig | null = null
let cachedAt = 0
const CACHE_MS = 60_000

export async function loadKpiEvalConfig(db: Firestore): Promise<KpiEvalConfig> {
  const now = Date.now()
  if (cached && now - cachedAt < CACHE_MS) return cached
  try {
    const snap = await db.collection(SCORING_AUX).doc(KPI_EVAL_DOC_ID).get()
    if (snap.exists && Number(snap.data()?.schemaVersion) === 1) {
      cached = mergeRemote(snap.data() as Record<string, unknown>)
    } else {
      cached = getDefaultKpiEvalConfig()
    }
  } catch (e) {
    console.warn('loadKpiEvalConfig fallback', e)
    cached = getDefaultKpiEvalConfig()
  }
  cachedAt = now
  return cached
}

export function bonusTierFromPercentile(pct: number, cfg: KpiEvalConfig): 'gold' | 'silver' | 'bronze' | 'none' {
  if (pct <= cfg.bonusTiers.goldMaxPercentile) return 'gold'
  if (pct <= cfg.bonusTiers.silverMaxPercentile) return 'silver'
  if (pct <= cfg.bonusTiers.bronzeMaxPercentile) return 'bronze'
  return 'none'
}
