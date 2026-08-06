import { describe, expect, it } from 'vitest'
import { mapDoc } from './useLeads'

describe('mapDoc timestamp hardening', () => {
  it('does not leave string importedAt that breaks Dashboard monthStart/toDate', () => {
    const lead = mapDoc('L1', {
      fullName: 'A',
      phone: '090',
      uniqueHash: 'h1',
      importedAt: '2026-08-01T00:00:00.000Z',
      createdAt: { seconds: 1_700_000_000, nanoseconds: 0 },
      updatedAt: 'not-a-date',
    })
    expect(lead).toBeTruthy()
    expect(typeof lead!.createdAt.toDate).toBe('function')
    expect(typeof lead!.updatedAt.toDate).toBe('function')
    expect(typeof lead!.importedAt?.toDate).toBe('function')
    // Must not throw (this was AppErrorBoundary after login)
    expect(() => lead!.importedAt!.toDate().getFullYear()).not.toThrow()
    expect(() => lead!.updatedAt.toMillis()).not.toThrow()
  })

  it('falls back when importedAt is truthy garbage', () => {
    const lead = mapDoc('L2', {
      fullName: 'B',
      phone: '091',
      uniqueHash: 'h2',
      importedAt: { foo: 1 },
      createdAt: TimestampLike(1_700_000_100),
    })
    expect(lead).toBeTruthy()
    expect(lead!.importedAt).toBeUndefined()
    expect(lead!.createdAt.toMillis()).toBe(1_700_000_100_000)
  })

  it('normalizes call/AI/follow-up timestamps the same way', () => {
    const lead = mapDoc('L3', {
      fullName: 'C',
      phone: '092',
      uniqueHash: 'h3',
      createdAt: TimestampLike(1_700_000_200),
      lastCallAt: '2026-08-06T01:00:00.000Z',
      lastCallAiAt: { seconds: 1_700_000_300, nanoseconds: 0 },
      nextFollowUpDate: { foo: true },
      aiProcessedAt: '2026-08-05T12:00:00.000Z',
    })
    expect(typeof lead!.lastCallAt?.toDate).toBe('function')
    expect(typeof lead!.lastCallAiAt?.toDate).toBe('function')
    expect(typeof lead!.aiProcessedAt?.toDate).toBe('function')
    expect(lead!.nextFollowUpDate).toBeNull()
  })
})

function TimestampLike(seconds: number) {
  return {
    seconds,
    nanoseconds: 0,
    toMillis: () => seconds * 1000,
    toDate: () => new Date(seconds * 1000),
  }
}
