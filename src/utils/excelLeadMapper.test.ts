import { describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'
import {
  mapSheetRow,
  normalizeStaffMatchKey,
  parseWorkbookToRows,
  resolveAssignedCounselorUid,
  STANDARD_LEAD_INTAKE_HEADERS,
} from './excelLeadMapper'
import { COMPACT_V2_INTAKE_COLUMNS } from './leadIntakeTemplates'

const team = [
  { id: 'u1', email: 'a@x.com', displayName: 'Nguyễn Văn A' },
  { id: 'u2', email: 'b@x.com', displayName: 'Nguyễn Văn A' },
  { id: 'u3', email: 'c@x.com', displayName: 'Trần Thị B' },
]

describe('mapSheetRow', () => {
  it('maps 20-column standard headers', () => {
    const row = mapSheetRow({
      'Mã khách hàng': 'KH001',
      'Tên Sinh viên': '  Nguyễn Văn A  ',
      'Ngày sinh': '15/03/2008',
      'Điện thoại': '0901',
      'ĐT Người liên hệ': '0902',
      Nguồn: 'Facebook',
      'Ngành Quan tâm': 'CNTT',
      'Học lực/ xếp loại': 'Khá',
      'Trường học': 'THPT 1',
      'Mong muốn': 'Đại học công lập',
      'Nhóm tài chính': 'INSTALLMENT',
      'Quận/ huyện': 'Cầu Giấy',
      'Sở thích': 'bóng đá',
      'Ghi chú 1': 'N1',
      'Ghi chú 2': 'N2',
      'Lớp hiện đang học': '12A1',
      'Tỉnh /Thành phố': 'Hà Nội',
      'Địa chỉ': 'P.1',
      'Tư vấn viên': 'a@x.com',
      'Nội dung lưu ý khác': 'Nhắc họp phụ huynh',
    })
    expect(row.customerId).toBe('KH001')
    expect(row.fullName).toBe('Nguyễn Văn A')
    expect(row.dateOfBirth).toBe('15/03/2008')
    expect(row.phone).toBe('0901')
    expect(row.parentPhone).toBe('0902')
    expect(row.source).toBe('Facebook')
    expect(row.majorInterest).toBe('CNTT')
    expect(row.academicPerformance).toBe('Khá')
    expect(row.highSchool).toBe('THPT 1')
    expect(row.aspirations).toBe('Đại học công lập')
    expect(row.financialStatus).toBe('INSTALLMENT')
    expect(row.hanoiArea).toBe('Cầu Giấy')
    expect(row.hobbies).toBe('bóng đá')
    expect(row.profileNote1).toBe('N1')
    expect(row.profileNote2).toBe('N2')
    expect(row.gradeClass).toBe('12A1')
    expect(row.province).toBe('Hà Nội')
    expect(row.address).toBe('P.1')
    expect(row.assignedToRaw).toBe('a@x.com')
    expect(row.otherAttentionNotes).toBe('Nhắc họp phụ huynh')
  })

  it('standard template has 20 headers', () => {
    expect(STANDARD_LEAD_INTAKE_HEADERS).toHaveLength(20)
  })

  it('still maps legacy Excel headers', () => {
    const row = mapSheetRow({
      'Tên khách hàng': 'B',
      'Nguồn khách hàng': 'Zalo',
      'Mô tả': 'old',
      'Điện thoại người liên hệ chính': '090',
      'Tình trạng': 'Mới',
    })
    expect(row.fullName).toBe('B')
    expect(row.source).toBe('Zalo')
    expect(row.description).toBe('old')
    expect(row.parentPhone).toBe('090')
    expect(row.statusRaw).toBe('Mới')
  })

  it('maps họ tên alias', () => {
    expect(mapSheetRow({ 'Họ tên': 'A' }).fullName).toBe('A')
  })
})

describe('parseWorkbookToRows compact v2', () => {
  function workbookBuf(sheets: Record<string, (string | number)[][]>): ArrayBuffer {
    const wb = XLSX.utils.book_new()
    for (const [name, aoa] of Object.entries(sheets)) {
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), name)
    }
    const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer | Uint8Array | number[]
    if (out instanceof ArrayBuffer) return out
    if (out instanceof Uint8Array) {
      return out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength)
    }
    return Uint8Array.from(out).buffer
  }

  it('reads Mẫu 2 headers and skips Hướng dẫn sheet', () => {
    const buf = workbookBuf({
      'Hướng dẫn': [['VietMy — hướng dẫn'], ['Không phải dữ liệu']],
      'Hồ sơ': [
        ['Họ tên', 'Giới Tính', 'ngày sinh', 'Trường học', 'điện thoại', 'email', 'địa chỉ', 'điểm tốt nghiệp'],
        ['Nguyễn A', 'Nam', '01/01/2008', 'THPT 1', '0912345678', 'a@x.com', 'HN', '8'],
      ],
    })
    const rows = parseWorkbookToRows(buf, {
      headerRowIndex: 0,
      fallbackOrderedHeaders: COMPACT_V2_INTAKE_COLUMNS.map((c) => c.header),
    })
    expect(rows).toHaveLength(1)
    expect(rows[0]?.fullName).toBe('Nguyễn A')
    expect(rows[0]?.phone).toBe('0912345678')
  })

  it('falls back to column order when header labels differ but layout matches Mẫu 2', () => {
    const buf = workbookBuf({
      Sheet1: [
        ['Full name', 'Sex', 'Birthday', 'School', 'Mobile', 'Mail', 'Addr', 'GPA'],
        ['Trần B', 'Nữ', '02/02/2007', 'THPT Y', '0900111222', 'b@y.com', 'Q1', '7.5'],
      ],
    })
    const rows = parseWorkbookToRows(buf, {
      headerRowIndex: 0,
      fallbackOrderedHeaders: COMPACT_V2_INTAKE_COLUMNS.map((c) => c.header),
    })
    expect(rows).toHaveLength(1)
    expect(rows[0]?.fullName).toBe('Trần B')
    expect(rows[0]?.phone).toBe('0900111222')
    expect(rows[0]?.studentEmail).toBe('b@y.com')
  })

  it('finds header on row 2 when row 1 is a title banner', () => {
    const buf = workbookBuf({
      'Hồ sơ': [
        ['Danh sách tuyển sinh tháng 3'],
        ['Họ tên', 'Giới Tính', 'ngày sinh', 'Trường học', 'điện thoại', 'email', 'địa chỉ', 'điểm tốt nghiệp'],
        ['Lê C', 'Nam', '03/03/2006', 'THPT Z', '0987654321', 'c@z.com', 'SG', '9'],
      ],
    })
    const rows = parseWorkbookToRows(buf, {
      headerRowIndex: 0,
      fallbackOrderedHeaders: COMPACT_V2_INTAKE_COLUMNS.map((c) => c.header),
    })
    expect(rows.length).toBeGreaterThanOrEqual(1)
    expect(rows.some((r) => r.fullName === 'Lê C' && r.phone === '0987654321')).toBe(true)
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
