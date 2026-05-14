import type { Permission, UserRole } from '../types'
import { PERMISSIONS } from '../types'

const ALL = PERMISSIONS as unknown as readonly Permission[]

/** Admin thường: mọi quyền trừ cấu hình khóa API LLM (chỉ Siêu quản trị). */
const ALL_EXCEPT_LLM_API = ALL.filter((p) => p !== 'config:llm_api')

/**
 * Ma trận quyền mặc định theo vai trò (UI + gợi ý Firestore Rules).
 */
export function defaultPermissionsForRole(role: UserRole): readonly Permission[] {
  switch (role) {
    case 'super_admin':
      return ALL
    case 'admin':
      return ALL_EXCEPT_LLM_API
    case 'counselor':
      return [
        'leads:read:self_assigned',
        'leads:write:self_assigned',
        'leads:reassign:peer',
        'interactions:create:self_assigned',
        'dashboard:counselor',
        'ai:use',
      ]
    case 'head_of_profession':
      return [
        'leads:read:profession_scope',
        'interactions:read:profession_scope',
        'dashboard:head_of_profession',
        'analytics:advanced',
        'ai:use',
      ]
    case 'head_of_department':
      return [
        'leads:read:department_scope',
        'dashboard:head_of_department',
        'analytics:advanced',
        'ai:use',
      ]
    default:
      return []
  }
}

export function hasPermission(
  perms: readonly Permission[] | undefined,
  p: Permission,
): boolean {
  return Boolean(perms?.includes(p))
}
