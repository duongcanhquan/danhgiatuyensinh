import { describe, expect, it } from 'vitest'
import { findScholarshipIdByLabel } from './scholarshipLabelResolver'

describe('findScholarshipIdByLabel', () => {
  const items = [
    { id: 'a1', label: 'Học bổng Tài năng 50%', isActive: true },
    { id: 'a2', label: 'HB Khuyến khích', isActive: true },
    { id: 'off', label: 'Đã tắt', isActive: false },
  ]

  it('khớp không dấu / hoa thường', () => {
    expect(findScholarshipIdByLabel(items, 'hoc bong tai nang 50%')).toBe('a1')
    expect(findScholarshipIdByLabel(items, 'HB Khuyến khích')).toBe('a2')
  })

  it('không khớp → null', () => {
    expect(findScholarshipIdByLabel(items, 'Không tồn tại')).toBeNull()
    expect(findScholarshipIdByLabel(items, '')).toBeNull()
  })

  it('soft match chứa nhau', () => {
    expect(findScholarshipIdByLabel(items, 'Tài năng 50%')).toBe('a1')
  })
})
