import { describe, expect, it } from 'vitest'
import { canCreateLead, canWriteLead, leadAssignedUid } from './leadAccess'
import type { VietMyUserProfile } from '../types'

function profile(partial: Partial<VietMyUserProfile> & Pick<VietMyUserProfile, 'id' | 'role'>): VietMyUserProfile {
  return {
    email: 'a@b.c',
    displayName: 'A',
    isActive: true,
    createdAt: {} as VietMyUserProfile['createdAt'],
    updatedAt: {} as VietMyUserProfile['updatedAt'],
    ...partial,
  }
}

describe('leadAccess capability-aware admin', () => {
  it('super_admin always creates/writes', () => {
    const p = profile({ id: 'sa', role: 'super_admin' })
    const can = () => false
    expect(canCreateLead(p, can)).toBe(true)
    expect(canWriteLead(p, { assignedTo: 'other' }, can, [])).toBe(true)
  })

  it('admin with global read+write can write any lead', () => {
    const p = profile({ id: 'ad', role: 'admin' })
    const can = (perm: string) =>
      perm === 'leads:read:global' || perm === 'leads:write:team_scope'
    expect(canCreateLead(p, can)).toBe(true)
    expect(canWriteLead(p, { assignedTo: 'other' }, can, [])).toBe(true)
  })

  it('admin with only global read cannot write other leads', () => {
    const p = profile({ id: 'ad', role: 'admin' })
    const can = (perm: string) => perm === 'leads:read:global'
    expect(canCreateLead(p, can)).toBe(true)
    expect(canWriteLead(p, { assignedTo: 'other' }, can, [])).toBe(false)
  })

  it('admin without global only writes self-assigned when granted', () => {
    const p = profile({ id: 'ad', role: 'admin' })
    const can = (perm: string) => perm === 'leads:write:self_assigned'
    expect(canCreateLead(p, can)).toBe(true)
    expect(canWriteLead(p, { assignedTo: 'ad' }, can, [])).toBe(true)
    expect(canWriteLead(p, { assignedTo: 'other' }, can, [])).toBe(false)
  })

  it('leadAssignedUid falls back when assignedTo is empty string', () => {
    expect(leadAssignedUid({ assignedTo: '', assignedCounselorId: 'c3' })).toBe('c3')
    expect(leadAssignedUid({ assignedTo: 'c1', assignedCounselorId: 'c3' })).toBe('c1')
    expect(leadAssignedUid({ assignedTo: '  ', assignedCounselorId: null })).toBeUndefined()
  })

  it('self-write uses legacy assignee when assignedTo is empty', () => {
    const p = profile({ id: 'c3', role: 'counselor' })
    const can = (perm: string) => perm === 'leads:write:self_assigned'
    expect(canWriteLead(p, { assignedTo: '', assignedCounselorId: 'c3' }, can, [])).toBe(true)
  })
})
