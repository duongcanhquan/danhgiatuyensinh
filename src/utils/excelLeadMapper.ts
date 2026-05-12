import * as XLSX from 'xlsx'
import type { FinancialStatus, Lead, LeadCounselorStatus, PriorityTag, SchoolType } from '../types'

const HEADER_ALIASES: Record<string, keyof ExcelLeadRow> = {
  'ho ten': 'fullName',
  'ho va ten': 'fullName',
  'họ và tên': 'fullName',
  fullname: 'fullName',
  name: 'fullName',
  'tên': 'fullName',
  'sđt': 'phone',
  'so dien thoai': 'phone',
  phone: 'phone',
  'điện thoại': 'phone',
  email: 'email',
  mail: 'email',
  'sdt phu huynh': 'parentPhone',
  'sđt phụ huynh': 'parentPhone',
  parentphone: 'parentPhone',
  'nganh': 'majorInterest',
  'ngành': 'majorInterest',
  major: 'majorInterest',
  majorinterest: 'majorInterest',
  'tỉnh': 'region',
  'tinh': 'region',
  'tỉnh/tp': 'region',
  'tinh thanh pho': 'region',
  'tinh/tp': 'region',
  province: 'region',
  'quan huyen ha noi': 'hanoiArea',
  'quan/huyen (hn)': 'hanoiArea',
  'khu vuc ha noi': 'hanoiArea',
  'khu vực hà nội': 'hanoiArea',
  hanoiarea: 'hanoiArea',
  'quan/huyen (ha noi)': 'hanoiArea',
  'du dinh': 'studyIntention',
  'dự định': 'studyIntention',
  studyintention: 'studyIntention',
  'hinh thuc dao tao': 'studyIntention',
  'truong': 'highSchoolName',
  'trường': 'highSchoolName',
  school: 'highSchoolName',
  schoolname: 'highSchoolName',
  highschool: 'highSchoolName',
  'hoc luc': 'academicLevel',
  'học lực': 'academicLevel',
  academicperformance: 'academicLevel',
  academiclevel: 'academicLevel',
  'loai truong': 'schoolTypeRaw',
  schooltype: 'schoolTypeRaw',
  'tai chinh': 'financialStatusRaw',
  financial: 'financialStatusRaw',
  'gioi tinh': 'gender',
  gender: 'gender',
  'nguyện vọng': 'aspirations',
  'nguyen vong': 'aspirations',
  aspirations: 'aspirations',
  'sở thích': 'hobbies',
  'so thich': 'hobbies',
  hobbies: 'hobbies',
  'ghi chú đi trường': 'fieldTripNotes',
  'ghi chu di truong': 'fieldTripNotes',
  fieldtripnotes: 'fieldTripNotes',
  'nguồn lead': 'leadSource',
  'nguon lead': 'leadSource',
  'nguồn tiếp nhận': 'leadSource',
  'nguon tiep nhan': 'leadSource',
  leadsource: 'leadSource',
  'ngay sinh': 'dateOfBirth',
  'ngày sinh': 'dateOfBirth',
  dob: 'dateOfBirth',
  dateofbirth: 'dateOfBirth',
  birthday: 'dateOfBirth',
  tuoi: 'age',
  'tuổi': 'age',
  age: 'age',
}

export type ExcelLeadRow = {
  fullName: string
  phone: string
  email: string
  parentPhone: string
  majorInterest: string
  region: string
  /** Quận / huyện khi tỉnh là Hà Nội */
  hanoiArea: string
  highSchoolName: string
  academicLevel: string
  /** Dự định: Cao đẳng, Trung cấp, Du học… */
  studyIntention: string
  schoolTypeRaw: string
  financialStatusRaw: string
  gender?: string
  aspirations?: string
  hobbies?: string
  fieldTripNotes?: string
  leadSource?: string
  /** DD/MM/YYYY or ISO — dùng fingerprint khi không có SĐT */
  dateOfBirth?: string
  age?: string
}

function normalizeHeader(h: string): string {
  return h
    .trim()
    .toLowerCase()
    .replace(/đ/g, 'd')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/\s+/g, ' ')
}

/** Chuẩn hoá tên sheet (hỗ trợ «Leads» / «Hồ sơ» / «Hồ_sơ»). */
function normalizeSheetTabName(name: string): string {
  return normalizeHeader(name).replace(/_/g, ' ').replace(/\s+/g, ' ').trim()
}

function resolveFieldKey(header: string): keyof ExcelLeadRow | null {
  const key = normalizeHeader(header)
  return HEADER_ALIASES[key] ?? null
}

export function mapSheetRow(raw: Record<string, unknown>): Partial<ExcelLeadRow> {
  const out: Partial<ExcelLeadRow> = {}
  for (const [header, val] of Object.entries(raw)) {
    const field = resolveFieldKey(header)
    if (!field) continue
    out[field] = val === undefined || val === null ? '' : String(val).trim()
  }
  return out
}

export function parseWorkbookToRows(file: ArrayBuffer): Partial<ExcelLeadRow>[] {
  const wb = XLSX.read(file, { type: 'array' })
  const names = wb.SheetNames
  const preferred =
    names.find((n) => normalizeSheetTabName(n) === 'leads') ??
    names.find((n) => normalizeSheetTabName(n) === 'ho so') ??
    names[0]
  const sheetName = preferred
  if (!sheetName) return []
  const sheet = wb.Sheets[sheetName]
  const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' })
  return json.map((row) => mapSheetRow(row))
}

function parseSchoolType(raw: string | undefined): SchoolType {
  const n = normalizeHeader(raw ?? '')
  if (n.includes('private') || n.includes('tu')) return 'PRIVATE'
  if (n.includes('international') || n.includes('quoc te')) return 'INTERNATIONAL'
  if (n.includes('public') || n.includes('cong')) return 'PUBLIC'
  return 'UNKNOWN'
}

