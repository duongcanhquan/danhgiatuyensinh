import type { Lead } from '../types'
import { studyFormatFromParts } from './studyFormatMerge'
import { resolveLeadPrimarySource } from './leadSemanticFieldValue'
import {
  INFO_SCORE_FIELD_IDS,
  type InfoScoreFieldId,
  type InfoScoreFieldRowPersisted,
  type InfoScoreRulesPersisted,
} from '../types'
import { scoringPhoneNationalDigits } from './scoringEngine'

function studentPhoneTenDigits(lead: Lead): boolean {
  return scoringPhoneNationalDigits(lead.phone ?? '').length === 10
}

function nonEmptyField(s: string | undefined): boolean {
  return Boolean(String(s ?? '').trim())
}

function descriptionMeaningful(lead: Lead): boolean {
  return (lead.description?.trim().length ?? 0) >= 15
}

const MATCHERS: Record<InfoScoreFieldId, (lead: Lead) => boolean> = {
  customerId: (l) => nonEmptyField(l.customerId),
  fullName: (l) => nonEmptyField(l.fullName),
  dateOfBirth: (l) => nonEmptyField(l.dateOfBirth),
  phone: studentPhoneTenDigits,
  parentPhone: (l) => nonEmptyField(l.parentPhone),
  source: (l) => nonEmptyField(resolveLeadPrimarySource(l) || l.source),
  majorInterest: (l) => nonEmptyField(l.majorInterest),
  academicPerformance: (l) => nonEmptyField(l.academicPerformance),
  highSchool: (l) => nonEmptyField(l.highSchool),
  aspirations: (l) => nonEmptyField(l.aspirations),
  financialStatus: (l) => nonEmptyField(l.financialStatus),
  hanoiArea: (l) => nonEmptyField(l.hanoiArea),
  hobbies: (l) => nonEmptyField(l.hobbies),
  profileNote1: (l) => nonEmptyField(l.profileNote1),
  profileNote2: (l) => nonEmptyField(l.profileNote2),
  gradeClass: (l) => nonEmptyField(l.gradeClass),
  province: (l) => nonEmptyField(l.province),
  address: (l) => nonEmptyField(l.permanentAddress || l.address),
  ethnicity: (l) => nonEmptyField(l.ethnicity),
  permanentAddress: (l) => nonEmptyField(l.permanentAddress || l.address),
  currentResidence: (l) => nonEmptyField(l.currentResidence),
  assignedTo: (l) => Boolean(l.assignedTo && String(l.assignedTo).trim()),
  otherAttentionNotes: (l) => nonEmptyField(l.otherAttentionNotes),
  educationLevel: (l) => nonEmptyField(studyFormatFromParts(l.studyIntention, l.educationLevel)),
  studyIntention: (l) => nonEmptyField(studyFormatFromParts(l.studyIntention, l.educationLevel)),
  description: descriptionMeaningful,
}

/**
 * Mặc định: bật 20 tiêu chí trùng bộ cột Excel quy chuẩn (có thể tắt / đổi điểm trong Cài đặt).
 * `educationLevel` và `description` (legacy) mặc định tắt — bật nếu vẫn thu thập qua form mở rộng / dữ liệu cũ.
 */
