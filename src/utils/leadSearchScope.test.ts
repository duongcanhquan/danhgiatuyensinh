import { describe, expect, it } from 'vitest'
import {
  classifyLeadSearchQuery,
  leadSearchPlaceholderForRole,
  leadSearchScanLimitForProfile,
  MAX_LEAD_SEARCH_SCAN_ADMIN,
  MAX_LEAD_SEARCH_SCAN_SELF,
  MAX_LEAD_SEARCH_SCAN_TEAM,
  teamLeadAssigneeScopeIds,
} from './leadSearchScope'

describe('leadSearchScope', () => {
  it('caps scan by role', () => {
    expect(leadSearchScanLimitForProfile({ role: 'super_admin' }, true)).toBe(MAX_LEAD_SEARCH_SCAN_ADMIN)
    expect(leadSearchScanLimitForProfile({ role: 'admin' }, true)).toBe(MAX_LEAD_SEARCH_SCAN_ADMIN)
    expect(leadSearchScanLimitForProfile({ role: 'team_lead' }, false)).toBe(MAX_LEAD_SEARCH_SCAN_TEAM)
    expect(leadSearchScanLimitForProfile({ role: 'counselor' }, false)).toBe(MAX_LEAD_SEARCH_SCAN_SELF)
    expect(leadSearchScanLimitForProfile({ role: 'ctv' }, false)).toBe(MAX_LEAD_SEARCH_SCAN_SELF)
  })

  it('classifies phone vs systemCode vs text', () => {
    expect(classifyLeadSearchQuery('0987654321').kind).toBe('phone')
    expect(classifyLeadSearchQuery('2608150001').kind).toBe('systemCode')
    expect(classifyLeadSearchQuery('Nguyễn Văn A').kind).toBe('text')
  })

  it('includes team lead self in assignee scope', () => {
    expect(
      teamLeadAssigneeScopeIds({
        id: 'tl1',
        managedCounselorIds: ['c1', 'c2'],
      } as never),
    ).toEqual(['tl1', 'c1', 'c2'])
  })

  it('placeholder mentions scope', () => {
    expect(leadSearchPlaceholderForRole('counselor', false)).toMatch(/phụ trách/i)
    expect(leadSearchPlaceholderForRole('team_lead', false)).toMatch(/nhóm/i)
    expect(leadSearchPlaceholderForRole('admin', true)).toMatch(/toàn trường/i)
  })
})
