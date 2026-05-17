import type { Permission, UserRole, VietMyUserProfile } from '../types'
import { PERMISSIONS } from '../types'
import { normalizeUserRole } from './roleUtils'

const ALL = PERMISSIONS as unknown as readonly Permission[]

/** Admin thường: mọi quyền trừ cấu hình khóa API LLM (chỉ Siêu quản trị). */
const ALL_EXCEPT_LLM_API = ALL.filter((p) => p !== 'config:llm_api')

/** Quyền tầng Trưởng nhóm (`team_lead`). */
const TEAM_LEAD_PERMISSIONS: readonly Permission[] = [
  'leads:read:team_scope',
  'leads:write:team_scope',
  'leads:reassign:team',
  'interactions:read:team_scope',
  'interactions:create:team_scope',
  'dashboard:team_lead',
  'config:scoring_profiles_team',
  'config:scoring_profiles_own',
  'config:users:team',
  'config:playbooks',
  'analytics:advanced',
  'ai:use',
]

/**
 * Ma trận quyền mặc định theo vai trò (UI + gợi ý Firestore Rules).
 *
 * Ba tầng: Tư vấn viên → Trưởng nhóm → Quản trị.
 */
export function defaultPermissionsForRole(role: UserRole | string): readonly Permission[] {
  const r = normalizeUserRole(role)
  switch (r) {
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
        'config:scoring_profiles_own',
        'ai:use',
      ]
    case 'team_lead':
      return TEAM_LEAD_PERMISSIONS
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

/**
 * Quyền hiệu lực = ma trận vai trò + `extraPermissions` − `deniedPermissions`.
 */
export function resolveEffectivePermissions(
  profile: Pick<VietMyUserProfile, 'role' | 'extraPermissions' | 'deniedPermissions'> | null | undefined,
): readonly Permission[] {
  if (!profile) return []
  const base = new Set<Permission>(defaultPermissionsForRole(profile.role))
  for (const p of profile.extraPermissions ?? []) {
    if ((PERMISSIONS as readonly string[]).includes(p)) base.add(p as Permission)
  }
  for (const p of profile.deniedPermissions ?? []) {
    base.delete(p)
  }
  return [...base]
}

export function canViewPermissionMatrix(perms: readonly Permission[] | undefined): boolean {
  return hasPermission(perms, 'config:users') || hasPermission(perms, 'config:llm_api')
}

const SETTINGS_PAGE_PERMISSIONS = [
  'config:master_data',
  'config:scoring_rules',
  'config:scoring_profiles_own',
  'config:scoring_profiles_team',
  'config:playbooks',
  'config:ai_engine',
  'config:users',
  'config:users:team',
] as const satisfies readonly Permission[]

export function canAccessSettingsPage(perms: readonly Permission[] | undefined): boolean {
  return SETTINGS_PAGE_PERMISSIONS.some((p) => hasPermission(perms, p))
}
