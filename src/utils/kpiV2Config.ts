import type {
  KpiDailyMetricKey,
  KpiRoleDailyTargets,
  KpiSourceBucket,
  KpiStaffRole,
  KpiV2ConfigPersisted,
} from '../types'
import { todayDayKeyVn } from './businessDays'

export const KPI_V2_FIRESTORE_DOC_ID = 'kpiV2Config'

const PDF_DAILY_OFF: KpiRoleDailyTargets = {
  outboundCalls: 200,
  connectedCalls: 80,
  leadCham: 60,
  validCalls: 80,
  uniqueLeadsCalled: 60,
  newToInterested: 10,
  warmHot: 6,
  lpxtCount: 2,
  depositPaidCount: 1,
}

const PDF_DAILY_MKT_CTV: KpiRoleDailyTargets = {
  outboundCalls: 200,
  connectedCalls: 80,
  leadCham: 60,
  validCalls: 80,
  uniqueLeadsCalled: 60,
  newToInterested: 10,
  warmHot: 6,
  lpxtCount: 2,
  depositPaidCount: 1,
}

const PDF_DAILY_MKT_NV: KpiRoleDailyTargets = {
  outboundCalls: 160,
  connectedCalls: 40,
  leadCham: 25,
  validCalls: 40,
  uniqueLeadsCalled: 25,
  newToInterested: 15,
  warmHot: 6,
  lpxtCount: 3,
  depositPaidCount: 2,
}

const PDF_DAILY_MKT_TL: KpiRoleDailyTargets = {
  outboundCalls: 100,
  connectedCalls: 25,
  leadCham: 0,
  validCalls: 25,
  uniqueLeadsCalled: 0,
  newToInterested: 0,
  warmHot: 0,
  lpxtCount: 0,
  depositPaidCount: 0,
}

const PDF_DAILY_NV_OFF: KpiRoleDailyTargets = {
  outboundCalls: 160,
  leadCham: 20,
  validCalls: 40,
  uniqueLeadsCalled: 20,
  newToInterested: 15,
  warmHot: 6,
  lpxtCount: 2,
  depositPaidCount: 1,
  connectedCalls: 40,
}

const PDF_DAILY_TL_OFF: KpiRoleDailyTargets = {
  outboundCalls: 100,
  connectedCalls: 25,
  leadCham: 13,
  validCalls: 25,
  uniqueLeadsCalled: 13,
  newToInterested: 9,
  warmHot: 4,
  lpxtCount: 1,
  depositPaidCount: 1,
}

function bucketTargets(
  off: KpiRoleDailyTargets,
  mkt: KpiRoleDailyTargets,
): Record<KpiSourceBucket, KpiRoleDailyTargets> {
  return { off, mkt, all: mergeDailyTargets(off, mkt) }
}

export function mergeDailyTargets(a: KpiRoleDailyTargets, b: KpiRoleDailyTargets): KpiRoleDailyTargets {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]) as Set<KpiDailyMetricKey>
  const out: KpiRoleDailyTargets = {}
  for (const k of keys) {
    out[k] = (a[k] ?? 0) + (b[k] ?? 0)
  }
  return out
}

export function getDefaultKpiV2Config(): KpiV2ConfigPersisted {
  return {
    schemaVersion: 1,
    enabled: true,
    goLiveDate: todayDayKeyVn(),
    lpxtMinVnd: 150_000,
    leadChamMinSeconds: 1,
    leadChamMaxSecondsExclusive: 30,
    sourceBucketByLabel: {
      MOU: 'off',
      SCT: 'off',
      'Đại lý': 'off',
      TikTok: 'mkt',
      Facebook: 'mkt',
    },
    dailyTargets: {
      ctv: bucketTargets(PDF_DAILY_OFF, PDF_DAILY_MKT_CTV),
      counselor: bucketTargets(PDF_DAILY_NV_OFF, PDF_DAILY_MKT_NV),
      team_lead: bucketTargets(PDF_DAILY_TL_OFF, PDF_DAILY_MKT_TL),
    },
    monthlyCallTargets: {
      ctv: { perDay: 60, perMonth: 1320 },
      counselor: { perDay: 40, perMonth: 880 },
      team_lead: { perDay: 25, perMonth: 550 },
    },
    monthlyScoreWeights: {
      ctv: { validCalls: 35, leadCham: 25, warm: 25, deposit: 15 },
      counselor: { validCalls: 20, leadCham: 20, warm: 20, deposit: 30, enrolled: 10 },
      team_lead: { validCalls: 20, leadCham: 20, warm: 20, deposit: 30, enrolled: 10 },
    },
    businessHolidays: [],
    rankByKpiScoreOnly: true,
  }
}

