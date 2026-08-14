import type { LeadFinanceRecord, LeadPaymentApprovalStatus, LeadPaymentLine, LeadPaymentSlotKey } from '../types'
import type { ExcelLeadRow } from './excelLeadMapper'

/** Data Sheet Apps Script bắt đầu dòng 3 Excel (= index 2). */
export const APPS_SCRIPT_SHEET_DATA_START_ROW = 2

/** Map batch → cột tiền / bill / duyệt / ngày (0-based) — docs APPSCRIPT-LEGACY. */
const PAYMENT_COLS: {
  key: LeadPaymentSlotKey
  amount: number
  bill: number
  approval: number
  date: number
}[] = [
  { key: 'deposit', amount: 30, bill: 34, approval: 50, date: 60 },
  { key: 'supplementL1', amount: 31, bill: 35, approval: 51, date: 61 },
  { key: 'supplementL2', amount: 44, bill: 45, approval: 52, date: 62 },
  { key: 'supplementL3', amount: 46, bill: 47, approval: 53, date: 63 },
  { key: 'supplementL4', amount: 48, bill: 49, approval: 54, date: 64 },
]

export type AppsScriptStudentExtras = {
  systemCode: string
  finance: LeadFinanceRecord
  inviteFolderUrl: string
  source2: string
  scholarship1Label: string
  scholarship2Label: string
  /** dd/MM/yyyy[ HH:mm:ss] từ cột 17 */
  createdAtRaw: string
  placeOfBirth: string
  ethnicity: string
  permanentAddress: string
  currentResidence: string
  fatherName: string
  fatherPhone: string
  motherName: string
  motherPhone: string
  guardian: string
  guardianPhone: string
  campus: string
  schoolYear: string
  /** Cột 43 — điểm Sheet (nếu có) */
  sheetScore: string
}

export type AppsScriptStudentParsed = {
  /** Index dòng trong file (0-based, gồm header). */
  sheetRowIndex: number
  row: Partial<ExcelLeadRow>
  extras: AppsScriptStudentExtras
}

