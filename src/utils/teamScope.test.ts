import { describe, expect, it } from 'vitest'
import type { VietMyUserProfile } from '../types'
import {
  counselorIdsInManagerScope,
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
})
