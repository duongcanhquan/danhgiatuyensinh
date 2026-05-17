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

/** Trưởng nhóm có `managedCounselorIds` rõ ràng (không chỉ fallback khoa/phòng). */
export function teamLeadUsesExplicitRoster(lead: VietMyUserProfile): boolean {
  return isTeamLeadRole(lead.role) && (lead.managedCounselorIds?.length ?? 0) > 0
}

/** Các trưởng nhóm mà TVV này thuộc phạm vi quản lý. */
export function teamLeadsForCounselor(
  counselorId: string,
  directory: readonly VietMyUserProfile[],
): VietMyUserProfile[] {
  return directory.filter(
    (u) => isTeamLeadRole(u.role) && counselorIdsInManagerScope(u, directory).includes(counselorId),
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
 * Gán TVV vào đúng một trưởng nhóm (`newTeamLeadId`), gỡ khỏi các trưởng nhóm khác.
 * `newTeamLeadId === null` → chỉ gỡ khỏi mọi nhóm.
 */
export function patchesForCounselorTeamAssignment(
  counselorId: string,
  newTeamLeadId: string | null,
  directory: readonly VietMyUserProfile[],
): TeamLeadRosterPatch[] {
  const patches: TeamLeadRosterPatch[] = []
  for (const lead of directory) {
    if (!isTeamLeadRole(lead.role)) continue
    const ids = [...(lead.managedCounselorIds ?? [])]
    const has = ids.includes(counselorId)
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
