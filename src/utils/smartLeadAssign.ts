import type { UserId, VietMyUserProfile } from '../types'
import { pickCounselorByLowestLoad } from './routing'

export type SmartAssignMode = 'single' | 'round_robin' | 'lowest_load'

/** Cách lấy N lead từ kết quả lọc trước khi lập plan phân. */
export type AssignPickRule = 'oldest' | 'table_order' | 'random'

export type AssignPickLeadMeta = {
  id: string
  /** ms epoch — thiếu thì xếp cuối khi chọn oldest */
  createdAtMs?: number | null
}

export type SmartAssignPlan = {
  /** leadId → counselorUid */
  assignments: Map<string, string>
  /** counselorUid → số hồ sơ được gán trong plan */
  perCounselor: Map<string, number>
  mode: SmartAssignMode
}

/**
 * Chọn tối đa `n` lead theo quy tắc.
 * - `table_order`: giữ thứ tự mảng đầu vào (thường = thứ tự bảng / lọc).
 * - `oldest`: `createdAt` sớm trước; thiếu timestamp xếp cuối.
 * - `random`: xáo một lần (Fisher–Yates); truyền `random` để test ổn định.
 */
export function pickLeadIdsForAssign(
  leads: AssignPickLeadMeta[],
  rule: AssignPickRule,
  n: number,
  opts?: { random?: () => number },
): string[] {
  const limit = Math.max(0, Math.floor(n))
  if (!limit || !leads.length) return []
  const uniq = new Map<string, AssignPickLeadMeta>()
  for (const row of leads) {
    const id = String(row.id ?? '').trim()
    if (!id || uniq.has(id)) continue
    uniq.set(id, { id, createdAtMs: row.createdAtMs })
  }
  const ordered = [...uniq.values()]
  if (rule === 'oldest') {
    ordered.sort((a, b) => {
      const am = a.createdAtMs != null && Number.isFinite(a.createdAtMs) ? a.createdAtMs : Number.POSITIVE_INFINITY
      const bm = b.createdAtMs != null && Number.isFinite(b.createdAtMs) ? b.createdAtMs : Number.POSITIVE_INFINITY
      if (am !== bm) return am - bm
      return a.id.localeCompare(b.id)
    })
  } else if (rule === 'random') {
    const rnd = opts?.random ?? Math.random
    for (let i = ordered.length - 1; i > 0; i -= 1) {
      const j = Math.floor(rnd() * (i + 1))
      const tmp = ordered[i]!
      ordered[i] = ordered[j]!
      ordered[j] = tmp
    }
  }
  return ordered.slice(0, Math.min(limit, ordered.length)).map((r) => r.id)
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
