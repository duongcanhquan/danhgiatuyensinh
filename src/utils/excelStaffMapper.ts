import * as XLSX from 'xlsx'
import type { UserRole } from '../types'
import { normalizeUserRole } from '../auth/roleUtils'
import { normalizeStaffMatchKey } from './excelLeadMapper'

export type ExcelStaffRow = {
  /** Bắt buộc — tên hiện trên hệ thống & map TVV Sheet cũ */
  displayName: string
  email: string
  password: string
  role: UserRole
  /** Số nội bộ OMICall (tuỳ chọn) */
  omicallSipUser?: string
  rawRole?: string
}

const HEADER_ALIASES: Record<string, keyof ExcelStaffRow | 'skip'> = {
  'ten hien thi': 'displayName',
  'ten hiển thị': 'displayName',
  'ho ten': 'displayName',
  'ho va ten': 'displayName',
  'ten tvv': 'displayName',
  'ten nhan vien': 'displayName',
  name: 'displayName',
  displayname: 'displayName',
  'display name': 'displayName',
  email: 'email',
  'e-mail': 'email',
  'thu dien tu': 'email',
  'mat khau': 'password',
  password: 'password',
  pass: 'password',
  'vai tro': 'role',
  role: 'role',
  'chuc vu': 'role',
  'so noi bo': 'omicallSipUser',
  'sip user': 'omicallSipUser',
  omicall: 'omicallSipUser',
}

function normHeader(h: unknown): string {
  return String(h ?? '')
    .replace(/^\uFEFF/, '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/đ/g, 'd')
    .replace(/\s+/g, ' ')
}

function mapRole(raw: string): UserRole {
  const s = normalizeStaffMatchKey(raw)
  if (!s) return 'counselor'
  if (s.includes('super') || s.includes('sieu')) return 'super_admin'
  if (s === 'admin' || s.includes('quan tri') || s.includes('quan ly truong')) return 'admin'
  if (s.includes('team') || s.includes('truong nhom') || s.includes('teamlead')) return 'team_lead'
  if (s.includes('marketing') || s === 'mkt') return 'marketing'
  if (s.includes('ke toan') || s.includes('accountant')) return 'accountant'
  if (s === 'ctv' || s.includes('cong tac')) return 'ctv'
  if (s.includes('tvv') || s.includes('tu van') || s.includes('counselor')) return 'counselor'
  return normalizeUserRole(raw)
}

export const STAFF_INTAKE_HEADERS = [
  'Tên hiển thị',
  'Email',
  'Mật khẩu',
  'Vai trò',
  'Số nội bộ OMICall',
] as const

export function downloadStaffIntakeTemplate(): void {
  const ws = XLSX.utils.aoa_to_sheet([
    [...STAFF_INTAKE_HEADERS],
    ['Nguyễn Văn A', 'a.nguyen@caodangvietmy.edu.vn', 'DoiMatKhau@123', 'counselor', ''],
  ])
  ws['!cols'] = STAFF_INTAKE_HEADERS.map(() => ({ wch: 28 }))
  const guide = XLSX.utils.aoa_to_sheet([
    ['VietMy — Mẫu nhập tư vấn viên / nhân sự'],
    [''],
    ['1. «Tên hiển thị» bắt buộc — đúng tên sẽ map cột TVV trên Sheet sinh viên cũ.'],
    ['2. Email = tài khoản đăng nhập (duy nhất).'],
    ['3. Mật khẩu tạm; nhân sự đổi sau khi đăng nhập.'],
    ['4. Vai trò: counselor (TVV), ctv, team_lead, admin, marketing, accountant.'],
    ['5. Import TVV trước → rồi mới import Sheet hồ sơ 71 cột (Mẫu 3).'],
  ])
  guide['!cols'] = [{ wch: 90 }]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Nhân sự')
  XLSX.utils.book_append_sheet(wb, guide, 'Hướng dẫn')
  XLSX.writeFile(wb, 'VietMy_Mau_nhap_tu_van_vien.xlsx')
}

export function parseStaffWorkbook(bytes: ArrayBuffer): {
  rows: ExcelStaffRow[]
  errors: string[]
} {
  const wb = XLSX.read(bytes, { type: 'array', cellDates: false })
  const sheet = wb.Sheets[wb.SheetNames[0]]
  if (!sheet) return { rows: [], errors: ['File không có sheet.'] }
  const aoa = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '', raw: false }) as unknown[][]
  if (!aoa.length) return { rows: [], errors: ['File trống.'] }

  const header = (aoa[0] ?? []).map(normHeader)
  const keyAt: (keyof ExcelStaffRow | null)[] = header.map((h) => {
    const k = HEADER_ALIASES[h]
    return k && k !== 'skip' ? k : null
  })
  const hasDisplay = keyAt.includes('displayName')
  const hasEmail = keyAt.includes('email')
  if (!hasDisplay || !hasEmail) {
    return {
      rows: [],
      errors: ['Thiếu cột «Tên hiển thị» và/hoặc «Email» trên hàng 1.'],
    }
  }

  const rows: ExcelStaffRow[] = []
  const errors: string[] = []
  for (let i = 1; i < aoa.length; i++) {
    const line = aoa[i] ?? []
    const draft: Partial<ExcelStaffRow> = {}
    keyAt.forEach((key, col) => {
      if (!key) return
      const val = String(line[col] ?? '').trim()
      if (key === 'role') {
        draft.rawRole = val
        draft.role = mapRole(val)
      } else if (key === 'displayName') draft.displayName = val
      else if (key === 'email') draft.email = val.toLowerCase()
      else if (key === 'password') draft.password = val
      else if (key === 'omicallSipUser') draft.omicallSipUser = val
    })
    if (!draft.displayName && !draft.email) continue
    if (!draft.displayName?.trim()) {
      errors.push(`Dòng ${i + 1}: thiếu Tên hiển thị.`)
      continue
    }
    if (!draft.email?.includes('@')) {
      errors.push(`Dòng ${i + 1}: email không hợp lệ.`)
      continue
    }
    rows.push({
      displayName: draft.displayName.trim(),
      email: draft.email.trim().toLowerCase(),
      password: (draft.password || 'DoiMatKhau@123').trim(),
      role: draft.role ?? 'counselor',
      ...(draft.omicallSipUser ? { omicallSipUser: draft.omicallSipUser } : {}),
      rawRole: draft.rawRole,
    })
  }
  return { rows, errors }
}
