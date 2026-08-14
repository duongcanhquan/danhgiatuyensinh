import * as XLSX from 'xlsx'
import type { Lead, LeadCounselorStatus, LeadIntakeOrigin, PriorityTag } from '../types'
import { assigneeFirestoreMirror, coerceLeadCounselorStatus, counselorStatusToPipeline } from './leadIdentity'

export type ExcelLeadRow = {
  customerId: string
  fullName: string
  dateOfBirth: string
  phone: string
  parentPhone: string
  source: string
  majorInterest?: string
  academicPerformance?: string
  highSchool: string
  aspirations?: string
  financialStatus?: string
  hanoiArea?: string
  hobbies?: string
  profileNote1?: string
  profileNote2?: string
  gradeClass: string
  province: string
  address: string
  assignedToRaw: string
  otherAttentionNotes?: string
  /** Cột tùy chọn / file cũ */
  statusRaw?: string
  educationLevel?: string
  description?: string
  studyIntention?: string
  schoolType?: string
  fieldTripNotes?: string
  /** Mẫu 2+ : email sinh viên */
  studentEmail?: string
  /** Mẫu 2+ : giới tính (chuỗi tự do) */
  gender?: string
  /** Mẫu 2+ : điểm tốt nghiệp (số / chuỗi tự do — tách khỏi học lực Yếu–Giỏi) */
  graduationScore?: string
  /** CCCD / CMND / hộ chiếu — chống trùng khi nhập Excel */
  nationalId?: string
}

/** Map tiêu đề cột Excel (sau chuẩn hoá) → khóa parser. Giữ alias cũ để file mẫu cũ vẫn đọc được. */
const HEADER_ALIASES: Record<string, keyof ExcelLeadRow> = {
  'ma kh': 'customerId',
  'ma khach hang': 'customerId',
  'ten khach hang': 'fullName',
  'ten sinh vien': 'fullName',
  'ho ten': 'fullName',
  'ho va ten': 'fullName',
  'ho ten hoc sinh': 'fullName',
  'ho va ten hoc sinh': 'fullName',
  'ho ten sv': 'fullName',
  'ten hoc sinh': 'fullName',
  ten: 'fullName',
  'full name': 'fullName',
  'student name': 'fullName',
  'ngay sinh': 'dateOfBirth',
  birthday: 'dateOfBirth',
  'ngay thang nam sinh': 'dateOfBirth',
  'ngay/thang/nam sinh': 'dateOfBirth',
  'nam sinh': 'dateOfBirth',
  dob: 'dateOfBirth',
  'dien thoai': 'phone',
  sdt: 'phone',
  'sdt sv': 'phone',
  'sdt sinh vien': 'phone',
  'so dien thoai': 'phone',
  'so dt': 'phone',
  'dien thoai sinh vien': 'phone',
  'dien thoai lien he': 'phone',
  'so dien thoai lien he': 'phone',
  tel: 'phone',
  phone: 'phone',
  mobile: 'phone',
  email: 'studentEmail',
  'e-mail': 'studentEmail',
  'email sinh vien': 'studentEmail',
  'mail': 'studentEmail',
  'gioi tinh': 'gender',
  sex: 'gender',
  gt: 'gender',
  cccd: 'nationalId',
  cmnd: 'nationalId',
  'so cccd': 'nationalId',
  'so cmnd': 'nationalId',
  'can cuoc': 'nationalId',
  'can cuoc cong dan': 'nationalId',
  'ho chieu': 'nationalId',
  passport: 'nationalId',
  'national id': 'nationalId',
  'diem tot nghiep': 'graduationScore',
  'diem tn': 'graduationScore',
  'diem thi tot nghiep': 'graduationScore',
  'tot nghiep': 'graduationScore',
  'graduation score': 'graduationScore',
  gpa: 'graduationScore',
  'hoc luc xep loai': 'academicPerformance',
  'dia chi': 'address',
  'dia chi thuong tru': 'address',
  'dia chi lien he': 'address',
  'truong hoc': 'highSchool',
  truong: 'highSchool',
  'truong thpt': 'highSchool',
  'ten truong': 'highSchool',
  thpt: 'highSchool',
  'truong dang hoc': 'highSchool',
  // --- Các cột Mẫu 1 / legacy (giữ nguyên) ---
  'dien thoai nguoi lien he chinh': 'parentPhone',
  'dt nguoi lien he': 'parentPhone',
  'dien thoai nguoi lien he': 'parentPhone',
  'nguon khach hang': 'source',
  nguon: 'source',
  'he dao tao': 'educationLevel',
  'nganh quan tam': 'majorInterest',
  'hoc luc': 'academicPerformance',
  'hoc luc / xep loai': 'academicPerformance',
  'hoc luc/xep loai': 'academicPerformance',
  'hoc luc/ xep loai': 'academicPerformance',
  'loai truong': 'schoolType',
  'du dinh': 'studyIntention',
  'du dinh (hinh thuc)': 'studyIntention',
  'nhom tai chinh': 'financialStatus',
  'tai chinh': 'financialStatus',
  'tinh hinh tai chinh': 'financialStatus',
  'quan huyen ha noi': 'hanoiArea',
  'quan huyen hn': 'hanoiArea',
  'khu vuc ha noi': 'hanoiArea',
  'quan / huyen (ha noi)': 'hanoiArea',
  'quan/huyen': 'hanoiArea',
  'quan/ huyen': 'hanoiArea',
  'quan / huyen': 'hanoiArea',
  'quan huyen': 'hanoiArea',
  'nguoi phu trach': 'assignedToRaw',
  'tu van vien': 'assignedToRaw',
  'tinh trang': 'statusRaw',
  'mo ta': 'description',
  'ghi chu them': 'description',
  'ghi chu them (mo ta chung)': 'description',
  'ghi chu': 'description',
  'ghi chu 1': 'profileNote1',
  'ghi chu 2': 'profileNote2',
  'noi dung luu y khac': 'otherAttentionNotes',
  'nguyen vong': 'aspirations',
  'mong muon hoc tap': 'aspirations',
  'mong muon': 'aspirations',
  'nhu cau': 'aspirations',
  'nguyen vong / mong muon': 'aspirations',
  'so thich': 'hobbies',
  'ghi chu di truong': 'fieldTripNotes',
  'ghi chu khao sat / thuc te': 'fieldTripNotes',
  lop: 'gradeClass',
  'lop hien dang hoc': 'gradeClass',
  'tinh thanh pho': 'province',
  'tinh /thanh pho': 'province',
  'tinh / thanh pho': 'province',
  'tinh/thanh pho': 'province',
}

