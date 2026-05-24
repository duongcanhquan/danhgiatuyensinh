import type { Permission, VietMyUserProfile } from '../types'
import { normalizeUserRole } from './roleUtils'

/** Quản trị vào được cổng kế toán để giám sát; TVV kế toán cần `finance:accountant`. */
export function canAccessAccountantPortal(
  can: (p: Permission) => boolean,
  profile?: Pick<VietMyUserProfile, 'role' | 'isActive'> | null,
): boolean {
  if (profile?.isActive === false) return false
  const role = normalizeUserRole(profile?.role)
  if (role === 'super_admin' || role === 'admin') return true
  return can('finance:accountant')
}

export function canManageAccountantStaff(can: (p: Permission) => boolean): boolean {
  return can('finance:manage_accountants')
}

/** TVV kế toán chỉ dùng cổng `/ke-toan`, không vào CRM tuyển sinh. */
export function isAccountantOnlyUser(profile: VietMyUserProfile | null | undefined): boolean {
  if (!profile || profile.isActive === false) return false
  return profile.role === 'accountant'
}

export function defaultAccountantEmailFromEnv(): string {
  return String(import.meta.env.VITE_DEFAULT_ACCOUNTANT_EMAIL ?? 'quan.duong@caodangvietmy.edu.vn')
    .trim()
    .toLowerCase()
}
