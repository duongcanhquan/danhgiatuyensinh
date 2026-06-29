import { describe, expect, it } from 'vitest'
import { getCounselorBehaviorDimensions } from './callSessionBehaviorCatalog'
import {
  behaviorScoreFromDelta,
  behaviorScoreFromSelections,
  sumBehaviorPointsFromSelections,
} from './callSessionBehaviorScore'
import { getDefaultCallEvaluationConfig } from './callSessionEvaluation'

describe('callSessionBehaviorScore', () => {
  const dims = getDefaultCallEvaluationConfig()

  it('cộng điểm tích cực và trừ tiêu cực', () => {
    const sel = {
      tvv_opening: ['greet_by_name', 'intro_self_school'],
      tvv_violations: ['interrupt'],
    }
    const delta = sumBehaviorPointsFromSelections(dims, sel)
    expect(delta).toBe(3 + 3 - 5)
    const { behaviorScore } = behaviorScoreFromSelections(dims, sel)
    expect(behaviorScore).toBe(70 + delta)
  })

  it('clamp 0–100', () => {
    expect(behaviorScoreFromDelta(50).behaviorScore).toBe(100)
    expect(behaviorScoreFromDelta(-80).behaviorScore).toBe(0)
  })

  it('catalog có đủ nhóm hành vi TVV', () => {
    const groups = getCounselorBehaviorDimensions().map((d) => d.scoringGroup)
    expect(groups).toContain('positive')
    expect(groups).toContain('negative')
    expect(groups.filter((g) => g === 'positive').length).toBeGreaterThanOrEqual(3)
    expect(getCounselorBehaviorDimensions().find((d) => d.id === 'tvv_violations')?.options.length).toBeGreaterThanOrEqual(
      15,
    )
  })
})
