import { describe, expect, it } from 'vitest'
import {
  authClaimsNeedUpdate,
  buildAuthCustomClaims,
  claimsMatchProfile,
} from './authClaims'

describe('buildAuthCustomClaims', () => {
  it('marks super_admin as platform with empty orgId', () => {
    expect(buildAuthCustomClaims({ role: 'super_admin', orgId: 'vietmy' })).toEqual({
      role: 'super_admin',
      orgId: '',
      platform: true,
    })
  })

  it('requires school orgId (default vietmy)', () => {
    expect(buildAuthCustomClaims({ role: 'admin', orgId: null })).toEqual({
      role: 'admin',
      orgId: 'vietmy',
      platform: false,
    })
    expect(buildAuthCustomClaims({ role: 'counselor', orgId: 'demo' })).toEqual({
      role: 'counselor',
      orgId: 'demo',
      platform: false,
    })
  })

  it('normalizes legacy head roles to team_lead', () => {
    expect(buildAuthCustomClaims({ role: 'head_of_department', orgId: 'vietmy' }).role).toBe('team_lead')
  })
})

describe('authClaimsNeedUpdate', () => {
  it('detects drift', () => {
    const desired = buildAuthCustomClaims({ role: 'admin', orgId: 'demo' })
    expect(authClaimsNeedUpdate({ role: 'admin', orgId: 'vietmy', platform: false }, desired)).toBe(true)
    expect(authClaimsNeedUpdate(desired, desired)).toBe(false)
  })
})

describe('claimsMatchProfile', () => {
  it('matches school profile', () => {
    expect(
      claimsMatchProfile(
        { role: 'admin', orgId: 'demo', platform: false },
        { role: 'admin', orgId: 'demo' },
      ),
    ).toBe(true)
    expect(
      claimsMatchProfile(
        { role: 'admin', orgId: 'vietmy', platform: false },
        { role: 'admin', orgId: 'demo' },
      ),
    ).toBe(false)
  })
})
