import { where, type QueryFilterConstraint } from 'firebase/firestore'
import { DEFAULT_ORG_ID } from './orgConstants'

/** Equality constraint for school isolation on flat collections. */
export function orgIdEqualityConstraint(orgId: string): QueryFilterConstraint {
  return where('orgId', '==', orgId)
}

/**
 * Trường mặc định (VietMy) còn nhiều hồ sơ cũ thiếu `orgId`.
 * Query `where(orgId==vietmy)` không trả các doc đó → danh sách trống dù chưa xóa.
 * Superadmin / Quản lý trường VietMy: caller có thể bỏ constraint rồi lọc client (`leadBelongsToOrg`).
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
 * Constraint gắn vào query list.
 * Luôn lọc `orgId ==` khi có id — tương thích Firestore Rules (query phải bị ràng buộc).
 * Superadmin + VietMy legacy: caller chủ động bỏ constraint (xem useLeads).
 */
export function orgIdQueryConstraint(orgId: string | null | undefined): QueryFilterConstraint | null {
  const id = String(orgId ?? '').trim()
  if (!id) return null
  return orgIdEqualityConstraint(id)
}
