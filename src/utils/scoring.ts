import type {
  Lead,
  PriorityTag,
  ScoringProfile,
  ScoringRule,
  ScoringRuleAllocationKind,
  ScoringRuleBlock,
  ScoringRuleConditionRow,
  RuleCategory,
} from '../types'

/** Ngưỡng mặc định khi profile không chỉ định (0–100) */
export const DEFAULT_TAG_THRESHOLDS = {
  hot: 80,
  warm: 50,
} as const

/** Dữ liệu tham chiếu từ MasterData (nhãn) — giữ tham số thứ 3 của `evaluateLead` để tương thích gọi cũ */
export type MasterDataBuckets = {
  regionLabels: string[]
  highSchoolLabels: string[]
  majorLabels: string[]
}

function norm(s: string): string {
  return s.trim().toLowerCase()
}

function getFieldValue(leadData: Record<string, unknown>, targetField: string): string {
  const v = leadData[targetField]
  if (v === undefined || v === null) return ''
  return String(v)
}

function ruleMatches(leadData: Record<string, unknown>, rule: ScoringRule): boolean {
  const fieldVal = norm(getFieldValue(leadData, rule.targetField))
  const condition = rule.condition

  if (condition === 'IS_NOT_EMPTY') {
    return fieldVal.length > 0
  }
  if (condition === 'EQUALS') {
    const val = norm(String(rule.value))
    return fieldVal === val
  }
  if (condition === 'CONTAINS') {
    const val = norm(String(rule.value))
    return val.length > 0 && fieldVal.includes(val)
  }
  if (condition === 'IN_LIST') {
    const list = Array.isArray(rule.value) ? rule.value : [String(rule.value)]
    const set = new Set(list.map((x) => norm(String(x))))
    return set.has(fieldVal)
  }
  return false
}

function rowAsSyntheticRule(block: ScoringRuleBlock, row: ScoringRuleConditionRow): ScoringRule {
  return {
    id: row.id,
    targetField: block.targetField,
    condition: row.condition,
    value: row.value,
    points: 0,
  }
}

function allocationToPoints(
  row: ScoringRuleConditionRow,
  maxWeight: number,
  kind: ScoringRuleAllocationKind,
): number {
  if (kind === 'percent_of_max') {
    const p = Math.max(0, Math.min(100, Number(row.allocationValue) || 0))
    return Math.round((maxWeight * p) / 100)
  }
  return Math.max(0, Number(row.allocationValue) || 0)
}

/**
 * Points from one block: first matching row (top‑down) wins, then `min(earned, maxWeight)`.
 */
export function scoreOneBlock(leadData: Record<string, unknown>, block: ScoringRuleBlock): number {
  const cap = Math.max(0, Number(block.maxWeight) || 0)
  if (!cap || !block.rows?.length) return 0
  for (const row of block.rows) {
    if (!ruleMatches(leadData, rowAsSyntheticRule(block, row))) continue
    const earned = allocationToPoints(row, cap, row.allocationKind)
    return Math.min(cap, earned)
  }
  return 0
}

export function sumBlockPoints(leadData: Record<string, unknown>, blocks: ScoringRuleBlock[]): number {
  let total = 0
  for (const b of blocks) {
    total += scoreOneBlock(leadData, b)
  }
  return Math.max(0, total)
}

/** Sum of `maxWeight` across blocks — the 100‑point budget denominator in the builder */
export function sumBlockMaxWeights(blocks: ScoringRuleBlock[] | undefined): number {
  if (!blocks?.length) return 0
  return blocks.reduce((s, b) => s + Math.max(0, Number(b.maxWeight) || 0), 0)
}

export function isProfileOverBudget(blocks: ScoringRuleBlock[] | undefined): boolean {
  return sumBlockMaxWeights(blocks) > 100
}

export function inferRuleCategory(targetField: string): RuleCategory {
  const f = targetField.trim()
  if (['aspirations', 'hobbies', 'fieldTripNotes'].includes(f)) return 'psychographics'
  if (f === 'aiSentimentScore') return 'ai_insights'
  if (['leadSource', 'source', 'parentPhone'].includes(f)) return 'source_engagement'
  if (['academicLevel', 'schoolType', 'highSchoolName', 'highSchoolId'].includes(f)) return 'academic'
  return 'demographics'
}

