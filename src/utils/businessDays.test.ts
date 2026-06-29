import { describe, expect, it } from 'vitest'
import { countBusinessDaysInMonth, isBusinessDayKey } from './businessDays'

describe('businessDays', () => {
  it('excludes weekends', () => {
    expect(isBusinessDayKey('2026-05-25')).toBe(true) // Mon
    expect(isBusinessDayKey('2026-05-24')).toBe(false) // Sun
  })

  it('excludes listed holidays', () => {
    expect(isBusinessDayKey('2026-05-25', ['2026-05-25'])).toBe(false)
  })

  it('counts business days in month', () => {
    const n = countBusinessDaysInMonth('2026-05', [])
    expect(n).toBeGreaterThan(20)
    expect(n).toBeLessThan(23)
  })
})
