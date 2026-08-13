import { Timestamp } from 'firebase/firestore'
import { describe, expect, it } from 'vitest'
import {
  formatUploadedDateRangeChip,
  leadMatchesUploadedDateRange,
  leadUploadedAtMs,
  sanitizeUploadedYmd,
  vnCalendarDayEndMs,
  vnCalendarDayStartMs,
} from './leadUploadedDateRange'

describe('leadUploadedDateRange', () => {
  it('prefers uploadedAt over createdAt', () => {
    const uploaded = Timestamp.fromMillis(Date.parse('2026-08-13T10:00:00+07:00'))
    const created = Timestamp.fromMillis(Date.parse('2026-08-01T10:00:00+07:00'))
    expect(leadUploadedAtMs({ uploadedAt: uploaded, createdAt: created })).toBe(uploaded.toMillis())
    expect(leadUploadedAtMs({ createdAt: created })).toBe(created.toMillis())
  })

  it('bounds VN calendar days at +07', () => {
    expect(vnCalendarDayStartMs('2026-08-13')).toBe(Date.parse('2026-08-13T00:00:00+07:00'))
    expect(vnCalendarDayEndMs('2026-08-13')).toBe(Date.parse('2026-08-13T23:59:59.999+07:00'))
  })

  it('matches inclusive uploaded range and swaps inverted bounds', () => {
    const lead = {
      uploadedAt: Timestamp.fromMillis(Date.parse('2026-08-13T15:30:00+07:00')),
    }
    expect(leadMatchesUploadedDateRange(lead, '2026-08-13', '2026-08-13')).toBe(true)
    expect(leadMatchesUploadedDateRange(lead, '2026-08-14', '2026-08-14')).toBe(false)
    expect(leadMatchesUploadedDateRange(lead, '2026-08-14', '2026-08-12')).toBe(true)
    expect(leadMatchesUploadedDateRange({ createdAt: null }, '2026-08-13', '')).toBe(false)
    expect(leadMatchesUploadedDateRange(lead, '', '')).toBe(true)
  })

  it('rejects invalid YMD bounds instead of ignoring them', () => {
    const lead = {
      uploadedAt: Timestamp.fromMillis(Date.parse('2026-08-13T15:30:00+07:00')),
    }
    expect(leadMatchesUploadedDateRange(lead, 'not-a-date', '')).toBe(false)
    expect(sanitizeUploadedYmd('2026-08-13')).toBe('2026-08-13')
    expect(sanitizeUploadedYmd('13/08/2026')).toBe('')
  })

  it('formats chip label in vi day order', () => {
    expect(formatUploadedDateRangeChip('2026-08-13', '2026-08-13')).toBe('Ngày tải: 13/08/2026')
    expect(formatUploadedDateRangeChip('2026-08-01', '2026-08-13')).toBe(
      'Ngày tải: 01/08/2026 – 13/08/2026',
    )
  })
})
