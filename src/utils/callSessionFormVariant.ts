import type { CallEvalDimension, LeadWorkMode } from '../types'

export type CallFormVariant = 'short' | 'full'

/** short = lọc nhanh / sàng data; full = chăm & chốt hoặc thiếu mode (compat). */
export function callFormVariantForWorkMode(mode: LeadWorkMode | undefined): CallFormVariant {
  if (mode === 'volume_filter' || mode === 'score_queue') return 'short'
  return 'full'
}

/**
 * Lọc chiều đánh giá theo variant form gọi.
 * Luôn bỏ `enrollment_signal` khỏi UI/validation (giữ nguyên defaults/Firestore).
 * short: giữ đủ chiều khách + hành vi nhưng **không bắt buộc** — phản hồi nhanh (disposition) là chính;
 *        TVV mở bảng khi gọi còn ngần ngại / cần ghi nhiều tín hiệu.
 * full: giữ chiều khách (affect/readiness/…) trừ enrollment_signal (required theo config).
 */
export function filterDimensionsForCallForm(
  dimensions: readonly CallEvalDimension[],
  variant: CallFormVariant,
): CallEvalDimension[] {
  const withoutSignal = dimensions.filter((d) => d.id !== 'enrollment_signal')
  if (variant === 'short') {
    return withoutSignal.map((d) => ({
      ...d,
      required: false,
      options: d.options.map((o) => ({ ...o })),
    }))
  }
  return withoutSignal.map((d) => ({
    ...d,
    options: d.options.map((o) => ({ ...o })),
  }))
}
