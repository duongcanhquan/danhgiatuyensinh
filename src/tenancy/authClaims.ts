import { DEFAULT_ORG_ID } from './orgConstants'
import { normalizeUserRole } from '../auth/roleUtils'

export type AuthCustomClaims = {
  role: string
  /** Empty string for platform super_admin; school users always have a non-empty orgId. */
  orgId: string
  platform: boolean
}

/** Build Auth custom claims from Firestore user profile fields. */
export function buildAuthCustomClaims(input: {
  role?: string | null
  orgId?: string | null
}): AuthCustomClaims {
  const role = normalizeUserRole(String(input.role ?? 'counselor'))
  const platform = role === 'super_admin'
  if (platform) {
    return { role: 'super_admin', orgId: '', platform: true }
  }
  const org = String(input.orgId ?? '').trim()
  return {
    role,
    orgId: org || DEFAULT_ORG_ID,
    platform: false,
  }
}

export function authClaimsNeedUpdate(
  current: Partial<AuthCustomClaims> | null | undefined,
  desired: AuthCustomClaims,
): boolean {
  if (!current) return true
  return (
    String(current.role ?? '') !== desired.role ||
    String(current.orgId ?? '') !== desired.orgId ||
    Boolean(current.platform) !== desired.platform
  )
}

export function claimsMatchProfile(
  claims: Partial<AuthCustomClaims> | null | undefined,
  profile: { role?: string | null; orgId?: string | null },
): boolean {
  const desired = buildAuthCustomClaims(profile)
  return !authClaimsNeedUpdate(claims, desired)
}
