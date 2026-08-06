import { describe, expect, it } from 'vitest'
import { buildMonthlyKpiCsv, buildPeriodKpiCsv } from './kpiCsvExport'

describe('kpiCsvExport', () => {
  it('builds monthly rows', () => {
    const csv = buildMonthlyKpiCsv(
      [
        {
          rank: 1,
          name: 'An',
          teamName: 'Nhóm 1',
          compositeScore: 88,
          tierLabel: 'Vàng',
          validCalls: 10,
          depositPaidCount: 2,
          approvedRevenueVnd: 5_000_000,
          fullNeCount: 1,
        },
      ],
      '2026-07',
    )
    expect(csv.split('\n')).toHaveLength(2)
    expect(csv).toContain('An')
    expect(csv).toContain('2026-07')
  })

  it('builds period rows', () => {
    const csv = buildPeriodKpiCsv(
      [{ name: 'An', teamName: '—', validCalls: 3, totalCalls: 5, depositPaidCount: 0, approvedRevenueVnd: 0 }],
      '2026-07-01',
      '2026-07-07',
    )
    expect(csv).toContain('2026-07-01')
    expect(csv).toContain('An')
  })
})
