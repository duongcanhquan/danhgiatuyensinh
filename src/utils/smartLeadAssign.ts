import type { UserId, VietMyUserProfile } from '../types'
import { pickCounselorByLowestLoad } from './routing'

export type SmartAssignMode = 'single' | 'round_robin' | 'lowest_load'

export type SmartAssignPlan = {
  /** leadId → counselorUid */
  assignments: Map<string, string>
  /** counselorUid → số hồ sơ được gán trong plan */
  perCounselor: Map<string, number>
  mode: SmartAssignMode
}

function uniqIds(ids: string[]): string[] {
  return [...new Set(ids.map((id) => id.trim()).filter(Boolean))]
}

/**
 * Lập kế hoạch phân lead.
 * - `single`: mọi lead → `singleUid`
 * - `round_robin`: chia đều theo vòng qua `counselorIds`
 * - `lowest_load`: mỗi lead gán TVV đang ít hồ sơ nhất (cộng dồn trong plan)
 */
export function planLeadAssignments(
  leadIds: string[],
  counselorIds: string[],
  mode: SmartAssignMode,
  opts?: {
    singleUid?: string
    /** Tải hiện tại (số hồ sơ đang phụ trách) — dùng cho lowest_load */
    currentLoads?: Map<string, number>
  },
): SmartAssignPlan {
  const leads = uniqIds(leadIds)
  const counselors = uniqIds(counselorIds)
  const assignments = new Map<string, string>()
  const perCounselor = new Map<string, number>()

  const bump = (uid: string) => {
    perCounselor.set(uid, (perCounselor.get(uid) ?? 0) + 1)
  }

  if (!leads.length) {
    return { assignments, perCounselor, mode }
  }

  if (mode === 'single') {
    const uid = (opts?.singleUid ?? counselors[0] ?? '').trim()
    if (!uid) throw new Error('Chưa chọn người phụ trách.')
    for (const id of leads) {
      assignments.set(id, uid)
      bump(uid)
    }
    return { assignments, perCounselor, mode }
  }

  if (!counselors.length) {
    throw new Error('Chọn ít nhất một tư vấn viên để chia.')
  }

  if (mode === 'round_robin') {
    let i = 0
    for (const id of leads) {
      const uid = counselors[i % counselors.length]!
      assignments.set(id, uid)
      bump(uid)
      i += 1
    }
    return { assignments, perCounselor, mode }
  }

  // lowest_load
  const loads = new Map<string, number>()
  for (const uid of counselors) {
    loads.set(uid, opts?.currentLoads?.get(uid) ?? 0)
  }
  const pool: VietMyUserProfile[] = counselors.map((id) => ({
    id,
    email: `${id}@local`,
    displayName: id,
    role: 'counselor',
    isActive: true,
    createdAt: {} as never,
    updatedAt: {} as never,
  }))

  for (const id of leads) {
    const uid = pickCounselorByLowestLoad(pool, loads)
    if (!uid) throw new Error('Không chọn được TVV theo tải.')
    assignments.set(id, uid)
    bump(uid)
    loads.set(uid, (loads.get(uid) ?? 0) + 1)
  }
  return { assignments, perCounselor, mode }
}

/** Tóm tắt ngắn cho UI (vd. «3 TVV · ~40/người»). */
export function summarizeAssignPlan(plan: SmartAssignPlan): string {
  const n = plan.assignments.size
  const people = [...plan.perCounselor.entries()].sort((a, b) => b[1] - a[1])
  if (!n) return 'Chưa có hồ sơ.'
  if (plan.mode === 'single') {
    const [, count] = people[0] ?? ['', 0]
    return `1 người · ${count} hồ sơ`
  }
  const avg = people.length ? Math.round(n / people.length) : 0
  return `${people.length} người · ~${avg}/người · tổng ${n}`
}

export type { UserId }
