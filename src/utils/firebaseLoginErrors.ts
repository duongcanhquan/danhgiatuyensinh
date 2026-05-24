export function firebaseAuthErrorCode(err: unknown): string {
  if (err && typeof err === 'object' && 'code' in err && typeof (err as { code: unknown }).code === 'string') {
    return (err as { code: string }).code
  }
  return ''
}

export function mapFirebaseLoginError(err: unknown): string {
  const code = firebaseAuthErrorCode(err)
  const byCode: Record<string, string> = {
    'auth/invalid-credential': 'Sai email hoặc mật khẩu.',
    'auth/wrong-password': 'Sai email hoặc mật khẩu.',
    'auth/invalid-login-credentials': 'Sai email hoặc mật khẩu.',
    'auth/user-not-found': 'Tài khoản không tồn tại.',
    'auth/too-many-requests': 'Thử quá nhiều lần. Đợi một lát rồi thử lại.',
    'auth/invalid-email': 'Email không đúng định dạng.',
    'auth/user-disabled': 'Tài khoản đã bị vô hiệu hóa. Liên hệ quản trị.',
    'auth/network-request-failed': 'Không kết nối được tới Firebase. Kiểm tra mạng.',
  }
  if (code && byCode[code]) return byCode[code]
  if (code) return `Đăng nhập không thành công (${code}).`
  if (err instanceof Error && err.message) return `Đăng nhập không thành công: ${err.message}`
  return 'Đăng nhập không thành công.'
}
