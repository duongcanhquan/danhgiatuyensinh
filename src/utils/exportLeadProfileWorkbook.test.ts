import { describe, expect, it } from 'vitest'
import type { Lead } from '../types'
import { Timestamp } from 'firebase/firestore'
import { buildLeadProfileExportRow } from './exportLeadProfileWorkbook'

function stubLead(over: Partial<Lead> = {}): Lead {
  return {
    id: 'lead-1',
    customerId: 'KH001',
    systemCode: '1708260001',
    fullName: 'Nguyễn Văn A',
    phone: '0901234567',
    parentPhone: '0912345678',
    source: 'Facebook',
    educationLevel: 'Cao đẳng',
    assignedTo: 'uid-tvv',
    status: 'NEW',
    description: '',
    pipelineStatus: 'NEW',
    priorityTag: 'WARM',
    calculatedScore: 62,
    createdAt: Timestamp.fromMillis(0),
    updatedAt: Timestamp.fromMillis(0),
    nationalId: '001234567890',
    studentEmail: 'a@example.com',
    majorInterest: 'CNTT',
    finance: {
      enrollmentStatus: 'ĐANG HOÀN THIỆN',
      payments: {
        deposit: { amountVnd: 5_000_000, collectedAt: '01/08/2026', approvalStatus: 'ĐỒNG Ý' },
      },
    },
    ...over,
  } as Lead
}

describe('buildLeadProfileExportRow', () => {
  it('exports identity, CRM and finance slots for a filtered student', () => {
    const row = buildLeadProfileExportRow(stubLead(), {
      counselorNameById: new Map([['uid-tvv', 'Trần Thị B']]),
    })
    expect(row['Mã sinh viên']).toBe('1708260001')
    expect(row['Tên sinh viên']).toBe('Nguyễn Văn A')
    expect(row['CCCD/Passport']).toBe('001234567890')
    expect(row.Email).toBe('a@example.com')
    expect(row['Tư vấn viên']).toBe('Trần Thị B')
    expect(row['Hệ đào tạo']).toBe('Cao đẳng')
    expect(row['Ngành quan tâm']).toBe('CNTT')
    expect(row['Thu phí (ghi danh)']).toBe('ĐANG HOÀN THIỆN')
    expect(row['1. Cọc / Ứng — tiền (đ)']).toBe(5_000_000)
    expect(row['1. Cọc / Ứng — duyệt']).toBe('ĐỒNG Ý')
    expect(row['Đã duyệt (đ)']).toBe(5_000_000)
    expect(row['Điểm hồ sơ']).toBe(62)
    expect(row['Độ đầy đủ (%)']).toBeGreaterThan(0)
    expect(row).not.toHaveProperty('Điểm')
    expect(row).not.toHaveProperty('Điểm TT')
  })

  it('marks missing national id', () => {
    const row = buildLeadProfileExportRow(
      stubLead({ nationalId: '', nationalIdNotAvailable: true }),
    )
    expect(row['CCCD/Passport']).toBe('Chưa có')
  })

  it('falls back to assignedCounselorId for counselor name', () => {
    const row = buildLeadProfileExportRow(
      stubLead({ assignedTo: '', assignedCounselorId: 'uid-legacy' }),
      { counselorNameById: new Map([['uid-legacy', 'Lê Văn C']]) },
    )
    expect(row['Tư vấn viên']).toBe('Lê Văn C')
  })
})
