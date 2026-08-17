import { describe, expect, it } from 'vitest'
import { firestoreReadErrorMessage } from './firestoreReadError'

describe('firestoreReadErrorMessage', () => {
  it('maps permission-denied to Vietnamese guidance', () => {
    expect(firestoreReadErrorMessage({ code: 'permission-denied', message: 'Missing or insufficient permissions.' }, 'fb')).toMatch(
      /không có quyền/i,
    )
  })

  it('uses fallback when empty', () => {
    expect(firestoreReadErrorMessage(null, 'fallback')).toBe('fallback')
  })

  it('unwraps already-localized string from { message }', () => {
    expect(
      firestoreReadErrorMessage({ message: 'Không có quyền đọc dữ liệu trường này. Đăng xuất rồi đăng nhập lại, hoặc nhờ quản trị kiểm tra mã trường trên tài khoản.' }, 'fb'),
    ).toMatch(/không có quyền/i)
  })

  it('maps missing composite index without exposing console URL', () => {
    const msg = firestoreReadErrorMessage(
      {
        code: 'failed-precondition',
        message: 'The query requires an index. You can create it here: https://console.firebase.google.com/project/x/indexes',
      },
      'fb',
    )
    expect(msg).toMatch(/chỉ mục/i)
    expect(msg).not.toMatch(/console\.firebase/i)
  })

  it('keeps an already-localized string', () => {
    expect(firestoreReadErrorMessage('Không đọc được kho tri thức.', 'fb')).toBe('Không đọc được kho tri thức.')
  })

  it('returns Error message when not a known code', () => {
    expect(firestoreReadErrorMessage(new Error('timeout'), 'fb')).toBe('timeout')
  })
})
