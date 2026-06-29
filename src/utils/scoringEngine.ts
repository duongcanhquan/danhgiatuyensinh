import { Timestamp } from 'firebase/firestore'
import type {
  Lead,
  MasterCatalogDefinition,
  MasterDataEntry,
  PriorityTag,
  ProfileCustomScoringSignal,
  ProfileScoringCondition,
  ScoringProfile,
  ScoringProfileThresholds,
  ScoringRule,
  ScoringRuleAllocationKind,
  ScoringRuleBlock,
  ScoringRuleConditionRow,
  RuleCategory,
} from '../types'
import {
  ALL_SCORING_SIGNAL_KEYS,
  SCORING_SIGNAL_META,
  inferSignalRuleCategory,
  mergeSchoolAndProfileCustomSignals,
  scoringCustomSignalsToEvaluationFlat,
  scoringSignalsToEvaluationFlat,
} from './leadScoringSignals'
import { evaluationRecordFieldValue, leadSourceFieldsForScoring } from './leadSemanticFieldValue'
import { computeInfoScoreRaw, type InfoScoreRuntime } from './infoScoreRules'
import type { LeadClassificationRuntime } from './leadClassificationConfig'
import { evaluateLeadWithClassification } from './leadClassificationScore'
import { entryMatchesMasterValue, findMasterEntryForListItem } from './masterDataMatch'
import { profileHasActiveRules } from './scoringProfileUtils'

export { profileHasActiveRules }

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
    case 'educationLevel':
      return 'training_programs'
    case 'academicPerformance':
      return 'academic_performance'
    case 'academicLevel':
      return 'academic_performance'
    case 'highSchool':
    case 'highSchoolName':
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
  return evaluationRecordFieldValue(leadData, targetField)
}

type FieldValueVariant = { raw: string; norm: string }

/** Trường thay thế khi profile trỏ nhầm hoặc dữ liệu nằm ở cột alias trên hồ sơ. */
const FIELD_READ_ALIASES: Record<string, readonly string[]> = {
  schoolType: ['highSchool'],
  schoolTypeKey: ['highSchool', 'schoolType'],
  highSchool: ['highSchoolName'],
  highSchoolName: ['highSchool'],
  province: ['region'],
  region: ['province'],
  address: ['permanentAddress', 'currentResidence'],
  permanentAddress: ['address', 'currentResidence'],
  currentResidence: ['address', 'permanentAddress'],
  hanoiArea: ['currentResidence', 'address', 'permanentAddress'],
  leadSource: ['source', 'source1'],
  source: ['source1', 'leadSource'],
  source1: ['source', 'leadSource'],
  academicLevel: ['academicPerformance'],
  academicPerformance: ['academicLevel'],
  major: ['majorInterest'],
  majorInterest: ['major'],
}

function pushFieldVariant(variants: FieldValueVariant[], raw: string): void {
  const n = norm(raw)
  if (!n || variants.some((v) => v.norm === n)) return
  variants.push({ raw, norm: n })
}

/**
 * Một số profile trỏ `targetField` không khớp cột thật trên hồ sơ — thử thêm biến thể alias.
 */
function fieldValueVariantsForRule(
  leadData: Record<string, unknown>,
  targetField: string,
  condition: ProfileScoringCondition,
): FieldValueVariant[] {
  const raw = getFieldValue(leadData, targetField)
  const primary: FieldValueVariant = { raw, norm: norm(raw) }
  const variants: FieldValueVariant[] = [primary]

  const tf = targetField.trim()
  const textMatchConditions: ProfileScoringCondition[] = [
    'CONTAINS',
    'CONTAINS_ABBR_NORM',
    'CONTAINS_ALL_NORM',
    'NOT_CONTAINS_NORM',
    'IN_LIST',
  ]
  const useAliases =
    textMatchConditions.includes(condition) ||
    condition === 'IS_NOT_EMPTY' ||
    (condition === 'EQUALS' && !primary.norm)

  if (!useAliases) return variants

  for (const alias of FIELD_READ_ALIASES[tf] ?? []) {
    pushFieldVariant(variants, getFieldValue(leadData, alias))
  }

  return variants
}

