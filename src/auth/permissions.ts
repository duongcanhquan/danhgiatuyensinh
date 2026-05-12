import type { Permission, UserRole } from '../types'
import { PERMISSIONS } from '../types'

const ALL = PERMISSIONS as unknown as readonly Permission[]

/**
 * Ma trận quyền mặc định theo vai trò (UI + gợi ý Firestore Rules).
 */
export function defaultPermissionsForRole(role: UserRole): readonly Permission[] {
  switch (role) {
    case 'admin':
      return ALL
    case 'counselor':
      return [
        'leads:read:self_assigned',
        'leads:write:self_assigned',
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
