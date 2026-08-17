import { FirebaseError } from 'firebase/app'

/** Copy lỗi ghi dữ liệu — không nhắc Rules / mã kỹ thuật với người dùng. */
export const MSG_SAVE_FAILED = 'Không lưu được. Thử lại hoặc liên hệ quản trị.'
export const MSG_DELETE_FAILED = 'Không xóa được. Thử lại hoặc liên hệ quản trị.'
export const MSG_NO_SESSION = 'Chưa đăng nhập hoặc mất kết nối. Đăng nhập lại rồi thử.'
export const MSG_NO_CHANGES = 'Không có thay đổi để lưu.'

export function userFacingWriteError(e: unknown): string {
  if (e instanceof FirebaseError) {
    if (e.code === 'permission-denied') {
      return 'Bạn không có quyền thực hiện thao tác này.'
    }
    if (e.code === 'unavailable') {
      return 'Hệ thống tạm thời không kết nối được. Thử lại sau.'
    }
    if (e.code === 'unauthenticated') {
      return 'Phiên đăng nhập hết hạn. Đăng nhập lại.'
    }
    return MSG_SAVE_FAILED
  }
  if (e instanceof Error && e.message.trim() && !/firestore|permission-denied|rules/i.test(e.message)) {
    return e.message.trim()
  }
  return MSG_SAVE_FAILED
}
