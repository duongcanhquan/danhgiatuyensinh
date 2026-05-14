import { describe, expect, it } from 'vitest'
import type { ScoringProfile, ScoringRule } from '../types'
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

  it('CONTAINS_ABBR_NORM: khớp viết tắt chữ đầu từng từ (không dấu)', () => {
    const profile: Pick<ScoringProfile, 'rules' | 'ruleBlocks' | 'thresholds'> = {
      rules: [],
      ruleBlocks: [
        {
          id: 'b1',
          category: 'academic',
          label: 'major',
          targetField: 'majorInterest',
          maxWeight: 100,
          rows: [
            {
              id: 'r1',
              condition: 'CONTAINS_ABBR_NORM',
              value: 'cntt',
              allocationKind: 'absolute',
              allocationValue: 15,
            },
          ],
        },
      ],
      thresholds: { hotMinScore: 80, warmMinScore: 50 },
    }
    expect(evaluateLead({ majorInterest: 'Công nghệ thông tin' }, profile).calculatedScore).toBe(15)
    expect(evaluateLead({ majorInterest: 'Kế toán' }, profile).calculatedScore).toBe(0)
  })

  it('CONTAINS_ABBR_NORM: khớp chuỗi sát không khoảng trắng sau khi bỏ dấu', () => {
    const profile: Pick<ScoringProfile, 'rules' | 'ruleBlocks' | 'thresholds'> = {
      rules: [],
      ruleBlocks: [
        {
          id: 'b1',
          category: 'academic',
          label: 'school',
          targetField: 'highSchool',
          maxWeight: 100,
          rows: [
            {
              id: 'r1',
              condition: 'CONTAINS_ABBR_NORM',
              value: 'thpt',
              allocationKind: 'absolute',
              allocationValue: 8,
            },
          ],
        },
      ],
      thresholds: { hotMinScore: 80, warmMinScore: 50 },
    }
    expect(evaluateLead({ highSchool: 'Trường THPT Chuyên Hà Nội' }, profile).calculatedScore).toBe(8)
  })

  it('CONTAINS_ALL_NORM: tất cả từ khóa phải có (không dấu)', () => {
    const profile: Pick<ScoringProfile, 'rules' | 'ruleBlocks' | 'thresholds'> = {
      rules: [],
      ruleBlocks: [
        {
          id: 'b1',
          category: 'demographics',
          label: 'addr',
          targetField: 'address',
          maxWeight: 100,
          rows: [
            {
              id: 'r1',
              condition: 'CONTAINS_ALL_NORM',
              value: 'so 12, ha noi',
              allocationKind: 'absolute',
              allocationValue: 20,
            },
          ],
        },
      ],
      thresholds: { hotMinScore: 80, warmMinScore: 50 },
    }
    expect(evaluateLead({ address: 'Số 12 ngõ nhỏ Hà Nội' }, profile).calculatedScore).toBe(20)
    expect(evaluateLead({ address: 'Hà Nội không có số' }, profile).calculatedScore).toBe(0)
  })

  it('NOT_CONTAINS_NORM: loại trừ từ khóa', () => {
    const profile: Pick<ScoringProfile, 'rules' | 'ruleBlocks' | 'thresholds'> = {
      rules: [],
      ruleBlocks: [
        {
          id: 'b1',
          category: 'psychographics',
          label: 'desc',
          targetField: 'description',
          maxWeight: 100,
          rows: [
            {
              id: 'r1',
              condition: 'NOT_CONTAINS_NORM',
              value: 'spam, quang cao',
              allocationKind: 'absolute',
              allocationValue: 5,
            },
          ],
        },
      ],
      thresholds: { hotMinScore: 80, warmMinScore: 50 },
    }
    expect(evaluateLead({ description: 'Học sinh năng động' }, profile).calculatedScore).toBe(5)
    expect(evaluateLead({ description: 'Đây là SPAM tin' }, profile).calculatedScore).toBe(0)
  })

  it('HAS_DIGIT: có chữ số trong chuỗi', () => {
    const profile: Pick<ScoringProfile, 'rules' | 'ruleBlocks' | 'thresholds'> = {
      rules: [],
      ruleBlocks: [
        {
          id: 'b1',
          category: 'demographics',
          label: 'addr',
          targetField: 'address',
          maxWeight: 100,
          rows: [
            {
              id: 'r1',
              condition: 'HAS_DIGIT',
              value: '',
              allocationKind: 'absolute',
              allocationValue: 3,
            },
          ],
        },
      ],
      thresholds: { hotMinScore: 80, warmMinScore: 50 },
    }
    expect(evaluateLead({ address: 'Ngõ 5 — tầng 2' }, profile).calculatedScore).toBe(3)
    expect(evaluateLead({ address: 'Không số nhà' }, profile).calculatedScore).toBe(0)
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

  it('IN_LIST matches province via master synonyms when buckets include regionEntries', () => {
    const profile = {
      rules: [] as ScoringRule[],
      ruleBlocks: [
        {
          id: 'b',
          category: 'demographics' as const,
          label: 't',
          targetField: 'province',
          maxWeight: 10,
          rows: [
            {
              id: 'r',
              condition: 'IN_LIST' as const,
              value: ['Điện Biên'],
              allocationKind: 'absolute' as const,
              allocationValue: 10,
            },
          ],
        },
      ],
      thresholds: { hotMinScore: 80, warmMinScore: 50 },
    }
    const buckets = {
      regionLabels: [],
      highSchoolLabels: [],
      majorLabels: [],
      regionEntries: [{ id: 'db', label: 'Điện Biên', synonyms: ['Dien Bien', 'dien bien'] }],
    }
    expect(evaluateLead({ province: 'dien bien' }, profile, buckets).calculatedScore).toBe(10)
  })

  it('IN_LIST matches academicLevel numeric between via entriesByCatalogId + catalogs', () => {
    const profile = {
      rules: [] as ScoringRule[],
      ruleBlocks: [
        {
          id: 'b',
          category: 'academic' as const,
          label: 'band',
          targetField: 'academicLevel',
          maxWeight: 10,
          rows: [
            {
              id: 'r',
              condition: 'IN_LIST' as const,
              value: ['Nhóm 8–10'],
              allocationKind: 'absolute' as const,
              allocationValue: 10,
            },
          ],
        },
      ],
      thresholds: { hotMinScore: 80, warmMinScore: 50 },
    }
    const buckets = {
      regionLabels: [],
      highSchoolLabels: [],
      majorLabels: [],
      academicPerformanceLabels: [],
      catalogs: [
        {
          id: 'academic_performance',
          label: 'Học lực',
          order: 70,
          valueKind: 'number' as const,
          defaultMatchMode: 'between' as const,
        },
      ],
      entriesByCatalogId: {
        academic_performance: [
          { id: 'b1', label: 'Nhóm 8–10', matchMode: 'between', numericMin: 8, numericMax: 10, isActive: true },
        ],
      },
    }
    expect(evaluateLead({ academicLevel: '9,2' }, profile, buckets).calculatedScore).toBe(10)
    expect(evaluateLead({ academicLevel: '7' }, profile, buckets).calculatedScore).toBe(0)
  })

  it('IN_LIST fuzzy_contains on province when catalog default is fuzzy', () => {
    const profile = {
      rules: [] as ScoringRule[],
      ruleBlocks: [
        {
          id: 'b',
          category: 'demographics' as const,
          label: 't',
          targetField: 'province',
          maxWeight: 10,
          rows: [
            {
              id: 'r',
              condition: 'IN_LIST' as const,
              value: ['Điện Biên'],
              allocationKind: 'absolute' as const,
              allocationValue: 10,
            },
          ],
        },
      ],
      thresholds: { hotMinScore: 80, warmMinScore: 50 },
    }
    const buckets = {
      regionLabels: [],
      highSchoolLabels: [],
      majorLabels: [],
      academicPerformanceLabels: [],
      catalogs: [
        {
          id: 'regions',
          label: 'Vùng',
          order: 10,
          valueKind: 'text' as const,
          defaultMatchMode: 'fuzzy_contains' as const,
        },
      ],
      entriesByCatalogId: {
        regions: [{ id: 'db', label: 'Điện Biên', isActive: true }],
      },
    }
    expect(evaluateLead({ province: 'Hộ khẩu tỉnh Điện Biên' }, profile, buckets).calculatedScore).toBe(10)
  })

  it('majorTrainingAlignment and schoolTypeKey augment scoring when buckets passed', () => {
    const profile = {
      rules: [] as ScoringRule[],
      ruleBlocks: [
        {
          id: 'm',
          category: 'academic' as const,
          label: 'align',
          targetField: 'majorTrainingAlignment',
          maxWeight: 10,
          rows: [
            {
              id: 'a',
              condition: 'EQUALS' as const,
              value: 'outside_or_unknown',
              allocationKind: 'absolute' as const,
              allocationValue: -5,
            },
          ],
        },
        {
          id: 's',
          category: 'academic' as const,
          label: 'stype',
          targetField: 'schoolTypeKey',
          maxWeight: 10,
          rows: [
            {
              id: 'k',
              condition: 'EQUALS' as const,
              value: 'LIEN_KET',
              allocationKind: 'absolute' as const,
              allocationValue: 7,
            },
          ],
        },
      ],
      thresholds: { hotMinScore: 80, warmMinScore: 50 },
    }
    const buckets = {
      regionLabels: [],
      highSchoolLabels: [],
      majorLabels: ['Công nghệ thông tin'],
      majorEntries: [],
    }
    const lead = { majorInterest: 'chưa biết ngành', schoolType: 'liên kết' }
    const r = evaluateLead(lead, profile, buckets)
    expect(r.calculatedScore).toBe(2)
  })

  it('IN_LIST uses financial_profiles when targetField is financialStatus', () => {
    const profile = {
      rules: [] as ScoringRule[],
      ruleBlocks: [
        {
          id: 'b',
          category: 'demographics' as const,
          label: 'fin',
          targetField: 'financialStatus',
          maxWeight: 10,
          rows: [
            {
              id: 'r',
              condition: 'IN_LIST' as const,
              value: ['Khá'],
              allocationKind: 'absolute' as const,
              allocationValue: 10,
            },
          ],
        },
      ],
      thresholds: { hotMinScore: 80, warmMinScore: 50 },
    }
    const buckets = {
      regionLabels: [],
      highSchoolLabels: [],
      majorLabels: [],
      academicPerformanceLabels: [],
      catalogs: [{ id: 'financial_profiles', label: 'TC', order: 60, valueKind: 'text' as const }],
      entriesByCatalogId: {
        financial_profiles: [{ id: '1', label: 'Khá', isActive: true }],
      },
    }
    expect(evaluateLead({ financialStatus: 'Khá' }, profile, buckets).calculatedScore).toBe(10)
  })

  it('IN_LIST resolves catalog when targetField equals custom masterData catalog id', () => {
    const profile = {
      rules: [] as ScoringRule[],
      ruleBlocks: [
        {
          id: 'b',
          category: 'demographics' as const,
          label: 'c',
          targetField: 'custom_volunteer_tier',
          maxWeight: 5,
          rows: [
            {
              id: 'r',
              condition: 'IN_LIST' as const,
              value: ['A'],
              allocationKind: 'absolute' as const,
              allocationValue: 5,
            },
          ],
        },
      ],
      thresholds: { hotMinScore: 80, warmMinScore: 50 },
    }
    const buckets = {
      regionLabels: [],
      highSchoolLabels: [],
      majorLabels: [],
      catalogs: [{ id: 'custom_volunteer_tier', label: 'Tầng', order: 900 }],
      entriesByCatalogId: {
        custom_volunteer_tier: [{ id: 'x', label: 'A', isActive: true }],
      },
    }
    expect(evaluateLead({ custom_volunteer_tier: 'A' }, profile, buckets).calculatedScore).toBe(5)
  })

  it('merges school TVV signal defs over profile on id clash', () => {
    const profile = {
      rules: [],
      ruleBlocks: [],
      customScoringSignals: [{ id: 'sig1', label: 'Profile', group: 'behavior' as const, points: 3 }],
      thresholds: { hotMinScore: 80, warmMinScore: 50 },
    }
    const school = [{ id: 'sig1', label: 'School', group: 'behavior' as const, points: 10 }]
    const r = evaluateLead({ scoringCustomSignals: { sig1: true } }, profile, undefined, school)
    expect(r.calculatedScore).toBe(10)
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
