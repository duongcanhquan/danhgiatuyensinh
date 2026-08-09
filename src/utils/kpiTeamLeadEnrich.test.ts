import { describe, expect, it } from 'vitest'
import type { VietMyUserProfile } from '../types'
import {
  counselorInTeamLeadScope,
  enrichTeamLeadUidOnRows,
  resolveTeamLeadUidForCounselor,
} from './kpiTeamLeadEnrich'

function user(partial: Partial<VietMyUserProfile> & Pick<VietMyUserProfile, 'id' | 'role'>): VietMyUserProfile {
  return {
    email: `${partial.id}@t.test`,
    displayName: partial.id,
    isActive: true,
    ...partial,
  } as VietMyUserProfile
}

describe('kpiTeamLeadEnrich', () => {
  const tl = user({ id: 'tl1', role: 'team_lead', managedCounselorIds: ['tvv1'] })
  const tvv1 = user({ id: 'tvv1', role: 'counselor' })
  const tvv2 = user({ id: 'tvv2', role: 'counselor', departmentId: 'sale' })
  const tlDept = user({ id: 'tl2', role: 'team_lead', departmentId: 'sale' })
  const directory = [tl, tvv1, tvv2, tlDept]

  it('keeps existing teamLeadUid on doc', () => {
    expect(resolveTeamLeadUidForCounselor('tvv1', directory, 'other')).toBe('other')
  })

  it('fills from managedCounselorIds roster', () => {
    expect(resolveTeamLeadUidForCounselor('tvv1', directory)).toBe('tl1')
  })

  it('fills from department fallback when roster empty', () => {
    expect(resolveTeamLeadUidForCounselor('tvv2', directory)).toBe('tl2')
  })

  it('enriches rows missing teamLeadUid', () => {
    const rows = enrichTeamLeadUidOnRows(
      [
        { counselorUid: 'tvv1', totalCalls: 3 },
        { counselorUid: 'tvv1', teamLeadUid: 'kept', totalCalls: 1 },
      ],
      directory,
    )
    expect(rows[0]?.teamLeadUid).toBe('tl1')
    expect(rows[1]?.teamLeadUid).toBe('kept')
  })

  it('scopes team membership by roster even when row teamLeadUid missing', () => {
    expect(counselorInTeamLeadScope('tvv1', tl, directory, null)).toBe(true)
    expect(counselorInTeamLeadScope('tvv2', tl, directory, null)).toBe(false)
    expect(counselorInTeamLeadScope('tvv2', tlDept, directory, null)).toBe(true)
  })
})
