import { describe, expect, it } from 'vitest'
import type { ScoringProfile } from '../types'
import { evaluateLead, scoreToPriorityTag, sumBlockMaxWeights } from './scoring'

describe('scoreToPriorityTag', () => {
  it('maps fixed thresholds to HOT / WARM / COLD / LOSS', () => {
    expect(scoreToPriorityTag(90, { hot: 80, warm: 50 })).toBe('HOT')
    expect(scoreToPriorityTag(60, { hot: 80, warm: 50 })).toBe('WARM')
    expect(scoreToPriorityTag(40, { hot: 80, warm: 50 })).toBe('COLD')
    expect(scoreToPriorityTag(-1, { hot: 80, warm: 50 })).toBe('LOSS')
  })
})

describe('evaluateLead', () => {
  it('sums all matching rows in a block (cumulative)', () => {
    const profile: Pick<ScoringProfile, 'rules' | 'ruleBlocks' | 'thresholds'> = {
      rules: [],
      ruleBlocks: [
        {
          id: 'b1',
          category: 'demographics',
          label: 'province',
          targetField: 'province',
          maxWeight: 100,
          rows: [
            {
              id: 'r1',
              condition: 'EQUALS',
              value: 'Hà Nội',
              allocationKind: 'absolute',
              allocationValue: 40,
            },
            {
              id: 'r2',
              condition: 'CONTAINS',
              value: 'Nội',
              allocationKind: 'absolute',
              allocationValue: 50,
            },
          ],
        },
      ],
      thresholds: { hotMinScore: 80, warmMinScore: 50 },
    }
    const r = evaluateLead({ province: 'Hà Nội' }, profile)
    expect(r.calculatedScore).toBe(90)
    expect(r.priorityTag).toBe('HOT')
  })

  it('CONTAINS: nhiều từ khóa cách bởi dấu phẩy — khớp nếu chứa bất kỳ từ nào', () => {
    const profile: Pick<ScoringProfile, 'rules' | 'ruleBlocks' | 'thresholds'> = {
      rules: [],
      ruleBlocks: [
        {
          id: 'b1',
          category: 'demographics',
          label: 'province',
          targetField: 'province',
          maxWeight: 100,
          rows: [
            {
              id: 'r1',
              condition: 'CONTAINS',
              value: 'đà nẵng, hà nội, huế',
              allocationKind: 'absolute',
              allocationValue: 25,
            },
          ],
        },
      ],
      thresholds: { hotMinScore: 80, warmMinScore: 50 },
    }
    expect(evaluateLead({ province: 'Quận Đống Đa, Hà Nội' }, profile).calculatedScore).toBe(25)
    expect(evaluateLead({ province: 'Đà Nẵng city' }, profile).calculatedScore).toBe(25)
    expect(evaluateLead({ province: 'Khánh Hòa' }, profile).calculatedScore).toBe(0)
  })

  it('CONTAINS: từ khóa không dấu vẫn khớp lead có dấu (chuẩn hóa bỏ dấu)', () => {
    const profile: Pick<ScoringProfile, 'rules' | 'ruleBlocks' | 'thresholds'> = {
      rules: [],
      ruleBlocks: [
        {
          id: 'b1',
          category: 'demographics',
          label: 'province',
          targetField: 'province',
          maxWeight: 100,
          rows: [
            {
              id: 'r1',
              condition: 'CONTAINS',
              value: 'ha noi, da nang',
              allocationKind: 'absolute',
              allocationValue: 10,
            },
          ],
        },
      ],
      thresholds: { hotMinScore: 80, warmMinScore: 50 },
    }
    expect(evaluateLead({ province: 'TP. Hà Nội' }, profile).calculatedScore).toBe(10)
    expect(evaluateLead({ province: 'Đà Nẵng city' }, profile).calculatedScore).toBe(10)
  })

  it('falls back to flat rules when no blocks', () => {
    const profile: Pick<ScoringProfile, 'rules' | 'ruleBlocks' | 'thresholds'> = {
      rules: [
        {
          id: 'x',
          targetField: 'province',
          condition: 'CONTAINS',
          value: 'Nội',
          points: 70,
        },
      ],
      ruleBlocks: [],
      thresholds: { hotMinScore: 80, warmMinScore: 50 },
    }
    const r = evaluateLead({ province: 'Hà Nội' }, profile)
    expect(r.calculatedScore).toBe(70)
    expect(r.priorityTag).toBe('WARM')
  })

  it('allows negative cumulative score → LOSS', () => {
    const profile: Pick<ScoringProfile, 'rules' | 'ruleBlocks' | 'thresholds'> = {
      rules: [
        {
          id: 'n',
          targetField: 'province',
          condition: 'IS_NOT_EMPTY',
          value: '',
          points: -40,
        },
      ],
      ruleBlocks: [],
      thresholds: { hotMinScore: 80, warmMinScore: 50 },
    }
    const r = evaluateLead({ province: 'HN' }, profile)
    expect(r.calculatedScore).toBe(-40)
    expect(r.priorityTag).toBe('LOSS')
  })

  it('allows negative percent_of_max row points', () => {
    const profile: Pick<ScoringProfile, 'rules' | 'ruleBlocks' | 'thresholds'> = {
      rules: [],
      ruleBlocks: [
        {
          id: 'b1',
          category: 'demographics',
          label: 'test',
          targetField: 'province',
          maxWeight: 100,
          rows: [
            {
              id: 'r1',
              condition: 'EQUALS',
              value: 'HN',
              allocationKind: 'percent_of_max',
              allocationValue: -30,
            },
          ],
        },
      ],
      thresholds: { hotMinScore: 80, warmMinScore: 50 },
    }
    const r = evaluateLead({ province: 'HN' }, profile)
    expect(r.calculatedScore).toBe(-30)
    expect(r.priorityTag).toBe('LOSS')
  })

  it('uses profile thresholds for HOT/WARM when set', () => {
    const profile: Pick<ScoringProfile, 'rules' | 'ruleBlocks' | 'thresholds'> = {
      rules: [],
      ruleBlocks: [
        {
          id: 'b1',
          category: 'demographics',
          label: 'x',
          targetField: 'province',
          maxWeight: 100,
          rows: [
            {
              id: 'r1',
              condition: 'EQUALS',
              value: 'HN',
              allocationKind: 'absolute',
              allocationValue: 85,
            },
          ],
        },
      ],
      thresholds: { hotMinScore: 90, warmMinScore: 60 },
    }
    const r = evaluateLead({ province: 'HN' }, profile)
    expect(r.calculatedScore).toBe(85)
    expect(r.priorityTag).toBe('WARM')
    const hot = evaluateLead({ province: 'HN' }, { ...profile, ruleBlocks: profile.ruleBlocks!.map((b) => ({ ...b, rows: [{ ...b.rows[0]!, allocationValue: 95 }] })) })
    expect(hot.calculatedScore).toBe(95)
    expect(hot.priorityTag).toBe('HOT')
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
