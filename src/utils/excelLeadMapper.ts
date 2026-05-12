import * as XLSX from 'xlsx'
import type { Lead, LeadCounselorStatus, PriorityTag } from '../types'
import { coerceLeadCounselorStatus, counselorStatusToPipeline } from './leadIdentity'

/** Map tiêu đề cột Excel (sau chuẩn hoá) → khóa parser. Giữ alias cũ để file mẫu cũ vẫn đọc được. */
const HEADER_ALIASES: Record<string, keyof ExcelLeadRow> = {
  'ma kh': 'customerId',
  'ma khach hang': 'customerId',
  'ten khach hang': 'fullName',
  'ten sinh vien': 'fullName',
  'dien thoai': 'phone',
  'dien thoai nguoi lien he chinh': 'parentPhone',
  'dt nguoi lien he': 'parentPhone',
  'dien thoai nguoi lien he': 'parentPhone',
  'nguon khach hang': 'source',
  nguon: 'source',
  'he dao tao': 'educationLevel',
  'nguoi phu trach': 'assignedToRaw',
  'tinh trang': 'statusRaw',
  'mo ta': 'description',
  'ghi chu them': 'description',
  'ghi chu': 'description',
  'truong hoc': 'highSchool',
  lop: 'gradeClass',
  'tinh thanh pho': 'province',
  'tinh /thanh pho': 'province',
  'tinh / thanh pho': 'province',
  'tinh/thanh pho': 'province',
  'dia chi': 'address',
}

export type ExcelLeadRow = {
  customerId: string
  fullName: string
  phone: string
  parentPhone: string
  source: string
  educationLevel: string
  /** Tên hiển thị (đăng nhập) hoặc email đăng nhập / UID — khớp `users` khi import. */
  assignedToRaw: string
  statusRaw: string
  description: string
  highSchool: string
  gradeClass: string
  province: string
  address: string
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

export type LeadIntakeOwnershipMeta = {
  uploadedBy: string
  uploaderName: string
  uploadBatchId: string
}

export type LeadIntakeIdentityMeta = {
  uniqueHash: string
  counselorStatus?: LeadCounselorStatus
}

/** Chuẩn hóa để so khớp tên (bỏ dấu, gộp khoảng trắng) — dùng cho cột «Người phụ trách» vs `displayName`. */
export function normalizeStaffMatchKey(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/đ/g, 'd')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/\s+/g, ' ')
}

/**
 * Gán UID từ cột «Người phụ trách» (ưu tiên: UID → email đăng nhập → tên hiển thị đăng nhập khớp tuyệt đối → tên sau chuẩn hóa).
 * Nếu nhiều TVV trùng tên sau chuẩn hóa, chọn bản ghi có email nhỏ nhất (ổn định) — nên phân biệt bằng email trong Excel.
 */
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

/** Payload Firestore khi tạo/cập nhật từ intake (không gồm id, createdAt, updatedAt). */
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
    educationLevel: row.educationLevel ?? '',
    assignedTo: assignee,
    assignedCounselorId: assignee,
    status,
    pipelineStatus,
    description: row.description ?? '',
    highSchool: row.highSchool ?? '',
    gradeClass: row.gradeClass ?? '',
    province: row.province ?? '',
    address: row.address ?? '',
    calculatedScore,
    priorityTag,
    uniqueHash: identity?.uniqueHash ?? '',
    ...(ownership
      ? {
          uploadedBy: ownership.uploadedBy,
          uploaderName: ownership.uploaderName,
          uploadBatchId: ownership.uploadBatchId,
        }
      : {}),
  }
}

export function downloadStandardIntakeTemplate(): void {
  /** Hàng 1 mẫu VietMy: 13 cột A–M theo thứ tự cố định. Parser vẫn đọc theo tên cột, không phụ thuộc vị trí. */
  const headers = [
    'Tên sinh viên',
    'Điện thoại',
    'Nguồn',
    'Hệ đào tạo',
    'Người phụ trách',
    'Tình trạng',
    'Ghi Chú thêm',
    'Trường học',
    'Lớp',
    'Tỉnh /Thành Phố',
    'Địa chỉ',
    'ĐT Người liên hệ',
    'Mã KH',
  ]
  const ws = XLSX.utils.aoa_to_sheet([headers])
  ws['!cols'] = headers.map(() => ({ wch: 22 }))
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Hồ sơ')

  const instructions: string[][] = [
    ['VietMy Admissions OS — mẫu nhập hồ sơ'],
    [''],
    [
      '1. Giữ nguyên hàng tiêu đề (dòng 1): 13 cột A–M — Tên sinh viên, Điện thoại, Nguồn, Hệ đào tạo, Người phụ trách, Tình trạng, Ghi Chú thêm, Trường học, Lớp, Tỉnh /Thành Phố, Địa chỉ, ĐT Người liên hệ, Mã KH. Có thể dùng sheet tên «Leads».',
    ],
    [
      '2. «Người phụ trách»: ghi tên hiển thị (như trên hệ thống đăng nhập) hoặc email đăng nhập — khớp danh bạ TVV; có thể thêm UID nếu cần.',
    ],
    ['   Khuyến nghị: ưu tiên tên hiển thị hoặc email; nếu hai TVV trùng tên thì bắt buộc dùng email.'],
    ['3. «Tình trạng»: Mới, Quan tâm / đang tư vấn, Đã cọc, Nhập học, … (hệ thống chuẩn hoá về Kanban).'],
    ['4. Điểm chấm & nhãn HOT/WARM/COLD/LOSS do engine tính sau upload.'],
    [
      '5. Khi tải lên: chỉ các dòng mới được ghi. Trùng trong file hoặc đã tồn tại trên hệ thống (cùng fingerprint) bị từ chối — không ghi đè bản cũ.',
    ],
    [''],
    ['© VietMy'],
  ]
  const ws2 = XLSX.utils.aoa_to_sheet(instructions)
  ws2['!cols'] = [{ wch: 80 }]
  XLSX.utils.book_append_sheet(wb, ws2, 'Hướng dẫn')

  XLSX.writeFile(wb, 'VietMy_Mau_nhap_ho_so.xlsx')
}
