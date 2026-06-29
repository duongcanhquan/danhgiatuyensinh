import type {
  Lead,
  LeadClassificationBreakdown,
  PriorityTag,
  ProfileCustomScoringSignal,
  ScoringProfile,
} from '../types'
import type { InfoScoreRuntime } from './infoScoreRules'
import { computeMockMlWinProbability } from './mlWinMock'
import type { LeadClassificationRuntime } from './leadClassificationConfig'
import { scoreToClassificationTag } from './leadClassificationConfig'
import {
  ALL_SCORING_SIGNAL_KEYS,
  SCORING_SIGNAL_META,
  mergeSchoolAndProfileCustomSignals,
} from './leadScoringSignals'
import {
  leadToEvaluationRecord,
  profileHasActiveRules,
  scoreToPriorityTag,
  sumBlockMaxWeights,
  sumBlockPoints,
  sumRulePoints,
  type MasterDataBuckets,
} from './scoringEngine'
import type { EvaluateLeadOptions } from './scoringEngine'

function clamp(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min
  return Math.max(min, Math.min(max, n))
}

function weightedAvg(parts: { score: number; weight: number }[]): number {
  const totalW = parts.reduce((s, p) => s + p.weight, 0)
  if (totalW <= 0) return 0
  return Math.round(parts.reduce((s, p) => s + p.score * p.weight, 0) / totalW)
}

function normTo100(raw: number, cap: number): number {
  if (cap <= 0) return raw > 0 ? 100 : 0
  return clamp(Math.round((raw / cap) * 100), 0, 100)
}

function signalScore(id: string | undefined, cfg: LeadClassificationRuntime): number {
  if (!id) return 50
  const v = cfg.engagement.signalScores[id]
  return typeof v === 'number' && Number.isFinite(v) ? clamp(Math.round(v), 0, 100) : 50
}

function boostScore(tag: PriorityTag | undefined, cfg: LeadClassificationRuntime): number {
  if (!tag) return 50
  return clamp(Math.round(cfg.engagement.boostScores[tag] ?? 50), 0, 100)
}

function tvvSignalsNorm(
  lead: Lead,
  profile: ScoringProfile | null,
  schoolDefs: ProfileCustomScoringSignal[] | null | undefined,
  cfg: LeadClassificationRuntime,
): number {
  const rec = leadToEvaluationRecord(lead)
  const skipFields = new Set<string>()
  if (profile) {
    for (const b of profile.ruleBlocks ?? []) {
      const tf = String(b.targetField ?? '').trim()
      if (tf) skipFields.add(tf)
    }
    for (const r of profile.rules ?? []) {
      const tf = String(r.targetField ?? '').trim()
      if (tf) skipFields.add(tf)
    }
  }
  let raw = 0
  for (const key of ALL_SCORING_SIGNAL_KEYS) {
    const { evalField, defaultPoints } = SCORING_SIGNAL_META[key]
    if (skipFields.has(evalField)) continue
    if (rec[evalField]) raw += defaultPoints
  }
  const defs = mergeSchoolAndProfileCustomSignals(schoolDefs, profile?.customScoringSignals)
  const flags = lead.scoringCustomSignals
  if (defs?.length && flags) {
    for (const d of defs) {
      if (flags[d.id] === true) raw += Number(d.points) || 0
    }
  }
  const cap = cfg.engagement.tvvSignalsCap
  const centered = 50 + (raw / cap) * 50
  return clamp(Math.round(centered), 0, 100)
}

export function computeProfilePillarScore(
  lead: Lead,
  profile: Pick<ScoringProfile, 'rules' | 'ruleBlocks' | 'customScoringSignals'> | null,
  masterBuckets: MasterDataBuckets | undefined,
  _schoolDefs: ProfileCustomScoringSignal[] | null | undefined,
  infoScoreRuntime: InfoScoreRuntime | null | undefined,
  cfg: LeadClassificationRuntime,
): { score: number; detail: LeadClassificationBreakdown['profileDetail'] } {
  const rec = leadToEvaluationRecord(lead)
  delete rec.calculatedScore
  delete rec.priorityTag

  let rulesRaw = 0
  if (profile && profileHasActiveRules(profile)) {
    const blocks = profile.ruleBlocks
    rulesRaw =
      blocks && blocks.length > 0
        ? sumBlockPoints(rec, blocks, masterBuckets)
        : sumRulePoints(rec, profile.rules ?? [], masterBuckets)
  }

  const cap =
    profile?.ruleBlocks?.length
      ? Math.max(cfg.profile.profileRulesCap, sumBlockMaxWeights(profile.ruleBlocks))
      : cfg.profile.profileRulesCap
  const rulesNorm = normTo100(Math.max(0, rulesRaw), cap)
  const infoNorm = computeMockMlWinProbability(lead, infoScoreRuntime).mlWinProbability

  const pw = cfg.profile
  const score = weightedAvg([
    { score: rulesNorm, weight: pw.profileRules },
    { score: infoNorm, weight: pw.infoScore },
  ])
  return { score, detail: { rulesNorm, infoNorm } }
}

