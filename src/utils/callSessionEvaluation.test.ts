import { describe, expect, it } from 'vitest'
import {
  buildPicksFromSelections,
  composeEvaluationCounselorNote,
  getDefaultCallEvaluationConfig,
  validateEvaluationSelections,
} from './callSessionEvaluation'

describe('callSessionEvaluation', () => {
  const dims = getDefaultCallEvaluationConfig()

  it('bắt buộc các chiều required', () => {
    expect(validateEvaluationSelections(dims, {}).ok).toBe(false)
    const sel = {
      affect: ['positive_open'],
      readiness: ['considering'],
      decision_role: ['parent'],
      enrollment_signal: ['warm'],
    }
    expect(validateEvaluationSelections(dims, sel).ok).toBe(true)
  })

  it('ghép ghi chú và picks', () => {
    const picks = buildPicksFromSelections(dims, {
      affect: ['anxious'],
      topics: ['tuition', 'major'],
    })
    const note = composeEvaluationCounselorNote(picks, '')
    expect(note).toContain('Thái độ')
    expect(note).toContain('Học phí')
    expect(picks).toHaveLength(3)
  })
})
