import { describe, expect, it } from 'vitest'
import { emptyKpiSummary } from './kpiMap'
import { mergeMonthlyKpiWithPeriodSummaries } from './kpiMonthlyMerge'
import type { CounselorMonthlyKpi } from '../types'

describe('mergeMonthlyKpiWithPeriodSummaries', () => {
  it('bumps stale monthly call counts and leadCham from live period', () => {
    const monthly: CounselorMonthlyKpi[] = [
      {
        id: 'u1',
        month: '2026-08',
        counselorUid: 'u1',
        teamLeadUid: null,
        totalCalls: 0,
        validCalls: 0,
        connectedCalls: 0,
        talkSeconds: 0,
        validTalkSeconds: 0,
        uniqueLeadsCalled: 0,
        crmActions: 0,
        depositPaidCount: 2,
        tuitionPaidCount: 0,
        approvedRevenueVnd: 1_000_000,
        fullNeCount: 0,
        warmNew: 0,
        hotNew: 0,
        newToInterested: 0,
        toDeposit: 0,
        toEnrolled: 0,
        leadCham: 0,
        lpxtCount: 0,
      },
    ]
    const period = [
      { ...emptyKpiSummary('u1'), totalCalls: 12, validCalls: 5, teamLeadUid: 'tl1', leadCham: 3, lpxtCount: 1 },
    ]
    const merged = mergeMonthlyKpiWithPeriodSummaries('2026-08', monthly, period)
    expect(merged).toHaveLength(1)
    expect(merged[0]).toMatchObject({
      totalCalls: 12,
      validCalls: 5,
      depositPaidCount: 2,
      approvedRevenueVnd: 1_000_000,
      teamLeadUid: 'tl1',
      leadCham: 3,
      lpxtCount: 1,
    })
  })

  it('creates monthly row when only live calls exist', () => {
    const period = [{ ...emptyKpiSummary('u2'), totalCalls: 4, validCalls: 2 }]
    const merged = mergeMonthlyKpiWithPeriodSummaries('2026-08', [], period)
    expect(merged[0]).toMatchObject({ counselorUid: 'u2', totalCalls: 4, validCalls: 2, month: '2026-08' })
  })
})
