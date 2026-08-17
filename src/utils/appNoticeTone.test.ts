import { describe, expect, it } from 'vitest'
import { appNoticeToneFromMessage } from './appNoticeTone'

describe('appNoticeToneFromMessage', () => {
  it('marks saved / created copy as success', () => {
    expect(appNoticeToneFromMessage('Đã lưu cập nhật.')).toBe('success')
    expect(appNoticeToneFromMessage('Đã tạo thư mục Drive.')).toBe('success')
  })

  it('marks in-progress copy as info', () => {
    expect(appNoticeToneFromMessage('Đang tải danh sách hồ sơ…')).toBe('info')
  })

  it('marks no-op save as info, not error', () => {
    expect(appNoticeToneFromMessage('Không có thay đổi để lưu.')).toBe('info')
  })

  it('marks permission / save failures as error', () => {
    expect(appNoticeToneFromMessage('Bạn không có quyền ghi tương tác.')).toBe('error')
    expect(appNoticeToneFromMessage('Không lưu được. Thử lại hoặc liên hệ quản trị.')).toBe('error')
  })

  it('marks missing input as warning', () => {
    expect(appNoticeToneFromMessage('Chưa có số tiền — TVV cần ghi nhận trước.')).toBe('warning')
    expect(appNoticeToneFromMessage('Chọn ngày thu trước khi duyệt.')).toBe('warning')
  })
})
