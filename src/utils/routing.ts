import type { UserId, VietMyUserProfile } from '../types'
import { isAdminLikeRole } from '../auth/roleUtils'

/** Chọn một UID quản trị (ổn định theo email) để gán lead chờ điều phối khi import không khớp TVV. */
export function pickPrimaryAdminUid(users: readonly VietMyUserProfile[]): UserId | null {
  const admins = users.filter((u) => isAdminLikeRole(u.role) && u.isActive)
  if (!admins.length) return null
  return [...admins].sort((a, b) => a.email.localeCompare(b.email, 'vi'))[0]!.id
}

/**
 * Gán counselor theo tải (số lead đang phụ trách) — MVP, không cần index phức tạp.
 */
export function pickCounselorByLowestLoad(
  counselors: VietMyUserProfile[],
  currentCounts: Map<UserId, number>,
): UserId | null {
  const active = counselors.filter((c) => c.isActive && c.role === 'counselor')
  if (!active.length) return null
  let best = active[0]!
  let bestScore = currentCounts.get(best.id) ?? 0
  for (const c of active) {
    const s = currentCounts.get(c.id) ?? 0
    if (s < bestScore) {
      best = c
      bestScore = s
    }
  }
  return best.id
}

/** Đếm lead đang gán cho từng counselor (ưu tiên `assignedTo`, fallback legacy; bỏ qua chuỗi rỗng). */
export function countAssignments(
  leads: readonly Pick<{ assignedTo?: string | null; assignedCounselorId?: string | null }, 'assignedTo' | 'assignedCounselorId'>[],
): Map<UserId, number> {
  const m = new Map<UserId, number>()
  for (const l of leads) {
    const primary = String(l.assignedTo ?? '').trim()
    const legacy = String(l.assignedCounselorId ?? '').trim()
    const id = primary || legacy
    if (!id) continue
    m.set(id, (m.get(id) ?? 0) + 1)
  }
  return m
}
