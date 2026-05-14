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

  it('PHONE_VN: đúng 10 số cộng điểm; thiếu/thừa/trống trừ điểm (khối)', () => {
    const profile: Pick<ScoringProfile, 'rules' | 'ruleBlocks' | 'thresholds'> = {
      rules: [],
      ruleBlocks: [
        {
          id: 'b-phone',
          category: 'demographics',
          label: 'SĐT',
          targetField: 'phone',
          maxWeight: 20,
          rows: [
            {
              id: 'ok',
              condition: 'PHONE_VN_10_DIGITS',
              value: '',
              allocationKind: 'absolute',
              allocationValue: 10,
            },
            {
              id: 'bad',
              condition: 'PHONE_VN_NOT_10_DIGITS',
              value: '',
              allocationKind: 'absolute',
              allocationValue: -8,
            },
          ],
        },
      ],
      thresholds: { hotMinScore: 80, warmMinScore: 50 },
    }
    expect(evaluateLead({ phone: '0912345678' }, profile).calculatedScore).toBe(10)
    expect(evaluateLead({ phone: '+84 912 345 678' }, profile).calculatedScore).toBe(10)
    expect(evaluateLead({ phone: '091234567' }, profile).calculatedScore).toBe(-8)
    expect(evaluateLead({ phone: '091234567890' }, profile).calculatedScore).toBe(-8)
    expect(evaluateLead({ phone: '' }, profile).calculatedScore).toBe(-8)
  })

  it('scoringSignals: cờ Hành vi / Rủi ro qua sig_* (+ và −)', () => {
    const profile: Pick<ScoringProfile, 'rules' | 'ruleBlocks' | 'thresholds'> = {
      rules: [],
      ruleBlocks: [
        {
          id: 'b-beh',
          category: 'behavior',
          label: 'Hỏi học phí',
          targetField: 'sig_askedTuition',
          maxWeight: 25,
          rows: [
            {
              id: 'r1',
              condition: 'IS_NOT_EMPTY',
              value: '',
              allocationKind: 'absolute',
              allocationValue: 25,
            },
          ],
        },
        {
          id: 'b-risk',
          category: 'risk',
          label: 'Silent',
          targetField: 'sig_silentOver7Days',
          maxWeight: 15,
          rows: [
            {
              id: 'r2',
              condition: 'IS_NOT_EMPTY',
              value: '',
              allocationKind: 'absolute',
              allocationValue: -15,
            },
          ],
        },
      ],
      thresholds: { hotMinScore: 80, warmMinScore: 50 },
    }
    const rec = {
      province: 'HN',
      sig_askedTuition: '1',
      sig_silentOver7Days: '',
    }
    expect(evaluateLead(rec, profile).calculatedScore).toBe(25)
    expect(evaluateLead({ ...rec, sig_silentOver7Days: '1' }, profile).calculatedScore).toBe(10)
  })

  it('PHONE_VN: quy tắc phẳng (rules) vẫn khớp', () => {
    const profile: Pick<ScoringProfile, 'rules' | 'ruleBlocks' | 'thresholds'> = {
      rules: [
        {
          id: 'p1',
          targetField: 'phone',
          condition: 'PHONE_VN_10_DIGITS',
          value: '',
          points: 5,
        },
      ],
      ruleBlocks: [],
      thresholds: { hotMinScore: 80, warmMinScore: 50 },
    }
    expect(evaluateLead({ phone: '84912345678' }, profile).calculatedScore).toBe(5)
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
