import type { KpiCompositeConfig, KpiManualScoreRecord, KpiMetricTargets } from '../types'
import type { CounselorKpiSummary } from './kpiMap'
import type { KpiEvaluationRuntime } from './kpiEvaluationRules'
import { evaluateKpiRowWarnings } from './kpiEvaluationRules'
import { resolveCounselorTargets } from './kpiTargets'

export type KpiMetricsLike = Pick<
  CounselorKpiSummary,
  | 'totalCalls'
  | 'validCalls'
  | 'uniqueLeadsCalled'
  | 'connectedCalls'
  | 'warmNew'
  | 'hotNew'
  | 'newToInterested'
  | 'crmActions'
  | 'notesAdded'
  | 'depositPaidCount'
  | 'toEnrolled'
  | 'fullNeCount'
  | 'approvedRevenueVnd'
>

export type KpiCompositeInput = KpiMetricsLike & Pick<Partial<CounselorKpiSummary>, 'activeDays'>

export type KpiCompositeBreakdown = {
  total: number
  call: number
  conversion: number
  compliance: number
  enrollment: number
  callDetail: { validCalls: number; uniqueLeads: number; quality: number }
  conversionDetail: { warmHot: number; interested: number; crm: number }
  complianceDetail: { auto: number; manual: number; blended: number }
  enrollmentDetail: { deposit: number; enrolled: number; revenue: number }
  targets: KpiMetricTargets
}

function clamp(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min
  return Math.max(min, Math.min(max, n))
}

export function ratioToScore(actual: number, target: number): number {
  if (target <= 0) return actual > 0 ? 100 : 0
  return clamp(Math.round((actual / target) * 100), 0, 100)
}

function weightedAvg(parts: { score: number; weight: number }[]): number {
  const totalW = parts.reduce((s, p) => s + p.weight, 0)
  if (totalW <= 0) return 0
  return Math.round(parts.reduce((s, p) => s + p.score * p.weight, 0) / totalW)
}

export function getCompositeConfig(runtime: KpiEvaluationRuntime): KpiCompositeConfig {
  return runtime.composite!
}

export type KpiCompositeOptions = {
  /** Cảnh báo tuân thủ: daily = theo ngày, period = chuẩn hoá theo activeDays (bảng điểm tháng). */
  complianceWarningMode?: 'daily' | 'period'
}

function scoreCallPillar(
  m: KpiMetricsLike,
  targets: KpiMetricTargets,
  cfg: KpiCompositeConfig,
): { score: number; detail: KpiCompositeBreakdown['callDetail'] } {
  const validCalls = ratioToScore(m.validCalls, targets.validCalls)
  const uniqueLeads = ratioToScore(m.uniqueLeadsCalled, targets.uniqueLeadsCalled)
  if (m.totalCalls <= 0) {
    return { score: 0, detail: { validCalls, uniqueLeads, quality: 0 } }
  }
  const validRatio = m.validCalls / m.totalCalls
  const connectRatio = m.connectedCalls / m.totalCalls
  const hlScore =
    validRatio >= cfg.call.minValidRatio ? 100 : ratioToScore(validRatio, cfg.call.minValidRatio)
  const connScore =
    connectRatio >= cfg.call.minConnectRatio ? 100 : ratioToScore(connectRatio, cfg.call.minConnectRatio)
  const quality = Math.round((hlScore + connScore) / 2)
  const detail = { validCalls, uniqueLeads, quality }
  const score = weightedAvg([
    { score: validCalls, weight: cfg.call.subWeights.validCalls },
    { score: uniqueLeads, weight: cfg.call.subWeights.uniqueLeads },
    { score: quality, weight: cfg.call.subWeights.quality },
  ])
  return { score, detail }
}

function scoreConversionPillar(
  m: KpiMetricsLike,
  targets: KpiMetricTargets,
  cfg: KpiCompositeConfig,
): { score: number; detail: KpiCompositeBreakdown['conversionDetail'] } {
  const warmHot = ratioToScore(m.warmNew + m.hotNew, targets.warmHot)
  const interested = ratioToScore(m.newToInterested, targets.newToInterested)
  const crm = ratioToScore(m.crmActions, targets.crmActions)
  const detail = { warmHot, interested, crm }
  const score = weightedAvg([
    { score: warmHot, weight: cfg.conversion.subWeights.warmHot },
    { score: interested, weight: cfg.conversion.subWeights.interested },
    { score: crm, weight: cfg.conversion.subWeights.crm },
  ])
  return { score, detail }
}

