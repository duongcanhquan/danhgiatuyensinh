import { describe, expect, it } from 'vitest'
import { DEFAULT_ORG_ID, DEFAULT_ORG_SLUG } from '../tenancy/orgConstants'

describe('ensureDefaultOrganization contract', () => {
  it('targets VietMy default ids', () => {
    expect(DEFAULT_ORG_ID).toBe('vietmy')
    expect(DEFAULT_ORG_SLUG).toBe('vietmy')
  })
})
