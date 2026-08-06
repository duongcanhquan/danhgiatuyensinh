import { describe, expect, it } from 'vitest'
import { Timestamp } from 'firebase/firestore'
import {
  buildLastCallLeadPatch,
  callQueueFilterMatches,
  formatLeadLastCallLine,
  startOfLocalDayMs,
  type CallQueueFilter,
} from './leadCallSignals'

describe('leadCallSignals', () => {
  const noon = new Date(2026, 7, 6, 12, 0, 0) // Aug 6 2026 local

  it('startOfLocalDayMs is midnight local', () => {
    const ms = startOfLocalDayMs(noon)
    const d = new Date(ms)
    expect(d.getHours()).toBe(0)
    expect(d.getDate()).toBe(6)
  })

  it('buildLastCallLeadPatch sets at, label, outcome', () => {
    const patch = buildLastCallLeadPatch({
      calledByLabel: 'SIP 101',
      outcome: 'CONNECTED',
      at: Timestamp.fromDate(noon),
    })
    expect(patch.lastCalledByLabel).toBe('SIP 101')
    expect(patch.lastCallOutcome).toBe('CONNECTED')
    expect(patch.lastCallAt?.toMillis()).toBe(Timestamp.fromDate(noon).toMillis())
  })

  it('never_called matches missing lastCallAt', () => {
    expect(callQueueFilterMatches({}, 'never_called', noon)).toBe(true)
    expect(
      callQueueFilterMatches({ lastCallAt: Timestamp.fromDate(noon) }, 'never_called', noon),
    ).toBe(false)
  })

  it('called_today matches lastCallAt today only', () => {
    const today = Timestamp.fromDate(noon)
    const yesterday = Timestamp.fromDate(new Date(2026, 7, 5, 18, 0, 0))
    expect(callQueueFilterMatches({ lastCallAt: today }, 'called_today', noon)).toBe(true)
    expect(callQueueFilterMatches({ lastCallAt: yesterday }, 'called_today', noon)).toBe(false)
    expect(callQueueFilterMatches({}, 'called_today', noon)).toBe(false)
  })

  it('needs_callback matches follow-up due or FOLLOW_UP outcome', () => {
    const due = Timestamp.fromDate(new Date(2026, 7, 6, 8, 0, 0))
    const future = Timestamp.fromDate(new Date(2026, 7, 10, 8, 0, 0))
    expect(
      callQueueFilterMatches({ nextFollowUpDate: due, lastCallAt: Timestamp.fromDate(noon) }, 'needs_callback', noon),
    ).toBe(true)
    expect(
      callQueueFilterMatches(
        { lastCallOutcome: 'FOLLOW_UP', lastCallAt: Timestamp.fromDate(noon) },
        'needs_callback',
        noon,
      ),
    ).toBe(true)
    expect(
      callQueueFilterMatches({ nextFollowUpDate: future, lastCallAt: Timestamp.fromDate(noon) }, 'needs_callback', noon),
    ).toBe(false)
    expect(callQueueFilterMatches({}, 'needs_callback', noon)).toBe(false)
  })

  it('all filter always matches', () => {
    expect(callQueueFilterMatches({}, 'all' as CallQueueFilter, noon)).toBe(true)
  })

  it('formatLeadLastCallLine shows chưa gọi or time + label', () => {
    expect(formatLeadLastCallLine({})).toBe('Chưa gọi')
    const line = formatLeadLastCallLine({
      lastCallAt: Timestamp.fromDate(noon),
      lastCalledByLabel: 'SIP 101',
      lastCallOutcome: 'CONNECTED',
    })
    expect(line).toContain('SIP 101')
    expect(line.toLowerCase()).toMatch(/đã bắt|connected|gọi/i)
  })
})
