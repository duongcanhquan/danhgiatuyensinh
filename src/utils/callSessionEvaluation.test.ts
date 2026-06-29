import { describe, expect, it } from 'vitest'
import {
  buildPicksFromSelections,
  composeEvaluationCounselorNote,
  evaluationRecordFromPicks,
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

  it('lưu behaviorScore khi có picks có điểm', () => {
    const picks = buildPicksFromSelections(dims, {
      tvv_opening: ['greet_by_name'],
    })
    const rec = evaluationRecordFromPicks(picks)
    expect(rec.behaviorPointsDelta).toBe(3)
    expect(rec.behaviorScore).toBe(73)
  })
})