function cell(row: unknown[], i: number): string {
  const v = row[i]
  if (v == null) return ''
  if (typeof v === 'number' && Number.isFinite(v)) {
    // Excel date serial → không đoán; trả chuỗi số (ngày thường đã là text 'dd/MM/yyyy)
    return String(v)
  }
  return String(v).replace(/^\uFEFF/, '').replace(/^'/, '').trim()
}

function parseAmountVnd(raw: string): number {
  const n = parseInt(raw.replace(/\D/g, ''), 10)
  return Number.isFinite(n) && n > 0 ? n : 0
}

function normalizeApproval(raw: string): LeadPaymentApprovalStatus | '' {
  const s = raw.trim().toUpperCase()
  if (s === 'ĐỒNG Ý' || s === 'DONG Y') return 'ĐỒNG Ý'
  if (s === 'TỪ CHỐI' || s === 'TU CHOI' || s.includes('TỪ CHỐI') || s.includes('TU CHOI')) return 'TỪ CHỐI'
  if (!s) return ''
  // Giữ nguyên nếu đã đúng tiếng Việt có dấu
  if (raw.trim() === 'ĐỒNG Ý' || raw.trim() === 'TỪ CHỐI') return raw.trim() as LeadPaymentApprovalStatus
  return ''
}

function buildFinanceFromRow(r: unknown[]): LeadFinanceRecord {
  const payments: LeadFinanceRecord['payments'] = {}
  let declared = 0
  for (const col of PAYMENT_COLS) {
    const amountVnd = parseAmountVnd(cell(r, col.amount))
    const receiptUrl = cell(r, col.bill)
    const approvalStatus = normalizeApproval(cell(r, col.approval))
    const collectedAt = cell(r, col.date)
    declared += amountVnd
    if (!amountVnd && !receiptUrl && !approvalStatus && !collectedAt) continue
    const line: LeadPaymentLine = {
      ...(amountVnd ? { amountVnd } : {}),
      ...(receiptUrl ? { receiptUrl } : {}),
      ...(approvalStatus ? { approvalStatus } : {}),
      ...(collectedAt ? { collectedAt } : {}),
    }
    payments[col.key] = line
  }
  const declaredSheet = parseAmountVnd(cell(r, 37))
  const enrollmentStatus = cell(r, 39) || 'MỚI'
  const situation = cell(r, 42)
  const fullNeRaw = cell(r, 65)
  const fullNeAt = cell(r, 66)
  const n8nStatus = cell(r, 55)
  const reqFullNe = fullNeRaw.toUpperCase().includes('YÊU CẦU')
  const isFullNe = fullNeRaw.toUpperCase().includes('ĐÃ FULL')

  return {
    payments,
    declaredTotalVnd: declaredSheet || declared || undefined,
    enrollmentStatus: situation === 'ĐÃ HOÀN THIỆN' ? 'ĐÃ HOÀN THIỆN' : enrollmentStatus || 'MỚI',
    ...(n8nStatus ? { n8nStatus } : {}),
    ...(reqFullNe ? { reqFullNe: true, fullNeStatus: 'YÊU CẦU FULL NE' } : {}),
    ...(isFullNe
      ? { fullNeStatus: 'ĐÃ FULL NE', fullNeAt: fullNeAt || undefined, reqFullNe: false }
      : fullNeAt
        ? { fullNeAt }
        : {}),
  }
}

/** Một hàng Sheet (mảng ô) → hồ sơ + finance. */
export function mapAppsScriptStudentRow(r: unknown[], sheetRowIndex: number): AppsScriptStudentParsed | null {
  const systemCode = cell(r, 1)
  const fullName = cell(r, 2)
  const phone = cell(r, 5).replace(/\s+/g, '')
  if (!fullName && !phone && !systemCode) return null

  const gender = cell(r, 3)
  const dateOfBirth = cell(r, 4)
  const studentEmail = cell(r, 6)
  const permanentAddress = cell(r, 8)
  const currentResidence = cell(r, 9)
  const educationLevel = cell(r, 10)
  const majorInterest = cell(r, 12)
  const schoolYear = cell(r, 13)
  const placeOfBirth = cell(r, 14)
  const ethnicity = cell(r, 15)
  const nationalId = cell(r, 16)
  const createdAtRaw = cell(r, 17)
  const assignedToRaw = cell(r, 18)
  const campus = cell(r, 19)
  const fatherName = cell(r, 20)
  const fatherPhone = cell(r, 21)
  const motherName = cell(r, 22)
  const motherPhone = cell(r, 23)
  const guardianName = cell(r, 24)
  const guardianPhone = cell(r, 25)
  const highSchool = cell(r, 26)
  const province = cell(r, 27)
  const hanoiArea = cell(r, 28)
  const scholarship1Label = cell(r, 29)
  const note = cell(r, 38)
  const sheetScore = cell(r, 43)
  const source = cell(r, 56)
  const source2 = cell(r, 68)
  const scholarship2Label = cell(r, 69)
  const inviteFolderUrl = cell(r, 36)

  const guardian = [guardianName, guardianPhone].filter(Boolean).join(' — ')
  const descriptionParts = [
    note,
    scholarship1Label ? `HB1: ${scholarship1Label}` : '',
    scholarship2Label ? `HB2: ${scholarship2Label}` : '',
    campus ? `Cơ sở: ${campus}` : '',
    schoolYear ? `Niên khóa: ${schoolYear}` : '',
  ].filter(Boolean)

  const row: Partial<ExcelLeadRow> = {
    customerId: systemCode,
    fullName,
    gender,
    dateOfBirth,
    phone,
    studentEmail,
    parentPhone: motherPhone || fatherPhone || guardianPhone,
    nationalId,
    educationLevel,
    majorInterest,
    highSchool,
    province,
    address: permanentAddress || currentResidence,
    hanoiArea,
    assignedToRaw,
    source: source || 'Import Sheet',
    description: descriptionParts.join('\n'),
    statusRaw: cell(r, 39),
    ...(sheetScore ? { graduationScore: sheetScore } : {}),
  }

  const extras: AppsScriptStudentExtras = {
    systemCode,
    finance: buildFinanceFromRow(r),
    inviteFolderUrl,
    source2,
    scholarship1Label,
    scholarship2Label,
    createdAtRaw,
    placeOfBirth,
    ethnicity,
    permanentAddress,
    currentResidence,
    fatherName,
    fatherPhone,
    motherName,
    motherPhone,
    guardian,
    guardianPhone,
    campus,
    schoolYear,
    sheetScore,
  }

  return { sheetRowIndex, row, extras }
}

/** AOA toàn sheet → danh sách SV (bỏ 2 hàng đầu). */
export function parseAppsScriptSheetAoa(aoa: unknown[][]): AppsScriptStudentParsed[] {
  const out: AppsScriptStudentParsed[] = []
  for (let i = APPS_SCRIPT_SHEET_DATA_START_ROW; i < aoa.length; i++) {
    const r = aoa[i]
    if (!Array.isArray(r)) continue
    const parsed = mapAppsScriptStudentRow(r, i)
    if (parsed) out.push(parsed)
  }
  return out
}

/** Parse ngày tạo Sheet → epoch ms (ICT calendar, không DST). */
export function parseAppsScriptCreatedAtMs(raw: string): number | null {
  const s = String(raw ?? '')
    .trim()
    .replace(/^'/, '')
  if (!s) return null
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/)
  if (!m) return null
  const dd = Number(m[1])
  const mm = Number(m[2])
  const yyyy = Number(m[3])
  const hh = Number(m[4] ?? 0)
  const mi = Number(m[5] ?? 0)
  const ss = Number(m[6] ?? 0)
  const p = (n: number, w = 2) => String(n).padStart(w, '0')
  const ms = Date.parse(
    `${yyyy}-${p(mm)}-${p(dd)}T${p(hh)}:${p(mi)}:${p(ss)}.000+07:00`,
  )
  return Number.isFinite(ms) ? ms : null
}
