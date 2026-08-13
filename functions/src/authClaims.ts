/** Mirrored from src/tenancy/authClaims.ts — keep in sync when changing claim shape. */

const DEFAULT_ORG_ID = 'vietmy'
const USER_ROLES = ['super_admin', 'admin', 'team_lead', 'counselor', 'ctv', 'accountant', 'marketing'] as const

export type AuthCustomClaims = {
  role: string
  orgId: string
  platform: boolean
}

function normalizeUserRole(role: string | null | undefined): string {
  if (!role) return 'counselor'
  if (role === 'head_of_profession' || role === 'head_of_department') return 'team_lead'
  if ((USER_ROLES as readonly string[]).includes(role)) return role
  return 'counselor'
}

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
  current: Record<string, unknown> | null | undefined,
  desired: AuthCustomClaims,
): boolean {
  if (!current) return true
  return (
    String(current.role ?? '') !== desired.role ||
    String(current.orgId ?? '') !== desired.orgId ||
    Boolean(current.platform) !== desired.platform
  )
}
