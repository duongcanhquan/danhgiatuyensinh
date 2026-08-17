function firestoreErrorCode(err: unknown): string {
  if (err && typeof err === 'object' && 'code' in err) {
    return String((err as { code: unknown }).code)
  }
  return ''
}

function unwrapReadError(err: unknown): unknown {
  if (err instanceof Error) return err
  if (typeof err === 'string') return err
  if (err && typeof err === 'object' && 'message' in err) {
    const message = (err as { message: unknown }).message
    if (typeof message === 'string' && message.trim()) return message
    if (message instanceof Error) return message
  }
  return err
}

function looksLikeMissingIndex(code: string, raw: string): boolean {
  if (code === 'failed-precondition' || code === 'FAILED_PRECONDITION') return true
  return /requires an index/i.test(raw)
}

function stripConsoleUrls(text: string): string {
  return text.replace(/\s*https?:\/\/console\.firebase\.google\.com\S*/gi, '').trim()
}

/** Thông báo lỗi đọc Firestore — tránh hiện raw tiếng Anh / URL console từ SDK. */
export function firestoreReadErrorMessage(err: unknown, fallback: string): string {
  const inner = unwrapReadError(err)
  const code = firestoreErrorCode(inner) || firestoreErrorCode(err)
  const raw = inner instanceof Error ? inner.message : typeof inner === 'string' ? inner : String(inner ?? '')

  if (code === 'permission-denied' || code === 'permissions-denied' || /missing or insufficient permissions/i.test(raw)) {
    return 'Không có quyền đọc dữ liệu trường này. Đăng xuất rồi đăng nhập lại, hoặc nhờ quản trị kiểm tra mã trường trên tài khoản.'
  }
  if (looksLikeMissingIndex(code, raw)) {
    return 'Truy vấn kho dữ liệu cần chỉ mục Firestore. Tải lại trang; nếu vẫn lỗi, báo quản trị.'
  }

  const trimmed = stripConsoleUrls(raw)
  if (trimmed && trimmed !== '[object Object]') {
    if (inner instanceof Error || typeof inner === 'string') return trimmed
  }
  return fallback
}