function variantsMatchContains(fieldValNorm: string, ruleValue: string | string[]): boolean {
  const raw = Array.isArray(ruleValue) ? ruleValue.join(',') : String(ruleValue ?? '')
  const parts = raw
    .split(',')
    .map((p) => norm(p))
    .filter((p) => p.length > 0)
  if (parts.length === 0) return false
  return parts.some((val) => fieldValNorm.includes(val))
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
    return fieldValueVariantsForRule(leadData, rule.targetField, condition).some((v) =>
      /\d/.test(v.raw),
    )
  }

  const variants = fieldValueVariantsForRule(leadData, rule.targetField, condition)

  if (condition === 'IS_NOT_EMPTY') {
    return variants.some((v) => v.norm.length > 0)
  }
  if (condition === 'EQUALS') {
    const val = norm(String(rule.value))
    return variants.some((v) => v.norm === val)
  }
  if (condition === 'CONTAINS') {
    return variants.some((v) => variantsMatchContains(v.norm, rule.value))
  }
  if (condition === 'CONTAINS_ABBR_NORM') {
    return variants.some((v) => matchesContainsAbbrNorm(v.norm, rule.value))
  }
  if (condition === 'CONTAINS_ALL_NORM') {
    const raw = Array.isArray(rule.value) ? rule.value.join(',') : String(rule.value ?? '')
    const parts = raw
      .split(',')
      .map((p) => norm(p))
      .filter((p) => p.length > 0)
    if (parts.length === 0) return false
    return variants.some((v) => parts.every((val) => v.norm.includes(val)))
  }
  if (condition === 'NOT_CONTAINS_NORM') {
    const raw = Array.isArray(rule.value) ? rule.value.join(',') : String(rule.value ?? '')
    const parts = raw
      .split(',')
      .map((p) => norm(p))
      .filter((p) => p.length > 0)
    if (parts.length === 0) return true
    return variants.every((v) => !parts.some((val) => v.norm.includes(val)))
  }
  if (condition === 'IN_LIST') {
    const list = Array.isArray(rule.value) ? rule.value : [String(rule.value)]
    const set = new Set(list.map((x) => norm(String(x))).filter(Boolean))
    const resolved = resolveInListEntries(rule.targetField, buckets)
    for (const v of variants) {
      if (resolved?.entries.length) {
        if (inListMatchesField(v.raw, v.norm, list, rule.targetField, buckets)) return true
        if (set.has(v.norm)) return true
        continue
      }
      if (set.has(v.norm)) return true
      if (variantsMatchContains(v.norm, list.map(String))) return true
    }
    return false
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
  if (
    [
      'aspirations',
      'hobbies',
      'fieldTripNotes',
      'description',
      'profileNote1',
      'profileNote2',
      'otherAttentionNotes',
    ].includes(f)
  )
    return 'psychographics'
  if (f === 'dateOfBirth') return 'demographics'
  if (f === 'aiSentimentScore') return 'ai_insights'
  if (['leadSource', 'source', 'parentPhone'].includes(f)) return 'source_engagement'
  if (
    [
      'academicLevel',
      'schoolType',
      'schoolTypeKey',
      'majorTrainingAlignment',
      'majorInterest',
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
  const studyFormat =
    lead.studyIntention?.trim() || lead.educationLevel?.trim() || ''
  const majorInterest = (lead.majorInterest?.trim() || studyFormat || lead.educationLevel || '').trim()
  const academicPerformance = (lead.academicPerformance?.trim() || '').trim()
  const academicLevel = (academicPerformance || studyFormat || lead.educationLevel || '').trim()
  const permanentAddress = (lead.permanentAddress?.trim() || lead.address?.trim() || '').trim()
  const sourceFields = leadSourceFieldsForScoring(lead)
  return {
    customerId: lead.customerId,
    fullName: lead.fullName,
    phone: lead.phone,
    parentPhone: lead.parentPhone,
    ...sourceFields,
    educationLevel: studyFormat || lead.educationLevel,
    assignedTo: lead.assignedTo,
    status: lead.status,
    description: lead.description,
    dateOfBirth: lead.dateOfBirth?.trim() ?? '',
    profileNote1: lead.profileNote1?.trim() ?? '',
    profileNote2: lead.profileNote2?.trim() ?? '',
    otherAttentionNotes: lead.otherAttentionNotes?.trim() ?? '',
    aspirations: lead.aspirations?.trim() ?? '',
    hobbies: lead.hobbies?.trim() ?? '',
    fieldTripNotes: lead.fieldTripNotes?.trim() ?? '',
    highSchool: lead.highSchool,
    gradeClass: lead.gradeClass,
    province: lead.province,
    address: permanentAddress || lead.address,
    permanentAddress,
    ethnicity: lead.ethnicity?.trim() ?? '',
    currentResidence: lead.currentResidence?.trim() ?? '',
    pipelineStatus: lead.pipelineStatus,
    uniqueHash: lead.uniqueHash,
    calculatedScore: lead.calculatedScore,
    priorityTag: lead.priorityTag,
    studyIntention: studyFormat,
    financialStatus: lead.financialStatus?.trim() ?? '',
    hanoiArea: lead.hanoiArea?.trim() ?? '',
    schoolType: lead.schoolType?.trim() ?? '',
    nationalId: lead.nationalId?.replace(/\D/g, '') ?? '',
    studentEmail: lead.studentEmail?.trim() ?? '',
    systemCode: lead.systemCode?.trim() ?? '',
    fatherName: lead.fatherName?.trim() ?? '',
    fatherPhone: lead.fatherPhone?.trim() ?? '',
    motherName: lead.motherName?.trim() ?? '',
    motherPhone: lead.motherPhone?.trim() ?? '',
    guardian: lead.guardian?.trim() ?? '',
    scholarship1Id: lead.scholarship1Id?.trim() ?? '',
    scholarship2Id: lead.scholarship2Id?.trim() ?? '',
    // Legacy field names still referenced by older scoring rules in Firestore
    region: lead.province,
    majorInterest,
    /** Alias cũ `targetField: major` trên một số profile / mẫu quy tắc. */
    major: majorInterest,
    academicPerformance,
    academicLevel,
    highSchoolName: lead.highSchool,
    assignedCounselorId: lead.assignedTo ?? lead.assignedCounselorId,
    aiSentimentScore: lead.aiSentimentScore,
    ...scoringSignalsToEvaluationFlat(lead.scoringSignals),
    ...scoringCustomSignalsToEvaluationFlat(lead.scoringCustomSignals),
    scoringCustomSignals: lead.scoringCustomSignals ?? {},
  }
}

const EVAL_STUB_TS = Timestamp.fromMillis(1_700_000_000_000)

/**
 * Chuẩn hoá Partial Lead (import Excel, tạo tay, patch) → bản ghi chấm điểm đầy đủ.
 * Dùng chung import / tạo lead để profile đọc đúng mọi cột hồ sơ.
 */
export function evaluationRecordFromLeadLike(partial: Partial<Lead>): Record<string, unknown> {
  const stub: Lead = {
    id: '_scoring_eval',
    customerId: '',
    fullName: '',
    phone: '',
    parentPhone: '',
    source: '',
    educationLevel: '',
    assignedTo: null,
    status: 'NEW',
    description: '',
    highSchool: '',
    gradeClass: '',
    province: '',
    address: '',
    calculatedScore: 0,
    priorityTag: 'COLD',
    uploadedAt: EVAL_STUB_TS,
    updatedAt: EVAL_STUB_TS,
    pipelineStatus: 'NEW',
    uniqueHash: '',
    createdAt: EVAL_STUB_TS,
    ...partial,
  }
  const rec = leadToEvaluationRecord(stub)
  delete rec.calculatedScore
  delete rec.priorityTag
  return rec
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

function collectProfileTargetFields(
  profile: Pick<ScoringProfile, 'rules' | 'ruleBlocks'>,
): Set<string> {
  const s = new Set<string>()
  for (const b of profile.ruleBlocks ?? []) {
    const tf = String(b.targetField ?? '').trim()
    if (tf) s.add(tf)
  }
  for (const r of profile.rules ?? []) {
    const tf = String(r.targetField ?? '').trim()
    if (tf) s.add(tf)
  }
  return s
}

/** Cộng điểm mẫu hành vi/rủi ro khi TVV bật cờ — bỏ qua nếu profile đã có rule cùng `targetField`. */
function sumBuiltinScoringSignalPoints(
  leadData: Record<string, unknown>,
  skipTargetFields: Set<string>,
): number {
  let total = 0
  for (const key of ALL_SCORING_SIGNAL_KEYS) {
    const { evalField, defaultPoints } = SCORING_SIGNAL_META[key]
    if (skipTargetFields.has(evalField)) continue
    const v = evaluationRecordFieldValue(leadData, evalField)
    if (v) total += defaultPoints
  }
  return total
}

export type EvaluateLeadOptions = {
  /** Lead gốc — cần để cộng điểm thông tin và kiểm tra cờ hành vi. */
  lead?: Lead
  infoScoreRuntime?: InfoScoreRuntime | null
  /** Mặc định true khi có `lead`: cộng điểm thông tin + hành vi mẫu (tránh trùng rule profile). */
  includeAuxScores?: boolean
  /** Phân loại HOT/WARM/COLD theo tỷ trọng hồ sơ vs gọi điện (admin cấu hình). */
  classificationRuntime?: LeadClassificationRuntime | null
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
  options?: EvaluateLeadOptions,
): { calculatedScore: number; priorityTag: PriorityTag } {
  try {
    if (options?.classificationRuntime?.enabled && options.lead) {
      const r = evaluateLeadWithClassification(
        options.lead,
        profile,
        options.classificationRuntime,
        masterBuckets,
        schoolCustomScoringSignals,
        { infoScoreRuntime: options.infoScoreRuntime },
      )
      return { calculatedScore: r.calculatedScore, priorityTag: r.priorityTag }
    }
    const merged = augmentLeadDataForScoring(leadData, masterBuckets)
    const mergedCustom = mergeSchoolAndProfileCustomSignals(schoolCustomScoringSignals, profile.customScoringSignals)
    const profileForBlocks: Pick<ScoringProfile, 'rules' | 'ruleBlocks' | 'customScoringSignals'> = {
      rules: profile.rules,
      ruleBlocks: profile.ruleBlocks,
      customScoringSignals: mergedCustom,
    }
    let raw = profileRawScore(merged, profileForBlocks, masterBuckets)
    const includeAux = options?.includeAuxScores ?? Boolean(options?.lead)
    if (includeAux && options?.lead) {
      const covered = collectProfileTargetFields(profileForBlocks)
      raw += sumBuiltinScoringSignalPoints(merged, covered)
      raw += computeInfoScoreRaw(options.lead, options.infoScoreRuntime)
    }
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
  options?: Pick<EvaluateLeadOptions, 'infoScoreRuntime' | 'includeAuxScores' | 'classificationRuntime'>,
): { calculatedScore: number; priorityTag: PriorityTag } | null {
  if (!profile) return null
  const merged = { ...before, ...patch } as Lead
  const rec = leadToEvaluationRecord(merged)
  delete rec.calculatedScore
  delete rec.priorityTag
  return evaluateLead(rec, profile, masterBuckets, schoolCustomScoringSignals, {
    lead: merged,
    infoScoreRuntime: options?.infoScoreRuntime,
    includeAuxScores: options?.includeAuxScores,
    classificationRuntime: options?.classificationRuntime?.enabled ? options.classificationRuntime : null,
  })
}

/** Partial ghi Firestore: điểm + nhãn (+ 2 trụ khi bật phân loại tỷ trọng). */
export function persistedLeadScoringFields(
  before: Lead,
  patch: Partial<Lead>,
  profile: ScoringProfile | null,
  masterBuckets?: MasterDataBuckets,
  schoolCustomScoringSignals?: ProfileCustomScoringSignal[] | null,
  options?: Pick<EvaluateLeadOptions, 'infoScoreRuntime' | 'includeAuxScores' | 'classificationRuntime'>,
): Partial<
  Pick<Lead, 'calculatedScore' | 'priorityTag' | 'leadScoreProfilePart' | 'leadScoreEngagementPart'>
> {
  if (!profile) return {}
  const merged = { ...before, ...patch } as Lead
  if (options?.classificationRuntime?.enabled) {
    const r = evaluateLeadWithClassification(
      merged,
      profile,
      options.classificationRuntime,
      masterBuckets,
      schoolCustomScoringSignals,
      { infoScoreRuntime: options?.infoScoreRuntime },
    )
    return {
      calculatedScore: r.compositeScore,
      priorityTag: r.priorityTag,
      leadScoreProfilePart: r.profilePart,
      leadScoreEngagementPart: r.engagementPart,
    }
  }
  const ev = computeStoredScoringForLeadPatch(
    before,
    patch,
    profile,
    masterBuckets,
    schoolCustomScoringSignals,
    options,
  )
  return ev ? { calculatedScore: ev.calculatedScore, priorityTag: ev.priorityTag } : {}
}

export function isKnownHighSchool(name: string, highSchoolLabels: string[]): boolean {
  const n = norm(name)
  return highSchoolLabels.some((p) => norm(p) === n)
}
