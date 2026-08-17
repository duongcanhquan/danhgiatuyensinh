export type AppNoticeTone = 'success' | 'error' | 'warning' | 'info'

/** Suy ra tone từ copy tiếng Việt — dùng khi chỗ gọi chỉ có chuỗi thông báo. */
export function appNoticeToneFromMessage(message: string): AppNoticeTone {
  const t = message.trim()
  if (!t) return 'info'
  const lower = t.toLocaleLowerCase('vi')

  if (lower.startsWith('đang ') || lower.includes('vui lòng đợi')) return 'info'

  if (
    lower.includes('không có thay đổi') ||
    lower.includes('không có gì để lưu')
  ) {
    return 'info'
  }

  if (
    /^(đã |đã lưu|đã tạo|đã cập nhật|đã gửi|đã xóa|đã chọn|đã thêm|đã điền|đã ghi)/.test(lower) ||
    lower.includes('thành công')
  ) {
    return 'success'
  }

  if (
    /không (lưu|xóa|đọc|tạo|ghi|mở|chạy|gửi|kết nối|phân|lập|duyệt|chọn được)/.test(lower) ||
    lower.includes('không được') ||
    lower.includes('thất bại') ||
    lower.includes('từ chối') ||
    lower.includes('permission') ||
    /\blỗi\b/.test(lower)
  ) {
    return 'error'
  }

  if (lower.includes('quyền')) return 'error'

  if (
    lower.includes('chưa ') ||
    lower.startsWith('cần ') ||
    lower.startsWith('chọn ') ||
    lower.includes('thử lại')
  ) {
    return 'warning'
  }

  if (lower.includes('không ')) return 'error'
  return 'info'
}
