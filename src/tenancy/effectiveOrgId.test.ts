import { describe, expect, it } from 'vitest'
import { resolveEffectiveOrgId } from './effectiveOrgId'
import { ACTIVE_ORG_STORAGE_KEY, readStoredActiveOrgId, writeStoredActiveOrgId } from './activeOrgStorage'

describe('resolveEffectiveOrgId', () => {
  it('school user always uses profile.orgId (or default)', () => {
    expect(
      resolveEffectiveOrgId({
        role: 'counselor',
        profileOrgId: 'school-a',
        activeOrgId: 'ignored',
      }),
    ).toBe('school-a')
    expect(
      resolveEffectiveOrgId({
        role: 'admin',
        profileOrgId: null,
        activeOrgId: 'x',
      }),
    ).toBe('vietmy')
  })

  it('platform super_admin uses activeOrgId then default', () => {
    expect(
      resolveEffectiveOrgId({
        role: 'super_admin',
        profileOrgId: null,
        activeOrgId: 'staging',
      }),
    ).toBe('staging')
    expect(
      resolveEffectiveOrgId({
        role: 'super_admin',
        profileOrgId: null,
        activeOrgId: null,
      }),
    ).toBe('vietmy')
  })

  it('super_admin bound to a school orgId behaves like school admin', () => {
    expect(
      resolveEffectiveOrgId({
        role: 'super_admin',
        profileOrgId: 'vietmy',
        activeOrgId: 'other',
      }),
    ).toBe('vietmy')
  })
})

describe('activeOrgStorage', () => {
  it('round-trips in memory mock', () => {
    const mem = new Map<string, string>()
    const storage = {
      getItem: (k: string) => mem.get(k) ?? null,
      setItem: (k: string, v: string) => {
        mem.set(k, v)
      },
      removeItem: (k: string) => {
        mem.delete(k)
      },
    }
    expect(ACTIVE_ORG_STORAGE_KEY).toContain('activeOrg')
    writeStoredActiveOrgId('abc', storage)
    expect(readStoredActiveOrgId(storage)).toBe('abc')
    writeStoredActiveOrgId('', storage)
    expect(readStoredActiveOrgId(storage)).toBeNull()
  })
})
