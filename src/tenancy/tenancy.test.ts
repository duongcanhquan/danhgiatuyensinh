import { describe, expect, it } from 'vitest'
import { DEFAULT_ORG_ID, DEFAULT_ORG_SLUG, normalizeOrgSlug } from './orgConstants'
import { orgSettingsDocPath, orgSettingsDocSegments } from './orgSettingsPaths'
import { ensureOrgId, isPlatformSuperAdminRole, resolveWriteOrgId } from './orgId'
import { pickOrgSettingsSnapshot } from './dualReadOrgSettings'

describe('orgConstants', () => {
  it('defaults VietMy as first school tenant', () => {
    expect(DEFAULT_ORG_ID).toBe('vietmy')
    expect(DEFAULT_ORG_SLUG).toBe('vietmy')
  })

  it('normalizes public portal slugs', () => {
    expect(normalizeOrgSlug(' VietMy ')).toBe('vietmy')
    expect(normalizeOrgSlug('CAO-DANG_X')).toBe('cao-dang_x')
    expect(normalizeOrgSlug('')).toBe(DEFAULT_ORG_SLUG)
  })
})

describe('orgSettingsPaths', () => {
  it('builds orgSettings/{orgId}/settings/{docId} segments', () => {
    expect(orgSettingsDocSegments('vietmy', 'kpiV2Config')).toEqual([
      'orgSettings',
      'vietmy',
      'settings',
      'kpiV2Config',
    ])
    expect(orgSettingsDocPath('vietmy', 'kpiV2Config')).toBe('orgSettings/vietmy/settings/kpiV2Config')
  })
})

describe('orgId helpers', () => {
  it('ensureOrgId injects default when missing', () => {
    expect(ensureOrgId({ name: 'a' })).toEqual({ name: 'a', orgId: 'vietmy' })
    expect(ensureOrgId({ orgId: 'other', x: 1 })).toEqual({ orgId: 'other', x: 1 })
  })

  it('resolveWriteOrgId prefers explicit then profile then default', () => {
    expect(resolveWriteOrgId({ explicitOrgId: 'a' })).toBe('a')
    expect(resolveWriteOrgId({ profileOrgId: 'b' })).toBe('b')
    expect(resolveWriteOrgId({ role: 'super_admin', activeOrgId: 'c' })).toBe('c')
    expect(resolveWriteOrgId({})).toBe('vietmy')
  })

  it('platform super admin is role super_admin without school orgId', () => {
    expect(isPlatformSuperAdminRole('super_admin', null)).toBe(true)
    expect(isPlatformSuperAdminRole('super_admin', 'vietmy')).toBe(false)
    expect(isPlatformSuperAdminRole('admin', null)).toBe(false)
  })
})

describe('dualReadOrgSettings', () => {
  it('prefers orgSettings data when present', () => {
    expect(
      pickOrgSettingsSnapshot({
        orgSettingsExists: true,
        orgSettingsData: { a: 1 },
        legacyExists: true,
        legacyData: { a: 2 },
      }),
    ).toEqual({ source: 'orgSettings', data: { a: 1 } })
  })

  it('falls back to scoringAux legacy when orgSettings missing', () => {
    expect(
      pickOrgSettingsSnapshot({
        orgSettingsExists: false,
        orgSettingsData: null,
        legacyExists: true,
        legacyData: { a: 2 },
      }),
    ).toEqual({ source: 'legacy', data: { a: 2 } })
  })

  it('returns empty when neither exists', () => {
    expect(
      pickOrgSettingsSnapshot({
        orgSettingsExists: false,
        orgSettingsData: null,
        legacyExists: false,
        legacyData: null,
      }),
    ).toEqual({ source: 'none', data: null })
  })
})