function normalizeHeader(h: string): string {
  return h
    .replace(/^\uFEFF/, '')
    .replace(/\u00a0/g, ' ')
    .trim()
    .toLowerCase()
    .replace(/đ/g, 'd')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    // Excel hay thêm *, :, (ghi chú) sau tên cột
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[*：:]+/g, ' ')
    .replace(/[_/\\|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function countFilledExcelFields(row: Partial<ExcelLeadRow>): number {
  let n = 0
  for (const v of Object.values(row)) {
    if (String(v ?? '').trim()) n += 1
  }
  return n
}

function mergeExcelRowPreferFilled(
  primary: Partial<ExcelLeadRow>,
  secondary: Partial<ExcelLeadRow>,
): Partial<ExcelLeadRow> {
  const out: Partial<ExcelLeadRow> = { ...primary }
  for (const [key, val] of Object.entries(secondary) as [keyof ExcelLeadRow, string | undefined][]) {
    if (!String(val ?? '').trim()) continue
    if (String(out[key] ?? '').trim()) continue
    out[key] = val
  }
  return out
}

/** Số serial ngày Excel (1900 date system) → dd/MM/yyyy. */
export function excelSerialToDateString(serial: number): string | null {
  if (!Number.isFinite(serial)) return null
  const n = Math.round(serial)
  // Học sinh: khoảng năm ~1985–2020 → serial ~31000–45000; nới biên an toàn.
  if (n < 25000 || n > 60000) return null
  const utc = Date.UTC(1899, 11, 30) + n * 86400000
  const d = new Date(utc)
  if (Number.isNaN(d.getTime())) return null
  const dd = String(d.getUTCDate()).padStart(2, '0')
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0')
  const yyyy = d.getUTCFullYear()
  return `${dd}/${mm}/${yyyy}`
}

function cellToFieldString(val: unknown, field: keyof ExcelLeadRow): string {
  if (field === 'dateOfBirth' && typeof val === 'number' && Number.isFinite(val)) {
    return excelSerialToDateString(val) ?? excelCellToPlainString(val)
  }
  return excelCellToPlainString(val)
}

function isMappedRowEmpty(row: Partial<ExcelLeadRow>): boolean {
  return !Object.values(row).some((v) => String(v ?? '').trim())
}

function normalizeSheetTabName(name: string): string {
  return normalizeHeader(name).replace(/_/g, ' ').replace(/\s+/g, ' ').trim()
}

function resolveFieldKey(header: string): keyof ExcelLeadRow | null {
  const key = normalizeHeader(header)
  return HEADER_ALIASES[key] ?? null
}

/** Chuỗi ô Excel — tránh SĐT thành scientific notation khi `raw: true`. */
export function excelCellToPlainString(val: unknown): string {
  if (val === undefined || val === null) return ''
  if (typeof val === 'number' && Number.isFinite(val)) {
    if (Number.isInteger(val) || Math.abs(val - Math.round(val)) < 1e-6) {
      return String(Math.round(val))
    }
    return String(val)
  }
  return String(val).trim()
}

export function mapSheetRow(raw: Record<string, unknown>): Partial<ExcelLeadRow> {
  const out: Partial<ExcelLeadRow> = {}
  for (const [header, val] of Object.entries(raw)) {
    const field = resolveFieldKey(header)
    if (!field) continue
    const v = cellToFieldString(val, field)
    if (v) out[field] = v
  }
  return out
}

function isInstructionSheet(tabNormalized: string): boolean {
  return (
    tabNormalized === 'huong dan' ||
    tabNormalized === 'guide' ||
    tabNormalized === 'readme' ||
    tabNormalized === 'instruction' ||
    tabNormalized === 'instructions' ||
    tabNormalized.startsWith('huong dan')
  )
}

/** Đọc hàng tiêu đề thô (aoa) — dùng khi alias tên cột không khớp. */
function sheetHeaderCells(sheet: XLSX.WorkSheet, headerRowIndex: number): string[] {
  const aoa = XLSX.utils.sheet_to_json<(string | number | boolean | null)[]>(sheet, {
    header: 1,
    defval: '',
    raw: false,
    range: headerRowIndex,
  })
  const headerLine = aoa[0]
  if (!Array.isArray(headerLine)) return []
  return headerLine.map((c) => excelCellToPlainString(c))
}

function mapRowByHeaderOrder(
  values: unknown[],
  orderedHeaders: string[],
): Partial<ExcelLeadRow> {
  const out: Partial<ExcelLeadRow> = {}
  const n = Math.min(values.length, orderedHeaders.length)
  for (let i = 0; i < n; i++) {
    const field = resolveFieldKey(orderedHeaders[i] ?? '')
    if (!field) continue
    const v = cellToFieldString(values[i], field)
    if (v) out[field] = v
  }
  return out
}

/**
 * Map theo cột: ưu tiên tên tiêu đề thật trên file; ô nào chưa gắn được thì dùng tiêu đề mẫu cùng vị trí
 * (vá lỗi chỉ khớp «Họ tên» rồi bỏ qua các cột còn lại).
 */
function mapRowHybridColumns(
  values: unknown[],
  actualHeaders: string[],
  fallbackOrderedHeaders: readonly string[],
): Partial<ExcelLeadRow> {
  const out: Partial<ExcelLeadRow> = {}
  const n = Math.max(values.length, actualHeaders.length, fallbackOrderedHeaders.length)
  for (let i = 0; i < n; i++) {
    const fromActual = resolveFieldKey(actualHeaders[i] ?? '')
    const fromTemplate = resolveFieldKey(fallbackOrderedHeaders[i] ?? '')
    const field = fromActual ?? fromTemplate
    if (!field) continue
    const v = cellToFieldString(values[i], field)
    if (!v) continue
    if (String(out[field] ?? '').trim()) continue
    out[field] = v
  }
  return out
}

function sheetMappedRows(
  sheet: XLSX.WorkSheet,
  headerRowIndex: number,
  fallbackOrderedHeaders?: readonly string[],
): Partial<ExcelLeadRow>[] {
  const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: '',
    raw: true,
    range: headerRowIndex,
  })
  const rows = json.map((row) => mapSheetRow(row)).filter((row) => !isMappedRowEmpty(row))

  if (!fallbackOrderedHeaders?.length) return rows

  const headers = sheetHeaderCells(sheet, headerRowIndex)
  const nonEmptyHeaders = headers.filter((h) => h.trim())
  const aliasHits = nonEmptyHeaders.filter((h) => resolveFieldKey(h)).length
  const expectedFieldCount = fallbackOrderedHeaders.filter((h) => resolveFieldKey(h)).length
  const avgFilled =
    rows.length > 0
      ? rows.reduce((s, r) => s + countFilledExcelFields(r), 0) / rows.length
      : 0
  // Thiếu bất kỳ cột mẫu nào (vd. đủ tên/ngày/giới/trường nhưng thiếu SĐT/email/địa chỉ/điểm) → bù theo vị trí.
  const sparse =
    rows.length === 0 ||
    (expectedFieldCount >= 4 && avgFilled < expectedFieldCount)

  const aoa = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: '',
    raw: true,
    range: headerRowIndex,
  })
  if (aoa.length < 2) return rows

  const maxValueCols = aoa.slice(1).reduce((m, line) => {
    const vals = Array.isArray(line) ? line : []
    let last = -1
    for (let i = 0; i < vals.length; i++) {
      if (String(vals[i] ?? '').trim()) last = i
    }
    return Math.max(m, last + 1)
  }, 0)
  if (maxValueCols < 2 && rows.length > 0 && !sparse) return rows

  // Có mẫu đang chọn: luôn thử map theo vị trí rồi merge — tránh «đủ 4 cột đầu → bỏ 4 cột cuối».
  const useTemplateOrder =
    aliasHits === 0 || nonEmptyHeaders.length < Math.min(4, fallbackOrderedHeaders.length) || sparse

  const hybridRows = aoa
    .slice(1)
    .map((line) => {
      const vals = Array.isArray(line) ? line : []
      if (useTemplateOrder) {
        return mapRowByHeaderOrder(vals, [...fallbackOrderedHeaders])
      }
      return mapRowHybridColumns(vals, headers, fallbackOrderedHeaders)
    })
    .filter((row) => Boolean((row.fullName ?? '').trim() || (row.phone ?? '').trim()))

  if (!hybridRows.length) return rows

  if (!rows.length) return hybridRows

  // Luôn merge: giữ field đã khớp alias, điền chỗ trống từ vị trí/mẫu.
  if (hybridRows.length === rows.length) {
    return rows.map((r, i) => mergeExcelRowPreferFilled(r, hybridRows[i] ?? {}))
  }

  const hybridAvg =
    hybridRows.reduce((s, r) => s + countFilledExcelFields(r), 0) / hybridRows.length
  return hybridAvg > avgFilled ? hybridRows : rows.map((r, i) => mergeExcelRowPreferFilled(r, hybridRows[i] ?? {}))
}

