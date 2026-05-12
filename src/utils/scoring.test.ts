import { describe, expect, it } from 'vitest'
import type { ScoringProfile } from '../types'
import { evaluateLead, scoreToPriorityTag, sumBlockMaxWeights } from './scoring'

describe('scoreToPriorityTag', () => {
  it('maps thresholds to HOT / WARM / COLD', () => {
    expect(scoreToPriorityTag(90, { hot: 80, warm: 50 })).toBe('HOT')
    expect(scoreToPriorityTag(60, { hot: 80, warm: 50 })).toBe('WARM')
    expect(scoreToPriorityTag(40, { hot: 80, warm: 50 })).toBe('COLD')
  })
})

describe('evaluateLead', () => {
  it('uses ruleBlocks when present', () => {
    const profile: Pick<ScoringProfile, 'rules' | 'ruleBlocks' | 'thresholds'> = {
      rules: [],
      ruleBlocks: [
        {
          id: 'b1',
          category: 'demographics',
          label: 'region',
          targetField: 'region',
          maxWeight: 100,
          rows: [
            {
              id: 'r1',
              condition: 'EQUALS',
              value: 'Hà Nội',
              allocationKind: 'absolute',
              allocationValue: 85,
            },
          ],
        },
      ],
      thresholds: { hotMinScore: 80, warmMinScore: 50 },
    }
    const r = evaluateLead({ region: 'Hà Nội' }, profile)
    expect(r.calculatedScore).toBe(85)
    expect(r.priorityTag).toBe('HOT')
  })

  it('falls back to flat rules when no blocks', () => {
    const profile: Pick<ScoringProfile, 'rules' | 'ruleBlocks' | 'thresholds'> = {
      rules: [
        {
          id: 'x',
          targetField: 'region',
          condition: 'CONTAINS',
          value: 'Nội',
          points: 70,
        },
      ],
      ruleBlocks: [],
      thresholds: { hotMinScore: 80, warmMinScore: 50 },
    }
    const r = evaluateLead({ region: 'Hà Nội' }, profile)
    expect(r.calculatedScore).toBe(70)
    expect(r.priorityTag).toBe('WARM')
  })

  it('returns safe defaults when nothing matches', () => {
    const r = evaluateLead(
      {},
      { rules: [], ruleBlocks: undefined, thresholds: { hotMinScore: 80, warmMinScore: 50 } },
    )
    expect(r.calculatedScore).toBe(0)
    expect(r.priorityTag).toBe('COLD')
  })
})

describe('sumBlockMaxWeights', () => {
  it('sums block caps', () => {
    expect(
      sumBlockMaxWeights([
        { id: 'a', category: 'demographics', label: 'a', targetField: 'x', maxWeight: 40, rows: [] },
        { id: 'b', category: 'demographics', label: 'b', targetField: 'y', maxWeight: 35, rows: [] },
      ]),
    ).toBe(75)
  })
})
