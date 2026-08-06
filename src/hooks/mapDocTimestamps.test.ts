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
})

function TimestampLike(seconds: number) {
  return {
    seconds,
    nanoseconds: 0,
    toMillis: () => seconds * 1000,
    toDate: () => new Date(seconds * 1000),
  }
}
