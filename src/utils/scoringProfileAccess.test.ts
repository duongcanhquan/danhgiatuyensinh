import { describe, expect, it } from 'vitest'
import type { ScoringProfile, VietMyUserProfile } from '../types'
import {
  canEditScoringProfile,
  filterApplicableScoringProfiles,
  inferScoringProfileScope,
  isGlobalScoringProfile,
} from './scoringProfileAccess'

function profile(partial: Partial<ScoringProfile> & Pick<ScoringProfile, 'id' | 'profileName'>): ScoringProfile {
  return {
    description: '',
    rules: [],
    ruleBlocks: [],
    thresholds: { hotMinScore: 80, warmMinScore: 50 },
    createdAt: { toMillis: () => 0 } as ScoringProfile['createdAt'],
    updatedAt: { toMillis: () => 0 } as ScoringProfile['updatedAt'],
    ...partial,
  }
}

const admin: VietMyUserProfile = {
  id: 'admin1',
  email: 'admin@test',
  displayName: 'Admin',
  role: 'admin',
  isActive: true,
}

const lead: VietMyUserProfile = {
  id: 'lead1',
  email: 'lead@test',
  displayName: 'Trưởng nhóm',
  role: 'team_lead',
  isActive: true,
  managedCounselorIds: ['tvv1'],
}

const counselor: VietMyUserProfile = {
  id: 'tvv1',
  email: 'tvv@test',
  displayName: 'TVV',
  role: 'counselor',
  isActive: true,
}

const directory = [admin, lead, counselor]

describe('scoringProfileAccess', () => {
  const globalP = profile({ id: 'g1', profileName: 'Global', scope: 'global' })
  const teamP = profile({ id: 't1', profileName: 'Team', scope: 'team', scopeOwnerUid: 'lead1', createdBy: 'lead1' })
  const legacyGlobal = profile({ id: 'lg', profileName: 'Legacy global' })
  const all = [globalP, teamP, legacyGlobal]

  it('infers global vs team scope', () => {
    expect(inferScoringProfileScope(globalP)).toBe('global')
    expect(inferScoringProfileScope(teamP)).toBe('team')
    expect(isGlobalScoringProfile(legacyGlobal)).toBe(true)
  })

  it('counselor sees global + own team profiles only', () => {
    const can = (p: string) => p === 'dashboard:counselor'
    const visible = filterApplicableScoringProfiles(all, counselor, directory, can)
    expect(visible.map((p) => p.id).sort()).toEqual(['g1', 'lg', 't1'])
  })

  it('team lead can edit own team profile not global', () => {
    const can = (p: string) => p === 'config:scoring_profiles_team'
    expect(canEditScoringProfile(teamP, lead, directory, can)).toBe(true)
    expect(canEditScoringProfile(globalP, lead, directory, can)).toBe(false)
  })

  it('admin edits all profiles', () => {
    const can = (p: string) => p === 'config:scoring_rules'
    expect(canEditScoringProfile(teamP, admin, directory, can)).toBe(true)
    expect(canEditScoringProfile(globalP, admin, directory, can)).toBe(true)
  })
})
