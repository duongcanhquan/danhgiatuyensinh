import { describe, expect, it } from 'vitest'
import type { Lead } from '../types'
import { leadMatchesCrmListVisibility } from './leadCounselorStatusUi'

describe('leadMatchesCrmListVisibility', () => {
  it('hides ENROLLED when filter is ALL', () => {
    expect(leadMatchesCrmListVisibility({ status: 'ENROLLED' }, 'ALL', false)).toBe(false)
  })

  it('hides ĐÃ HOÀN THIỆN even if CRM chưa ENROLLED', () => {
    const lead = {
      status: 'DEPOSIT_PAID',
      finance: { enrollmentStatus: 'ĐÃ HOÀN THIỆN' },
    } as Lead
    expect(leadMatchesCrmListVisibility(lead, 'ALL', false)).toBe(false)
  })

  it('shows DEPOSIT_PAID / chỉ cọc on ALL', () => {
    expect(
      leadMatchesCrmListVisibility(
        { status: 'DEPOSIT_PAID', finance: { enrollmentStatus: 'CỌC THÀNH CÔNG' } } as Lead,
        'ALL',
        false,
      ),
    ).toBe(true)
  })

  it('shows handover when lọc Thu phí = Đã hoàn thiện', () => {
    const lead = {
      status: 'DEPOSIT_PAID',
      finance: { enrollmentStatus: 'ĐÃ HOÀN THIỆN' },
    } as Lead
    expect(leadMatchesCrmListVisibility(lead, 'ALL', false, 'DA_HOAN_THIEN')).toBe(true)
  })

  it('shows ENROLLED only when filtered or searching', () => {
    expect(leadMatchesCrmListVisibility({ status: 'ENROLLED' }, 'ENROLLED', false)).toBe(true)
    expect(leadMatchesCrmListVisibility({ status: 'NEW' }, 'ENROLLED', false)).toBe(false)
    expect(leadMatchesCrmListVisibility({ status: 'ENROLLED' }, 'ALL', true)).toBe(true)
  })
})
