import * as XLSX from 'xlsx'
import type { Lead, LeadCounselorStatus, PriorityTag } from '../types'
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
}

/** Map tiêu đề cột Excel (sau chuẩn hoá) → khóa parser. Giữ alias cũ để file mẫu cũ vẫn đọc được. */
const HEADER_ALIASES: Record<string, keyof ExcelLeadRow> = {
  'ma kh': 'customerId',
  'ma khach hang': 'customerId',
  'ten khach hang': 'fullName',
  'ten sinh vien': 'fullName',
  'ngay sinh': 'dateOfBirth',
  'dien thoai': 'phone',
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
  'truong hoc': 'highSchool',
  lop: 'gradeClass',
  'lop hien dang hoc': 'gradeClass',
  'tinh thanh pho': 'province',
  'tinh /thanh pho': 'province',
  'tinh / thanh pho': 'province',
  'tinh/thanh pho': 'province',
  'dia chi': 'address',
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
  const wb = XLSX.read(file, {
    type: 'array',
    cellStyles: false,
    cellDates: false,
    dense: true,
    cellHTML: false,
    cellNF: false,
    cellText: false,
  })
  const names = wb.SheetNames
  const preferred =
    names.find((n) => normalizeSheetTabName(n) === 'leads') ??
    names.find((n) => normalizeSheetTabName(n) === 'ho so') ??
    names[0]
  const sheetName = preferred
  if (!sheetName) return []
  const sheet = wb.Sheets[sheetName]
  const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: '',
    raw: true,
  })
  return json.map((row) => mapSheetRow(row))
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
    calculatedScore,
    priorityTag,
    uniqueHash: identity?.uniqueHash ?? '',
    ...(row.dateOfBirth?.trim() ? { dateOfBirth: row.dateOfBirth.trim() } : {}),
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

  XLSX.writeFile(wb, 'VietMy_Mau_nhap_ho_so.xlsx')
}