function num(v: unknown, fallback: number): number {
  const n = Number(v ?? fallback)
  return Number.isFinite(n) ? n : fallback
}

function mergeRoleTargets(
  base: KpiRoleDailyTargets,
  partial?: Partial<KpiRoleDailyTargets> | null,
): KpiRoleDailyTargets {
  if (!partial) return { ...base }
  const out = { ...base }
  for (const [k, v] of Object.entries(partial)) {
    if (v === undefined || v === null) continue
    out[k as KpiDailyMetricKey] = Math.max(0, Math.round(num(v, 0)))
  }
  return out
}

export function mergeKpiV2Config(raw: Partial<KpiV2ConfigPersisted> | null | undefined): KpiV2ConfigPersisted {
  const d = getDefaultKpiV2Config()
  if (!raw) return d
  const roles: KpiStaffRole[] = ['ctv', 'counselor', 'team_lead']
  const buckets: KpiSourceBucket[] = ['off', 'mkt', 'all']
  const dailyTargets = { ...d.dailyTargets }
  for (const role of roles) {
    dailyTargets[role] = { ...dailyTargets[role] }
    for (const bucket of buckets) {
      dailyTargets[role][bucket] = mergeRoleTargets(
        d.dailyTargets[role][bucket],
        raw.dailyTargets?.[role]?.[bucket],
      )
    }
  }
  return {
    schemaVersion: 1,
    enabled: raw.enabled !== false,
    goLiveDate: String(raw.goLiveDate ?? d.goLiveDate).trim() || d.goLiveDate,
    lpxtMinVnd: Math.max(1, Math.round(num(raw.lpxtMinVnd, d.lpxtMinVnd))),
    leadChamMinSeconds: Math.max(1, Math.round(num(raw.leadChamMinSeconds, d.leadChamMinSeconds))),
    leadChamMaxSecondsExclusive: Math.max(
      2,
      Math.round(num(raw.leadChamMaxSecondsExclusive, d.leadChamMaxSecondsExclusive)),
    ),
    sourceBucketByLabel: {
      ...d.sourceBucketByLabel,
      ...(raw.sourceBucketByLabel ?? {}),
    },
    dailyTargets,
    monthlyCallTargets: {
      ctv: { ...d.monthlyCallTargets.ctv, ...(raw.monthlyCallTargets?.ctv ?? {}) },
      counselor: { ...d.monthlyCallTargets.counselor, ...(raw.monthlyCallTargets?.counselor ?? {}) },
      team_lead: { ...d.monthlyCallTargets.team_lead, ...(raw.monthlyCallTargets?.team_lead ?? {}) },
    },
    monthlyScoreWeights: {
      ctv: { ...d.monthlyScoreWeights.ctv, ...(raw.monthlyScoreWeights?.ctv ?? {}) },
      counselor: { ...d.monthlyScoreWeights.counselor, ...(raw.monthlyScoreWeights?.counselor ?? {}) },
      team_lead: { ...d.monthlyScoreWeights.team_lead, ...(raw.monthlyScoreWeights?.team_lead ?? {}) },
    },
    businessHolidays: Array.isArray(raw.businessHolidays)
      ? raw.businessHolidays.map(String).filter(Boolean)
      : d.businessHolidays,
    rankByKpiScoreOnly: raw.rankByKpiScoreOnly !== false,
    updatedAt: raw.updatedAt,
  }
}

export function resolveSourceBucket(
  sourceLabel: string,
  mapping: Record<string, KpiSourceBucket>,
): KpiSourceBucket {
  const t = sourceLabel.trim()
  if (!t) return 'off'
  if (mapping[t]) return mapping[t]
  const lower = t.toLowerCase()
  for (const [k, v] of Object.entries(mapping)) {
    if (k.toLowerCase() === lower) return v
  }
  if (/tiktok|facebook|fb|meta|ads|mkt|marketing/i.test(t)) return 'mkt'
  return 'off'
}

export function userRoleToKpiStaffRole(role: string): KpiStaffRole | null {
  if (role === 'ctv') return 'ctv'
  if (role === 'counselor') return 'counselor'
  if (role === 'team_lead' || role === 'head_of_profession' || role === 'head_of_department') return 'team_lead'
  return null
}

export function isOnOrAfterGoLive(day: string, goLiveDate: string): boolean {
  return day >= goLiveDate
}
