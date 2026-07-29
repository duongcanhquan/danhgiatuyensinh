import { where, type QueryFilterConstraint } from 'firebase/firestore'
import { DEFAULT_ORG_ID } from './orgConstants'

/** Equality constraint for school isolation on flat collections. */
export function orgIdEqualityConstraint(orgId: string): QueryFilterConstraint {
  return where('orgId', '==', orgId)
}

/**
 * Trường mặc định (VietMy) còn nhiều hồ sơ cũ thiếu `orgId`.
 * Không gắn `where(orgId==)` trên query — lọc client bằng {@link leadBelongsToOrg}.
 * Trường khác: luôn lọc server `orgId ==`.
 */
export function shouldUseLegacyMissingOrgIdRead(orgId: string | null | undefined): boolean {
  return String(orgId ?? '').trim() === DEFAULT_ORG_ID
}

/** Hồ sơ thuộc trường đang xem (kể cả legacy thiếu orgId trên VietMy). */
export function leadBelongsToOrg(
  lead: { orgId?: string | null },
  orgId: string,
): boolean {
  const target = orgId.trim() || DEFAULT_ORG_ID
  const oid = lead.orgId != null ? String(lead.orgId).trim() : ''
  if (target === DEFAULT_ORG_ID) return !oid || oid === DEFAULT_ORG_ID
  return oid === target
}

/**
 * Constraint gắn vào query list. `null` = không lọc org trên server (legacy VietMy).
 */
export function orgIdQueryConstraint(orgId: string | null | undefined): QueryFilterConstraint | null {
  const id = String(orgId ?? '').trim()
  if (!id) return null
  if (shouldUseLegacyMissingOrgIdRead(id)) return null
  return orgIdEqualityConstraint(id)
}
