import { describe, expect, it } from 'vitest'
import type { Lead } from '../types'
import {
  formatStudentCode,
  formatStudentCodeDayPrefix,
  isStandardStudentCode,
  resolveStudentDisplayCode,
} from './studentDisplayCode'

describe('studentDisplayCode', () => {
  it('formats DDMMYY prefix', () => {
    const prefix = formatStudentCodeDayPrefix(new Date('2026-05-24T10:00:00+07:00'))
    expect(prefix).toMatch(/^\d{6}$/)
  })

  it('builds 10-digit code', () => {
    expect(formatStudentCode('240526', 1)).toBe('2405260001')
    expect(isStandardStudentCode('2405260001')).toBe(true)
  })

  it('uses existing customerId when standard', () => {
    const lead = { id: '1', customerId: '2602025170', fullName: 'A' } as Lead
    expect(resolveStudentDisplayCode(lead)).toBe('2602025170')
  })
})
