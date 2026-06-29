import { describe, expect, it } from 'vitest'
import { isLlmAnalysisAllowedForProfile } from './llmAccess'
import { defaultPermissionsForRole, hasPermission, resolveEffectivePermissions } from './permissions'
import type { VietMyUserProfile } from '../types'

function profile(partial: Partial<VietMyUserProfile> & Pick<VietMyUserProfile, 'id' | 'email' | 'role'>): VietMyUserProfile {
  return {
    displayName: partial.displayName ?? partial.email,
    isActive: true,
    ...partial,
  }
}

describe('isLlmAnalysisAllowedForProfile', () => {
  it('super_admin and admin always allowed without flag', () => {
    expect(isLlmAnalysisAllowedForProfile(profile({ id: '1', email: 'a@x.vn', role: 'super_admin' }))).toBe(true)
    expect(isLlmAnalysisAllowedForProfile(profile({ id: '2', email: 'b@x.vn', role: 'admin' }))).toBe(true)
  })

  it('counselor and team_lead need allowLlmAndAiTasks', () => {
    const counselor = profile({ id: '3', email: 'c@x.vn', role: 'counselor' })
    expect(isLlmAnalysisAllowedForProfile(counselor)).toBe(false)
    expect(isLlmAnalysisAllowedForProfile({ ...counselor, allowLlmAndAiTasks: true })).toBe(true)

    const lead = profile({ id: '4', email: 'd@x.vn', role: 'team_lead' })
    expect(isLlmAnalysisAllowedForProfile(lead)).toBe(false)
    expect(isLlmAnalysisAllowedForProfile({ ...lead, allowLlmAndAiTasks: true })).toBe(true)
  })

  it('ctv has ai:use denied at permission layer', () => {
    const ctv = profile({ id: '5', email: 'e@x.vn', role: 'ctv' })
    expect(hasPermission(defaultPermissionsForRole('ctv'), 'ai:use')).toBe(false)
    expect(isLlmAnalysisAllowedForProfile({ ...ctv, allowLlmAndAiTasks: true })).toBe(true)
  })
})

describe('canRunLlmAnalysis composition', () => {
  it('counselor with ai:use and flag passes both checks', () => {
    const p = profile({ id: '6', email: 'f@x.vn', role: 'counselor', allowLlmAndAiTasks: true })
    const perms = resolveEffectivePermissions(p)
    expect(hasPermission(perms, 'ai:use') && isLlmAnalysisAllowedForProfile(p)).toBe(true)
  })

  it('counselor with ai:use but no flag blocked', () => {
    const p = profile({ id: '7', email: 'g@x.vn', role: 'counselor' })
    const perms = resolveEffectivePermissions(p)
    expect(hasPermission(perms, 'ai:use')).toBe(true)
    expect(isLlmAnalysisAllowedForProfile(p)).toBe(false)
  })
})
