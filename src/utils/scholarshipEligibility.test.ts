import { describe, expect, it } from 'vitest'
import type { ScholarshipRecord } from '../types'
import {
  activeScholarshipsForSlot,
  isScholarshipCurrentlyValid,
  scholarshipAppliesToSlot,
  scholarshipScheduleStatus,
} from './scholarshipEligibility'

const base = (over: Partial<ScholarshipRecord>): ScholarshipRecord => ({
  id: 'x',
  label: 'Test',
  category: 'phcd',
  amountVnd: 1_000_000,
  sortOrder: 10,
  isActive: true,
  ...over,
})

describe('scholarshipEligibility', () => {
  it('filters by date range', () => {
    const s = base({ validFrom: '2099-01-01', validTo: '2099-12-31' })
    expect(isScholarshipCurrentlyValid(s, new Date('2026-05-24'))).toBe(false)
    expect(scholarshipScheduleStatus(s, new Date('2026-05-24'))).toBe('scheduled')
  })

  it('filters by apply slot', () => {
    const s = base({ applySlots: ['slot2'] })
    expect(scholarshipAppliesToSlot(s, 'slot1')).toBe(false)
    expect(scholarshipAppliesToSlot(s, 'slot2')).toBe(true)
  })

  it('keeps selected id even when expired', () => {
    const expired = base({ id: 'old', validTo: '2020-01-01' })
    const rows = activeScholarshipsForSlot([expired], 'slot1', new Date('2026-05-24'), ['old'])
    expect(rows.some((r) => r.id === 'old')).toBe(true)
  })
})
