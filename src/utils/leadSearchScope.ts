import type { UserRole, VietMyUserProfile } from '../types'
import {
  isAdminLikeRole,
  isFieldStaffRole,
  isSuperAdminRole,
  isTeamLeadRole,
} from '../auth/roleUtils'
import { isSystemLeadCode } from './systemLeadCode'
import { normalizePhoneKey } from './leadIdentity'

/** Admin / siêu QT — quét rộng trong trường (không phá RBAC). */
export const MAX_LEAD_SEARCH_SCAN_ADMIN = 2000
/** Trưởng nhóm — chỉ hồ sơ TVV trong nhóm (+ chính mình). */
export const MAX_LEAD_SEARCH_SCAN_TEAM = 600
/** TVV / CTV — chỉ hồ sơ được gán cho mình. */
export const MAX_LEAD_SEARCH_SCAN_SELF = 400
/** Trần cũ (admin) — giữ export tương thích. */
export const MAX_LEAD_SEARCH_SCAN_DEFAULT = 1200

export type LeadSearchExactKind = 'phone' | 'systemCode' | 'customerId' | 'text'

export type LeadSearchQueryClass = {
  kind: LeadSearchExactKind
  /** Giá trị đưa vào where equality (phone đã chuẩn hóa). */
  exactValue: string
  /** Chuỗi lowercase cho leadMatchesClientSearch. */
  clientNeedle: string
}

/** UID trong phạm vi gán hồ sơ của trưởng nhóm (roster + chính mình). */
export function teamLeadAssigneeScopeIds(profile: VietMyUserProfile): string[] {
  const ids = (profile.managedCounselorIds ?? []).map(String).filter(Boolean)
  if (profile.id) ids.unshift(profile.id)
  return [...new Set(ids)]
}

/**
 * Trần số document quét khi tìm chữ (fuzzy) — vẫn nằm trong RBAC server.
 * Admin rộng hơn; TVV/CTV và trưởng nhóm hẹp để nhanh + tiết kiệm đọc.
 */
export function leadSearchScanLimitForProfile(
  profile: Pick<VietMyUserProfile, 'role'> | null | undefined,
  canReadGlobal: boolean,
): number {
  const role = profile?.role as UserRole | undefined
  if (isSuperAdminRole(role) || (isAdminLikeRole(role) && canReadGlobal)) {
    return MAX_LEAD_SEARCH_SCAN_ADMIN
  }
  if (isTeamLeadRole(role)) return MAX_LEAD_SEARCH_SCAN_TEAM
  if (isFieldStaffRole(role)) return MAX_LEAD_SEARCH_SCAN_SELF
  if (isAdminLikeRole(role) && !canReadGlobal) return MAX_LEAD_SEARCH_SCAN_SELF
  return MAX_LEAD_SEARCH_SCAN_SELF
}

/** Phân loại ô tìm để ưu tiên where equality (SĐT / mã hệ thống). */
export function classifyLeadSearchQuery(raw: string): LeadSearchQueryClass {
  const trimmed = String(raw ?? '').trim()
  const clientNeedle = trimmed.toLowerCase()
  if (!trimmed) {
    return { kind: 'text', exactValue: '', clientNeedle: '' }
  }

  const phone = normalizePhoneKey(trimmed)
  if (phone.length === 10 && phone.startsWith('0')) {
    return { kind: 'phone', exactValue: phone, clientNeedle }
  }

  // Mã hệ thống YYMMDD+seq — 10 số, thường không bắt đầu bằng 0.
  if (isSystemLeadCode(trimmed) && !trimmed.startsWith('0')) {
    return { kind: 'systemCode', exactValue: trimmed, clientNeedle }
  }

  // Mã KH ngắn / alphanumeric — equality customerId khi đủ rõ.
  if (/^[A-Za-z0-9][A-Za-z0-9._\-]{2,31}$/.test(trimmed) && !/\s/.test(trimmed)) {
    return { kind: 'customerId', exactValue: trimmed, clientNeedle }
  }

  return { kind: 'text', exactValue: '', clientNeedle }
}

/** Gợi ý placeholder theo quyền — tiếng Việt đời thường. */
export function leadSearchPlaceholderForRole(
  role: UserRole | string | undefined | null,
  canReadGlobal: boolean,
): string {
  if (isSuperAdminRole(role) || (isAdminLikeRole(role) && canReadGlobal)) {
    return 'Tìm toàn trường: tên, SĐT, mã hồ sơ, TVV…'
  }
  if (isTeamLeadRole(role)) {
    return 'Tìm trong nhóm: tên, SĐT, mã hồ sơ của TVV bạn quản lý…'
  }
  if (isFieldStaffRole(role) || (isAdminLikeRole(role) && !canReadGlobal)) {
    return 'Tìm hồ sơ bạn đang phụ trách: tên, SĐT, mã hồ sơ…'
  }
  return 'Tên, SĐT, mã hồ sơ…'
}

export function leadSearchScopeHintForRole(
  role: UserRole | string | undefined | null,
  canReadGlobal: boolean,
): string {
  if (isSuperAdminRole(role) || (isAdminLikeRole(role) && canReadGlobal)) {
    return 'Phạm vi: toàn bộ hồ sơ trong trường.'
  }
  if (isTeamLeadRole(role)) {
    return 'Phạm vi: hồ sơ của bạn và các TVV trong nhóm.'
  }
  if (isFieldStaffRole(role) || (isAdminLikeRole(role) && !canReadGlobal)) {
    return 'Phạm vi: chỉ hồ sơ đang giao cho bạn.'
  }
  return 'Phạm vi tìm theo quyền tài khoản.'
}
