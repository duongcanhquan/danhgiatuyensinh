import { describe, expect, it } from 'vitest'
import type { Lead, LeadFinanceRecord, ScholarshipRecord } from '../types'
import {
  computeEnrollmentStatusAfterDecision,
  isLeadProfileCompleteForEnrollment,
} from './financeEnrollmentStatus'
import type { FinanceTuitionCatalog } from './financeTuitionCatalog'

function lead(over: Partial<Lead> = {}): Lead {
  return {
    id: '1',
    customerId: 'KH',
    systemCode: '2608130001',
    fullName: 'Nguyen Van A',
    phone: '0912345678',
    parentPhone: '',
    source: 'Web',
    educationLevel: 'Cao đẳng chính quy',
    status: 'NEW',
    pipelineStatus: 'NEW',
    description: '',
    highSchool: 'THPT A',
    gradeClass: '',
    province: 'Hà Nội',
    address: 'Addr',
    permanentAddress: 'Addr',
    calculatedScore: 0,
    priorityTag: 'COLD',
    uniqueHash: 'h',
    gender: 'Nam',
    dateOfBirth: '01/01/2005',
    studentEmail: 'a@mail.com',
    majorInterest: 'CNTT',
    placeOfBirth: 'HN',
    ethnicity: 'Kinh',
    nationalId: '001234567890',
    fatherName: 'Bo',
    fatherPhone: '0911111111',
    motherName: 'Me',
    motherPhone: '0922222222',
    hanoiArea: 'Nam Từ Liêm',
    ...over,
  } as Lead
}

function financeApproved(amount: number): LeadFinanceRecord {
  return {
    payments: {
      deposit: { amountVnd: amount, approvalStatus: 'ĐỒNG Ý' },
    },
  }
}

const catalog: FinanceTuitionCatalog = {
  rows: [{ id: '1', majorLabel: 'CNTT', tuitionTerm1Vnd: 10_000_000 }],
}

const hb: ScholarshipRecord = {
  id: 'hb1',
  label: 'EB',
  category: 'cdcq',
  amountVnd: 5_000_000,
  sortOrder: 1,
  isActive: true,
  termCount: 5,
  termAllocationsVnd: [1_000_000, 1_000_000, 1_000_000, 1_000_000, 1_000_000],
}

describe('isLeadProfileCompleteForEnrollment (Apps Script required fields)', () => {
  it('true khi đủ field lõi + CCCD', () => {
    expect(isLeadProfileCompleteForEnrollment(lead())).toBe(true)
  })

  it('true khi thiếu systemCode nhưng còn id hồ sơ', () => {
    expect(isLeadProfileCompleteForEnrollment(lead({ systemCode: '' }))).toBe(true)
  })

  it('cho phép CHƯA CÓ CCCD khi nationalIdNotAvailable', () => {
    expect(
      isLeadProfileCompleteForEnrollment(lead({ nationalId: '', nationalIdNotAvailable: true })),
    ).toBe(true)
  })

  it('false khi thiếu ngành / CCCD', () => {
    expect(isLeadProfileCompleteForEnrollment(lead({ majorInterest: '' }))).toBe(false)
    expect(isLeadProfileCompleteForEnrollment(lead({ nationalId: '' }))).toBe(false)
  })
})

describe('computeEnrollmentStatusAfterDecision', () => {
  it('đủ cọc nhưng chưa đủ học phí kỳ 1 → CỌC (kể cả hồ sơ đủ)', () => {
    expect(
      computeEnrollmentStatusAfterDecision(lead(), financeApproved(1_000_000), 'ĐỒNG Ý', {
        catalog,
        scholarshipsById: new Map([['hb1', hb]]),
      }),
    ).toBe('CỌC THÀNH CÔNG')
  })

  it('đủ phải đóng kỳ 1 + hồ sơ đủ → ĐÃ HOÀN THIỆN', () => {
    const fin: LeadFinanceRecord = {
      payments: {
        deposit: { amountVnd: 1_000_000, approvalStatus: 'ĐỒNG Ý' },
        supplementL1: { amountVnd: 8_000_000, approvalStatus: 'ĐỒNG Ý' },
      },
    }
    expect(
      computeEnrollmentStatusAfterDecision(lead({ scholarship1Id: 'hb1' }), fin, 'ĐỒNG Ý', {
        catalog,
        scholarshipsById: new Map([['hb1', hb]]),
      }),
    ).toBe('ĐÃ HOÀN THIỆN')
  })

  it('đủ tiền kỳ 1 nhưng thiếu field → CỌC', () => {
    const fin: LeadFinanceRecord = {
      payments: {
        deposit: { amountVnd: 10_000_000, approvalStatus: 'ĐỒNG Ý' },
      },
    }
    expect(
      computeEnrollmentStatusAfterDecision(lead({ majorInterest: 'CNTT', nationalId: '' }), fin, 'ĐỒNG Ý', {
        catalog,
      }),
    ).toBe('CỌC THÀNH CÔNG')
  })

  it('chưa có bảng giá ngành → không ĐÃ HOÀN THIỆN dù đủ cọc + hồ sơ', () => {
    expect(
      computeEnrollmentStatusAfterDecision(lead(), financeApproved(1_000_000), 'ĐỒNG Ý', {
        catalog: { rows: [] },
      }),
    ).toBe('CỌC THÀNH CÔNG')
  })

  it('hệ 9+ cần 2tr mới cọc', () => {
    const l = lead({ educationLevel: 'Hệ 9+', majorInterest: 'CNTT' })
    expect(
      computeEnrollmentStatusAfterDecision(l, financeApproved(1_000_000), 'ĐỒNG Ý', {
        catalog,
        thresholds: { lpxtMinVnd: 150_000, depositStandardVnd: 1_000_000, depositNinePlusVnd: 2_000_000 },
      }),
    ).toBe('ĐANG HOÀN THIỆN')
    expect(
      computeEnrollmentStatusAfterDecision(l, financeApproved(2_000_000), 'ĐỒNG Ý', {
        catalog,
        thresholds: { lpxtMinVnd: 150_000, depositStandardVnd: 1_000_000, depositNinePlusVnd: 2_000_000 },
      }),
    ).toBe('CỌC THÀNH CÔNG')
  })

  it('TỪ CHỐI → KIỂM TRA LẠI', () => {
    expect(computeEnrollmentStatusAfterDecision(lead(), financeApproved(500_000), 'TỪ CHỐI')).toBe(
      'KIỂM TRA LẠI',
    )
  })
})
