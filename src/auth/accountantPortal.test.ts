import { describe, expect, it } from 'vitest'
import { canAccessAccountantPortal, canManageAccountantStaff } from './accountantPortal'
import { defaultPermissionsForRole } from './permissions'
import { hasPermission } from './permissions'

describe('canAccessAccountantPortal', () => {
  const canFrom = (role: Parameters<typeof defaultPermissionsForRole>[0]) => {
    const perms = defaultPermissionsForRole(role)
    return (p: Parameters<typeof hasPermission>[1]) => hasPermission(perms, p)
  }

  it('allows super_admin and admin without finance:accountant', () => {
    expect(canAccessAccountantPortal(canFrom('super_admin'), { role: 'super_admin', isActive: true })).toBe(true)
    expect(canAccessAccountantPortal(canFrom('admin'), { role: 'admin', isActive: true })).toBe(true)
  })

  it('allows accountant with finance permission', () => {
    expect(canAccessAccountantPortal(canFrom('accountant'), { role: 'accountant', isActive: true })).toBe(true)
  })

  it('allows accountant role even if can() denies finance (role gate)', () => {
    const denyAll = () => false
    expect(canAccessAccountantPortal(denyAll, { role: 'accountant', isActive: true })).toBe(true)
  })

  it('blocks counselor and inactive users', () => {
    expect(canAccessAccountantPortal(canFrom('counselor'), { role: 'counselor', isActive: true })).toBe(false)
    expect(canAccessAccountantPortal(canFrom('super_admin'), { role: 'super_admin', isActive: false })).toBe(false)
  })
})

describe('canManageAccountantStaff', () => {
  const canFrom = (role: Parameters<typeof defaultPermissionsForRole>[0]) => {
    const perms = defaultPermissionsForRole(role)
    return (p: Parameters<typeof hasPermission>[1]) => hasPermission(perms, p)
  }

  it('only super_admin may manage accountant accounts', () => {
    expect(canManageAccountantStaff(canFrom('super_admin'), { role: 'super_admin' })).toBe(true)
    expect(canManageAccountantStaff(canFrom('accountant'), { role: 'accountant' })).toBe(false)
    expect(canManageAccountantStaff(canFrom('admin'), { role: 'admin' })).toBe(false)
  })
})
