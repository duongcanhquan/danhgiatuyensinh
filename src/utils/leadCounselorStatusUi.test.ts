import { describe, expect, it } from 'vitest'
import { leadMatchesCrmListVisibility } from './leadCounselorStatusUi'

describe('leadMatchesCrmListVisibility', () => {
  it('hides DEPOSIT_PAID when filter is ALL', () => {
    expect(leadMatchesCrmListVisibility({ status: 'DEPOSIT_PAID' }, 'ALL', false)).toBe(false)
    expect(leadMatchesCrmListVisibility({ status: 'NEW' }, 'ALL', false)).toBe(true)
  })

  it('shows DEPOSIT_PAID only when filtered or searching', () => {
    expect(leadMatchesCrmListVisibility({ status: 'DEPOSIT_PAID' }, 'DEPOSIT_PAID', false)).toBe(true)
    expect(leadMatchesCrmListVisibility({ status: 'NEW' }, 'DEPOSIT_PAID', false)).toBe(false)
    expect(leadMatchesCrmListVisibility({ status: 'DEPOSIT_PAID' }, 'ALL', true)).toBe(true)
  })
})
