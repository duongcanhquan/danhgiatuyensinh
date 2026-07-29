import { describe, expect, it } from 'vitest'
import {
  leadBelongsToOrg,
  orgIdQueryConstraint,
  shouldUseLegacyMissingOrgIdRead,
} from './orgQuery'
import { DEFAULT_ORG_ID } from './orgConstants'

describe('orgQuery legacy VietMy', () => {
  it('flags VietMy for legacy reads but still returns org equality constraint', () => {
    expect(shouldUseLegacyMissingOrgIdRead(DEFAULT_ORG_ID)).toBe(true)
    expect(shouldUseLegacyMissingOrgIdRead('demo')).toBe(false)
    // Luôn gắn where(orgId==) — bỏ lọc chỉ ở useLeads cho Superadmin
    expect(orgIdQueryConstraint(DEFAULT_ORG_ID)).toBeTruthy()
    expect(orgIdQueryConstraint('demo')).toBeTruthy()
    expect(orgIdQueryConstraint('')).toBeNull()
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
