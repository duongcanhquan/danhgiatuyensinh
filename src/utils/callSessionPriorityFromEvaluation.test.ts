import { describe, expect, it } from 'vitest'
import type { CallEvalPick } from '../types'
import { mergeCallEvalPriorityBoost, priorityTagFromCallEvaluation } from './callSessionPriorityFromEvaluation'

function pick(dim: string, opt: string): CallEvalPick {
  return { dimensionId: dim, dimensionLabel: dim, optionId: opt, optionLabel: opt }
}

describe('callSessionPriorityFromEvaluation', () => {
  it('hot signal → HOT', () => {
    expect(
      priorityTagFromCallEvaluation([pick('enrollment_signal', 'hot'), pick('readiness', 'considering')]),
    ).toBe('HOT')
  })

  it('ready readiness → HOT', () => {
    expect(priorityTagFromCallEvaluation([pick('readiness', 'ready')])).toBe('HOT')
  })

  it('warm signal → WARM', () => {
    expect(priorityTagFromCallEvaluation([pick('enrollment_signal', 'warm')])).toBe('WARM')
  })

  it('chỉ nâng boost khi cao hơn', () => {
    expect(mergeCallEvalPriorityBoost('HOT', [pick('enrollment_signal', 'warm')])).toBeNull()
    expect(mergeCallEvalPriorityBoost('COLD', [pick('enrollment_signal', 'hot')])).toBe('HOT')
  })
})
