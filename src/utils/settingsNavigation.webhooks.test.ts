import { describe, expect, it } from 'vitest'
import {
  enabledSubsForMain,
  isSettingsSubEnabled,
  resolveSettingsRoute,
  type SettingsAccessContext,
} from './settingsNavigation'

const fullAccess: SettingsAccessContext = {
  canIntake: true,
  canMaster: true,
  canScoringRules: true,
  canScoringProfilesTeam: true,
  canScoringProfilesOwn: true,
  canPlaybooks: true,
  canAiEngine: true,
  canOmicall: true,
  canStaff: true,
  canStaffTeam: true,
  canPermMatrix: true,
}

describe('settingsNavigation webhooks', () => {
  it('exposes webhooks under connect for master or omicall', () => {
    expect(isSettingsSubEnabled('webhooks', fullAccess)).toBe(true)
    expect(enabledSubsForMain('connect', fullAccess)).toContain('webhooks')
    expect(enabledSubsForMain('connect', fullAccess)).toContain('hub')
    expect(resolveSettingsRoute('connect', 'webhooks', fullAccess)).toEqual({
      main: 'connect',
      sub: 'webhooks',
    })
    expect(resolveSettingsRoute('n8n', null, fullAccess).sub).toBe('webhooks')
    expect(resolveSettingsRoute('integrations', null, fullAccess).sub).toBe('hub')
  })

  it('hides webhooks without master/omicall', () => {
    expect(
      isSettingsSubEnabled('webhooks', {
        ...fullAccess,
        canMaster: false,
        canOmicall: false,
      }),
    ).toBe(false)
    expect(
      isSettingsSubEnabled('hub', {
        ...fullAccess,
        canMaster: false,
        canOmicall: false,
      }),
    ).toBe(false)
  })
})
