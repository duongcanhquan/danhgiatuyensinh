import { describe, expect, it } from 'vitest'
import {
  formatSystemLeadCode,
  formatSystemLeadCodeDayPrefix,
  isSystemLeadCode,
} from './systemLeadCode'

describe('systemLeadCode', () => {
  it('formats YYMMDD prefix', () => {
    const prefix = formatSystemLeadCodeDayPrefix(new Date('2026-05-26T10:00:00+07:00'))
    expect(prefix).toBe('260526')
  })

  it('builds 10-digit system code', () => {
    expect(formatSystemLeadCode('260526', 1)).toBe('2605260001')
    expect(formatSystemLeadCode('260526', 42)).toBe('2605260042')
    expect(isSystemLeadCode('2605260001')).toBe(true)
  })
})