export type ParseWorkbookDiag = {
  sheetNames: string[]
  triedHeaderRows: number[]
  pickedSheet?: string
  pickedHeaderRow?: number
  sampleHeaders?: string[]
  mappedRowCount: number
}

function parseWorkbookOnce(
  wb: XLSX.WorkBook,
  opts?: {
    headerRowIndex?: number
    fallbackOrderedHeaders?: readonly string[]
  },
): {
  rows: Partial<ExcelLeadRow>[]
  diag: ParseWorkbookDiag
} {
  const names = wb.SheetNames
  if (!names.length) {
    return {
      rows: [],
      diag: { sheetNames: [], triedHeaderRows: [], mappedRowCount: 0 },
    }
  }

  const preferredHeader = Math.max(0, Math.floor(opts?.headerRowIndex ?? 0))
  const headerCandidates = [...new Set([preferredHeader, 0, 1, 2])].sort((a, b) => a - b)
  const fallbackHeaders = opts?.fallbackOrderedHeaders

  let best: {
    rows: Partial<ExcelLeadRow>[]
    preferred: boolean
    sheetName: string
    headerRow: number
    sampleHeaders: string[]
  } | null = null

  for (const headerRowIndex of headerCandidates) {
    for (const name of names) {
      const sheet = wb.Sheets[name]
      if (!sheet) continue
      const tab = normalizeSheetTabName(name)
      if (isInstructionSheet(tab)) continue
      const rows = sheetMappedRows(sheet, headerRowIndex, fallbackHeaders)
      const preferred = tab === 'leads' || tab === 'ho so' || tab === 'du lieu' || tab === 'data'
      const sampleHeaders = sheetHeaderCells(sheet, headerRowIndex).filter(Boolean).slice(0, 12)
      if (
        !best ||
        rows.length > best.rows.length ||
        (rows.length === best.rows.length && rows.length > 0 && preferred && !best.preferred)
      ) {
        best = { rows, preferred, sheetName: name, headerRow: headerRowIndex, sampleHeaders }
      }
    }
    if (best && best.rows.length > 0 && headerRowIndex === preferredHeader) break
  }

  if (!best || best.rows.length === 0) {
    const firstDataSheet =
      names.find((n) => !isInstructionSheet(normalizeSheetTabName(n))) ?? names[0]!
    const sheet = wb.Sheets[firstDataSheet]
    const sampleHeaders = sheet
      ? sheetHeaderCells(sheet, preferredHeader).filter(Boolean).slice(0, 12)
      : []
    return {
      rows: [],
      diag: {
        sheetNames: names,
        triedHeaderRows: headerCandidates.map((i) => i + 1),
        pickedSheet: firstDataSheet,
        pickedHeaderRow: preferredHeader + 1,
        sampleHeaders,
        mappedRowCount: 0,
      },
    }
  }

  return {
    rows: best.rows,
    diag: {
      sheetNames: names,
      triedHeaderRows: headerCandidates.map((i) => i + 1),
      pickedSheet: best.sheetName,
      pickedHeaderRow: best.headerRow + 1,
      sampleHeaders: best.sampleHeaders,
      mappedRowCount: best.rows.length,
    },
  }
}

