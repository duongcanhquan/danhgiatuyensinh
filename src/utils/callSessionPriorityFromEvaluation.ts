import type { CallEvalPick, PriorityTag } from '../types'
import { maxPriorityTag } from './leadPriorityTag'

/**
 * Gợi ý nâng nhãn ưu tiên từ bảng đánh giá trực tiếp (chỉ nâng, không hạ).
 * `enrollment_signal` + `readiness` theo khung tuyển sinh / giai đoạn thay đổi hành vi.
 */
export function priorityTagFromCallEvaluation(picks: readonly CallEvalPick[]): PriorityTag | null {
  const signal = picks.find((p) => p.dimensionId === 'enrollment_signal')?.optionId
  const readiness = picks.find((p) => p.dimensionId === 'readiness')?.optionId

  if (signal === 'hot' || readiness === 'ready') return 'HOT'
  if (signal === 'warm' || readiness === 'preparing') return 'WARM'
  if (readiness === 'considering' && signal !== 'cold' && signal !== 'blocked') return 'WARM'
  return null
}

export function mergeCallEvalPriorityBoost(
  current: PriorityTag | undefined,
  picks: readonly CallEvalPick[],
): PriorityTag | null {
  const suggested = priorityTagFromCallEvaluation(picks)
  if (!suggested) return null
  if (!current) return suggested
  const merged = maxPriorityTag(current, suggested)
  return merged === current ? null : merged
}
