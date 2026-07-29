import { describe, expect, it } from 'vitest'
import {
  defaultRoleCapabilities,
  parseRoleCapabilities,
  SCHOOL_ADMIN_CAPABILITY_MODULES,
} from './roleCapabilitiesConfig'
import { adminPermissionsAllowedByCapabilities } from '../auth/permissions'

describe('roleCapabilitiesConfig', () => {
  it('defaults enable all modules including required staff', () => {
    const caps = defaultRoleCapabilities()
    expect(caps.adminEnabledModuleIds).toContain('staff')
    expect(caps.adminEnabledModuleIds.length).toBe(SCHOOL_ADMIN_CAPABILITY_MODULES.length)
  })

  it('always keeps required staff module when parsing', () => {
    const parsed = parseRoleCapabilities({ adminEnabledModuleIds: ['data', 'ai'] })
    expect(parsed.adminEnabledModuleIds).toContain('staff')
    expect(parsed.adminEnabledModuleIds).toContain('data')
  })

  it('restricts admin permissions when integrations module disabled', () => {
    const caps = parseRoleCapabilities({ adminEnabledModuleIds: ['staff', 'data'] })
    const allowed = adminPermissionsAllowedByCapabilities(caps)
    expect(allowed).not.toBeNull()
    expect(allowed!.has('config:users')).toBe(true)
    expect(allowed!.has('config:master_data')).toBe(true)
    expect(allowed!.has('config:omicall')).toBe(false)
    expect(allowed!.has('config:ai_engine')).toBe(false)
  })
})
