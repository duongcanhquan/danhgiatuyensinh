import { sha256 } from '@noble/hashes/sha256'
import type { Lead, LeadCounselorStatus } from '../types'
import { LEAD_COUNSELOR_STATUS_ORDER } from '../types'
import type { ExcelLeadRow } from './excelLeadMapper'

const COUNSELOR_SET = new Set<string>([...LEAD_COUNSELOR_STATUS_ORDER])

/** Map legacy Firestore / Excel counselor statuses to the EdTech Kanban model. */
const LEGACY_COUNSELOR_STATUS: Record<string, LeadCounselorStatus> = {
  ATTEMPTED_CONTACT: 'INTERESTED',
  IN_PROGRESS: 'INTERESTED',
  CAMPUS_TOUR_BOOKED: 'INTERESTED',
}

export function isLeadCounselorStatus(v: string): v is LeadCounselorStatus {
  return COUNSELOR_SET.has(v)
}

export function coerceLeadCounselorStatus(raw: string): LeadCounselorStatus {
  const u = String(raw ?? '').toUpperCase()
  if (COUNSELOR_SET.has(u)) return u as LeadCounselorStatus
  if (LEGACY_COUNSELOR_STATUS[u]) return LEGACY_COUNSELOR_STATUS[u]
  // Sheet / Excel tiếng Việt
  const fold = u
    .replace(/[Đ]/g, 'D')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/\s+/g, ' ')
  if (fold.includes('NHAP HOC') || fold.includes('DA HOAN THIEN') || fold.includes('GHI DANH')) {
    return 'ENROLLED'
  }
  if (fold.includes('COC THANH CONG') || fold.includes('DA COC') || fold.includes('COC DU')) {
    return 'DEPOSIT_PAID'
  }
  if (
    fold.includes('DANG KY XT') ||
    fold.includes('LPXT') ||
    fold.includes('XET TUYEN') ||
    fold.includes('DANG HOAN THIEN') ||
    fold.includes('KIEM TRA')
  ) {
    return 'INTERESTED'
  }
  if (fold.includes('HUY PHUT') || fold.includes('SUMMER') || fold.includes('MELT')) {
    return 'SUMMER_MELT'
  }
  if (fold.includes('KHONG TIEM NANG') || fold.includes('THAT BAI')) return 'DEAD'
  if (!fold || fold === 'MOI') return 'NEW'
  return 'NEW'
}

/** Digits-only key; prefers student phone, then parent. Vietnam +84 → 0…; 9 số thiếu 0 đầu → thêm 0. */
export function normalizePhoneKey(phone: string, parentPhone?: string): string {
  const raw = (phone ?? '').trim() || (parentPhone ?? '').trim()
  let digits = raw.replace(/\D/g, '')
  if (!digits) return ''
  if (digits.startsWith('84') && digits.length >= 10) digits = `0${digits.slice(2)}`
  // Excel hay lưu 912… (mất số 0) — thống nhất với hồ sơ dạng 0912…
  if (digits.length === 9 && /^[35789]/.test(digits)) digits = `0${digits}`
  return digits
}

function normIdentity(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
}

