import { describe, expect, it } from 'vitest'
import { parseStaffWorkbook, STAFF_INTAKE_HEADERS } from './excelStaffMapper'
import * as XLSX from 'xlsx'

describe('excelStaffMapper', () => {
  it('parse Tên hiển thị + email + role', () => {
    const ws = XLSX.utils.aoa_to_sheet([
      [...STAFF_INTAKE_HEADERS],
      ['Nguyễn Văn A', 'a@caodangvietmy.edu.vn', 'Pass@123', 'counselor', ''],
      ['', '', '', '', ''],
      ['Trần B', 'bad-email', 'x', 'tvv', ''],
    ])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Nhân sự')
    const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
    const { rows, errors } = parseStaffWorkbook(buf)
    expect(rows).toHaveLength(1)
    expect(rows[0]!.displayName).toBe('Nguyễn Văn A')
    expect(rows[0]!.email).toBe('a@caodangvietmy.edu.vn')
    expect(rows[0]!.role).toBe('counselor')
    expect(errors.some((e) => e.includes('email'))).toBe(true)
  })
})
