import { describe, expect, it } from 'vitest'
import { mapSheetRow, normalizeStaffMatchKey, resolveAssignedCounselorUid } from './excelLeadMapper'

const team = [
  { id: 'u1', email: 'a@x.com', displayName: 'Nguyễn Văn A' },
  { id: 'u2', email: 'b@x.com', displayName: 'Nguyễn Văn A' },
  { id: 'u3', email: 'c@x.com', displayName: 'Trần Thị B' },
]

describe('mapSheetRow', () => {
  it('maps standard intake column titles (13-column template)', () => {
    const row = mapSheetRow({
      'Tên sinh viên': '  Nguyễn Văn A  ',
      'Điện thoại': '0901',
      'Nguồn': 'Facebook',
      'Hệ đào tạo': 'Đại học',
      'Người phụ trách': 'a@x.com',
      'Tình trạng': 'Mới',
      'Ghi Chú thêm': 'Ghi chú',
      'Trường học': 'THPT 1',
      'Lớp': '12A1',
      'Tỉnh /Thành Phố': 'Hà Nội',
      'Địa chỉ': 'P.1',
      'ĐT Người liên hệ': '0902',
      'Mã KH': 'KH001',
    })
    expect(row.fullName).toBe('Nguyễn Văn A')
    expect(row.phone).toBe('0901')
    expect(row.source).toBe('Facebook')
    expect(row.educationLevel).toBe('Đại học')
    expect(row.assignedToRaw).toBe('a@x.com')
    expect(row.statusRaw).toBe('Mới')
    expect(row.description).toBe('Ghi chú')
    expect(row.highSchool).toBe('THPT 1')
    expect(row.gradeClass).toBe('12A1')
    expect(row.province).toBe('Hà Nội')
    expect(row.address).toBe('P.1')
    expect(row.parentPhone).toBe('0902')
    expect(row.customerId).toBe('KH001')
  })

  it('still maps legacy Excel headers', () => {
    const row = mapSheetRow({
      'Tên khách hàng': 'B',
      'Nguồn khách hàng': 'Zalo',
      'Mô tả': 'old',
      'Điện thoại người liên hệ chính': '090',
    })
    expect(row.fullName).toBe('B')
    expect(row.source).toBe('Zalo')
    expect(row.description).toBe('old')
    expect(row.parentPhone).toBe('090')
  })
})

describe('normalizeStaffMatchKey', () => {
  it('strips diacritics and collapses spaces', () => {
    expect(normalizeStaffMatchKey('  Nguyễn  Văn  A  ')).toBe(normalizeStaffMatchKey('Nguyen Van A'))
  })
})

describe('resolveAssignedCounselorUid', () => {
  it('matches uid, email, exact display name', () => {
    expect(resolveAssignedCounselorUid('u3', team)).toBe('u3')
    expect(resolveAssignedCounselorUid('b@x.com', team)).toBe('u2')
    expect(resolveAssignedCounselorUid('Trần Thị B', team)).toBe('u3')
  })

  it('matches display name after normalization', () => {
    expect(resolveAssignedCounselorUid('Nguyen Van A', team)).toBe('u1')
  })

  it('picks deterministic uid when multiple share normalized display name', () => {
    expect(resolveAssignedCounselorUid('nguyen van a', team)).toBe('u1')
  })
})
