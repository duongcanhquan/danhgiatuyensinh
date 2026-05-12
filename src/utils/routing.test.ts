import { describe, expect, it } from 'vitest'
import { pickCounselorByLowestLoad, pickPrimaryAdminUid } from './routing'

const u = (id: string, role: 'admin' | 'counselor', email: string) => ({
  id,
  email,
  displayName: id,
  role,
  isActive: true,
  createdAt: {} as never,
  updatedAt: {} as never,
})

describe('pickPrimaryAdminUid', () => {
  it('returns null when no admin', () => {
    expect(pickPrimaryAdminUid([u('c1', 'counselor', 'z@x.com')])).toBeNull()
  })

  it('returns stable admin by email sort', () => {
    const admins = [u('a2', 'admin', 'b@x.com'), u('a1', 'admin', 'a@x.com')]
    expect(pickPrimaryAdminUid(admins)).toBe('a1')
  })

  it('ignores inactive admins', () => {
    const admins = [{ ...u('a1', 'admin', 'a@x.com'), isActive: false }]
    expect(pickPrimaryAdminUid(admins)).toBeNull()
  })
})

describe('pickCounselorByLowestLoad', () => {
  it('returns null when no active counselors', () => {
    expect(pickCounselorByLowestLoad([], new Map())).toBeNull()
  })
})
