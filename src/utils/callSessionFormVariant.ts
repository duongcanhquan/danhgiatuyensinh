import type { CallEvalDimension, LeadWorkMode } from '../types'
import { isScoringDimension } from './callSessionBehaviorCatalog'

export type CallFormVariant = 'short' | 'full'

/** short = lọc nhanh / sàng data; full = chăm & chốt hoặc thiếu mode (compat). */
export function callFormVariantForWorkMode(mode: LeadWorkMode | undefined): CallFormVariant {
  if (mode === 'volume_filter' || mode === 'score_queue') return 'short'
  return 'full'
}

/**
 * Lọc chiều đánh giá theo variant form gọi.
 * Luôn bỏ `enrollment_signal` khỏi UI/validation (giữ nguyên defaults/Firestore).
 * short: chỉ giữ hành vi TVV (nếu có), required=false — disposition xử lý riêng.
 * full: giữ chiều khách (affect/readiness/…) trừ enrollment_signal.
 */
export function filterDimensionsForCallForm(
  dimensions: readonly CallEvalDimension[],
  variant: CallFormVariant,
): CallEvalDimension[] {
  const withoutSignal = dimensions.filter((d) => d.id !== 'enrollment_signal')
  if (variant === 'short') {
    return withoutSignal
      .filter((d) => isScoringDimension(d))
      .map((d) => ({ ...d, required: false, options: d.options.map((o) => ({ ...o })) }))
  }
  return withoutSignal.map((d) => ({
    ...d,
    options: d.options.map((o) => ({ ...o })),
  }))
}
