import type { Lead, Permission, VietMyUserProfile } from '../types'
import { hasPermission } from './permissions'
import { isAdminLikeRole, isTeamLeadRole } from './roleUtils'
import { counselorIdsInManagerScope } from '../utils/teamScope'

/** Bộ lọc hồ sơ toàn trường (chỉ Admin / Siêu quản trị). */
export function hasGlobalLeadFilters(perms: readonly Permission[] | undefined): boolean {
  return hasPermission(perms, 'leads:read:global')
}

/** Đổi TVV / bulk — trưởng nhóm trong phạm vi hoặc admin. */
export function canReassignTeamLeads(perms: readonly Permission[] | undefined): boolean {
  return hasPermission(perms, 'leads:reassign:team') || hasPermission(perms, 'leads:read:global')
}

export function leadAssignedUid(lead: Pick<Lead, 'assignedTo' | 'assignedCounselorId'>): string | undefined {
  const uid = (lead.assignedTo ?? lead.assignedCounselorId)?.trim()
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

/** Được sửa / cập nhật hồ sơ (form chi tiết, bulk). */
export function canWriteLead(
  profile: VietMyUserProfile | null | undefined,
  lead: Pick<Lead, 'assignedTo' | 'assignedCounselorId'>,
  can: (p: Permission) => boolean,
  directory: readonly VietMyUserProfile[],
): boolean {
  if (!profile) return false
  if (isAdminLikeRole(profile.role)) return true
  const assigned = leadAssignedUid(lead)
  if (can('leads:write:self_assigned') && assigned === profile.id) return true
  if (can('leads:write:team_scope') && isLeadInManagerTeam(profile, lead, directory)) return true
  return false
}
