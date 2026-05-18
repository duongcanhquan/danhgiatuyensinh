import { describe, expect, it } from 'vitest'
import {
  canAccessSettingsPage,
  defaultPermissionsForRole,
  hasPermission,
  resolveEffectivePermissions,
} from './permissions'
import { tierHasPermission } from './permissionsMatrix'
import { normalizeUserRole } from './roleUtils'
import type { Permission } from '../types'

describe('normalizeUserRole', () => {
  it('maps legacy head roles to team_lead', () => {
    expect(normalizeUserRole('head_of_profession')).toBe('team_lead')
    expect(normalizeUserRole('head_of_department')).toBe('team_lead')
  })
})

describe('defaultPermissionsForRole', () => {
  it('grants super_admin every non-finance permission in PERMISSIONS', async () => {
    const { PERMISSIONS } = await import('../types')
    const perms = defaultPermissionsForRole('super_admin')
    for (const p of PERMISSIONS as readonly Permission[]) {
      if (p === 'finance:accountant' || p === 'finance:reports') continue
      expect(perms).toContain(p)
    }
    expect(hasPermission(perms, 'finance:accountant')).toBe(false)
  })

  it('grants admin all permissions except LLM API and finance', async () => {
    const { PERMISSIONS } = await import('../types')
    const perms = defaultPermissionsForRole('admin')
    expect(hasPermission(perms, 'config:llm_api')).toBe(false)
    expect(hasPermission(perms, 'finance:accountant')).toBe(false)
    for (const p of PERMISSIONS as readonly Permission[]) {
      if (p === 'config:llm_api' || p === 'finance:accountant' || p === 'finance:reports') continue
      expect(perms).toContain(p)
    }
  })

  it('accountant only gets finance permissions', () => {
    const perms = defaultPermissionsForRole('accountant')
    expect(hasPermission(perms, 'finance:accountant')).toBe(true)
    expect(hasPermission(perms, 'finance:reports')).toBe(true)
    expect(hasPermission(perms, 'leads:read:global')).toBe(false)
    expect(canAccessSettingsPage(perms)).toBe(false)
  })

  it('counselor: own leads and scoring profile only', () => {
    const perms = defaultPermissionsForRole('counselor')
    expect(hasPermission(perms, 'dashboard:counselor')).toBe(true)
    expect(hasPermission(perms, 'config:playbooks')).toBe(false)
  })

  it('team_lead: team scope, playbooks, no global admin', () => {
    const perms = defaultPermissionsForRole('team_lead')
    expect(hasPermission(perms, 'leads:read:team_scope')).toBe(true)
    expect(hasPermission(perms, 'leads:write:team_scope')).toBe(true)
    expect(hasPermission(perms, 'leads:reassign:team')).toBe(true)
    expect(hasPermission(perms, 'config:playbooks')).toBe(true)
    expect(hasPermission(perms, 'dashboard:team_lead')).toBe(true)
    expect(hasPermission(perms, 'config:master_data')).toBe(false)
  })

  it('legacy head_of_profession resolves to team_lead permissions', () => {
    const perms = defaultPermissionsForRole('head_of_profession')
    expect(hasPermission(perms, 'config:playbooks')).toBe(true)
  })

  it('counselor can access settings for own scoring profile', () => {
    expect(canAccessSettingsPage(defaultPermissionsForRole('counselor'))).toBe(true)
  })
})

describe('tierHasPermission', () => {
  it('maps three business tiers', () => {
    expect(tierHasPermission('counselor', 'config:playbooks')).toBe(false)
    expect(tierHasPermission('team_lead', 'config:playbooks')).toBe(true)
    expect(tierHasPermission('admin', 'config:master_data')).toBe(true)
  })
})

describe('resolveEffectivePermissions', () => {
  it('merges extra and removes denied', () => {
    const perms = resolveEffectivePermissions({
      role: 'counselor',
      extraPermissions: ['analytics:advanced'],
      deniedPermissions: ['leads:reassign:peer'],
    })
    expect(hasPermission(perms, 'analytics:advanced')).toBe(true)
    expect(hasPermission(perms, 'leads:reassign:peer')).toBe(false)
  })
})