const DEFAULT_FIELD_ROWS: readonly InfoScoreFieldRowPersisted[] = [
  { id: 'customerId', label: 'Mã khách hàng', pointsIfMatch: 3, enabled: true },
  { id: 'fullName', label: 'Tên Sinh viên', pointsIfMatch: 4, enabled: true },
  { id: 'dateOfBirth', label: 'Ngày sinh', pointsIfMatch: 2, enabled: true, hint: 'Chuỗi không rỗng sau trim.' },
  {
    id: 'phone',
    label: 'Điện thoại (đủ 10 số VN)',
    pointsIfMatch: 8,
    enabled: true,
    hint: 'Chuẩn hóa +84 → 0…; chỉ tính khi đủ 10 chữ số quốc gia.',
  },
  {
    id: 'parentPhone',
    label: 'ĐT người liên hệ',
    pointsIfMatch: 3,
    enabled: true,
    hint: 'Chỉ cần có nội dung — không bắt đủ 10 số.',
  },
  { id: 'source', label: 'Nguồn', pointsIfMatch: 2, enabled: true },
  { id: 'majorInterest', label: 'Ngành Quan tâm', pointsIfMatch: 3, enabled: true },
  { id: 'academicPerformance', label: 'Học lực/ xếp loại', pointsIfMatch: 3, enabled: true },
  { id: 'highSchool', label: 'Trường học', pointsIfMatch: 4, enabled: true },
  { id: 'aspirations', label: 'Mong muốn', pointsIfMatch: 2, enabled: true },
  { id: 'financialStatus', label: 'Nhóm tài chính', pointsIfMatch: 2, enabled: true },
  { id: 'hanoiArea', label: 'Quận/ huyện', pointsIfMatch: 2, enabled: true },
  { id: 'hobbies', label: 'Sở thích', pointsIfMatch: 1, enabled: true },
  { id: 'profileNote1', label: 'Ghi chú 1', pointsIfMatch: 2, enabled: true },
  { id: 'profileNote2', label: 'Ghi chú 2', pointsIfMatch: 1, enabled: true },
  { id: 'gradeClass', label: 'Lớp hiện đang học', pointsIfMatch: 2, enabled: true },
  { id: 'province', label: 'Tỉnh / Thành phố', pointsIfMatch: 3, enabled: true },
  { id: 'address', label: 'Địa chỉ (thường trú)', pointsIfMatch: 3, enabled: true },
  {
    id: 'ethnicity',
    label: 'Dân tộc',
    pointsIfMatch: 2,
    enabled: false,
    hint: 'Bật nếu thu thập trên form Thông tin chung.',
  },
  {
    id: 'permanentAddress',
    label: 'Địa chỉ thường trú',
    pointsIfMatch: 3,
    enabled: false,
    hint: 'Trùng cột địa chỉ khi đã nhập trên form mới.',
  },
  {
    id: 'currentResidence',
    label: 'Nơi ở hiện tại',
    pointsIfMatch: 2,
    enabled: false,
    hint: 'Bật nếu thu thập trên form Thông tin chung.',
  },
  {
    id: 'assignedTo',
    label: 'Đã phân công TVV',
    pointsIfMatch: 4,
    enabled: true,
    hint: 'Có `assignedTo` (UID) — cột «Tư vấn viên» sau import / phân công.',
  },
  { id: 'otherAttentionNotes', label: 'Nội dung lưu ý khác', pointsIfMatch: 2, enabled: true },
  {
    id: 'educationLevel',
    label: 'Hình thức học quan tâm (educationLevel)',
    pointsIfMatch: 4,
    enabled: false,
    hint: 'Gộp hệ đào tạo + dự định hình thức trên form Nguyện vọng.',
  },
  {
    id: 'studyIntention',
    label: 'Hình thức học quan tâm (studyIntention)',
    pointsIfMatch: 4,
    enabled: false,
    hint: 'Cùng giá trị với educationLevel sau khi gộp trên form.',
  },
  {
    id: 'description',
    label: 'Mô tả legacy (≥ 15 ký tự)',
    pointsIfMatch: 4,
    enabled: false,
    hint: 'Dữ liệu cũ / «Ghi chú thêm» — tách với Ghi chú 1–2.',
  },
]

