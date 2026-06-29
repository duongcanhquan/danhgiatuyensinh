import type { Lead, PriorityTag } from '../types'

export const PRIORITY_TAG_RANK: Record<PriorityTag, number> = {
  HOT: 4,
  WARM: 3,
  COLD: 2,
  LOSS: 1,
}

export function maxPriorityTag(a: PriorityTag, b: PriorityTag): PriorityTag {
  return PRIORITY_TAG_RANK[a] >= PRIORITY_TAG_RANK[b] ? a : b
}

/** Nhãn hiển thị = max(điểm profile, nhãn lưu trên hồ sơ, boost sau cuộc gọi). */
export function resolveLeadDisplayPriorityTag(
  lead: Pick<Lead, 'priorityTag' | 'callEvalPriorityBoost'>,
  scoredTag?: PriorityTag,
): PriorityTag {
  const base = scoredTag ?? lead.priorityTag
  if (lead.callEvalPriorityBoost) return maxPriorityTag(base, lead.callEvalPriorityBoost)
  return base
}
