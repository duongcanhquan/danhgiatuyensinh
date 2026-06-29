import { Timestamp } from 'firebase/firestore'
import { describe, expect, it, vi, afterEach } from 'vitest'
import type { Lead } from '../types'
import { effectiveTouchMs, isFollowUpTodayLocal, isHotStaleNewSla, isStaleNewSla } from './slaLead'

function baseLead(over: Partial<Lead> = {}): Lead {
  const now = Date.now()
  return {
    id: 'l1',
    fullName: 'Test',
    phone: '0',
    majorInterest: 'X',
    region: 'HN',
    schoolType: 'PUBLIC',
    financialStatus: 'UNKNOWN',
    calculatedScore: 50,
    priorityTag: 'WARM',
    assignedCounselorId: null,
    pipelineStatus: 'NEW',
    status: 'NEW',
    createdAt: Timestamp.fromMillis(now),
    updatedAt: Timestamp.fromMillis(now),
    ...over,
  } as Lead
}

describe('effectiveTouchMs', () => {
  it('prefers lastTouchedAt over updatedAt', () => {
    const t1 = Timestamp.fromMillis(1000)
    const t2 = Timestamp.fromMillis(5000)
    const l = baseLead({ lastTouchedAt: t2, updatedAt: t1 })
    expect(effectiveTouchMs(l)).toBe(5000)
  })
})

describe('isStaleNewSla', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('is false when status is not NEW', () => {
    vi.setSystemTime(new Date('2026-06-01T12:00:00Z'))
    const l = baseLead({
      status: 'INTERESTED',
      updatedAt: Timestamp.fromMillis(Date.now() - 48 * 3600 * 1000),
    })
    expect(isStaleNewSla(l)).toBe(false)
  })

  it('is true when NEW and untouched > 24h', () => {
    vi.setSystemTime(new Date('2026-06-01T12:00:00Z'))
    const l = baseLead({
      status: 'NEW',
      updatedAt: Timestamp.fromMillis(Date.now() - 25 * 3600 * 1000),
    })
    expect(isStaleNewSla(l)).toBe(true)
  })
})

describe('isHotStaleNewSla', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('requires HOT tag and stale NEW', () => {
    vi.setSystemTime(new Date('2026-06-01T12:00:00Z'))
    const stale = Timestamp.fromMillis(Date.now() - 25 * 3600 * 1000)
    expect(isHotStaleNewSla(baseLead({ status: 'NEW', updatedAt: stale, priorityTag: 'HOT' }), 'HOT')).toBe(true)
    expect(isHotStaleNewSla(baseLead({ status: 'NEW', updatedAt: stale, priorityTag: 'WARM' }), 'WARM')).toBe(false)
  })
})

describe('isFollowUpTodayLocal', () => {
  it('matches calendar day in local timezone', () => {
    const d = new Date()
    const ts = Timestamp.fromDate(d)
    expect(isFollowUpTodayLocal(ts)).toBe(true)
  })

  it('returns false for null', () => {
    expect(isFollowUpTodayLocal(null)).toBe(false)
  })
})
