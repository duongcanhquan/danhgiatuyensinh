import { describe, expect, it } from 'vitest'
import {
  enabledMainTabs,
  enabledSubsForMain,
  isConnectDetailSub,
  isSettingsSubEnabled,
  resolveSettingsRoute,
  shouldShowSettingsSubNav,
  SETTINGS_AI_ADVISE_HREF,
  SETTINGS_MAIN_LABELS,
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

describe('settingsNavigation five groups', () => {
  it('five main groups with plain labels', () => {
    expect(enabledMainTabs(fullAccess)).toEqual(['data', 'rules', 'advise', 'connect', 'people'])
    expect(SETTINGS_MAIN_LABELS.data).toBe('Cài đặt trường')
    expect(SETTINGS_MAIN_LABELS.rules).toBe('Cài đặt profile')
    expect(SETTINGS_MAIN_LABELS.advise).toBe('Tư vấn & AI')
    expect(SETTINGS_MAIN_LABELS.connect).toBe('Cài đặt kết nối')
    expect(SETTINGS_MAIN_LABELS.people).toBe('Cài đặt Nhân sự')
  })

  it('advise splits content vs AI machine', () => {
    expect(enabledSubsForMain('advise', fullAccess)).toEqual(['consulting', 'llm'])
    expect(enabledSubsForMain('connect', fullAccess)).toEqual(['hub'])
    expect(enabledSubsForMain('connect', fullAccess)).not.toContain('consulting')
    expect(shouldShowSettingsSubNav('advise', ['consulting', 'llm'], 'consulting')).toBe(true)
    expect(shouldShowSettingsSubNav('connect', ['hub'], 'hub')).toBe(false)
    expect(shouldShowSettingsSubNav('data', ['intake', 'master'], 'intake')).toBe(true)
    expect(SETTINGS_AI_ADVISE_HREF).toBe('/settings?tab=advise&sub=llm')
  })

  it('legacy connect+consulting / llm → advise zones', () => {
    expect(resolveSettingsRoute('connect', 'consulting', fullAccess)).toEqual({
      main: 'advise',
      sub: 'consulting',
    })
    expect(resolveSettingsRoute('connect', 'llm', fullAccess)).toEqual({
      main: 'advise',
      sub: 'llm',
    })
    expect(resolveSettingsRoute('advise', 'consulting', fullAccess)).toEqual({
      main: 'advise',
      sub: 'consulting',
    })
    expect(resolveSettingsRoute('llm', null, fullAccess)).toEqual({
      main: 'advise',
      sub: 'llm',
    })
    expect(isSettingsSubEnabled('llm', fullAccess)).toBe(true)
  })

  it('URL sâu kênh vẫn mở được', () => {
    expect(isConnectDetailSub('webhooks')).toBe(true)
    expect(resolveSettingsRoute('connect', 'webhooks', fullAccess)).toEqual({
      main: 'connect',
      sub: 'webhooks',
    })
    expect(resolveSettingsRoute('n8n', null, fullAccess).sub).toBe('webhooks')
    expect(resolveSettingsRoute('integrations', null, fullAccess).sub).toBe('hub')
  })

  it('Học phí nằm trong Cài đặt thông tin (không còn tab ngang riêng)', () => {
    expect(enabledSubsForMain('data', fullAccess)).not.toContain('tuition')
    expect(enabledSubsForMain('data', fullAccess)).toContain('lead_profile')
    expect(resolveSettingsRoute('data', 'tuition', fullAccess)).toEqual({
      main: 'data',
      sub: 'lead_profile',
    })
    expect(resolveSettingsRoute('hoc_phi', null, fullAccess).sub).toBe('lead_profile')
  })
})
