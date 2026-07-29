import { describe, expect, it } from 'vitest'
import {
  leadBelongsToOrg,
  orgIdQueryConstraint,
  shouldUseLegacyMissingOrgIdRead,
} from './orgQuery'
import { DEFAULT_ORG_ID } from './orgConstants'

describe('orgQuery legacy VietMy', () => {
  it('uses legacy read only for default org', () => {
    expect(shouldUseLegacyMissingOrgIdRead(DEFAULT_ORG_ID)).toBe(true)
    expect(shouldUseLegacyMissingOrgIdRead('demo')).toBe(false)
    expect(orgIdQueryConstraint(DEFAULT_ORG_ID)).toBeNull()
    expect(orgIdQueryConstraint('demo')).toBeTruthy()
  })

  it('leadBelongsToOrg accepts missing orgId on VietMy only', () => {
    expect(leadBelongsToOrg({}, DEFAULT_ORG_ID)).toBe(true)
    expect(leadBelongsToOrg({ orgId: null }, DEFAULT_ORG_ID)).toBe(true)
    expect(leadBelongsToOrg({ orgId: 'vietmy' }, DEFAULT_ORG_ID)).toBe(true)
    expect(leadBelongsToOrg({ orgId: 'other' }, DEFAULT_ORG_ID)).toBe(false)
    expect(leadBelongsToOrg({}, 'demo')).toBe(false)
    expect(leadBelongsToOrg({ orgId: 'demo' }, 'demo')).toBe(true)
  })
})