/** SHA-256 hex — đồng bộ, cùng kết quả với `crypto.subtle` (đã dùng trước đây) để `uniqueHash` trên Firestore không đổi. */
function sha256HexSync(input: string): string {
  const digest = sha256(new TextEncoder().encode(input))
  return Array.from(digest)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/** Độ tin cậy fingerprint chống trùng — `weak` không được dùng để từ chối cả lô nhập. */
export type LeadDedupeStrength = 'phone' | 'identity' | 'weak'

export function leadDedupeStrength(row: Partial<ExcelLeadRow>): LeadDedupeStrength {
  const phoneKey = normalizePhoneKey(row.phone ?? '', row.parentPhone)
  if (phoneKey.length >= 9) return 'phone'
  const n = normIdentity(row.fullName ?? '')
  const cid = normIdentity(row.customerId ?? '')
  if (n.length >= 2 || cid.length >= 2) return 'identity'
  return 'weak'
}

/**
 * Dedupe fingerprint: primary phone (student → parent); else normalized name + customer id + education.
 * Hàng yếu (không SĐT / không tên) → hash riêng theo `rowSalt` để không dính «trùng toàn bộ» một mã trống.
 */
export function computeLeadUniqueHash(row: Partial<ExcelLeadRow>, rowSalt?: string | number): string {
  const phoneKey = normalizePhoneKey(row.phone ?? '', row.parentPhone)
  let basis: string
  if (phoneKey.length >= 9) {
    basis = `phone:${phoneKey}`
  } else {
    const n = normIdentity(row.fullName ?? '')
    const cid = normIdentity(row.customerId ?? '')
    const edu = normIdentity(row.educationLevel ?? '')
    const grade = normIdentity(row.gradeClass ?? '')
    const dob = normIdentity(row.dateOfBirth ?? '')
    basis = `identity:${n}|kh:${cid}|edu:${edu}|lop:${grade}|dob:${dob}`
    if (leadDedupeStrength(row) === 'weak') {
      basis = `${basis}|salt:${rowSalt ?? '0'}`
    }
  }
  return sha256HexSync(basis)
}

/** Chỉ các hash đủ mạnh mới đem đi so Firestore — tránh khớp mã trống trên hồ sơ cũ. */
export function shouldQueryExistingByUniqueHash(row: Partial<ExcelLeadRow>): boolean {
  return leadDedupeStrength(row) !== 'weak'
}

/**
 * Chuẩn hóa CCCD/Passport để chống trùng (Apps Script `formatCCCD`).
 * `CHƯA CÓ` / tick «chưa có» / rỗng → '' (không dùng làm khóa trùng).
 */
export function normalizeNationalIdKey(
  nationalId: string | undefined | null,
  notAvailable = false,
): string {
  if (notAvailable) return ''
  const raw = String(nationalId ?? '')
    .trim()
    .toUpperCase()
  if (!raw || raw === 'CHƯA CÓ') return ''
  if (/^\d+$/.test(raw)) return raw
  return raw.replace(/[^A-Z0-9]/g, '')
}

/** Hash Firestore riêng cho CCCD — không gộp vào `uniqueHash` (SĐT) để giữ ổn định dữ liệu cũ. */
export function computeNationalIdHash(normalizedKey: string): string | null {
  const key = String(normalizedKey ?? '').trim().toUpperCase()
  if (!key || key === 'CHƯA CÓ') return null
  return sha256HexSync(`nationalId:${key}`)
}

export function nationalIdHashFromInput(
  nationalId: string | undefined | null,
  notAvailable = false,
): string | null {
  return computeNationalIdHash(normalizeNationalIdKey(nationalId, notAvailable))
}

/** Map admission funnel stage to counselor Kanban when `status` is absent on legacy docs. */
export function pipelineToCounselorStatus(p: Lead['pipelineStatus']): LeadCounselorStatus {
  switch (p) {
    case 'NEW':
      return 'NEW'
    case 'CONTACTED':
      return 'INTERESTED'
    case 'QUALIFIED':
    case 'APPLIED':
      return 'INTERESTED'
    case 'ENROLLED':
      return 'ENROLLED'
    case 'LOST':
    case 'ARCHIVED':
      return 'DEAD'
    default:
      return 'NEW'
  }
}

/**
 * Ghi đồng bộ `assignedTo` + `assignedCounselorId` lên Firestore — tránh chỉ cập nhật một trường.
 */
export function assigneeFirestoreMirror(uid: string | null): {
  assignedTo: string | null
  assignedCounselorId: string | null
} {
  return { assignedTo: uid, assignedCounselorId: uid }
}

/** When only counselor `status` exists, infer admission funnel for analytics & legacy UI. */
export function counselorStatusToPipeline(s: LeadCounselorStatus): Lead['pipelineStatus'] {
  switch (s) {
    case 'NEW':
      return 'NEW'
    case 'INTERESTED':
      return 'QUALIFIED'
    case 'DEPOSIT_PAID':
      return 'APPLIED'
    case 'ENROLLED':
      return 'ENROLLED'
    case 'SUMMER_MELT':
    case 'DEAD':
      return 'LOST'
    default:
      return 'NEW'
  }
}
