import type { Permission, UserRole, VietMyUserProfile } from '../types'
import { PERMISSIONS } from '../types'
import { normalizeUserRole } from './roleUtils'
import {
  SCHOOL_ADMIN_CAPABILITY_MODULES,
  type OrgRoleCapabilities,
} from '../utils/roleCapabilitiesConfig'

const ALL = PERMISSIONS as unknown as readonly Permission[]

/** Admin thường: mọi quyền trừ cấu hình khóa API LLM (chỉ Siêu quản trị). */
const FINANCE_PERMISSIONS: readonly Permission[] = [
  'finance:accountant',
  'finance:manage_accountants',
  'finance:reports',
]
const ALL_EXCEPT_LLM_API_AND_FINANCE = ALL.filter(
  (p) => p !== 'config:llm_api' && !FINANCE_PERMISSIONS.includes(p),
)

/** Quyền tầng Trưởng nhóm (`team_lead`). */
const TEAM_LEAD_PERMISSIONS: readonly Permission[] = [
  'leads:read:team_scope',
  'leads:write:team_scope',
  'leads:reassign:team',
  'interactions:read:team_scope',
  'interactions:create:team_scope',
  'dashboard:team_lead',
  'config:scoring_profiles_team',
  'config:users:team',
  'config:playbooks',
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
      return [...ALL_EXCEPT_LLM_API_AND_FINANCE, 'config:omicall']
    case 'accountant':
      return FINANCE_PERMISSIONS
    case 'counselor':
      return [
        'leads:read:self_assigned',
        'leads:write:self_assigned',
        'leads:reassign:peer',
        'interactions:create:self_assigned',
        'dashboard:counselor',
        'ai:use',
      ]
    case 'ctv':
      return [
        'leads:read:self_assigned',
        'leads:write:self_assigned',
        'interactions:create:self_assigned',
        'dashboard:counselor',
      ]
    case 'team_lead':
      return TEAM_LEAD_PERMISSIONS
    case 'marketing':
      // Apps Script role marketing: xem all + báo cáo, ẩn tạo/sửa HS
      return ['leads:read:global', 'analytics:advanced', 'dashboard:counselor']
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
 * Quyền hiệu lực = ma trận vai trò + `extraPermissions` − `deniedPermissions`
 * (+ giao cắt capability trường cho role `admin`).
 */
export function adminPermissionsAllowedByCapabilities(
  caps: OrgRoleCapabilities | null | undefined,
): Set<Permission> | null {
  if (!caps || !caps.adminEnabledModuleIds?.length) return null
  const enabled = new Set(caps.adminEnabledModuleIds)
  const allowedFromModules = new Set<Permission>()
  for (const m of SCHOOL_ADMIN_CAPABILITY_MODULES) {
    if (!enabled.has(m.id)) continue
    for (const p of m.permissions) allowedFromModules.add(p)
  }
  const modulePerms = new Set<Permission>()
  for (const m of SCHOOL_ADMIN_CAPABILITY_MODULES) {
    for (const p of m.permissions) modulePerms.add(p)
  }
  const adminDefaults = defaultPermissionsForRole('admin')
  const result = new Set<Permission>()
  for (const p of adminDefaults) {
    if (!modulePerms.has(p)) {
      result.add(p)
      continue
    }
    if (allowedFromModules.has(p)) result.add(p)
  }
  for (const m of SCHOOL_ADMIN_CAPABILITY_MODULES) {
    if (!m.required) continue
    for (const p of m.permissions) result.add(p)
  }
  return result
}

export function resolveEffectivePermissions(
  profile: Pick<VietMyUserProfile, 'role' | 'extraPermissions' | 'deniedPermissions'> | null | undefined,
  _orgCaps?: OrgRoleCapabilities | null,
): readonly Permission[] {
  void _orgCaps
  if (!profile) return []
  const base = new Set<Permission>(defaultPermissionsForRole(profile.role))
  for (const p of profile.extraPermissions ?? []) {
    if ((PERMISSIONS as readonly string[]).includes(p)) base.add(p as Permission)
  }
  for (const p of profile.deniedPermissions ?? []) {
    base.delete(p)
  }

  const role = normalizeUserRole(profile.role)
  // Quản lý trường = toàn quyền vận hành trong trường (giống «siêu quản trị cơ sở»).
  // Module capability từ Siêu QT chỉ dùng khi tạo/cấu hình trường — không tước quyền CRM đang chạy.
  if (role === 'admin') {
    base.add('leads:read:global')
    base.add('leads:write:team_scope')
    base.add('leads:reassign:team')
    base.add('leads:delete')
    base.add('config:users')
    base.add('config:omicall')
    base.add('config:master_data')
    base.add('config:scoring_rules')
    base.add('data:intake')
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
  'config:omicall',
  'config:users',
  'config:users:team',
] as const satisfies readonly Permission[]

export function canAccessSettingsPage(perms: readonly Permission[] | undefined): boolean {
  return SETTINGS_PAGE_PERMISSIONS.some((p) => hasPermission(perms, p))
}
