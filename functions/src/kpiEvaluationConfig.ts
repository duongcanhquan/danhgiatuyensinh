import type { Firestore } from 'firebase-admin/firestore'
import { Timestamp } from 'firebase-admin/firestore'

export type KpiEvalConfig = {
  schemaVersion: 1 | 2
  validCall: { minBillSeconds: number; dedupWindowHours: number }
  validCallDedupWindowMs: number
  warnings: {
    spam: { minTotalCalls: number; minValidRatio: number; label: string }
    noDeposit: { minTotalCalls: number; label: string }
    lowConnect: { minTotalCalls: number; maxConnectRatio: number; label: string }
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

function str(v: unknown, fallback: string): string {
  const s = String(v ?? '').trim()
  return s || fallback
}

export function getDefaultKpiEvalConfig(): KpiEvalConfig {
  const validCall = { minBillSeconds: 30, dedupWindowHours: 3 }
  return {
    schemaVersion: 2,
    validCall,
    validCallDedupWindowMs: validCall.dedupWindowHours * 60 * 60 * 1000,
    warnings: {
      spam: { minTotalCalls: 50, minValidRatio: 0.35, label: 'Nghi spam' },
      noDeposit: { minTotalCalls: 80, label: 'Chưa cọc' },
      lowConnect: { minTotalCalls: 20, maxConnectRatio: 0.25, label: 'Bắt máy thấp' },
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
  const w = (raw.warnings ?? {}) as Record<string, Record<string, unknown>>
  const spam = w.spam ?? {}
  const noDeposit = w.noDeposit ?? {}
  const lowConnect = w.lowConnect ?? {}
  const ms = (raw.monthlyScore ?? {}) as Record<string, unknown>
  const bt = (raw.bonusTiers ?? {}) as Record<string, unknown>
  let goldMaxPercentile = clamp(Number(bt.goldMaxPercentile ?? d.bonusTiers.goldMaxPercentile), 0.01, 0.5)
  let silverMaxPercentile = clamp(Number(bt.silverMaxPercentile ?? d.bonusTiers.silverMaxPercentile), 0.05, 0.9)
  let bronzeMaxPercentile = clamp(Number(bt.bronzeMaxPercentile ?? d.bonusTiers.bronzeMaxPercentile), 0.1, 1)
  if (silverMaxPercentile <= goldMaxPercentile) silverMaxPercentile = goldMaxPercentile + 0.05
  if (bronzeMaxPercentile <= silverMaxPercentile) bronzeMaxPercentile = silverMaxPercentile + 0.05
  const fin = (raw.finance ?? {}) as Record<string, unknown>
  const schemaVersion = Number(raw.schemaVersion) === 1 ? 1 : 2
  return {
    schemaVersion,
    validCall,
    validCallDedupWindowMs: validCall.dedupWindowHours * 60 * 60 * 1000,
    warnings: {
      spam: {
        minTotalCalls: clamp(Math.round(Number(spam.minTotalCalls ?? d.warnings.spam.minTotalCalls)), 1, 500),
        minValidRatio: clamp(Number(spam.minValidRatio ?? d.warnings.spam.minValidRatio), 0.05, 1),
        label: str(spam.label, d.warnings.spam.label),
      },
      noDeposit: {
        minTotalCalls: clamp(Math.round(Number(noDeposit.minTotalCalls ?? d.warnings.noDeposit.minTotalCalls)), 1, 500),
        label: str(noDeposit.label, d.warnings.noDeposit.label),
      },
      lowConnect: {
        minTotalCalls: clamp(
          Math.round(Number(lowConnect.minTotalCalls ?? d.warnings.lowConnect.minTotalCalls)),
          1,
          500,
        ),
        maxConnectRatio: clamp(Number(lowConnect.maxConnectRatio ?? d.warnings.lowConnect.maxConnectRatio), 0.05, 1),
        label: str(lowConnect.label, d.warnings.lowConnect.label),
      },
    },
    monthlyScore: {
      capCalls: clamp(Math.round(Number(ms.capCalls ?? d.monthlyScore.capCalls)), 0, 100),
      capConversion: clamp(Math.round(Number(ms.capConversion ?? d.monthlyScore.capConversion)), 0, 100),
      capDeposit: clamp(Math.round(Number(ms.capDeposit ?? d.monthlyScore.capDeposit)), 0, 100),
      capRevenue: clamp(Math.round(Number(ms.capRevenue ?? d.monthlyScore.capRevenue)), 0, 100),
      capInterested: clamp(Math.round(Number(ms.capInterested ?? d.monthlyScore.capInterested)), 0, 100),
      targetValidCalls: clamp(Math.round(Number(ms.targetValidCalls ?? d.monthlyScore.targetValidCalls)), 1, 10_000),
      pointsPerWarmHot: clamp(Number(ms.pointsPerWarmHot ?? d.monthlyScore.pointsPerWarmHot), 0, 50),
      pointsPerDeposit: clamp(Number(ms.pointsPerDeposit ?? d.monthlyScore.pointsPerDeposit), 0, 50),
      revenueDenominatorVnd: clamp(
        Math.round(Number(ms.revenueDenominatorVnd ?? d.monthlyScore.revenueDenominatorVnd)),
        1_000_000,
        1_000_000_000_000,
      ),
      pointsPerInterested: clamp(Number(ms.pointsPerInterested ?? d.monthlyScore.pointsPerInterested), 0, 50),
    },
    bonusTiers: { goldMaxPercentile, silverMaxPercentile, bronzeMaxPercentile },
    finance: {
      approvalStatus: str(fin.approvalStatus, d.finance.approvalStatus),
      fullNeStatus: str(fin.fullNeStatus, d.finance.fullNeStatus),
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
    const v = Number(snap.data()?.schemaVersion)
    if (snap.exists && (v === 1 || v === 2)) {
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

/** Ngày KPI theo giờ Việt Nam (YYYY-MM-DD). */
export function kpiDayKeyFromTs(ts?: Timestamp): string {
  const d = (ts ?? Timestamp.now()).toDate()
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' })
}

/** Tháng KPI theo giờ Việt Nam (YYYY-MM). */
export function kpiMonthKeyFromTs(ts?: Timestamp): string {
  return kpiDayKeyFromTs(ts).slice(0, 7)
}
