import { describe, expect, it } from 'vitest'
import { counselorDashboardNeedsFullScope } from './counselorDashboardLeadScope'

const base = {
  myDayFilter: null as null | 'followup' | 'hot_sla',
  dueOnly: false,
  counselorFilterUid: '',
  canReadGlobalLeads: true,
  dateAxis: 'updated' as const,
  dateFrom: '',
  dateTo: '',
}

describe('counselorDashboardNeedsFullScope', () => {
  it('defaults to paged (no fullScope)', () => {
    expect(counselorDashboardNeedsFullScope(base)).toBe(false)
  })

  it('requires fullScope for follow-up / HOT SLA / due / unassigned', () => {
    expect(counselorDashboardNeedsFullScope({ ...base, myDayFilter: 'followup' })).toBe(true)
    expect(counselorDashboardNeedsFullScope({ ...base, myDayFilter: 'hot_sla' })).toBe(true)
    expect(counselorDashboardNeedsFullScope({ ...base, dueOnly: true })).toBe(true)
    expect(counselorDashboardNeedsFullScope({ ...base, counselorFilterUid: '__UNASSIGNED__' })).toBe(
      true,
    )
  })

  it('requires fullScope when assignee filter cannot go to server', () => {
    expect(
      counselorDashboardNeedsFullScope({
        ...base,
        counselorFilterUid: 'uid-a',
        canReadGlobalLeads: false,
      }),
    ).toBe(true)
    expect(
      counselorDashboardNeedsFullScope({
        ...base,
        counselorFilterUid: 'uid-a',
        canReadGlobalLeads: true,
      }),
    ).toBe(false)
  })

  it('requires fullScope for follow-up date axis with range', () => {
    expect(
      counselorDashboardNeedsFullScope({
        ...base,
        dateAxis: 'followup',
        dateFrom: '2026-01-01',
      }),
    ).toBe(true)
    expect(
      counselorDashboardNeedsFullScope({
        ...base,
        dateAxis: 'created',
        dateFrom: '2026-01-01',
      }),
    ).toBe(false)
  })
})
