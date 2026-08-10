import { describe, expect, it } from 'vitest'
import type { VietMyUserProfile } from '../types'
import { resolveTeamRosterMembers } from './teamRosterMembers'

function user(
  partial: Pick<VietMyUserProfile, 'id' | 'role'> &
    Partial<Pick<VietMyUserProfile, 'displayName' | 'managedCounselorIds' | 'isActive'>>,
): VietMyUserProfile {
  return {
    email: `${partial.id}@test.local`,
    displayName: partial.displayName ?? partial.id,
    orgId: 'vietmy',
    isActive: partial.isActive ?? true,
    managedCounselorIds: partial.managedCounselorIds,
    createdAt: {} as VietMyUserProfile['createdAt'],
    updatedAt: {} as VietMyUserProfile['updatedAt'],
    ...partial,
  }
}

describe('resolveTeamRosterMembers', () => {
  const tvv1 = user({ id: 'tvv1', role: 'counselor', displayName: 'An' })
  const tvv2 = user({ id: 'tvv2', role: 'counselor', displayName: 'Bình' })
  const tvv3 = user({ id: 'tvv3', role: 'ctv', displayName: 'Chi' })
  const lead = user({
    id: 'tl1',
    role: 'team_lead',
    displayName: 'Trưởng',
    managedCounselorIds: ['tvv1', 'tvv2'],
  })
  const admin = user({ id: 'adm', role: 'admin', displayName: 'Quản trị' })
  const directory = [tvv1, tvv2, tvv3, lead, admin]

  it('team lead only sees managed roster', () => {
    const rows = resolveTeamRosterMembers({
      profile: lead,
      can: (p) => p === 'dashboard:team_lead' || p === 'leads:read:team_scope',
      directory,
    })
    expect(rows.map((r) => r.counselorUid)).toEqual(['tvv1', 'tvv2'])
  })

  it('admin sees all field staff and can filter by team lead', () => {
    const all = resolveTeamRosterMembers({
      profile: admin,
      can: (p) => p === 'leads:read:global',
      directory,
    })
    expect(all.map((r) => r.counselorUid)).toEqual(['tvv1', 'tvv2', 'tvv3'])

    const filtered = resolveTeamRosterMembers({
      profile: admin,
      can: (p) => p === 'leads:read:global',
      directory,
      filterTeamLeadUid: 'tl1',
    })
    expect(filtered.map((r) => r.counselorUid)).toEqual(['tvv1', 'tvv2'])
  })
})
