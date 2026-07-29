import { DEFAULT_ORG_ID } from './orgConstants'
import type { UserRole } from '../types'

/** Ensure payload carries orgId (default vietmy for Phase 0 single-tenant migrate). */
export function ensureOrgId<T extends Record<string, unknown>>(data: T, orgId: string = DEFAULT_ORG_ID): T & { orgId: string } {
  const existing = data.orgId
  if (typeof existing === 'string' && existing.trim()) {
    return data as T & { orgId: string }
  }
  return { ...data, orgId }
}

export function resolveWriteOrgId(input: {
  explicitOrgId?: string | null
  profileOrgId?: string | null
  activeOrgId?: string | null
  role?: UserRole | null
}): string {
  const explicit = input.explicitOrgId?.trim()
  if (explicit) return explicit
  if (input.role === 'super_admin') {
    const active = input.activeOrgId?.trim()
    if (active) return active
  }
  const profile = input.profileOrgId?.trim()
  if (profile) return profile
  return DEFAULT_ORG_ID
}

/** Platform superadmin: role super_admin and no school orgId bound. */
export function isPlatformSuperAdminRole(role: UserRole | null | undefined, orgId: string | null | undefined): boolean {
  return role === 'super_admin' && (orgId == null || String(orgId).trim() === '')
}