export function parseWorkbookToRows(
  file: ArrayBuffer,
  opts?: {
    headerRowIndex?: number
    /** Tiêu đề cột theo mẫu (vd. Mẫu 2) — dùng khi tên cột trên file lệch alias. */
    fallbackOrderedHeaders?: readonly string[]
    /** Nhận chẩn đoán để hiện lỗi rõ hơn trên UI. */
    onDiag?: (d: ParseWorkbookDiag) => void
  },
): Partial<ExcelLeadRow>[] {
  const bytes = file instanceof Uint8Array ? file : new Uint8Array(file)
  const readOpts = {
    type: 'array' as const,
    cellStyles: false,
    cellDates: false,
    cellHTML: false,
    cellNF: false,
    cellText: false,
  }
  // dense:true nhanh hơn nhưng một số file Excel (Google Sheets / export lạ) map ra 0 dòng.
  const denseWb = XLSX.read(bytes, { ...readOpts, dense: true })
  let parsed = parseWorkbookOnce(denseWb, opts)
  if (parsed.rows.length === 0) {
    const sparseWb = XLSX.read(bytes, { ...readOpts, dense: false })
    parsed = parseWorkbookOnce(sparseWb, opts)
  }
  opts?.onDiag?.(parsed.diag)
  return parsed.rows
}

