import type {
  Lead,
  PriorityTag,
  ScoringProfile,
  ScoringProfileThresholds,
  ScoringRule,
  ScoringRuleAllocationKind,
  ScoringRuleBlock,
  ScoringRuleConditionRow,
  RuleCategory,
} from '../types'

/** Ngưỡng mặc định khi profile không cấu hình hoặc giá trị không hợp lệ. */
export const FIXED_TAG_THRESHOLDS = {
  hot: 80,
  warm: 50,
  coldFloor: 0,
} as const

function isThresholdDoc(x: unknown): x is ScoringProfileThresholds {
  return typeof x === 'object' && x !== null && 'hotMinScore' in x
}

/**
 * Chuẩn hóa ngưỡng HOT/WARM từ profile (hoặc object legacy `{ hot, warm }` trong test).
 * Đảm bảo warm &lt; hot để các dải HOT / WARM / COLD / LOSS không chồng lấn.
 */
export function resolveTagBands(
  input: ScoringProfileThresholds | { hot: number; warm: number } | null | undefined,
): { hot: number; warm: number } {
  const defH = FIXED_TAG_THRESHOLDS.hot
  const defW = FIXED_TAG_THRESHOLDS.warm
  if (!input) return { hot: defH, warm: defW }
  let hotRaw: number
  let warmRaw: number
  if (isThresholdDoc(input)) {
    hotRaw = Number(input.hotMinScore)
    warmRaw = Number(input.warmMinScore)
  } else {
    hotRaw = Number((input as { hot: number }).hot)
    warmRaw = Number((input as { warm: number }).warm)
  }
  let hot = Number.isFinite(hotRaw) ? Math.round(hotRaw) : defH
  let warm = Number.isFinite(warmRaw) ? Math.round(warmRaw) : defW
  hot = Math.max(1, hot)
  warm = Math.max(0, warm)
  if (warm >= hot) warm = Math.max(0, hot - 1)
  return { hot, warm }
}

export type MasterDataBuckets = {
  regionLabels: string[]
  highSchoolLabels: string[]
  majorLabels: string[]
}

/**
 * Chuẩn hóa để so khớp điều kiện: thường, bỏ dấu (Hà Nội ≡ ha noi), gom khoảng trắng.
 * Dùng cho EQUALS / CONTAINS / IN_LIST và nội dung trường lead.
 */
function norm(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/đ/g, 'd')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/\s+/g, ' ')
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
    const raw = String(rule.value)
    /** Nhiều từ khóa: cách nhau bởi dấu phẩy — khớp nếu trường chứa bất kỳ từ nào (trim, không phân biệt hoa thường). */
    const parts = raw
      .split(',')
      .map((p) => norm(p))
      .filter((p) => p.length > 0)
    if (parts.length === 0) return false
    return parts.some((val) => fieldVal.includes(val))
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
    const cap = Math.max(0, Number(maxWeight) || 0)
    const p = Number(row.allocationValue)
    if (!Number.isFinite(p)) return 0
    return Math.round((cap * p) / 100)
  }
  const abs = Number(row.allocationValue)
  return Number.isFinite(abs) ? abs : 0
}

/**
 * Một khối: **cộng dồn** mọi dòng điều kiện khớp (điểm có thể âm). Không còn trần theo maxWeight.
 */
export function scoreOneBlock(leadData: Record<string, unknown>, block: ScoringRuleBlock): number {
  if (!block.rows?.length) return 0
  const cap = Math.max(0, Number(block.maxWeight) || 0)
  let total = 0
  for (const row of block.rows) {
    if (!ruleMatches(leadData, rowAsSyntheticRule(block, row))) continue
    total += allocationToPoints(row, cap, row.allocationKind)
  }
  return total
}

export function sumBlockPoints(leadData: Record<string, unknown>, blocks: ScoringRuleBlock[]): number {
  let total = 0
  for (const b of blocks) {
    total += scoreOneBlock(leadData, b)
  }
  return total
}

export function sumBlockMaxWeights(blocks: ScoringRuleBlock[] | undefined): number {
  if (!blocks?.length) return 0
  return blocks.reduce((s, b) => s + Math.max(0, Number(b.maxWeight) || 0), 0)
}

/** Không còn chặn lưu theo ngân sách 100 — luôn cho phép lưu profile. */
export function isProfileOverBudget(_blocks: ScoringRuleBlock[] | undefined): boolean {
  return false
}

