import { describe, expect, it } from 'vitest'
import type { ConsultingPlaybook, Lead } from '../types'
import { playbookConditionsMatch, playbookKeywordsMatch, playbooksMatchingLead } from './playbookMatch'

function baseLead(overrides: Partial<Lead> = {}): Lead {
  return {
    id: 'l1',
    fullName: 'Nguyễn A',
    province: 'Hà Nội',
    educationLevel: 'Công nghệ thông tin',
    majorInterest: '',
    description: 'Quan tâm học bổng',
    priorityTag: 'HOT',
    pipelineStatus: 'new',
    status: 'new',
    calculatedScore: 0,
    ...overrides,
  } as Lead
}

function pb(partial: Partial<ConsultingPlaybook> & Pick<ConsultingPlaybook, 'id' | 'title'>): ConsultingPlaybook {
  return {
    isActive: true,
    priority: 10,
    triggerConditions: [],
    strategy: '',
    objectionHandling: [],
    createdAt: {} as ConsultingPlaybook['createdAt'],
    updatedAt: {} as ConsultingPlaybook['updatedAt'],
    ...partial,
  }
}

describe('playbookConditionsMatch', () => {
  it('returns false when no conditions', () => {
    expect(playbookConditionsMatch(baseLead(), [])).toBe(false)
  })

  it('requires all AND conditions', () => {
    const lead = baseLead()
    const ok = playbookConditionsMatch(lead, [
      { field: 'province', operator: 'EQUALS', value: 'Hà Nội' },
      { field: 'priorityTag', operator: 'EQUALS', value: 'HOT' },
    ])
    expect(ok).toBe(true)
    const fail = playbookConditionsMatch(lead, [
      { field: 'province', operator: 'EQUALS', value: 'Hà Nội' },
      { field: 'priorityTag', operator: 'EQUALS', value: 'COLD' },
    ])
    expect(fail).toBe(false)
  })
})

describe('playbookKeywordsMatch', () => {
  it('matches keyword in lead text blob', () => {
    expect(playbookKeywordsMatch(baseLead(), ['học bổng'])).toBe(true)
    expect(playbookKeywordsMatch(baseLead(), ['đà nẵng'])).toBe(false)
  })
})

describe('playbooksMatchingLead', () => {
  it('does not match playbook with empty rules', () => {
    const results = playbooksMatchingLead(baseLead(), [pb({ id: 'x', title: 'Empty' })])
    expect(results).toHaveLength(0)
  })

  it('matches by keywords without conditions', () => {
    const results = playbooksMatchingLead(baseLead(), [
      pb({ id: 'k', title: 'KW', matchKeywords: ['công nghệ'] }),
    ])
    expect(results).toHaveLength(1)
    expect(results[0]?.kind).toBe('keywords')
  })

  it('matches matchAllLeads', () => {
    const results = playbooksMatchingLead(baseLead(), [
      pb({ id: 'a', title: 'All', matchAllLeads: true }),
    ])
    expect(results[0]?.kind).toBe('all')
  })

  it('prefers conditions kind over keywords when both apply', () => {
    const results = playbooksMatchingLead(baseLead(), [
      pb({
        id: 'both',
        title: 'Both',
        priority: 5,
        triggerConditions: [{ field: 'priorityTag', operator: 'EQUALS', value: 'HOT' }],
        matchKeywords: ['học bổng'],
      }),
    ])
    expect(results[0]?.kind).toBe('conditions')
  })
})
