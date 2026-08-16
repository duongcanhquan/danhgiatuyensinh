import { describe, expect, it } from 'vitest'
import {
  formatStaffDisplayName,
  formatStaffDirectoryLabel,
  looksLikeUserIdCode,
  resolveCounselorDisplayName,
} from './counselorDisplay'

describe('counselorDisplay', () => {
  it('prefers displayName over email and never shows uid codes', () => {
    expect(
      formatStaffDisplayName({ id: 'abc123456789012345678901234', displayName: 'Nguyễn An', email: 'a@x.vn' }),
    ).toBe('Nguyễn An')
    expect(formatStaffDisplayName({ id: 'abc123456789012345678901234', displayName: '', email: 'a@x.vn' })).toBe(
      'a@x.vn',
    )
    expect(formatStaffDisplayName({ id: 'abc123456789012345678901234', displayName: '', email: '' })).toBe(
      'Chưa đặt tên',
    )
    expect(formatStaffDirectoryLabel({ id: 'abc123456789012345678901234', displayName: '', email: '' })).not.toMatch(
      /…/,
    )
  })

  it('detects firebase-like ids', () => {
    expect(looksLikeUserIdCode('xYz1234567890AbCdEfGhIjKlMnOp')).toBe(true)
    expect(looksLikeUserIdCode('Nguyễn Văn A')).toBe(false)
  })

  it('resolves from directory then uploaderName', () => {
    expect(
      resolveCounselorDisplayName('u1', {
        directoryNames: new Map([['u1', 'Trần Bình']]),
      }),
    ).toBe('Trần Bình')
    expect(
      resolveCounselorDisplayName('u2', {
        leadUploaderName: 'Lê Chi',
      }),
    ).toBe('Lê Chi')
    expect(resolveCounselorDisplayName('u3')).toBe('Chưa đặt tên')
  })
})
