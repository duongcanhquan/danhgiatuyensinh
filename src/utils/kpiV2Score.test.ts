import { describe, expect, it } from 'vitest'
import { getDefaultKpiV2Config } from './kpiV2Config'
import { computeKpiV2MonthlyScore } from './kpiV2Score'

describe('computeKpiV2MonthlyScore', () => {
  it('weights counselor metrics toward total 0–100', () => {
    const cfg = getDefaultKpiV2Config()
    const month = '2026-05'
    const result = computeKpiV2MonthlyScore(
      {
        validCalls: 40,
        leadCham: 25,
        warmNew: 3,
        hotNew: 1,
        depositPaidCount: 1,
        toEnrolled: 0,
        fullNeCount: 0,
      },
      'counselor',
      cfg,
      month,
    )
    expect(result.total).toBeGreaterThanOrEqual(0)
    expect(result.total).toBeLessThanOrEqual(100)
    expect(result.validCalls).toBeGreaterThan(0)
  })
})