/** Giải thích điều kiện khớp cố định trong app (đồng bộ với MATCHERS). */
export const INFO_SCORE_CRITERION_HELP: ReadonlyArray<{ id: InfoScoreFieldId; rule: string }> = [
  { id: 'customerId', rule: 'Chuỗi không rỗng sau trim.' },
  { id: 'fullName', rule: 'Chuỗi không rỗng sau trim.' },
  { id: 'dateOfBirth', rule: 'Chuỗi không rỗng sau trim (định dạng ngày tự do).' },
  { id: 'phone', rule: 'Số quốc gia VN đúng 10 chữ số (sau chuẩn hóa +84 / khoảng trắng).' },
  { id: 'parentPhone', rule: 'Chuỗi không rỗng sau trim.' },
  { id: 'source', rule: 'Chuỗi không rỗng sau trim.' },
  { id: 'majorInterest', rule: 'Chuỗi không rỗng sau trim.' },
  { id: 'academicPerformance', rule: 'Chuỗi không rỗng sau trim.' },
  { id: 'highSchool', rule: 'Chuỗi không rỗng sau trim.' },
  { id: 'aspirations', rule: 'Chuỗi không rỗng sau trim.' },
  { id: 'financialStatus', rule: 'Chuỗi không rỗng sau trim.' },
  { id: 'hanoiArea', rule: 'Chuỗi không rỗng sau trim.' },
  { id: 'hobbies', rule: 'Chuỗi không rỗng sau trim.' },
  { id: 'profileNote1', rule: 'Chuỗi không rỗng sau trim.' },
  { id: 'profileNote2', rule: 'Chuỗi không rỗng sau trim.' },
  { id: 'gradeClass', rule: 'Chuỗi không rỗng sau trim.' },
  { id: 'province', rule: 'Chuỗi không rỗng sau trim.' },
  { id: 'address', rule: 'Địa chỉ thường trú hoặc cột address legacy — không rỗng sau trim.' },
  { id: 'ethnicity', rule: 'Chuỗi không rỗng sau trim.' },
  { id: 'permanentAddress', rule: 'Chuỗi không rỗng sau trim (hoặc address legacy).' },
  { id: 'currentResidence', rule: 'Chuỗi không rỗng sau trim.' },
  { id: 'assignedTo', rule: 'Trường assignedTo có UID (đã gán tư vấn viên).' },
  { id: 'otherAttentionNotes', rule: 'Chuỗi không rỗng sau trim.' },
  { id: 'educationLevel', rule: 'Hình thức học quan tâm — studyIntention hoặc educationLevel không rỗng.' },
  { id: 'studyIntention', rule: 'Cùng điều kiện với educationLevel sau khi gộp trên form.' },
  { id: 'description', rule: 'Độ dài trim ≥ 15 ký tự (tránh cộng điểm cho ghi chú rỗng / vài ký tự).' },
]

export function getDefaultInfoScoreRules(): InfoScoreRulesPersisted {
  return {
    schemaVersion: 1,
    basePoints: 10,
    capMin: 5,
    capMax: 96,
    fields: DEFAULT_FIELD_ROWS.map((r) => ({ ...r })),
  }
}

function isInfoScoreFieldId(id: string): id is InfoScoreFieldId {
  return (INFO_SCORE_FIELD_IDS as readonly string[]).includes(id)
}

function clampInt(n: number, lo: number, hi: number): number {
  if (!Number.isFinite(n)) return lo
  return Math.max(lo, Math.min(hi, Math.round(n)))
}

function sanitizeRow(raw: unknown, fallback: InfoScoreFieldRowPersisted): InfoScoreFieldRowPersisted {
  if (!raw || typeof raw !== 'object') return { ...fallback }
  const o = raw as Record<string, unknown>
  const idRaw = String(o.id ?? fallback.id)
  const id = isInfoScoreFieldId(idRaw) ? idRaw : fallback.id
  const label = String(o.label ?? fallback.label).trim() || fallback.label
  const pts = Number(o.pointsIfMatch ?? fallback.pointsIfMatch)
  const pointsIfMatch = clampInt(pts, 0, 50)
  const hintRaw = o.hint
  const hint =
    typeof hintRaw === 'string' && hintRaw.trim() ? hintRaw.trim().slice(0, 500) : fallback.hint
  const enabled = o.enabled === false ? false : true
  return { id, label, pointsIfMatch, hint, enabled }
}

