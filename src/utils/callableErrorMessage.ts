import { FirebaseError } from 'firebase/app'

const CODE_MESSAGES: Record<string, string> = {
  unauthenticated: 'Phiên đăng nhập hết hạn — đăng nhập lại.',
  'permission-denied': 'Không có quyền thực hiện thao tác này.',
  'not-found': 'Không tìm thấy dữ liệu trên server.',
  'invalid-argument': 'Dữ liệu gửi lên không hợp lệ.',
  'failed-precondition': 'Không thể thực hiện trong trạng thái hiện tại.',
  'already-exists': 'Dữ liệu đã tồn tại.',
  'resource-exhausted': 'Server đang quá tải — thử lại sau.',
  unavailable: 'Server tạm không phản hồi — thử lại sau.',
  'not-found-function': 'Chức năng server chưa được triển khai — liên hệ quản trị deploy Cloud Functions.',
}

function callableCode(err: FirebaseError): string {
  return err.code.replace(/^functions\//, '')
}

/** Lấy thông báo tiếng Việt từ lỗi `httpsCallable` — tránh chỉ hiện chữ «internal». */
export function callableErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof FirebaseError) {
    const msg = err.message?.trim() ?? ''
    if (msg && msg.toLowerCase() !== 'internal') return msg
    const code = callableCode(err)
    if (CODE_MESSAGES[code]) return CODE_MESSAGES[code]
    const details = (err as FirebaseError & { details?: unknown }).details
    if (typeof details === 'string' && details.trim()) return details.trim()
    if (code === 'not-found' || code === 'unavailable') {
      return CODE_MESSAGES['not-found-function'] ?? fallback
    }
  }
  if (err instanceof Error) {
    const msg = err.message.trim()
    if (msg && msg.toLowerCase() !== 'internal') return msg
  }
  return fallback
}
