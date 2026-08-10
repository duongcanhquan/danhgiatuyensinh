/** Thông báo lỗi đọc Firestore — tránh hiện raw tiếng Anh từ SDK. */
export function firestoreReadErrorMessage(err: unknown, fallback: string): string {
  const code =
    err && typeof err === 'object' && 'code' in err ? String((err as { code: unknown }).code) : ''
  if (code === 'permission-denied' || code === 'permissions-denied') {
    return 'Không có quyền đọc dữ liệu trường này. Đăng xuất rồi đăng nhập lại, hoặc nhờ quản trị kiểm tra mã trường trên tài khoản.'
  }
  if (err instanceof Error && err.message.trim()) {
    const msg = err.message.trim()
    if (/missing or insufficient permissions/i.test(msg)) {
      return 'Không có quyền đọc dữ liệu trường này. Đăng xuất rồi đăng nhập lại, hoặc nhờ quản trị kiểm tra mã trường trên tài khoản.'
    }
    return msg
  }
  return fallback
}
