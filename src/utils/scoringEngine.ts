import type {
  Lead,
  MasterCatalogDefinition,
  MasterDataEntry,
  PriorityTag,
  ProfileCustomScoringSignal,
  ScoringProfile,
  ScoringProfileThresholds,
  ScoringRule,
  ScoringRuleAllocationKind,
  ScoringRuleBlock,
  ScoringRuleConditionRow,
  RuleCategory,
} from '../types'
import { inferSignalRuleCategory, mergeSchoolAndProfileCustomSignals, scoringSignalsToEvaluationFlat } from './leadScoringSignals'
import { entryMatchesMasterValue, findMasterEntryForListItem } from './masterDataMatch'

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
  /** Tùy chọn — mở rộng IN_LIST theo `synonyms` + chế độ khớp trên từng mục master */
  regionEntries?: MasterDataEntry[]
  majorEntries?: MasterDataEntry[]
  /** Nhãn học lực trong master (vd. Giỏi, Khá) */
  academicPerformanceLabels?: string[]
  /** Meta catalog (valueKind, defaultMatchMode) — đồng bộ với `_registry`. */
  catalogs?: MasterCatalogDefinition[]
  /** Toàn bộ mục theo id catalog — dùng cho IN_LIST theo `targetField`. */
  entriesByCatalogId?: Record<string, MasterDataEntry[]>
}

/**
 * Chuẩn hóa để so khớp điều kiện: thường, bỏ dấu (Hà Nội ≡ ha noi), gom khoảng trắng.
 * Dùng cho EQUALS / CONTAINS / CONTAINS_ABBR_NORM / IN_LIST và nội dung trường lead.
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

/** Chữ cái đầu mỗi từ (sau norm, còn khoảng trắng) — dùng khớp viết tắt kiểu CNTT, HN. */
function wordInitialsNorm(fieldSpacedNorm: string): string {
  const words = fieldSpacedNorm.split(/\s+/).filter(Boolean)
  if (words.length < 2) return ''
  return words.map((w) => w[0]!).join('')
}

/** CONTAINS + bỏ khoảng trắng toàn chuỗi + khớp chuỗi viết tắt từ chữ đầu các từ (không dấu). */
function matchesContainsAbbrNorm(fieldValNorm: string, value: string | string[]): boolean {
  const raw = Array.isArray(value) ? value.join(',') : String(value ?? '')
  const parts = raw
    .split(',')
    .map((p) => norm(p))
    .filter((p) => p.length > 0)
  if (parts.length === 0) return false
  const fieldCompact = fieldValNorm.replace(/\s+/g, '')
  const initials = wordInitialsNorm(fieldValNorm)
  return parts.some((part) => {
    const pc = part.replace(/\s+/g, '')
    if (!pc) return false
    if (fieldValNorm.includes(part)) return true
    if (fieldCompact.includes(pc)) return true
    if (initials.length >= 2 && pc.length >= 2 && initials.includes(pc)) return true
    return initials.length >= 2 && pc.length >= 2 && pc === initials
  })
}

/** Chuẩn hoá loại trường để rule EQUALS / IN_LIST dùng mã ổn định (bỏ dấu, không phân biệt hoa thường). */
export function normalizeSchoolTypeKey(raw: string): string {
  const n = norm(raw)
  if (!n) return 'UNKNOWN'
  if (n.includes('lien ket') || n.includes('hop tac') || n.includes('ket hop')) return 'LIEN_KET'
  if (n.includes('quoc te') || n.includes('international')) return 'INTERNATIONAL'
  if (n.includes('tu thuc') || n.includes('dan lap') || n.includes('private')) return 'PRIVATE'
  if (n.includes('cong lap') || n.includes('nha nuoc') || n === 'public') return 'PUBLIC'
  const upper = raw.trim().toUpperCase()
  if (['PUBLIC', 'PRIVATE', 'INTERNATIONAL', 'UNKNOWN', 'LIEN_KET'].includes(upper)) return upper
  return 'UNKNOWN'
}

/**
 * So khớp ngành quan tâm với danh mục ngành đào tạo (đã chuẩn hoá).
 * `outside_or_unknown`: chưa nhập, từ khóa «chưa biết / ngoài ngành», hoặc không khớp bất kỳ ngành nào.
 */
export function computeMajorTrainingAlignment(majorInterest: string, majorLabels: string[]): string {
  const m = norm(majorInterest)
  if (!m) return 'empty'
  const undecided = [
    'chua biet',
    'chua xac dinh',
    'chua ro',
    'ngoai nganh',
    'ngoai nganh dao tao',
    'khong xac dinh',
    'chua chon nganh',
    'chua chon',
    'tu van',
    'xx',
  ]
  if (undecided.some((u) => m === u || m.includes(u))) return 'outside_or_unknown'
  const norms = majorLabels.map((x) => norm(String(x))).filter(Boolean)
  for (const ml of norms) {
    if (m === ml || m.includes(ml) || ml.includes(m)) return 'aligned'
  }
  return 'outside_or_unknown'
}

