import { describe, expect, it } from 'vitest'
import { leadNeedsAutoScorePersist } from './leadNeedsAutoScorePersist'

describe('leadNeedsAutoScorePersist', () => {
  it('true when score differs', () => {
    expect(leadNeedsAutoScorePersist({ calculatedScore: 0 }, { calculatedScore: 42 })).toBe(true)
  })

  it('false when only priority tag would differ (score already matches)', () => {
    expect(leadNeedsAutoScorePersist({ calculatedScore: 42 }, { calculatedScore: 42 })).toBe(false)
  })
})
