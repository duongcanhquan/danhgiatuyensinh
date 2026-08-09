import type { Permission, VietMyUserProfile } from '../types'
import { isAdminLikeRole, isAssignableFieldStaffRole, isTeamLeadRole } from '../auth/roleUtils'
import { counselorIdsInManagerScope } from './teamScope'
import type { TeamRosterMemberInput } from './teamRosterSummary'

export function canAccessTeamRosterTab(can: (p: Permission) => boolean): boolean {
  return (
    can('dashboard:team_lead') ||
    can('leads:read:team_scope') ||
    can('analytics:advanced') ||
    can('leads:read:global')
  )
}

function memberLabel(u: VietMyUserProfile): string {
  return u.displayName?.trim() || u.email?.trim() || u.id
}

function activeFieldStaff(directory: readonly VietMyUserProfile[]): VietMyUserProfile[] {
  return directory.filter((u) => isAssignableFieldStaffRole(u.role) && u.isActive !== false)
}

/**
 * Danh sách nhân sự hiển thị trên tab «Nhóm của tôi».
 * Trưởng nhóm → roster của mình; quản trị / siêu quản trị → cả trường (lọc nhóm tùy chọn).
 */
export function resolveTeamRosterMembers(input: {
  profile: VietMyUserProfile | null | undefined
  can: (p: Permission) => boolean
  directory: readonly VietMyUserProfile[]
  /** Chỉ áp dụng khi xem phạm vi trường. */
  filterTeamLeadUid?: string | null
}): TeamRosterMemberInput[] {
  const { profile, can, directory } = input
  const staff = activeFieldStaff(directory)
  if (!profile) return []

  const toMembers = (users: VietMyUserProfile[]) =>
    [...users]
      .sort((a, b) => memberLabel(a).localeCompare(memberLabel(b), 'vi'))
      .map((u) => ({ counselorUid: u.id, displayName: memberLabel(u) }))

  // Trưởng nhóm: luôn nhóm của mình (kể cả khi có analytics:advanced).
  if (isTeamLeadRole(profile.role) && !isAdminLikeRole(profile.role)) {
    const ids = new Set(counselorIdsInManagerScope(profile, directory))
    return toMembers(staff.filter((u) => ids.has(u.id)))
  }

  if (can('leads:read:global') || isAdminLikeRole(profile.role) || can('analytics:advanced')) {
    const filterUid = input.filterTeamLeadUid?.trim()
    if (filterUid) {
      const tl = directory.find((u) => u.id === filterUid)
      if (tl) {
        const ids = new Set(counselorIdsInManagerScope(tl, directory))
        return toMembers(staff.filter((u) => ids.has(u.id)))
      }
    }
    return toMembers(staff)
  }

  if (can('dashboard:team_lead') || can('leads:read:team_scope')) {
    const ids = new Set(counselorIdsInManagerScope(profile, directory))
    return toMembers(staff.filter((u) => ids.has(u.id)))
  }

  return []
}

export function teamLeadOptionsForFilter(
  directory: readonly VietMyUserProfile[],
): { id: string; label: string }[] {
  return directory
    .filter((u) => isTeamLeadRole(u.role) && u.isActive !== false)
    .map((u) => ({ id: u.id, label: memberLabel(u) }))
    .sort((a, b) => a.label.localeCompare(b.label, 'vi'))
}
