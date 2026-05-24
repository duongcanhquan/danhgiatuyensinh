import type { Permission, VietMyUserProfile } from '../types'

export function canAccessAccountantPortal(can: (p: Permission) => boolean): boolean {
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
