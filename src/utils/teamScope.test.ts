import { describe, expect, it } from 'vitest'
import type { VietMyUserProfile } from '../types'
import {
  counselorIdsInManagerScope,
  isUserInExplicitTeamRoster,
  patchesForCounselorTeamAssignment,
  primaryTeamLeadForCounselor,
  teamLeadsForCounselor,
} from './teamScope'

const now = { seconds: 0, nanoseconds: 0 } as VietMyUserProfile['createdAt']

function u(
  id: string,
  role: VietMyUserProfile['role'],
  extra: Partial<VietMyUserProfile> = {},
): VietMyUserProfile {
  return {
    id,
    email: `${id}@x.vn`,
    displayName: id,
    role,
    isActive: true,
    createdAt: now,
    updatedAt: now,
    ...extra,
  }
}

describe('teamScope roster', () => {
  const directory = [
    u('lead-a', 'team_lead', { managedCounselorIds: ['c1'] }),
    u('lead-b', 'team_lead', { managedCounselorIds: ['c2'] }),
    u('c1', 'counselor'),
    u('c2', 'counselor'),
    u('c3', 'counselor'),
  ]

  it('lists team leads for counselor', () => {
    expect(teamLeadsForCounselor('c1', directory).map((x) => x.id)).toEqual(['lead-a'])
    expect(teamLeadsForCounselor('c3', directory)).toEqual([])
  })

  it('patches move counselor between leads', () => {
    const patches = patchesForCounselorTeamAssignment('c1', 'lead-b', directory)
    expect(patches).toHaveLength(2)
    const a = patches.find((p) => p.userId === 'lead-a')
    const b = patches.find((p) => p.userId === 'lead-b')
    expect(a?.managedCounselorIds).toEqual([])
    expect(b?.managedCounselorIds.sort()).toEqual(['c1', 'c2'].sort())
  })

  it('primaryTeamLead prefers explicit roster', () => {
    const dir = [
      u('lead-legacy', 'team_lead', { departmentId: 'd1' }),
      u('lead-explicit', 'team_lead', { managedCounselorIds: ['c1'] }),
      u('c1', 'counselor', { departmentId: 'd1' }),
    ]
    expect(primaryTeamLeadForCounselor('c1', dir)?.id).toBe('lead-explicit')
    expect(counselorIdsInManagerScope(dir[0], dir)).toContain('c1')
  })

  it('explicit roster ignores department fallback for staff ops', () => {
    const lead = u('lead-a', 'team_lead', { departmentId: 'd1', managedCounselorIds: [] })
    const c1 = u('c1', 'counselor', { departmentId: 'd1' })
    const dir = [lead, c1]
    expect(counselorIdsInManagerScope(lead, dir)).toContain('c1')
    expect(isUserInExplicitTeamRoster(lead, c1)).toBe(false)
    const withRoster = u('lead-a', 'team_lead', { departmentId: 'd1', managedCounselorIds: ['c1'] })
    expect(isUserInExplicitTeamRoster(withRoster, c1)).toBe(true)
  })

  it('clears orphan managedCounselorIds on admin when reassigning counselor', () => {
    const dir = [
      u('mgr', 'admin', { managedCounselorIds: ['c1'] }),
      u('lead-a', 'team_lead', { managedCounselorIds: [] }),
      u('c1', 'counselor'),
    ]
    const patches = patchesForCounselorTeamAssignment('c1', 'lead-a', dir)
    expect(patches.find((p) => p.userId === 'mgr')?.managedCounselorIds).toEqual([])
    expect(patches.find((p) => p.userId === 'lead-a')?.managedCounselorIds).toEqual(['c1'])
  })

  it('allows assigning counselor only into team_lead rosters (not admin)', () => {
    const dir = [
      u('mgr', 'admin', { managedCounselorIds: [] }),
      u('lead-a', 'team_lead', { managedCounselorIds: ['c1'] }),
      u('c1', 'counselor'),
    ]
    const patches = patchesForCounselorTeamAssignment('c1', 'mgr', dir)
    expect(patches.find((p) => p.userId === 'mgr')).toBeUndefined()
    expect(patches.find((p) => p.userId === 'lead-a')?.managedCounselorIds).toEqual([])
  })
})
