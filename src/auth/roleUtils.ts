import type { UserRole } from '../types'
import { USER_ROLES } from '../types'

/** Vai trò trưởng nhóm cũ trên Firestore — map sang `team_lead` khi đọc. */
export const LEGACY_TEAM_LEAD_ROLES = ['head_of_profession', 'head_of_department'] as const

/** Admin thường + Siêu quản trị — cùng phạm vi dữ liệu / cấu hình rộng (trừ API LLM chỉ dành cho super). */
export function isAdminLikeRole(role: UserRole | string | undefined | null): boolean {
  const r = normalizeUserRole(role)
  return r === 'admin' || r === 'super_admin'
}

export function isSuperAdminRole(role: UserRole | string | undefined | null): boolean {
  return normalizeUserRole(role) === 'super_admin'
}

/** Trưởng nhóm — tầng giữa (quản lý nhóm TVV). */
export function isTeamLeadRole(role: UserRole | string | undefined | null): boolean {
  return normalizeUserRole(role) === 'team_lead'
}

/** TVV + CTV — cùng phạm vi hồ sơ được gán. */
export function isFieldStaffRole(role: UserRole | string | undefined | null): boolean {
  const r = normalizeUserRole(role)
  return r === 'counselor' || r === 'ctv'
}

/** Nhân viên sale / CTV — được gán hồ sơ và thuộc roster trưởng nhóm. */
export function isAssignableFieldStaffRole(role: UserRole | string | undefined | null): boolean {
  return isFieldStaffRole(role)
}

/**
 * Chuẩn hóa `role` từ Firestore / Auth.
 * `head_of_profession` và `head_of_department` → `team_lead`.
 */
export function normalizeUserRole(role: string | null | undefined): UserRole {
  if (!role) return 'counselor'
  if (role === 'head_of_profession' || role === 'head_of_department') return 'team_lead'
  if ((USER_ROLES as readonly string[]).includes(role)) return role as UserRole
  return 'counselor'
}