/** Ánh xạ trường lead (rule.targetField) → id document catalog trong `masterData`. */
export function catalogIdForScoringTargetField(targetField: string): string | null {
  switch (targetField) {
    case 'province':
    case 'region':
      return 'regions'
    case 'majorInterest':
      return 'majors'
    case 'academicLevel':
      return 'academic_performance'
    case 'highSchool':
      return 'high_schools'
    case 'schoolType':
      return 'school_types'
    case 'studyIntention':
      return 'study_intentions'
    case 'financialStatus':
      return 'financial_profiles'
    case 'hanoiArea':
      return 'hanoi_areas'
    default:
      return null
  }
}

/** Catalog dùng cho IN_LIST: ánh xạ cố định + catalog có id trùng `targetField` (danh mục tùy thêm). */
function resolveCatalogIdForInList(targetField: string, buckets?: MasterDataBuckets): string | null {
  const mapped = catalogIdForScoringTargetField(targetField)
  if (mapped) return mapped
  const raw = targetField.trim()
  if (raw && buckets?.entriesByCatalogId?.[raw]?.length) return raw
  return null
}

function resolveInListEntries(
  targetField: string,
  buckets?: MasterDataBuckets,
): { entries: MasterDataEntry[]; catalog?: MasterCatalogDefinition } | null {
  const catalogId = resolveCatalogIdForInList(targetField, buckets)
  if (catalogId && buckets?.entriesByCatalogId?.[catalogId]?.length) {
    const entries = buckets.entriesByCatalogId[catalogId]!
    const catalog = buckets.catalogs?.find((c) => c.id === catalogId)
    return { entries, catalog }
  }
  if (targetField === 'province' || targetField === 'region') {
    const e = buckets?.regionEntries
    if (!e?.length) return null
    const catalog = buckets?.catalogs?.find((c) => c.id === 'regions')
    return { entries: e, catalog }
  }
  if (targetField === 'majorInterest') {
    const e = buckets?.majorEntries
    if (!e?.length) return null
    const catalog = buckets?.catalogs?.find((c) => c.id === 'majors')
    return { entries: e, catalog }
  }
  return null
}

function inListMatchesField(
  rawField: string,
  fieldVal: string,
  list: unknown[],
  targetField: string,
  buckets?: MasterDataBuckets,
): boolean {
  const items = (Array.isArray(list) ? list : [String(list)]).map((x) => String(x))
  const baseSet = new Set(items.map((x) => norm(x)))
  if (baseSet.has(fieldVal)) return true

  const resolved = resolveInListEntries(targetField, buckets)
  if (!resolved?.entries.length) return false
  const { entries, catalog } = resolved

  for (const item of items) {
    const want = norm(String(item))
    const entry = findMasterEntryForListItem(entries, want)
    if (!entry) continue
    if (entryMatchesMasterValue(rawField, fieldVal, entry, catalog)) return true
  }
  return false
}

function augmentLeadDataForScoring(
  leadData: Record<string, unknown>,
  buckets?: MasterDataBuckets,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...leadData }
  const schoolRaw = String(leadData.schoolType ?? '').trim()
  out.schoolTypeKey = schoolRaw ? normalizeSchoolTypeKey(schoolRaw) : 'UNKNOWN'
  if (buckets?.majorLabels?.length) {
    out.majorTrainingAlignment = computeMajorTrainingAlignment(
      String(leadData.majorInterest ?? ''),
      buckets.majorLabels,
    )
  }
  return out
}

function getFieldValue(leadData: Record<string, unknown>, targetField: string): string {
  const v = leadData[targetField]
  if (v === undefined || v === null) return ''
  return String(v)
}

/**
 * Chuẩn hoá một chuỗi SĐT VN cho chấm điểm: chỉ giữ số; bắt đầu bằng 84 và đủ dài → `0` + phần còn lại
 * (cùng hướng tiếp cận `normalizePhoneKey` trong `leadIdentity.ts`, nhưng chỉ một trường lead).
 */
export function scoringPhoneNationalDigits(raw: string): string {
  const digits = String(raw ?? '').trim().replace(/\D/g, '')
  if (!digits) return ''
  if (digits.startsWith('84') && digits.length >= 10) return `0${digits.slice(2)}`
  return digits
}

function phoneDigitsMatch(leadData: Record<string, unknown>, rule: ScoringRule, wantTen: boolean): boolean {
  const raw = getFieldValue(leadData, rule.targetField)
  const national = scoringPhoneNationalDigits(raw)
  const ok = national.length === 10
  return wantTen ? ok : !ok
}

