import type { Lead, UserId, VietMyUserProfile } from '../types'

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

/** Đếm lead đang gán cho từng counselor (chỉ cần trường gán TVV). */
export function countAssignments(leads: readonly Pick<Lead, 'assignedCounselorId'>[]): Map<UserId, number> {
  const m = new Map<UserId, number>()
  for (const l of leads) {
    const id = l.assignedCounselorId
    if (!id) continue
    m.set(id, (m.get(id) ?? 0) + 1)
  }
  return m
}
