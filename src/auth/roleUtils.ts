import type { UserRole } from '../types'

/** Admin thường + Siêu quản trị — cùng phạm vi dữ liệu / cấu hình rộng (trừ API LLM chỉ dành cho super). */
export function isAdminLikeRole(role: UserRole | undefined | null): boolean {
  return role === 'admin' || role === 'super_admin'
}

export function isSuperAdminRole(role: UserRole | undefined | null): boolean {
  return role === 'super_admin'
}
