import { HttpsError } from 'firebase-functions/v2/https'

function authErrorCode(e: unknown): string {
  if (e && typeof e === 'object') {
    const o = e as { code?: string; errorInfo?: { code?: string } }
    return String(o.errorInfo?.code ?? o.code ?? '').trim()
  }
  return ''
}

function authErrorMessage(e: unknown): string {
  if (e instanceof Error) return e.message.trim()
  return String(e ?? '').trim()
}

export function isAuthUserNotFound(e: unknown): boolean {
  const code = authErrorCode(e)
  const msg = authErrorMessage(e).toLowerCase()
  return (
    code === 'auth/user-not-found' ||
    msg.includes('user-not-found') ||
    msg.includes('no user record') ||
    msg.includes('there is no user record')
  )
}

export function toStaffAuthHttpsError(e: unknown, fallback: string): HttpsError {
  const code = authErrorCode(e)
  const msg = authErrorMessage(e)

  if (isAuthUserNotFound(e)) {
    return new HttpsError(
      'not-found',
      'Firebase Auth không có tài khoản này — gửi email đặt lại mật khẩu hoặc tạo lại user.',
    )
  }
  if (code === 'auth/invalid-password' || code === 'auth/weak-password') {
    return new HttpsError(
      'invalid-argument',
      'Mật khẩu không đủ mạnh — dùng ít nhất 6 ký tự, tránh mật khẩu quá phổ biến.',
    )
  }
  if (code === 'auth/operation-not-allowed') {
    return new HttpsError('failed-precondition', 'Chưa bật đăng nhập Email/Password trên Firebase Authentication.')
  }
  if (code === 'auth/email-already-exists') {
    return new HttpsError('already-exists', 'Email đã gắn tài khoản Auth khác.')
  }
  if (msg) return new HttpsError('internal', msg)
  return new HttpsError('internal', fallback)
}
