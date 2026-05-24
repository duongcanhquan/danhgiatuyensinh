import type { Permission, ScoringProfile, UserId, VietMyUserProfile } from '../types'
import { isAdminLikeRole, isTeamLeadRole } from '../auth/roleUtils'
import { counselorIdsInManagerScope, primaryTeamLeadForCounselor } from './teamScope'

export type ScoringProfileScope = 'global' | 'team'

/** Phạm vi profile — legacy không có `scope`: admin (không createdBy) = global, còn lại = team. */
export function inferScoringProfileScope(profile: Pick<ScoringProfile, 'scope' | 'createdBy'>): ScoringProfileScope {
  if (profile.scope === 'global' || profile.scope === 'team') return profile.scope
  if (!profile.createdBy?.trim()) return 'global'
  return 'team'
}

/** Chủ sở hữu phạm vi nhóm — trưởng nhóm tạo profile hoặc TVV cũ (legacy). */
export function resolveScoringProfileScopeOwnerUid(
  profile: Pick<ScoringProfile, 'scope' | 'scopeOwnerUid' | 'createdBy'>,
  directory: readonly VietMyUserProfile[],
): UserId | undefined {
  if (inferScoringProfileScope(profile) === 'global') return undefined
  if (profile.scopeOwnerUid?.trim()) return profile.scopeOwnerUid.trim()
  const creatorId = profile.createdBy?.trim()
  if (!creatorId) return undefined
  const creator = directory.find((u) => u.id === creatorId)
  if (creator && isTeamLeadRole(creator.role)) return creator.id
  if (creator?.role === 'counselor') {
    return primaryTeamLeadForCounselor(creator.id, directory)?.id ?? creatorId
  }
  return creatorId
}

export function canBuildScoringProfiles(can: (p: Permission) => boolean): boolean {
  return can('config:scoring_rules') || can('config:scoring_profiles_team')
}

/** Profile admin tạo — phạm vi toàn hệ thống. */
export function isGlobalScoringProfile(
  profile: Pick<ScoringProfile, 'scope' | 'createdBy'>,
): boolean {
  return inferScoringProfileScope(profile) === 'global'
}

/**
 * Profile được phép chọn / áp dụng khi chấm điểm hồ sơ.
 * - Admin: mọi profile
 * - Trưởng nhóm: global + profile nhóm mình
 * - TVV: global + profile nhóm trưởng nhóm quản lý
 */
export function filterApplicableScoringProfiles(
  profiles: ScoringProfile[],
  user: VietMyUserProfile | null | undefined,
  directory: readonly VietMyUserProfile[],
  can: (p: Permission) => boolean,
): ScoringProfile[] {
  if (!user) return []
  if (can('config:scoring_rules') || isAdminLikeRole(user.role)) return profiles

  if (isTeamLeadRole(user.role) && can('config:scoring_profiles_team')) {
    return profiles.filter((p) => {
      if (isGlobalScoringProfile(p)) return true
      return resolveScoringProfileScopeOwnerUid(p, directory) === user.id
    })
  }

  const teamLeadIds = new Set(
    directory
      .filter((u) => isTeamLeadRole(u.role) && counselorIdsInManagerScope(u, directory).includes(user.id))
      .map((u) => u.id),
  )

  return profiles.filter((p) => {
    if (isGlobalScoringProfile(p)) return true
    const owner = resolveScoringProfileScopeOwnerUid(p, directory)
    return owner != null && teamLeadIds.has(owner)
  })
}

/** Profile hiển thị trong Cài đặt → Cài đặt Profile (xem / sửa). */
export function filterManageableScoringProfiles(
  profiles: ScoringProfile[],
  user: VietMyUserProfile | null | undefined,
  directory: readonly VietMyUserProfile[],
  can: (p: Permission) => boolean,
): ScoringProfile[] {
  if (!user || !canBuildScoringProfiles(can)) return []
  if (can('config:scoring_rules') || isAdminLikeRole(user.role)) return profiles

  if (isTeamLeadRole(user.role) && can('config:scoring_profiles_team')) {
    return profiles.filter((p) => {
      if (isGlobalScoringProfile(p)) return true
      const owner = resolveScoringProfileScopeOwnerUid(p, directory)
      return owner === user.id
    })
  }

  return []
}

export function canEditScoringProfile(
  profile: ScoringProfile,
  user: VietMyUserProfile | null | undefined,
  directory: readonly VietMyUserProfile[],
  can: (p: Permission) => boolean,
): boolean {
  if (!user || !canBuildScoringProfiles(can)) return false
  if (can('config:scoring_rules') || isAdminLikeRole(user.role)) return true
  if (!isTeamLeadRole(user.role) || !can('config:scoring_profiles_team')) return false
  if (isGlobalScoringProfile(profile)) return false
  return resolveScoringProfileScopeOwnerUid(profile, directory) === user.id
}

export function scoringProfileScopeLabel(
  profile: ScoringProfile,
  directory: readonly VietMyUserProfile[],
): string {
  if (isGlobalScoringProfile(profile)) return 'Toàn hệ thống'
  const owner = resolveScoringProfileScopeOwnerUid(profile, directory)
  const lead = owner ? directory.find((u) => u.id === owner) : undefined
  const name = lead?.displayName?.trim() || lead?.email || owner?.slice(0, 8)
  return name ? `Nhóm · ${name}` : 'Nhóm'
}

export function buildScoringProfileScopePayload(opts: {
  isAdminLike: boolean
  sessionUid: string | null
}): Pick<ScoringProfile, 'scope' | 'scopeOwnerUid' | 'createdBy'> {
  if (opts.isAdminLike) {
    return { scope: 'global', scopeOwnerUid: undefined, createdBy: opts.sessionUid?.trim() || undefined }
  }
  const uid = opts.sessionUid?.trim()
  if (!uid) return { scope: 'team', scopeOwnerUid: undefined }
  return { scope: 'team', scopeOwnerUid: uid, createdBy: uid }
}
