import type { Lead, Permission, VietMyUserProfile } from '../types'
import { hasPermission } from './permissions'
import { isAdminLikeRole, isSuperAdminRole, isTeamLeadRole } from './roleUtils'
import { counselorIdsInManagerScope } from '../utils/teamScope'

/** Bộ lọc hồ sơ toàn trường (chỉ Admin / Siêu quản trị có `leads:read:global`). */
export function hasGlobalLeadFilters(perms: readonly Permission[] | undefined): boolean {
  return hasPermission(perms, 'leads:read:global')
}

/** Đổi TVV / bulk — trưởng nhóm trong phạm vi hoặc admin có global. */
export function canReassignTeamLeads(perms: readonly Permission[] | undefined): boolean {
  return hasPermission(perms, 'leads:reassign:team') || hasPermission(perms, 'leads:read:global')
}

export function leadAssignedUid(lead: Pick<Lead, 'assignedTo' | 'assignedCounselorId'>): string | undefined {
  const primary = String(lead.assignedTo ?? '').trim()
  const legacy = String(lead.assignedCounselorId ?? '').trim()
  const uid = primary || legacy
  return uid || undefined
}

/** Hồ sơ thuộc nhóm TVV do trưởng nhóm quản lý. */
export function isLeadInManagerTeam(
  manager: VietMyUserProfile,
  lead: Pick<Lead, 'assignedTo' | 'assignedCounselorId'>,
  directory: readonly VietMyUserProfile[],
): boolean {
  if (!isTeamLeadRole(manager.role)) return false
  const assigned = leadAssignedUid(lead)
  if (!assigned) return true
  return counselorIdsInManagerScope(manager, directory).includes(assigned)
}

/** Tạo hồ sơ ứng viên mới (form thủ công trên màn Hồ sơ). */
export function canCreateLead(
  profile: VietMyUserProfile | null | undefined,
  can: (p: Permission) => boolean,
): boolean {
  if (!profile) return false
  if (isSuperAdminRole(profile.role)) return true
  // Admin có hồ sơ toàn trường hoặc quyền ghi thông thường
  if (isAdminLikeRole(profile.role) && can('leads:read:global')) return true
  return can('leads:write:self_assigned') || can('leads:write:team_scope')
}

/** Được sửa / cập nhật hồ sơ (form chi tiết, bulk). */
export function canWriteLead(
  profile: VietMyUserProfile | null | undefined,
  lead: Pick<Lead, 'assignedTo' | 'assignedCounselorId'>,
  can: (p: Permission) => boolean,
  directory: readonly VietMyUserProfile[],
): boolean {
  if (!profile) return false
  if (isSuperAdminRole(profile.role)) return true
  // Admin toàn trường: cần quyền ghi phạm vi nhóm (đi kèm module hồ sơ) hoặc ghi cá nhân
  if (can('leads:read:global') && (can('leads:write:team_scope') || can('leads:write:self_assigned'))) {
    return true
  }
  const assigned = leadAssignedUid(lead)
  if (can('leads:write:self_assigned') && assigned === profile.id) return true
  if (can('leads:write:team_scope') && isLeadInManagerTeam(profile, lead, directory)) return true
  return false
}
