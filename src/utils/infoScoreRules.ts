import type { Lead } from '../types'
import { INFO_SCORE_FIELD_IDS, type InfoScoreFieldId, type InfoScoreFieldRowPersisted, type InfoScoreRulesPersisted } from '../types'
import { scoringPhoneNationalDigits } from './scoringEngine'

function studentPhoneTenDigits(lead: Lead): boolean {
  return scoringPhoneNationalDigits(lead.phone ?? '').length === 10
}

const MATCHERS: Record<InfoScoreFieldId, (lead: Lead) => boolean> = {
  fullName: (l) => Boolean(l.fullName?.trim()),
  phone: studentPhoneTenDigits,
  customerId: (l) => Boolean(l.customerId?.trim()),
  parentPhone: (l) => Boolean(l.parentPhone?.trim()),
  province: (l) => Boolean(l.province?.trim()),
  educationLevel: (l) => Boolean(l.educationLevel?.trim()),
  highSchool: (l) => Boolean(l.highSchool?.trim()),
  address: (l) => Boolean(l.address?.trim()),
}

/** Bản mặc định (trùng logic ban đầu app). */
const DEFAULT_FIELD_ROWS: readonly InfoScoreFieldRowPersisted[] = [
  { id: 'fullName', label: 'Họ tên sinh viên', pointsIfMatch: 6, enabled: true },
  {
    id: 'phone',
    label: 'SĐT sinh viên (chuẩn VN, đúng 10 số)',
    pointsIfMatch: 10,
    enabled: true,
    hint: 'Giống chấm điểm: chỉ số, +84→0…, đủ 10 số mới cộng.',
  },
  { id: 'customerId', label: 'Mã khách hàng', pointsIfMatch: 5, enabled: true },
  {
    id: 'parentPhone',
    label: 'SĐT người liên hệ (có nhập)',
    pointsIfMatch: 4,
    enabled: true,
    hint: 'Chỉ cần có nội dung — không bắt 10 số như SĐT SV.',
  },
  { id: 'province', label: 'Tỉnh / thành phố', pointsIfMatch: 6, enabled: true },
  { id: 'educationLevel', label: 'Hệ đào tạo / ngành quan tâm', pointsIfMatch: 8, enabled: true },
  { id: 'highSchool', label: 'Trường học', pointsIfMatch: 7, enabled: true },
  { id: 'address', label: 'Địa chỉ', pointsIfMatch: 4, enabled: true },
]

export function getDefaultInfoScoreRules(): InfoScoreRulesPersisted {
  return {
    schemaVersion: 1,
    basePoints: 38,
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
