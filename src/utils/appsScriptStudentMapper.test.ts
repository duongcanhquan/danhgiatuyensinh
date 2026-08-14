import { describe, expect, it } from 'vitest'
import { mapAppsScriptStudentRow, parseAppsScriptCreatedAtMs, parseAppsScriptSheetAoa } from './appsScriptStudentMapper'

describe('appsScriptStudentMapper', () => {
  it('map đủ hồ sơ + 5 đợt thu + Full NE + TVV', () => {
    const r: unknown[] = new Array(71).fill('')
    r[1] = '2608130001'
    r[2] = 'Nguyễn Văn A'
    r[3] = 'Nam'
    r[4] = '01/01/2005'
    r[5] = '0912345678'
    r[6] = 'a@mail.com'
    r[8] = 'HN'
    r[10] = 'Cao đẳng chính quy'
    r[12] = 'CNTT'
    r[16] = '001234567890'
    r[17] = '13/08/2026 10:00:00'
    r[18] = 'Trần Thị B'
    r[22] = 'Mẹ A'
    r[23] = '0987654321'
    r[26] = 'THPT X'
    r[27] = 'Hà Nội'
    r[30] = '1000000'
    r[34] = 'https://drive.example/bill1'
    r[39] = 'CỌC THÀNH CÔNG'
    r[42] = 'ĐÃ HOÀN THIỆN'
    r[43] = '8.75'
    r[50] = 'ĐỒNG Ý'
    r[56] = 'Facebook Ads'
    r[60] = '01/08/2026'
    r[65] = 'ĐÃ FULL NE'
    r[66] = '10/08/2026'

    const parsed = mapAppsScriptStudentRow(r, 2)
    expect(parsed).not.toBeNull()
    expect(parsed!.row.fullName).toBe('Nguyễn Văn A')
    expect(parsed!.row.assignedToRaw).toBe('Trần Thị B')
    expect(parsed!.row.graduationScore).toBe('8.75')
    expect(parsed!.extras.sheetScore).toBe('8.75')
    expect(parsed!.extras.systemCode).toBe('2608130001')
    expect(parsed!.extras.finance.payments?.deposit?.amountVnd).toBe(1_000_000)
    expect(parsed!.extras.finance.payments?.deposit?.approvalStatus).toBe('ĐỒNG Ý')
    expect(parsed!.extras.finance.enrollmentStatus).toBe('ĐÃ HOÀN THIỆN')
    expect(parsed!.extras.finance.fullNeStatus).toBe('ĐÃ FULL NE')
    expect(parsed!.extras.motherPhone).toBe('0987654321')
  })

  it('bỏ 2 hàng đầu khi parse AOA', () => {
    const aoa: unknown[][] = [
      ['header1'],
      ['header2'],
      new Array(20).fill('').map((_, i) => (i === 2 ? 'Tên A' : i === 5 ? '0901111111' : '')),
    ]
    const rows = parseAppsScriptSheetAoa(aoa)
    expect(rows).toHaveLength(1)
    expect(rows[0]!.row.fullName).toBe('Tên A')
  })

  it('parse ngày tạo ICT', () => {
    const ms = parseAppsScriptCreatedAtMs('13/08/2026 10:00:00')
    expect(ms).not.toBeNull()
    expect(new Date(ms!).toISOString()).toContain('2026-08-13')
  })
})
