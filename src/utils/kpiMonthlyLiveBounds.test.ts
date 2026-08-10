import { describe, expect, it } from 'vitest'
import { monthlyLiveMergeBounds } from './kpiMonthlyLiveBounds'

describe('monthlyLiveMergeBounds', () => {
  it('returns the last two days through today for the current month', () => {
    expect(monthlyLiveMergeBounds('2026-08', 2, new Date('2026-08-10T10:00:00+07:00'))).toEqual({
      from: '2026-08-09',
      to: '2026-08-10',
    })
  })

  it('does not cross the month boundary', () => {
    expect(monthlyLiveMergeBounds('2026-08', 3, new Date('2026-08-01T10:00:00+07:00'))).toEqual({
      from: '2026-08-01',
      to: '2026-08-01',
    })
  })

  it('returns an empty range for a past or future month', () => {
    const now = new Date('2026-08-10T10:00:00+07:00')
    expect(monthlyLiveMergeBounds('2026-07', 2, now)).toEqual({ from: '', to: '' })
    expect(monthlyLiveMergeBounds('2026-09', 2, now)).toEqual({ from: '', to: '' })
  })

  it('normalizes invalid day counts to the two-day default', () => {
    expect(monthlyLiveMergeBounds('2026-08', 0, new Date('2026-08-10T10:00:00+07:00'))).toEqual({
      from: '2026-08-09',
      to: '2026-08-10',
    })
  })
})