export type LeadIntakeOwnershipMeta = {
  uploadedBy: string
  uploaderName: string
  uploadBatchId: string
  /** Chương trình / đợt nhập — bắt buộc khi commit từ màn Nhập liệu. */
  intakeProgram?: string
  /** Mặc định `campaign_upload` khi có ownership (Excel). */
  intakeOrigin?: LeadIntakeOrigin
}

export type LeadIntakeIdentityMeta = {
  uniqueHash: string
  /** Hash CCCD riêng — tùy chọn (Apps Script chống trùng CCCD). */
  nationalIdHash?: string
  counselorStatus?: LeadCounselorStatus
}

export function normalizeStaffMatchKey(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/đ/g, 'd')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/\s+/g, ' ')
}

export function resolveAssignedCounselorUid(
  raw: string | undefined,
  counselors: { id: string; email: string; displayName: string }[],
): string | null {
  const t = (raw ?? '').trim()
  if (!t) return null
  const lower = t.toLowerCase()
  const byId = counselors.find((c) => c.id === t)
  if (byId) return byId.id
  const byEmail = counselors.find((c) => c.email.toLowerCase().trim() === lower)
  if (byEmail) return byEmail.id

  const exactName = counselors.filter((c) => (c.displayName || '').trim().toLowerCase() === lower)
  if (exactName.length === 1) return exactName[0].id
  if (exactName.length > 1) {
    return [...exactName].sort((a, b) => a.email.localeCompare(b.email))[0].id
  }

  const nk = normalizeStaffMatchKey(t)
  if (!nk) return null
  const normMatches = counselors.filter((c) => normalizeStaffMatchKey(c.displayName || '') === nk)
  if (normMatches.length === 0) return null
  if (normMatches.length === 1) return normMatches[0].id
  return [...normMatches].sort((a, b) => a.email.localeCompare(b.email))[0].id
}

