import { describe, expect, it } from 'vitest'
import { canAccessAccountantPortal } from './accountantPortal'
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

  it('blocks counselor and inactive users', () => {
    expect(canAccessAccountantPortal(canFrom('counselor'), { role: 'counselor', isActive: true })).toBe(false)
    expect(canAccessAccountantPortal(canFrom('super_admin'), { role: 'super_admin', isActive: false })).toBe(false)
  })
})
