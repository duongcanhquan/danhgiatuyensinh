import { describe, expect, it } from 'vitest'
import {
  enabledSubsForMain,
  isConnectDetailSub,
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

describe('settingsNavigation connect hub', () => {
  it('nav chỉ còn Các kênh + Tư vấn — không trùng tab Gọi điện/n8n/AI', () => {
    const subs = enabledSubsForMain('connect', fullAccess)
    expect(subs).toEqual(['hub', 'consulting'])
    expect(subs).not.toContain('webhooks')
    expect(subs).not.toContain('omicall')
    expect(subs).not.toContain('llm')
    expect(subs).not.toContain('comms')
    expect(subs).not.toContain('invite_docs')
  })

  it('URL sâu webhooks/omicall/comms vẫn mở được; llm gộp Tư vấn', () => {
    expect(isConnectDetailSub('webhooks')).toBe(true)
    expect(isConnectDetailSub('invite_docs')).toBe(true)
    expect(isConnectDetailSub('llm')).toBe(false)
    expect(resolveSettingsRoute('connect', 'webhooks', fullAccess)).toEqual({
      main: 'connect',
      sub: 'webhooks',
    })
    expect(resolveSettingsRoute('connect', 'llm', fullAccess)).toEqual({
      main: 'connect',
      sub: 'consulting',
    })
    expect(resolveSettingsRoute('connect', 'comms', fullAccess)).toEqual({
      main: 'connect',
      sub: 'comms',
    })
    expect(resolveSettingsRoute('n8n', null, fullAccess).sub).toBe('webhooks')
    expect(resolveSettingsRoute('giay_moi', null, fullAccess).sub).toBe('invite_docs')
    expect(resolveSettingsRoute('chung_tu', null, fullAccess).sub).toBe('receipts')
    expect(resolveSettingsRoute('integrations', null, fullAccess).sub).toBe('hub')
  })

  it('knowledge legacy → Tư vấn; tab connect không có knowledge ngang', () => {
    expect(resolveSettingsRoute('connect', 'knowledge', fullAccess)).toEqual({
      main: 'connect',
      sub: 'consulting',
    })
    expect(enabledSubsForMain('connect', fullAccess)).not.toContain('knowledge')
  })

  it('hides hub without master/omicall', () => {
    expect(
      isSettingsSubEnabled('hub', {
        ...fullAccess,
        canMaster: false,
        canOmicall: false,
      }),
    ).toBe(false)
  })
})