export function buildLeadFirestorePayload(
  row: Partial<ExcelLeadRow>,
  calculatedScore: number,
  priorityTag: PriorityTag,
  assignedCounselorId: string | null,
  ownership?: LeadIntakeOwnershipMeta,
  identity?: LeadIntakeIdentityMeta,
): Omit<Lead, 'id' | 'createdAt' | 'updatedAt' | 'uploadedAt'> {
  const assignee = assignedCounselorId
  const status = identity?.counselorStatus ?? coerceLeadCounselorStatus(row.statusRaw ?? '')
  const pipelineStatus = counselorStatusToPipeline(status)
  return {
    customerId: row.customerId ?? '',
    fullName: row.fullName ?? '',
    phone: row.phone ?? '',
    parentPhone: row.parentPhone ?? '',
    source: row.source ?? '',
    educationLevel: row.educationLevel?.trim() ?? '',
    ...assigneeFirestoreMirror(assignee),
    status,
    pipelineStatus,
    description: row.description?.trim() ?? '',
    highSchool: row.highSchool ?? '',
    gradeClass: row.gradeClass ?? '',
    province: row.province ?? '',
    address: row.address ?? '',
    // Form hồ sơ ưu tiên permanentAddress — đồng bộ khi nhập Excel có «địa chỉ».
    ...(row.address?.trim() ? { permanentAddress: row.address.trim() } : {}),
    calculatedScore,
    priorityTag,
    uniqueHash: identity?.uniqueHash ?? '',
    ...(identity?.nationalIdHash ? { nationalIdHash: identity.nationalIdHash } : {}),
    ...(row.dateOfBirth?.trim() ? { dateOfBirth: row.dateOfBirth.trim() } : {}),
    ...(row.nationalId?.trim() ? { nationalId: row.nationalId.trim() } : {}),
    ...(row.studentEmail?.trim() ? { studentEmail: row.studentEmail.trim() } : {}),
    ...(row.gender?.trim() ? { gender: row.gender.trim() } : {}),
    ...(row.graduationScore?.trim()
      ? { graduationScore: row.graduationScore.trim() }
      : {}),
    ...(row.aspirations?.trim() ? { aspirations: row.aspirations.trim() } : {}),
    ...(row.hobbies?.trim() ? { hobbies: row.hobbies.trim() } : {}),
    ...(row.fieldTripNotes?.trim() ? { fieldTripNotes: row.fieldTripNotes.trim() } : {}),
    ...(row.profileNote1?.trim() ? { profileNote1: row.profileNote1.trim() } : {}),
    ...(row.profileNote2?.trim() ? { profileNote2: row.profileNote2.trim() } : {}),
    ...(row.otherAttentionNotes?.trim() ? { otherAttentionNotes: row.otherAttentionNotes.trim() } : {}),
    ...(row.majorInterest?.trim() ? { majorInterest: row.majorInterest.trim() } : {}),
    ...(row.academicPerformance?.trim() ? { academicPerformance: row.academicPerformance.trim() } : {}),
    ...(row.schoolType?.trim() ? { schoolType: row.schoolType.trim() } : {}),
    ...(row.studyIntention?.trim() ? { studyIntention: row.studyIntention.trim() } : {}),
    ...(row.financialStatus?.trim() ? { financialStatus: row.financialStatus.trim() } : {}),
    ...(row.hanoiArea?.trim() ? { hanoiArea: row.hanoiArea.trim() } : {}),
    ...(ownership
      ? {
          uploadedBy: ownership.uploadedBy,
          uploaderName: ownership.uploaderName,
          uploadBatchId: ownership.uploadBatchId,
          intakeOrigin: ownership.intakeOrigin ?? ('campaign_upload' as const),
          ...(ownership.intakeProgram?.trim()
            ? { intakeProgram: ownership.intakeProgram.trim().slice(0, 120) }
            : {}),
        }
      : {}),
  }
}