/** Đọc document Firestore; trả về `null` nếu không có hoặc không hợp lệ. */
export function parseInfoScoreDoc(data: Record<string, unknown> | undefined | null): InfoScoreRulesPersisted | null {
  if (!data || typeof data !== 'object') return null
  if (Number(data.schemaVersion) !== 1) return null
  const defaults = getDefaultInfoScoreRules()
  const basePoints = clampInt(
    Number(data.basePoints !== undefined && data.basePoints !== null ? data.basePoints : defaults.basePoints),
    0,
    100,
  )
  let capMin = clampInt(
    Number(data.capMin !== undefined && data.capMin !== null ? data.capMin : defaults.capMin),
    0,
    99,
  )
  let capMax = clampInt(
    Number(data.capMax !== undefined && data.capMax !== null ? data.capMax : defaults.capMax),
    1,
    100,
  )
  if (capMin >= capMax) {
    capMin = defaults.capMin
    capMax = defaults.capMax
  }
  const fieldsRaw = data.fields
  if (!Array.isArray(fieldsRaw) || fieldsRaw.length < 1) {
    return { schemaVersion: 1, basePoints, capMin, capMax, fields: defaults.fields.map((r) => ({ ...r })) }
  }
  const byId = new Map<InfoScoreFieldId, InfoScoreFieldRowPersisted>()
  for (const fr of fieldsRaw) {
    const tmp = sanitizeRow(fr, defaults.fields[0])
    if (isInfoScoreFieldId(tmp.id)) byId.set(tmp.id, tmp)
  }
  const fields: InfoScoreFieldRowPersisted[] = []
  for (const id of INFO_SCORE_FIELD_IDS) {
    const fb = defaults.fields.find((x) => x.id === id)!
    fields.push(byId.get(id) ?? fb)
  }
  return { schemaVersion: 1, basePoints, capMin, capMax, fields }
}

/** Gộp bản đọc được với mặc định (an toàn khi thiếu trường). */
export function mergeInfoScoreRules(parsed: InfoScoreRulesPersisted | null): InfoScoreRulesPersisted {
  const d = getDefaultInfoScoreRules()
  if (!parsed) return d
  const basePoints = clampInt(parsed.basePoints, 0, 100)
  let capMin = clampInt(parsed.capMin, 0, 99)
  let capMax = clampInt(parsed.capMax, 1, 100)
  if (capMin >= capMax) {
    capMin = d.capMin
    capMax = d.capMax
  }
  const fields: InfoScoreFieldRowPersisted[] = []
  for (const id of INFO_SCORE_FIELD_IDS) {
    const fb = d.fields.find((x) => x.id === id)!
    const row = parsed.fields.find((x) => x.id === id)
    fields.push(row ? sanitizeRow(row, fb) : fb)
  }
  return { schemaVersion: 1, basePoints, capMin, capMax, fields }
}

export type InfoScoreRuntimeField = {
  id: InfoScoreFieldId
  label: string
  pointsIfMatch: number
  hint?: string
  enabled: boolean
  match: (lead: Lead) => boolean
}

export type InfoScoreRuntime = {
  /** `remote` = đã đọc được cấu hình từ `scoringAux/infoScoreConfig`; `builtin` = mặc định app (chưa có doc hợp lệ). */
  ruleSource: 'builtin' | 'remote'
  basePoints: number
  capMin: number
  capMax: number
  fields: InfoScoreRuntimeField[]
}

export function buildInfoScoreRuntime(merged: InfoScoreRulesPersisted, rulesFromRemote: boolean): InfoScoreRuntime {
  return {
    ruleSource: rulesFromRemote ? 'remote' : 'builtin',
    basePoints: merged.basePoints,
    capMin: merged.capMin,
    capMax: merged.capMax,
    fields: merged.fields.map((f) => ({
      ...f,
      match: MATCHERS[f.id],
    })),
  }
}

export function infoScoreMaxRaw(merged: InfoScoreRulesPersisted): number {
  const fe = merged.fields.filter((f) => f.enabled)
  return merged.basePoints + fe.reduce((s, f) => s + f.pointsIfMatch, 0)
}

/** Điểm thông tin thô (chưa kẹp %) — dùng cộng vào calculatedScore profile. */
export function computeInfoScoreRaw(lead: Lead, runtime?: InfoScoreRuntime | null): number {
  const r =
    runtime ??
    buildInfoScoreRuntime(mergeInfoScoreRules(null), false)
  let raw = r.basePoints
  for (const f of r.fields) {
    if (f.enabled && f.match(lead)) raw += f.pointsIfMatch
  }
  return raw
}