function ruleMatches(
  leadData: Record<string, unknown>,
  rule: ScoringRule,
  buckets?: MasterDataBuckets,
): boolean {
  const condition = rule.condition
  if (condition === 'PHONE_VN_10_DIGITS') {
    return phoneDigitsMatch(leadData, rule, true)
  }
  if (condition === 'PHONE_VN_NOT_10_DIGITS') {
    return phoneDigitsMatch(leadData, rule, false)
  }

  if (condition === 'HAS_DIGIT') {
    return /\d/.test(getFieldValue(leadData, rule.targetField))
  }

  const fieldVal = norm(getFieldValue(leadData, rule.targetField))

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
  if (condition === 'CONTAINS_ABBR_NORM') {
    return matchesContainsAbbrNorm(fieldVal, rule.value)
  }
  if (condition === 'CONTAINS_ALL_NORM') {
    const raw = Array.isArray(rule.value) ? rule.value.join(',') : String(rule.value ?? '')
    const parts = raw
      .split(',')
      .map((p) => norm(p))
      .filter((p) => p.length > 0)
    if (parts.length === 0) return false
    return parts.every((val) => fieldVal.includes(val))
  }
  if (condition === 'NOT_CONTAINS_NORM') {
    const raw = Array.isArray(rule.value) ? rule.value.join(',') : String(rule.value ?? '')
    const parts = raw
      .split(',')
      .map((p) => norm(p))
      .filter((p) => p.length > 0)
    if (parts.length === 0) return true
    return !parts.some((val) => fieldVal.includes(val))
  }
  if (condition === 'IN_LIST') {
    const list = Array.isArray(rule.value) ? rule.value : [String(rule.value)]
    const rawField = getFieldValue(leadData, rule.targetField)
    const fieldVal = norm(rawField)
    const resolved = resolveInListEntries(rule.targetField, buckets)
    if (resolved?.entries.length) {
      return inListMatchesField(rawField, fieldVal, list, rule.targetField, buckets)
    }
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
export function scoreOneBlock(
  leadData: Record<string, unknown>,
  block: ScoringRuleBlock,
  buckets?: MasterDataBuckets,
): number {
  if (!block.rows?.length) return 0
  const cap = Math.max(0, Number(block.maxWeight) || 0)
  let total = 0
  for (const row of block.rows) {
    if (!ruleMatches(leadData, rowAsSyntheticRule(block, row), buckets)) continue
    total += allocationToPoints(row, cap, row.allocationKind)
  }
  return total
}

export function sumBlockPoints(
  leadData: Record<string, unknown>,
  blocks: ScoringRuleBlock[],
  buckets?: MasterDataBuckets,
): number {
  let total = 0
  for (const b of blocks) {
    total += scoreOneBlock(leadData, b, buckets)
  }
  return total
}

export function sumBlockMaxWeights(blocks: ScoringRuleBlock[] | undefined): number {
  if (!blocks?.length) return 0
  return blocks.reduce((s, b) => s + Math.max(0, Number(b.maxWeight) || 0), 0)
}

/** Không còn chặn lưu theo ngân sách 100 — luôn cho phép lưu profile. */
export function isProfileOverBudget(blocks?: ScoringRuleBlock[]): boolean {
  void blocks
  return false
}

export function inferRuleCategory(targetField: string): RuleCategory {
  const f = targetField.trim()
  const sigCat = inferSignalRuleCategory(f)
  if (sigCat) return sigCat
  if (['aspirations', 'hobbies', 'fieldTripNotes', 'description'].includes(f)) return 'psychographics'
  if (f === 'aiSentimentScore') return 'ai_insights'
  if (['leadSource', 'source', 'parentPhone'].includes(f)) return 'source_engagement'
  if (
    [
      'academicLevel',
      'schoolType',
      'schoolTypeKey',
      'majorTrainingAlignment',
      'highSchoolName',
      'highSchoolId',
      'highSchool',
      'educationLevel',
      'gradeClass',
    ].includes(f)
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
export function sumRulePoints(
  leadData: Record<string, unknown>,
  rules: ScoringRule[],
  buckets?: MasterDataBuckets,
): number {
  let total = 0
  for (const rule of rules) {
    if (ruleMatches(leadData, rule, buckets)) total += Number(rule.points) || 0
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
  const majorInterest = (lead.majorInterest?.trim() || lead.educationLevel || '').trim()
  const academicLevel = (lead.academicPerformance?.trim() || lead.educationLevel || '').trim()
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
    studyIntention: lead.studyIntention?.trim() ?? '',
    financialStatus: lead.financialStatus?.trim() ?? '',
    hanoiArea: lead.hanoiArea?.trim() ?? '',
    schoolType: lead.schoolType?.trim() ?? '',
    // Legacy field names still referenced by older scoring rules in Firestore
    region: lead.province,
    majorInterest,
    academicLevel,
    highSchoolName: lead.highSchool,
    leadSource: lead.source,
    assignedCounselorId: lead.assignedTo ?? lead.assignedCounselorId,
    aiSentimentScore: lead.aiSentimentScore,
    ...scoringSignalsToEvaluationFlat(lead.scoringSignals),
    scoringCustomSignals: lead.scoringCustomSignals ?? {},
  }
}

function sumCustomScoringSignalPoints(
  leadData: Record<string, unknown>,
  defs: ProfileCustomScoringSignal[] | undefined,
): number {
  if (!defs?.length) return 0
  const flags = leadData.scoringCustomSignals as Record<string, unknown> | undefined
  if (!flags || typeof flags !== 'object') return 0
  let t = 0
  for (const d of defs) {
    if (flags[d.id] === true) t += Number(d.points) || 0
  }
  return t
}

function profileRawScore(
  leadData: Record<string, unknown>,
  profile: Pick<ScoringProfile, 'rules' | 'ruleBlocks' | 'customScoringSignals'>,
  buckets?: MasterDataBuckets,
): number {
  const blocks = profile.ruleBlocks
  const fromBlocks =
    blocks && blocks.length > 0
      ? sumBlockPoints(leadData, blocks, buckets)
      : sumRulePoints(leadData, profile.rules ?? [], buckets)
  return fromBlocks + sumCustomScoringSignalPoints(leadData, profile.customScoringSignals)
}

/**
 * Chấm điểm tích lũy không trần 100; nhãn HOT/WARM/COLD/LOSS theo `profile.thresholds`
 * (mỗi profile kể cả mặc định đều chỉnh được), fallback {@link FIXED_TAG_THRESHOLDS}.
 */
export function evaluateLead(
  leadData: Record<string, unknown>,
  profile: Pick<ScoringProfile, 'rules' | 'ruleBlocks' | 'thresholds' | 'customScoringSignals'>,
  masterBuckets?: MasterDataBuckets,
  schoolCustomScoringSignals?: ProfileCustomScoringSignal[] | null,
): { calculatedScore: number; priorityTag: PriorityTag } {
  try {
    const merged = augmentLeadDataForScoring(leadData, masterBuckets)
    const mergedCustom = mergeSchoolAndProfileCustomSignals(schoolCustomScoringSignals, profile.customScoringSignals)
    const profileForBlocks: Pick<ScoringProfile, 'rules' | 'ruleBlocks' | 'customScoringSignals'> = {
      rules: profile.rules,
      ruleBlocks: profile.ruleBlocks,
      customScoringSignals: mergedCustom,
    }
    const raw = profileRawScore(merged, profileForBlocks, masterBuckets)
    const calculatedScore = Number.isFinite(raw) ? raw : 0
    const priorityTag = scoreToPriorityTag(calculatedScore, profile.thresholds)
    return { calculatedScore, priorityTag }
  } catch {
    return { calculatedScore: 0, priorityTag: 'COLD' }
  }
}

/**
 * Tính lại điểm/nhãn sau khi merge `patch` vào lead (Firestore / UI).
 * Bỏ `calculatedScore` / `priorityTag` khỏi record đầu vào để rule không đọc nhầm điểm cũ khi chấm lại.
 */
export function computeStoredScoringForLeadPatch(
  before: Lead,
  patch: Partial<Lead>,
  profile: ScoringProfile | null,
  masterBuckets?: MasterDataBuckets,
  schoolCustomScoringSignals?: ProfileCustomScoringSignal[] | null,
): { calculatedScore: number; priorityTag: PriorityTag } | null {
  if (!profile) return null
  const merged = { ...before, ...patch } as Lead
  const rec = leadToEvaluationRecord(merged)
  delete rec.calculatedScore
  delete rec.priorityTag
  return evaluateLead(rec, profile, masterBuckets, schoolCustomScoringSignals)
}

/** Partial ghi Firestore: chỉ điểm + nhãn; rỗng nếu không có profile chấm. */
export function persistedLeadScoringFields(
  before: Lead,
  patch: Partial<Lead>,
  profile: ScoringProfile | null,
  masterBuckets?: MasterDataBuckets,
  schoolCustomScoringSignals?: ProfileCustomScoringSignal[] | null,
): Partial<Pick<Lead, 'calculatedScore' | 'priorityTag'>> {
  const ev = computeStoredScoringForLeadPatch(before, patch, profile, masterBuckets, schoolCustomScoringSignals)
  return ev ? { calculatedScore: ev.calculatedScore, priorityTag: ev.priorityTag } : {}
}

export function isKnownHighSchool(name: string, highSchoolLabels: string[]): boolean {
  const n = norm(name)
  return highSchoolLabels.some((p) => norm(p) === n)
}
