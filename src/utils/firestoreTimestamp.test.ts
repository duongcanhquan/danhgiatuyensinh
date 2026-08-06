import { describe, expect, it } from 'vitest'
import { Timestamp } from 'firebase/firestore'
import { asFirestoreTimestamp, asFirestoreTimestampOrNow } from './firestoreTimestamp'

describe('asFirestoreTimestamp', () => {
  it('keeps real Timestamp', () => {
    const t = Timestamp.fromMillis(1_700_000_000_000)
    expect(asFirestoreTimestamp(t)?.toMillis()).toBe(t.toMillis())
  })

  it('converts plain {seconds,nanoseconds} (legacy / REST)', () => {
    const t = asFirestoreTimestamp({ seconds: 1_700_000_000, nanoseconds: 0 })
    expect(t).toBeTruthy()
    expect(t!.toMillis()).toBe(1_700_000_000_000)
  })

  it('converts ISO string dates', () => {
    const t = asFirestoreTimestamp('2026-08-06T04:00:00.000Z')
    expect(t?.toDate().toISOString()).toBe('2026-08-06T04:00:00.000Z')
  })

  it('returns undefined for garbage (so callers can fall back)', () => {
    expect(asFirestoreTimestamp(null)).toBeUndefined()
    expect(asFirestoreTimestamp('not-a-date')).toBeUndefined()
    expect(asFirestoreTimestamp({})).toBeUndefined()
  })

  it('asFirestoreTimestampOrNow never returns non-Timestamp', () => {
    const t = asFirestoreTimestampOrNow('bad')
    expect(typeof t.toDate).toBe('function')
    expect(typeof t.toMillis).toBe('function')
  })
})