export function computeEngagementPillarScore(
  lead: Lead,
  profile: ScoringProfile | null,
  schoolDefs: ProfileCustomScoringSignal[] | null | undefined,
  cfg: LeadClassificationRuntime,
): { score: number; detail: LeadClassificationBreakdown['engagementDetail'] } {
  const callBehavior = clamp(Math.round(lead.lastCallBehaviorScore ?? 50), 0, 100)

  const enroll = signalScore(lead.lastCallEnrollmentSignalId, cfg)
  const ready = signalScore(lead.lastCallReadinessId, cfg)
  const callSignal = Math.round((enroll + ready) / 2)

  const aiSentiment = clamp(Math.round(lead.aiSentimentScore ?? 50), 0, 100)
  const tvvSignals = tvvSignalsNorm(lead, profile, schoolDefs, cfg)
  const priorityBoost = boostScore(lead.callEvalPriorityBoost ?? lead.priorityTag, cfg)

  const w = cfg.engagement.subWeights
  const score = weightedAvg([
    { score: callBehavior, weight: w.callBehavior },
    { score: callSignal, weight: w.callSignal },
    { score: aiSentiment, weight: w.aiSentiment },
    { score: tvvSignals, weight: w.tvvSignals },
    { score: priorityBoost, weight: w.priorityBoost },
  ])

  return {
    score,
    detail: { callBehavior, callSignal, aiSentiment, tvvSignals, priorityBoost },
  }
}

export function computeLeadClassification(
  lead: Lead,
  profile: Pick<ScoringProfile, 'rules' | 'ruleBlocks' | 'customScoringSignals' | 'thresholds'> | null,
  cfg: LeadClassificationRuntime,
  masterBuckets?: MasterDataBuckets,
  schoolDefs?: ProfileCustomScoringSignal[] | null,
  infoScoreRuntime?: InfoScoreRuntime | null,
): LeadClassificationBreakdown {
  const profileR = computeProfilePillarScore(lead, profile, masterBuckets, schoolDefs, infoScoreRuntime, cfg)
  const engagementR = computeEngagementPillarScore(lead, profile as ScoringProfile | null, schoolDefs, cfg)

  const pw = cfg.profileWeightPercent
  const ew = cfg.engagementWeightPercent
  const compositeScore = clamp(Math.round((profileR.score * pw + engagementR.score * ew) / 100), 0, 100)
  const priorityTag = scoreToClassificationTag(compositeScore, cfg)

  return {
    profilePart: profileR.score,
    engagementPart: engagementR.score,
    compositeScore,
    priorityTag,
    profileDetail: profileR.detail,
    engagementDetail: engagementR.detail,
  }
}

/** Ghi đè evaluateLead khi bật phân loại tỷ trọng. */
export function evaluateLeadWithClassification(
  lead: Lead,
  profile: Pick<ScoringProfile, 'rules' | 'ruleBlocks' | 'customScoringSignals' | 'thresholds'> | null,
  cfg: LeadClassificationRuntime,
  masterBuckets?: MasterDataBuckets,
  schoolDefs?: ProfileCustomScoringSignal[] | null,
  options?: Pick<EvaluateLeadOptions, 'infoScoreRuntime'>,
): LeadClassificationBreakdown & { calculatedScore: number } {
  const breakdown = computeLeadClassification(
    lead,
    profile,
    cfg,
    masterBuckets,
    schoolDefs,
    options?.infoScoreRuntime,
  )
  return { ...breakdown, calculatedScore: breakdown.compositeScore }
}

export function classificationFirestorePatch(
  breakdown: LeadClassificationBreakdown,
): Pick<Lead, 'calculatedScore' | 'priorityTag' | 'leadScoreProfilePart' | 'leadScoreEngagementPart' | 'mlWinProbability'> {
  return {
    calculatedScore: breakdown.compositeScore,
    priorityTag: breakdown.priorityTag,
    leadScoreProfilePart: breakdown.profilePart,
    leadScoreEngagementPart: breakdown.engagementPart,
  }
}

/** Fallback khi tắt phân loại tỷ trọng — giữ ngưỡng profile. */
export function legacyTagFromProfileScore(
  score: number,
  profile: Pick<ScoringProfile, 'thresholds'> | null | undefined,
): PriorityTag {
  return scoreToPriorityTag(score, profile?.thresholds)
}
