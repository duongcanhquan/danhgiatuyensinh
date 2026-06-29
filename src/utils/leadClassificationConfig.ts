import type { LeadClassificationConfigPersisted, PriorityTag } from '../types'

function clamp(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min
  return Math.max(min, Math.min(max, n))
}

export function getDefaultLeadClassificationConfig(): LeadClassificationConfigPersisted {
  return {
    schemaVersion: 1,
    enabled: false,
    profileWeightPercent: 40,
    profile: {
      profileRules: 55,
      infoScore: 45,
      profileRulesCap: 100,
    },
    engagement: {
      subWeights: {
        callBehavior: 30,
        callSignal: 25,
        aiSentiment: 15,
        tvvSignals: 15,
        priorityBoost: 15,
      },
      signalScores: {
        hot: 100,
        warm: 75,
        cold: 35,
        blocked: 10,
        ready: 100,
        preparing: 80,
        considering: 55,
        unaware: 25,
        positive_open: 70,
        neutral: 50,
      },
      boostScores: {
        HOT: 90,
        WARM: 65,
        COLD: 40,
        LOSS: 15,
      },
      tvvSignalsCap: 80,
    },
    thresholds: {
      hotMinScore: 75,
      warmMinScore: 50,
    },
  }
}

function normSubWeights<T extends Record<string, number>>(raw: Partial<T>, defaults: T): T {
  const out = { ...defaults }
  for (const k of Object.keys(defaults) as (keyof T)[]) {
    out[k] = clamp(Math.round(Number(raw[k] ?? defaults[k])), 0, 100) as T[keyof T]
  }
  return out
}

export function mergeLeadClassificationConfig(
  remote: Partial<LeadClassificationConfigPersisted> | null | undefined,
): LeadClassificationConfigPersisted {
  const d = getDefaultLeadClassificationConfig()
  if (!remote) return d
  const profileW = clamp(Math.round(Number(remote.profileWeightPercent ?? d.profileWeightPercent)), 0, 100)
  const profileSub = normSubWeights(
    {
      profileRules: remote.profile?.profileRules ?? d.profile.profileRules,
      infoScore: remote.profile?.infoScore ?? d.profile.infoScore,
    },
    d.profile,
  )
  const engageSub = normSubWeights(
    {
      callBehavior: remote.engagement?.subWeights?.callBehavior ?? d.engagement.subWeights.callBehavior,
      callSignal: remote.engagement?.subWeights?.callSignal ?? d.engagement.subWeights.callSignal,
      aiSentiment: remote.engagement?.subWeights?.aiSentiment ?? d.engagement.subWeights.aiSentiment,
      tvvSignals: remote.engagement?.subWeights?.tvvSignals ?? d.engagement.subWeights.tvvSignals,
      priorityBoost: remote.engagement?.subWeights?.priorityBoost ?? d.engagement.subWeights.priorityBoost,
    },
    d.engagement.subWeights,
  )
  let hot = clamp(Math.round(Number(remote.thresholds?.hotMinScore ?? d.thresholds.hotMinScore)), 1, 100)
  let warm = clamp(Math.round(Number(remote.thresholds?.warmMinScore ?? d.thresholds.warmMinScore)), 0, 99)
  if (warm >= hot) warm = Math.max(0, hot - 1)

  return {
    schemaVersion: 1,
    enabled: remote.enabled === true,
    profileWeightPercent: profileW,
    profile: {
      ...profileSub,
      profileRulesCap: Math.max(1, Math.round(Number(remote.profile?.profileRulesCap ?? d.profile.profileRulesCap))),
    },
    engagement: {
      subWeights: engageSub,
      signalScores: { ...d.engagement.signalScores, ...(remote.engagement?.signalScores ?? {}) },
      boostScores: { ...d.engagement.boostScores, ...(remote.engagement?.boostScores ?? {}) },
      tvvSignalsCap: Math.max(10, Math.round(Number(remote.engagement?.tvvSignalsCap ?? d.engagement.tvvSignalsCap))),
    },
    thresholds: { hotMinScore: hot, warmMinScore: warm },
  }
}

export function parseLeadClassificationDoc(raw: Record<string, unknown> | null | undefined): LeadClassificationConfigPersisted | null {
  if (!raw || typeof raw !== 'object') return null
  return mergeLeadClassificationConfig(raw as Partial<LeadClassificationConfigPersisted>)
}

export type LeadClassificationRuntime = LeadClassificationConfigPersisted & {
  engagementWeightPercent: number
}

export function buildLeadClassificationRuntime(merged: LeadClassificationConfigPersisted): LeadClassificationRuntime {
  return {
    ...merged,
    engagementWeightPercent: 100 - merged.profileWeightPercent,
  }
}

export function classificationThresholdHint(cfg: LeadClassificationRuntime): string {
  const { hotMinScore, warmMinScore } = cfg.thresholds
  return `HOT ≥ ${hotMinScore}, WARM ${warmMinScore}–${hotMinScore - 1}, COLD 0–${warmMinScore - 1} (trên điểm tổng hợp 0–100)`
}

export function scoreToClassificationTag(score: number, cfg: LeadClassificationRuntime): PriorityTag {
  const { hotMinScore, warmMinScore } = cfg.thresholds
  const s = clamp(Math.round(score), 0, 100)
  if (s >= hotMinScore) return 'HOT'
  if (s >= warmMinScore) return 'WARM'
  if (s >= 0) return 'COLD'
  return 'LOSS'
}
