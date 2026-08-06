import { describe, expect, it } from 'vitest'
import { isPriorityTag } from './bulkLeadPriorityTag'

describe('bulkLeadPriorityTag', () => {
  it('accepts known tags only', () => {
    expect(isPriorityTag('HOT')).toBe(true)
    expect(isPriorityTag('WARM')).toBe(true)
    expect(isPriorityTag('nope')).toBe(false)
  })
})
