import { FirebaseError } from 'firebase/app'
import { describe, expect, it } from 'vitest'
import { callableErrorMessage } from './callableErrorMessage'

describe('callableErrorMessage', () => {
  it('maps generic internal to fallback', () => {
    const err = new FirebaseError('functions/internal', 'internal')
    expect(callableErrorMessage(err, 'Lỗi mặc định')).toBe('Lỗi mặc định')
  })

  it('keeps server message when not internal', () => {
    const err = new FirebaseError('functions/invalid-argument', 'Mật khẩu cần ít nhất 6 ký tự.')
    expect(callableErrorMessage(err, 'Lỗi mặc định')).toBe('Mật khẩu cần ít nhất 6 ký tự.')
  })

  it('maps permission-denied code', () => {
    const err = new FirebaseError('functions/permission-denied', 'internal')
    expect(callableErrorMessage(err, 'Lỗi mặc định')).toContain('quyền')
  })
})
