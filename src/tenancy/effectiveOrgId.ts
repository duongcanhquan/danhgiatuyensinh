import { DEFAULT_ORG_ID } from './orgConstants'
import type { UserRole } from '../types'
import { isPlatformSuperAdminRole } from './orgId'

/**
 * Org used for queries/writes in the CRM shell.
 * - School users: always profile.orgId (default vietmy if missing).
 * - Platform super_admin (no profile.orgId): activeOrgId from switcher, else default.
 */
export function resolveEffectiveOrgId(input: {
  role: UserRole | null | undefined
  profileOrgId: string | null | undefined
  activeOrgId: string | null | undefined
}): string {
  const profile = input.profileOrgId?.trim() || null
  if (isPlatformSuperAdminRole(input.role, profile)) {
    const active = input.activeOrgId?.trim()
    return active || DEFAULT_ORG_ID
  }
  return profile || DEFAULT_ORG_ID
}