/**
 * Quy chuẩn 20 cột Excel / hồ sơ ứng viên (thứ tự cố định trên mẫu tải về).
 * Parser đọc theo **tên cột** (chuẩn hoá bỏ dấu); thứ tự cột trên file có thể khác.
 */
export const STANDARD_LEAD_INTAKE_COLUMNS: ReadonlyArray<{ key: keyof ExcelLeadRow; header: string }> = [
  { key: 'customerId', header: 'Mã khách hàng' },
  { key: 'fullName', header: 'Tên Sinh viên' },
  { key: 'dateOfBirth', header: 'Ngày sinh' },
  { key: 'phone', header: 'Điện thoại' },
  { key: 'parentPhone', header: 'ĐT Người liên hệ' },
  { key: 'source', header: 'Nguồn' },
  { key: 'majorInterest', header: 'Ngành Quan tâm' },
  { key: 'academicPerformance', header: 'Học lực/ xếp loại' },
  { key: 'highSchool', header: 'Trường học' },
  { key: 'aspirations', header: 'Mong muốn' },
  { key: 'financialStatus', header: 'Nhóm tài chính' },
  { key: 'hanoiArea', header: 'Quận/ huyện' },
  { key: 'hobbies', header: 'Sở thích' },
  { key: 'profileNote1', header: 'Ghi chú 1' },
  { key: 'profileNote2', header: 'Ghi chú 2' },
  { key: 'gradeClass', header: 'Lớp hiện đang học' },
  { key: 'province', header: 'Tỉnh /Thành phố' },
  { key: 'address', header: 'Địa chỉ' },
  { key: 'assignedToRaw', header: 'Tư vấn viên' },
  { key: 'otherAttentionNotes', header: 'Nội dung lưu ý khác' },
]

export const STANDARD_LEAD_INTAKE_HEADERS = STANDARD_LEAD_INTAKE_COLUMNS.map((c) => c.header)

/** `targetField` trên profile chấm điểm tương ứng cột Excel (đa số trùng tên trường Firestore). */
export function scoringTargetFieldForIntakeColumn(key: keyof ExcelLeadRow): string {
  if (key === 'assignedToRaw') return 'assignedTo'
  if (key === 'statusRaw') return 'status'
  return key as string
}

export function downloadStandardIntakeTemplate(): void {
  const headers = [...STANDARD_LEAD_INTAKE_HEADERS]
  const ws = XLSX.utils.aoa_to_sheet([headers])
  ws['!cols'] = headers.map(() => ({ wch: 24 }))
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Hồ sơ')

  const instructions: string[][] = [
    ['VietMy Admissions OS — mẫu nhập hồ sơ (20 cột quy chuẩn)'],
    [''],
    [
      '1. Giữ nguyên hàng tiêu đề (dòng 1). Có thể thêm cột phụ (vd. «Tình trạng», «Hệ đào tạo») — parser map theo tên; cột không có → để trống trên hệ thống.',
    ],
    [
      '2. «Tư vấn viên»: ghi email đăng nhập hoặc UID Firebase (khớp TVV/Admin). Không khớp → gán Admin chờ điều phối.',
    ],
    [
      '3. Chấm điểm profile: trong Cài đặt → Mẫu quy tắc, chọn targetField trùng tên kỹ thuật (vd. profileNote1, dateOfBirth, hanoiArea…). Điều kiện EQUALS/CONTAINS/IN_LIST/… — thiếu dữ liệu thì dòng thường không khớp, không cộng điểm.',
    ],
    [
      '4. «Mong muốn» lưu aspirations; «Ghi chú 1/2» và «Nội dung lưu ý khác» là ba trường văn bản riêng (profileNote1, profileNote2, otherAttentionNotes) — tách bạch cho AI và quy tắc.',
    ],
    [
      '5. File cũ có «Ghi chú thêm» / description vẫn import được. Trùng fingerprint trong file hoặc đã có trên hệ thống → bỏ qua dòng.',
    ],
    [''],
    ['© VietMy'],
  ]
  const ws2 = XLSX.utils.aoa_to_sheet(instructions)
  ws2['!cols'] = [{ wch: 88 }]
  XLSX.utils.book_append_sheet(wb, ws2, 'Hướng dẫn')

  XLSX.writeFile(wb, 'VietMy_Mau_1_nhap_ho_so.xlsx')
}