function scoreCompliancePillar(
  m: KpiMetricsLike,
  cfg: KpiEvaluationRuntime,
  manualScore: number | null | undefined,
  warningMode: 'daily' | 'period' = 'daily',
): { score: number; detail: KpiCompositeBreakdown['complianceDetail'] } {
  const c = cfg.composite!.compliance
  let auto = 100
  const warn = evaluateKpiRowWarnings(m as CounselorKpiSummary, cfg, { mode: warningMode })
  if (warn?.id === 'spam' && c.penalizeSpamWarning > 0) auto -= c.penalizeSpamWarning
  if (warn?.id === 'no_deposit' && c.penalizeNoDepositWarning > 0) auto -= c.penalizeNoDepositWarning
  if (warn?.id === 'low_connect' && c.penalizeLowConnectWarning > 0) auto -= c.penalizeLowConnectWarning
  const noteRatio = m.validCalls > 0 ? m.notesAdded / m.validCalls : 1
  if (m.validCalls >= 20 && noteRatio < c.minNoteRatioPerValidCall) {
    auto -= c.penalizeLowConnectWarning > 0 ? c.penalizeLowConnectWarning : 20
  }
  auto = clamp(auto, 0, 100)

  const manual =
    manualScore !== null && manualScore !== undefined ? clamp(Math.round(manualScore), 0, 100) : auto
  const aw = clamp(c.autoWeightPercent, 0, 100)
  const mw = 100 - aw
  const blended = Math.round((auto * aw + manual * mw) / 100)
  return { score: blended, detail: { auto, manual, blended } }
}

function scoreEnrollmentPillar(
  m: KpiMetricsLike,
  targets: KpiMetricTargets,
  cfg: KpiCompositeConfig,
): { score: number; detail: KpiCompositeBreakdown['enrollmentDetail'] } {
  const deposit = ratioToScore(m.depositPaidCount, targets.depositPaidCount)
  const enrolledActual = m.toEnrolled + m.fullNeCount
  const enrolled = ratioToScore(enrolledActual, targets.enrolled)
  const revenue = ratioToScore(m.approvedRevenueVnd, targets.approvedRevenueVnd)
  const detail = { deposit, enrolled, revenue }
  const score = weightedAvg([
    { score: deposit, weight: cfg.enrollment.subWeights.deposit },
    { score: enrolled, weight: cfg.enrollment.subWeights.enrolled },
    { score: revenue, weight: cfg.enrollment.subWeights.revenue },
  ])
  return { score, detail }
}

export function computeCompositeKpiScore(
  metrics: KpiCompositeInput,
  runtime: KpiEvaluationRuntime,
  targets: KpiMetricTargets,
  manualComplianceScore?: number | null,
  options?: KpiCompositeOptions,
): KpiCompositeBreakdown {
  const cfg = getCompositeConfig(runtime)
  const w = cfg.weights
  const warningMode = options?.complianceWarningMode ?? 'daily'
  const callR = scoreCallPillar(metrics, targets, cfg)
  const convR = scoreConversionPillar(metrics, targets, cfg)
  const compR = scoreCompliancePillar(metrics, runtime, manualComplianceScore, warningMode)
  const enrollR = scoreEnrollmentPillar(metrics, targets, cfg)

  const weightSum = w.call + w.conversion + w.compliance + w.enrollment
  const norm = weightSum > 0 ? weightSum : 100
  const total = Math.round(
    (callR.score * w.call +
      convR.score * w.conversion +
      compR.score * w.compliance +
      enrollR.score * w.enrollment) /
      norm,
  )

  return {
    total: clamp(total, 0, 100),
    call: callR.score,
    conversion: convR.score,
    compliance: compR.score,
    enrollment: enrollR.score,
    callDetail: callR.detail,
    conversionDetail: convR.detail,
    complianceDetail: compR.detail,
    enrollmentDetail: enrollR.detail,
    targets,
  }
}

export function computeCompositeForCounselor(
  metrics: KpiCompositeInput,
  runtime: KpiEvaluationRuntime,
  monthDefaults: Partial<KpiMetricTargets> | null | undefined,
  counselorOverrides: Partial<KpiMetricTargets> | null | undefined,
  manual?: KpiManualScoreRecord | null,
  options?: KpiCompositeOptions,
): KpiCompositeBreakdown {
  const targets = resolveCounselorTargets(runtime.composite!.globalTargets, monthDefaults, counselorOverrides)
  return computeCompositeKpiScore(metrics, runtime, targets, manual?.complianceScore, options)
}

export const KPI_PILLAR_LABELS = {
  call: 'Hiệu suất cuộc gọi',
  conversion: 'Hồ sơ / chuyển đổi',
  compliance: 'Tuân thủ / phối hợp',
  enrollment: 'NB / NE',
} as const
