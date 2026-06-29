import { describe, expect, it } from 'vitest'
import type { ScoringProfile } from '../types'
import { computeLeadScoringResult, rescoreLeadList } from './bulkLeadRescore'

describe('bulkLeadRescore', () => {
  const profile: Pick<ScoringProfile, 'rules' | 'ruleBlocks' | 'thresholds'> = {
    rules: [],
    ruleBlocks: [
      {
        id: 'b',
        category: 'academic',
        label: 'school',
        targetField: 'schoolTypeKey',
        maxWeight: 40,
        rows: [
          {
            id: 'r',
            condition: 'CONTAINS',
            value: 'THPT Chương Mỹ B',
            allocationKind: 'absolute',
            allocationValue: 40,
          },
        ],
      },
    ],
    thresholds: { hotMinScore: 81, warmMinScore: 51 },
  }

  it('phát hiện thay đổi điểm khi hồ sơ có highSchool khớp rule (kèm điểm thông tin)', () => {
    const lead = {
      id: 'l1',
      calculatedScore: 5,
      priorityTag: 'COLD' as const,
      highSchool: 'THPT Chương Mỹ B',
      schoolType: '',
    }
    const r = computeLeadScoringResult(lead as never, profile as ScoringProfile)
    expect(r.calculatedScore).toBeGreaterThan(40)
    expect(r.changed).toBe(true)
  })

  it('rescoreLeadList giữ nguyên hồ sơ đã khớp điểm tính lại', () => {
    const lead = {
      id: 'l2',
      calculatedScore: 5,
      priorityTag: 'COLD' as const,
      highSchool: 'THPT Chương Mỹ B',
      schoolType: '',
    }
    const expected = computeLeadScoringResult(lead as never, profile as ScoringProfile)
    const matched = {
      ...lead,
      calculatedScore: expected.calculatedScore,
      priorityTag: expected.priorityTag,
    }
    const [r] = rescoreLeadList([matched as never], profile as ScoringProfile)
    expect(r?.changed).toBe(false)
  })
})
