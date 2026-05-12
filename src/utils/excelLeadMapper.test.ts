import { describe, expect, it } from 'vitest'
import { normalizeStaffMatchKey, resolveAssignedCounselorUid } from './excelLeadMapper'

const team = [
  { id: 'u1', email: 'a@x.com', displayName: 'Nguyễn Văn A' },
  { id: 'u2', email: 'b@x.com', displayName: 'Nguyễn Văn A' },
  { id: 'u3', email: 'c@x.com', displayName: 'Trần Thị B' },
]

describe('normalizeStaffMatchKey', () => {
  it('strips diacritics and collapses spaces', () => {
    expect(normalizeStaffMatchKey('  Nguyễn  Văn  A  ')).toBe(normalizeStaffMatchKey('Nguyen Van A'))
  })
})

describe('resolveAssignedCounselorUid', () => {
  it('matches uid, email, exact display name', () => {
    expect(resolveAssignedCounselorUid('u3', team)).toBe('u3')
    expect(resolveAssignedCounselorUid('b@x.com', team)).toBe('u2')
    expect(resolveAssignedCounselorUid('Trần Thị B', team)).toBe('u3')
  })

  it('matches display name after normalization', () => {
    expect(resolveAssignedCounselorUid('Nguyen Van A', team)).toBe('u1')
  })

  it('picks deterministic uid when multiple share normalized display name', () => {
    expect(resolveAssignedCounselorUid('nguyen van a', team)).toBe('u1')
  })
})