/** Migrate legacy flat rules → one block per rule (first row = original condition). */
export function legacyRulesToBlocks(rules: ScoringRule[]): ScoringRuleBlock[] {
  return rules.map((r) => ({
    id: r.id,
    category: inferRuleCategory(String(r.targetField)),
    label: String(r.targetField),
    targetField: r.targetField,
    maxWeight: Math.max(0, r.points),
    rows: [
      {
        id: crypto.randomUUID(),
        condition: r.condition,
        value: r.value,
        allocationKind: 'absolute',
        allocationValue: r.points,
      },
    ],
  }))
}

export function sumRulePoints(leadData: Record<string, unknown>, rules: ScoringRule[]): number {
  let total = 0
  for (const rule of rules) {
    if (ruleMatches(leadData, rule)) total += rule.points
  }
  return Math.max(0, total)
}

export function scoreToPriorityTag(
  score: number,
  thresholds: { hot: number; warm: number } = DEFAULT_TAG_THRESHOLDS,
): PriorityTag {
  if (score >= thresholds.hot) return 'HOT'
  if (score >= thresholds.warm) return 'WARM'
  return 'COLD'
}

/** Chuẩn hoá lead → record cho engine (targetField khớp tên cột / field). */
export function leadToEvaluationRecord(lead: Lead): Record<string, unknown> {
  return {
    fullName: lead.fullName,
    phone: lead.phone,
    email: lead.email,
    parentPhone: lead.parentPhone,
    majorInterest: lead.majorInterest,
    majorInterestId: lead.majorInterestId,
    academicLevel: lead.academicLevel,
    studyIntention: lead.studyIntention,
    region: lead.region,
    regionId: lead.regionId,
    province: lead.province,
    hanoiArea: lead.hanoiArea,
    gender: lead.gender,
    highSchoolName: lead.highSchoolName,
    highSchoolId: lead.highSchoolId,
    schoolType: lead.schoolType,
    financialStatus: lead.financialStatus,
    pipelineStatus: lead.pipelineStatus,
    status: lead.status,
    uniqueHash: lead.uniqueHash,
    assignedCounselorId: lead.assignedCounselorId,
    calculatedScore: lead.calculatedScore,
    priorityTag: lead.priorityTag,
    source: lead.source,
    leadSource: lead.leadSource,
    aspirations: lead.aspirations,
    hobbies: lead.hobbies,
    fieldTripNotes: lead.fieldTripNotes,
    aiSentimentScore: lead.aiSentimentScore,
  }
}

function profileRawScore(
  leadData: Record<string, unknown>,
  profile: Pick<ScoringProfile, 'rules' | 'ruleBlocks' | 'thresholds'>,
): number {
  const blocks = profile.ruleBlocks
  if (blocks && blocks.length > 0) {
    return sumBlockPoints(leadData, blocks)
  }
  return sumRulePoints(leadData, profile.rules ?? [])
}

/**
 * Chấm điểm theo một `ScoringProfile` (ruleBlocks ưu tiên, sau đó rules phẳng + thresholds).
 * Điểm tối đa 100 (clamp). `masterData` giữ chỗ tương thích API.
 */
function safeThresholds(profile: Pick<ScoringProfile, 'thresholds'>): { hot: number; warm: number } {
  const t = profile.thresholds
  const hot =
    t && typeof t.hotMinScore === 'number' && Number.isFinite(t.hotMinScore)
      ? t.hotMinScore
      : DEFAULT_TAG_THRESHOLDS.hot
  const warm =
    t && typeof t.warmMinScore === 'number' && Number.isFinite(t.warmMinScore)
      ? t.warmMinScore
      : DEFAULT_TAG_THRESHOLDS.warm
  return { hot, warm: Math.min(warm, hot) }
}

export function evaluateLead(
  leadData: Record<string, unknown>,
  profile: Pick<ScoringProfile, 'rules' | 'ruleBlocks' | 'thresholds'>,
  _masterData?: MasterDataBuckets,
): { calculatedScore: number; priorityTag: PriorityTag } {
  void _masterData
  try {
    const raw = profileRawScore(leadData, profile)
    const calculatedScore = Math.min(100, Math.max(0, Number.isFinite(raw) ? raw : 0))
    const priorityTag = scoreToPriorityTag(calculatedScore, safeThresholds(profile))
    return { calculatedScore, priorityTag }
  } catch {
    return { calculatedScore: 0, priorityTag: 'COLD' }
  }
}

/** Lead thuộc danh sách THPT trong master (theo tên) */
export function isKnownHighSchool(name: string, highSchoolLabels: string[]): boolean {
  const n = norm(name)
  return highSchoolLabels.some((p) => norm(p) === n)
}
