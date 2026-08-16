import { describe, expect, it } from 'vitest'
import { CALL_AI_MIN_NOTE_CHARS, evaluateCallAiEligibility } from './callSessionAiEligibility'

describe('evaluateCallAiEligibility', () => {
  it('allows when evaluation pick present', () => {
    const r = evaluateCallAiEligibility({
      counselorNote: 'ngắn',
      evaluationPicks: [
        {
          dimensionId: 'd1',
          dimensionLabel: 'Thái độ',
          optionId: 'o1',
          optionLabel: 'Tốt',
        },
      ],
    })
    expect(r.ok).toBe(true)
  })

  it('allows when note long enough', () => {
    const note = 'x'.repeat(CALL_AI_MIN_NOTE_CHARS)
    expect(evaluateCallAiEligibility({ counselorNote: note, evaluationPicks: [] }).ok).toBe(true)
  })

  it('blocks short note without picks', () => {
    const r = evaluateCallAiEligibility({
      counselorNote: 'ok',
      freeNote: 'hi',
      evaluationPicks: [],
    })
    expect(r.ok).toBe(false)
    expect(r.reason).toMatch(/không gọi AI/i)
  })
})
