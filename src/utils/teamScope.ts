import type { VietMyUserProfile } from '../types'
import { isTeamLeadRole, normalizeUserRole } from '../auth/roleUtils'

/** UID tư vấn viên thuộc phạm vi quản lý của trưởng nhóm. */
export function counselorIdsInManagerScope(
  manager: VietMyUserProfile,
  directory: readonly VietMyUserProfile[],
): string[] {
  if (!isTeamLeadRole(manager.role)) return []

  const explicit = manager.managedCounselorIds ?? []
  if (explicit.length) return [...new Set(explicit.map(String))]

  const dept = manager.departmentId?.trim()
  if (dept) {
    return directory
      .filter((u) => u.role === 'counselor' && u.isActive !== false && u.departmentId === dept)
      .map((u) => u.id)
  }

  const unit = manager.professionUnitId?.trim()
  if (unit) {
    return directory
      .filter((u) => u.role === 'counselor' && u.isActive !== false && u.professionUnitId === unit)
      .map((u) => u.id)
  }

  return []
}

export function isUserInManagerTeamScope(
  manager: VietMyUserProfile,
  target: VietMyUserProfile,
  directory: readonly VietMyUserProfile[],
): boolean {
  if (target.id === manager.id) return true
  if (target.role !== 'counselor') return false
  const team = new Set(counselorIdsInManagerScope(manager, directory))
  return team.has(target.id)
}

/** Profile chấm điểm mà quản lý được phép sửa (của mình + TVV trong nhóm). */
export function canManagerEditScoringProfile(
  manager: VietMyUserProfile,
  profileCreatedBy: string | undefined,
  directory: readonly VietMyUserProfile[],
): boolean {
  const uid = manager.id
  if (profileCreatedBy === uid) return true
  if (!profileCreatedBy?.trim()) return false
  const team = new Set(counselorIdsInManagerScope(manager, directory))
  return team.has(profileCreatedBy.trim())
}

export function roleCanAccessSettings(role: string | undefined): boolean {
  const r = normalizeUserRole(role)
  return (
    r === 'super_admin' ||
    r === 'admin' ||
    r === 'counselor' ||
    r === 'team_lead'
  )
}