function parseFinancial(raw: string | undefined): FinancialStatus {
  const n = normalizeHeader(raw ?? '')
  if (n.includes('install') || n.includes('tra gop')) return 'INSTALLMENT'
  if (n.includes('scholar') || n.includes('hoc bong')) return 'SCHOLARSHIP_SEEKING'
  if (n.includes('aid') || n.includes('ho tro')) return 'FINANCIAL_AID'
  if (n.includes('full')) return 'FULL_PAY'
  return 'UNKNOWN'
}

export type LeadIntakeOwnershipMeta = {
  uploadedBy: string
  uploaderName: string
  uploadBatchId: string
}

export type LeadIntakeIdentityMeta = {
  uniqueHash: string
  counselorStatus?: LeadCounselorStatus
}

/** Dữ liệu ghi Firestore (không gồm id, createdAt, updatedAt — thêm ở bước intake). */
export function buildLeadFirestorePayload(
  row: Partial<ExcelLeadRow>,
  calculatedScore: number,
  priorityTag: PriorityTag,
  assignedCounselorId: string | null,
  ownership?: LeadIntakeOwnershipMeta,
  identity?: LeadIntakeIdentityMeta,
): Omit<Lead, 'id' | 'createdAt' | 'updatedAt'> {
  const assignee = assignedCounselorId
  return {
    fullName: row.fullName ?? '',
    phone: row.phone ?? '',
    email: row.email || undefined,
    parentPhone: row.parentPhone || undefined,
    majorInterest: row.majorInterest ?? '',
    academicLevel: row.academicLevel || undefined,
    studyIntention: row.studyIntention?.trim() || undefined,
    region: row.region ?? '',
    hanoiArea: row.hanoiArea?.trim() || undefined,
    highSchoolName: row.highSchoolName || undefined,
    schoolType: parseSchoolType(row.schoolTypeRaw),
    financialStatus: parseFinancial(row.financialStatusRaw),
    calculatedScore,
    priorityTag,
    assignedCounselorId: assignee,
    assignedTo: assignee,
    gender: row.gender?.trim() || undefined,
    aspirations: row.aspirations?.trim() || undefined,
    hobbies: row.hobbies?.trim() || undefined,
    fieldTripNotes: row.fieldTripNotes?.trim() || undefined,
    leadSource: row.leadSource?.trim() || undefined,
    pipelineStatus: 'NEW',
    status: identity?.counselorStatus ?? 'NEW',
    nextFollowUpDate: null,
    uniqueHash: identity?.uniqueHash ?? '',
    source: 'EXCEL',
    ...(ownership
      ? {
          uploadedBy: ownership.uploadedBy,
          uploaderName: ownership.uploaderName,
          uploadBatchId: ownership.uploadBatchId,
        }
      : {}),
  }
}

/** Mẫu Excel chuẩn + sheet hướng dẫn (tải về máy người dùng). */
export function downloadStandardIntakeTemplate(): void {
  const headers = [
    'Họ Tên',
    'SĐT',
    'Email',
    'SĐT Phụ huynh',
    'Ngành quan tâm',
    'Tỉnh/Thành phố',
    'Quận/Huyện (Hà Nội)',
    'Trường THPT',
    'Học lực',
    'Dự định',
    'Loại trường',
    'Tài chính',
    'Giới tính',
    'Ngày sinh',
    'Tuổi',
    'Nguyện vọng',
    'Sở thích',
    'Ghi chú đi trường',
    'Nguồn tiếp nhận',
  ]
  const ws = XLSX.utils.aoa_to_sheet([headers])
  ws['!cols'] = headers.map(() => ({ wch: 18 }))
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Hồ sơ')

  const instructions: string[][] = [
    ['VietMy — Hệ thống tuyển sinh: hướng dẫn nhập liệu'],
    [''],
    ['1. Chỉnh sửa trên sheet «Hồ sơ» (hoặc sheet tên «Leads» trong file cũ), giữ nguyên hàng tiêu đề (dòng 1).'],
    ['2. Cột bắt buộc tối thiểu: Họ Tên, SĐT, Tỉnh/Thành phố, Ngành quan tâm (khuyến nghị).'],
    ['2a. Quận/Huyện (Hà Nội): điền khi Tỉnh/Thành phố là Hà Nội; danh mục chỉnh trong Cấu hình dữ liệu.'],
    ['2b. Dự định: Cao đẳng, Trung cấp, Phổ thông cao đẳng, Du học… — khớp danh mục «Dự định» trong Cấu hình.'],
    ['2b. Ngày sinh / Tuổi: khuyến nghị khi thiếu SĐT — dùng để tạo fingerprint trùng lặp.'],
    ['3. Loại trường: gõ PUBLIC, PRIVATE, INTERNATIONAL hoặc để trống (UNKNOWN).'],
    ['4. Tài chính: FULL_PAY, INSTALLMENT, SCHOLARSHIP_SEEKING, FINANCIAL_AID hoặc để trống.'],
    ['5. Nguyện vọng / Sở thích / Ghi chú đi trường: văn bản tự do; hệ thống dùng cho scoring nâng cao.'],
    ['6. Sau khi tải lên, hệ thống gắn UID & tên người upload và mã batch tự động.'],
    [''],
    ['© VietMy — mẫu chuẩn hoá'],
  ]
  const ws2 = XLSX.utils.aoa_to_sheet(instructions)
  ws2['!cols'] = [{ wch: 72 }]
  XLSX.utils.book_append_sheet(wb, ws2, 'Hướng dẫn')

  XLSX.writeFile(wb, 'VietMy_Mau_nhap_ho_so.xlsx')
}
