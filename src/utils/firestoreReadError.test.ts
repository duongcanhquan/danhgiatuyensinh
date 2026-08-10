import { describe, expect, it } from 'vitest'
import { firestoreReadErrorMessage } from './firestoreReadError'

describe('firestoreReadErrorMessage', () => {
  it('maps permission-denied to Vietnamese guidance', () => {
    expect(firestoreReadErrorMessage({ code: 'permission-denied', message: 'Missing or insufficient permissions.' }, 'fb')).toMatch(
      /không có quyền/i,
    )
  })

  it('uses fallback when empty', () => {
    expect(firestoreReadErrorMessage(null, 'fallback')).toBe('fallback')
  })
})
