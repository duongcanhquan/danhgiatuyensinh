import { describe, expect, it } from 'vitest'
import { resolveImportAssigneeUid } from './importAssignee'

describe('resolveImportAssigneeUid', () => {
  it('prefers matched counselor from Excel', () => {
    expect(
      resolveImportAssigneeUid({
        rawAssign: 'a@x.com',
        matchedCounselorUid: 'tvv-1',
        adminPoolUid: 'admin-1',
      }),
    ).toBe('tvv-1')
  })

  it('assigns admin when Excel TVV empty or unmatched', () => {
    expect(
      resolveImportAssigneeUid({
        rawAssign: '',
        matchedCounselorUid: null,
        adminPoolUid: 'admin-1',
      }),
    ).toBe('admin-1')
    expect(
      resolveImportAssigneeUid({
        rawAssign: 'unknown',
        matchedCounselorUid: null,
        adminPoolUid: 'admin-1',
      }),
    ).toBe('admin-1')
  })

  it('returns null when no admin pool', () => {
    expect(
      resolveImportAssigneeUid({
        rawAssign: '',
        matchedCounselorUid: null,
        adminPoolUid: null,
      }),
    ).toBeNull()
  })
})
