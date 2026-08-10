import type { VietMyUserProfile } from '../types'
import {
  canOwnFieldStaffTeam,
  isAssignableFieldStaffRole,
  normalizeUserRole,
} from '../auth/roleUtils'

/** UID tư vấn viên / CTV thuộc phạm vi quản lý của trưởng nhóm (roster). */
export function counselorIdsInManagerScope(
  manager: VietMyUserProfile,
  directory: readonly VietMyUserProfile[],
): string[] {
  if (!canOwnFieldStaffTeam(manager.role)) return []

  const explicit = manager.managedCounselorIds ?? []
  if (explicit.length) return [...new Set(explicit.map(String))]

  const dept = manager.departmentId?.trim()
  if (dept) {
    return directory
      .filter(
        (u) => isAssignableFieldStaffRole(u.role) && u.isActive !== false && u.departmentId === dept,
      )
      .map((u) => u.id)
  }

  const unit = manager.professionUnitId?.trim()
  if (unit) {
    return directory
      .filter(
        (u) => isAssignableFieldStaffRole(u.role) && u.isActive !== false && u.professionUnitId === unit,
      )
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
  if (!isAssignableFieldStaffRole(target.role)) return false
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

/** Trưởng nhóm có `managedCounselorIds` rõ ràng (không chỉ fallback khoa/phòng). */
export function teamLeadUsesExplicitRoster(lead: VietMyUserProfile): boolean {
  return canOwnFieldStaffTeam(lead.role) && (lead.managedCounselorIds?.length ?? 0) > 0
}

/** Các trưởng nhóm mà TVV/CTV này thuộc phạm vi. */
export function teamLeadsForCounselor(
  counselorId: string,
  directory: readonly VietMyUserProfile[],
): VietMyUserProfile[] {
  return directory.filter(
    (u) => canOwnFieldStaffTeam(u.role) && counselorIdsInManagerScope(u, directory).includes(counselorId),
  )
}

export function primaryTeamLeadForCounselor(
  counselorId: string,
  directory: readonly VietMyUserProfile[],
): VietMyUserProfile | null {
  const leads = teamLeadsForCounselor(counselorId, directory)
  if (!leads.length) return null
  const explicit = leads.filter((l) => (l.managedCounselorIds ?? []).includes(counselorId))
  return explicit[0] ?? leads[0]
}

export type TeamLeadRosterPatch = { userId: string; managedCounselorIds: string[] }

/**
 * Gán TVV/CTV vào đúng một Trưởng nhóm (`newTeamLeadId`), gỡ khỏi các nhóm khác.
 * Đồng thời gỡ khỏi roster «mồ côi» trên tài khoản không còn quyền cầm nhóm (vd. admin cũ).
 * `newTeamLeadId === null` → chỉ gỡ khỏi mọi nhóm.
 */
export function patchesForCounselorTeamAssignment(
  counselorId: string,
  newTeamLeadId: string | null,
  directory: readonly VietMyUserProfile[],
): TeamLeadRosterPatch[] {
  const patches: TeamLeadRosterPatch[] = []
  for (const lead of directory) {
    const ids = [...(lead.managedCounselorIds ?? [])]
    const has = ids.includes(counselorId)
    if (!canOwnFieldStaffTeam(lead.role)) {
      if (has) {
        patches.push({
          userId: lead.id,
          managedCounselorIds: ids.filter((id) => id !== counselorId).slice(0, 60),
        })
      }
      continue
    }
    const shouldHave = lead.id === newTeamLeadId
    if (has === shouldHave) continue
    const next = shouldHave ? [...ids, counselorId] : ids.filter((id) => id !== counselorId)
    patches.push({ userId: lead.id, managedCounselorIds: [...new Set(next)].slice(0, 60) })
  }
  return patches
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
