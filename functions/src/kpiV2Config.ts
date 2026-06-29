import type { Firestore } from 'firebase-admin/firestore'

export type KpiSourceBucket = 'off' | 'mkt' | 'all'

export type KpiV2Runtime = {
  enabled: boolean
  goLiveDate: string
  lpxtMinVnd: number
  leadChamMinSeconds: number
  leadChamMaxSecondsExclusive: number
  sourceBucketByLabel: Record<string, KpiSourceBucket>
}

const SCORING_AUX = 'scoringAux'
const DOC_ID = 'kpiV2Config'

function todayVn(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' })
}

export function defaultKpiV2Runtime(): KpiV2Runtime {
  return {
    enabled: true,
    goLiveDate: todayVn(),
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
  }
}

export async function loadKpiV2Config(db: Firestore): Promise<KpiV2Runtime> {
  const d = defaultKpiV2Runtime()
  try {
    const snap = await db.collection(SCORING_AUX).doc(DOC_ID).get()
    if (!snap.exists) return d
    const raw = snap.data() ?? {}
    return {
      enabled: raw.enabled !== false,
      goLiveDate: String(raw.goLiveDate ?? d.goLiveDate).trim() || d.goLiveDate,
      lpxtMinVnd: Math.max(1, Math.round(Number(raw.lpxtMinVnd ?? d.lpxtMinVnd))),
      leadChamMinSeconds: Math.max(1, Math.round(Number(raw.leadChamMinSeconds ?? d.leadChamMinSeconds))),
      leadChamMaxSecondsExclusive: Math.max(
        2,
        Math.round(Number(raw.leadChamMaxSecondsExclusive ?? d.leadChamMaxSecondsExclusive)),
      ),
      sourceBucketByLabel: {
        ...d.sourceBucketByLabel,
        ...((raw.sourceBucketByLabel as Record<string, KpiSourceBucket>) ?? {}),
      },
    }
  } catch {
    return d
  }
}

export function resolveSourceBucket(sourceLabel: string, mapping: Record<string, KpiSourceBucket>): KpiSourceBucket {
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

export function isOnOrAfterGoLive(day: string, goLiveDate: string): boolean {
  return day >= goLiveDate
}
