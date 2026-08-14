import { describe, expect, it } from 'vitest'
import { mapSheetRow, STANDARD_LEAD_INTAKE_HEADERS } from './excelLeadMapper'
import {
  COMPACT_V2_INTAKE_COLUMNS,
  getLeadIntakeTemplate,
  LEAD_INTAKE_TEMPLATES,
} from './leadIntakeTemplates'

describe('leadIntakeTemplates registry', () => {
  it('includes standard, compact, and appscript sheet', () => {
    expect(LEAD_INTAKE_TEMPLATES.map((t) => t.id)).toEqual([
      'standard_v1',
      'compact_v2',
      'appscript_sheet_v1',
    ])
    expect(getLeadIntakeTemplate('standard_v1').columns).toHaveLength(20)
    expect(getLeadIntakeTemplate('compact_v2').columns).toHaveLength(8)
    expect(getLeadIntakeTemplate('appscript_sheet_v1').positionalAppsScript).toBe(true)
  })

  it('compact v2 headers match business columns', () => {
    expect(COMPACT_V2_INTAKE_COLUMNS.map((c) => c.header)).toEqual([
      'Họ tên',
      'Giới Tính',
      'ngày sinh',
      'Trường học',
      'điện thoại',
      'email',
      'địa chỉ',
      'điểm tốt nghiệp',
    ])
  })
})

describe('mapSheetRow compact v2 aliases', () => {
  it('maps Họ tên / Giới Tính / email / điểm tốt nghiệp', () => {
    const row = mapSheetRow({
      'Họ tên': '  Trần B  ',
      'Giới Tính': 'Nữ',
      'ngày sinh': '01/02/2007',
      'Trường học': 'THPT X',
      'điện thoại': '0912345678',
      email: 'b@example.com',
      'địa chỉ': 'Q.1',
      'điểm tốt nghiệp': '8.5',
    })
    expect(row.fullName).toBe('Trần B')
    expect(row.gender).toBe('Nữ')
    expect(row.dateOfBirth).toBe('01/02/2007')
    expect(row.highSchool).toBe('THPT X')
    expect(row.phone).toBe('0912345678')
    expect(row.studentEmail).toBe('b@example.com')
    expect(row.address).toBe('Q.1')
    expect(row.graduationScore).toBe('8.5')
  })

  it('standard template still has 20 headers', () => {
    expect(STANDARD_LEAD_INTAKE_HEADERS).toHaveLength(20)
  })
})
