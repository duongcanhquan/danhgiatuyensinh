import type { CallEvalPick } from '../types'

/** Ngưỡng tối thiểu để gọi LLM sau cuộc gọi (tiết kiệm token). */
export const CALL_AI_MIN_NOTE_CHARS = 40

export type CallAiEligibilityInput = {
  counselorNote: string
  evaluationPicks: readonly CallEvalPick[]
  freeNote?: string
}

export type CallAiEligibility = {
  ok: boolean
  reason: string
}

/**
 * Chỉ chạy AI khi có tín hiệu tư vấn đáng phân tích:
 * ghi chú ghép đủ dài HOẶC có ít nhất một lựa chọn đánh giá.
 */
export function evaluateCallAiEligibility(input: CallAiEligibilityInput): CallAiEligibility {
  const note = (input.counselorNote || '').trim()
  const free = (input.freeNote || '').trim()
  const combinedLen = Math.max(note.length, (note || free).length)
  const pickCount = input.evaluationPicks.filter((p) => String(p.optionId ?? p.optionLabel ?? '').trim()).length

  if (pickCount >= 1) {
    return { ok: true, reason: 'Có đánh giá trên bảng.' }
  }
  if (combinedLen >= CALL_AI_MIN_NOTE_CHARS) {
    return { ok: true, reason: 'Ghi chú đủ dài.' }
  }
  return {
    ok: false,
    reason: `Cần ghi chú ≥ ${CALL_AI_MIN_NOTE_CHARS} ký tự hoặc chọn ít nhất một mục đánh giá — đã lưu không gọi AI.`,
  }
}
