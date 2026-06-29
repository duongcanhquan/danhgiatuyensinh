import { describe, expect, it } from 'vitest'
import { serverFiltersForTagDistribution } from './useLeads'

describe('serverFiltersForTagDistribution', () => {
  it('removes priorityTag and priorityTagsIn', () => {
    const out = serverFiltersForTagDistribution({
      priorityTag: 'HOT',
      priorityTagsIn: ['HOT', 'WARM'],
      province: 'HN',
    })
    expect(out).toEqual({ province: 'HN' })
  })

  it('returns undefined when only priority filters existed', () => {
    expect(serverFiltersForTagDistribution({ priorityTag: 'WARM' })).toBeUndefined()
    expect(serverFiltersForTagDistribution(undefined)).toBeUndefined()
  })
})
