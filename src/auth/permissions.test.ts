import { describe, expect, it } from 'vitest'
import { defaultPermissionsForRole, hasPermission } from './permissions'
import type { Permission } from '../types'

describe('defaultPermissionsForRole', () => {
  it('grants admin every permission in PERMISSIONS', async () => {
    const { PERMISSIONS } = await import('../types')
    const perms = defaultPermissionsForRole('admin')
    for (const p of PERMISSIONS as readonly Permission[]) {
      expect(perms).toContain(p)
    }
  })

  it('counselor can use pipeline and self-assigned leads but not global config', () => {
    const perms = defaultPermissionsForRole('counselor')
    expect(hasPermission(perms, 'dashboard:counselor')).toBe(true)
    expect(hasPermission(perms, 'leads:write:self_assigned')).toBe(true)
    expect(hasPermission(perms, 'config:users')).toBe(false)
    expect(hasPermission(perms, 'data:intake')).toBe(false)
  })

  it('head_of_department has analytics but not counselor pipeline', () => {
    const perms = defaultPermissionsForRole('head_of_department')
    expect(hasPermission(perms, 'analytics:advanced')).toBe(true)
    expect(hasPermission(perms, 'dashboard:counselor')).toBe(false)
  })
})

describe('hasPermission', () => {
  it('returns false for undefined list', () => {
    expect(hasPermission(undefined, 'ai:use')).toBe(false)
  })
})