export function inferRuleCategory(targetField: string): RuleCategory {
  const f = targetField.trim()
  if (['aspirations', 'hobbies', 'fieldTripNotes', 'description'].includes(f)) return 'psychographics'
  if (f === 'aiSentimentScore') return 'ai_insights'
  if (['leadSource', 'source', 'parentPhone'].includes(f)) return 'source_engagement'
  if (
    ['academicLevel', 'schoolType', 'highSchoolName', 'highSchoolId', 'highSchool', 'educationLevel', 'gradeClass'].includes(
      f,
    )
  )
    return 'academic'
  return 'demographics'
}

export function legacyRulesToBlocks(rules: ScoringRule[]): ScoringRuleBlock[] {
  return rules.map((r) => ({
    id: r.id,
    category: inferRuleCategory(String(r.targetField)),
    label: String(r.targetField),
    targetField: r.targetField,
    maxWeight: Math.max(0, Math.abs(r.points)),
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

/** Quy tắc phẳng: mọi rule khớp đều cộng điểm (có thể âm). */
export function sumRulePoints(leadData: Record<string, unknown>, rules: ScoringRule[]): number {
  let total = 0
  for (const rule of rules) {
    if (ruleMatches(leadData, rule)) total += Number(rule.points) || 0
  }
  return total
}

export function scoreToPriorityTag(
  score: number,
  /** Ngưỡng từ profile (`hotMinScore` / `warmMinScore`) hoặc legacy `{ hot, warm }` cho test. */
  thresholds?: ScoringProfileThresholds | { hot: number; warm: number } | null,
): PriorityTag {
  const { hot, warm } = resolveTagBands(thresholds ?? undefined)
  if (score >= hot) return 'HOT'
  if (score >= warm) return 'WARM'
  if (score >= FIXED_TAG_THRESHOLDS.coldFloor) return 'COLD'
  return 'LOSS'
}

export function leadToEvaluationRecord(lead: Lead): Record<string, unknown> {
  return {
    customerId: lead.customerId,
    fullName: lead.fullName,
    phone: lead.phone,
    parentPhone: lead.parentPhone,
    source: lead.source,
    educationLevel: lead.educationLevel,
    assignedTo: lead.assignedTo,
    status: lead.status,
    description: lead.description,
    highSchool: lead.highSchool,
    gradeClass: lead.gradeClass,
    province: lead.province,
    address: lead.address,
    pipelineStatus: lead.pipelineStatus,
    uniqueHash: lead.uniqueHash,
    calculatedScore: lead.calculatedScore,
    priorityTag: lead.priorityTag,
    // Legacy field names still referenced by older scoring rules in Firestore
    region: lead.province,
    majorInterest: lead.educationLevel,
    academicLevel: lead.educationLevel,
    highSchoolName: lead.highSchool,
    leadSource: lead.source,
    assignedCounselorId: lead.assignedTo ?? lead.assignedCounselorId,
    aiSentimentScore: lead.aiSentimentScore,
  }
}

function profileRawScore(
  leadData: Record<string, unknown>,
  profile: Pick<ScoringProfile, 'rules' | 'ruleBlocks'>,
): number {
  const blocks = profile.ruleBlocks
  if (blocks && blocks.length > 0) {
    return sumBlockPoints(leadData, blocks)
  }
  return sumRulePoints(leadData, profile.rules ?? [])
}

/**
 * Chấm điểm tích lũy không trần 100; nhãn HOT/WARM/COLD/LOSS theo `profile.thresholds`
 * (mỗi profile kể cả mặc định đều chỉnh được), fallback {@link FIXED_TAG_THRESHOLDS}.
 */
export function evaluateLead(
  leadData: Record<string, unknown>,
  profile: Pick<ScoringProfile, 'rules' | 'ruleBlocks' | 'thresholds'>,
  _masterData?: MasterDataBuckets,
): { calculatedScore: number; priorityTag: PriorityTag } {
  void _masterData
  try {
    const raw = profileRawScore(leadData, profile)
    const calculatedScore = Number.isFinite(raw) ? raw : 0
    const priorityTag = scoreToPriorityTag(calculatedScore, profile.thresholds)
    return { calculatedScore, priorityTag }
  } catch {
    return { calculatedScore: 0, priorityTag: 'COLD' }
  }
}

export function isKnownHighSchool(name: string, highSchoolLabels: string[]): boolean {
  const n = norm(name)
  return highSchoolLabels.some((p) => norm(p) === n)
}
