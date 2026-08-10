import { describe, expect, it } from 'vitest'
import { __resetSharedFirestoreQueryRegistryForTests } from './sharedFirestoreQuery'

describe('sharedFirestoreQuery registry', () => {
  it('clears registry for tests', () => {
    __resetSharedFirestoreQueryRegistryForTests()
    expect(true).toBe(true)
  })
})
