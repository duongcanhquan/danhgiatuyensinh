import { describe, expect, it } from 'vitest'
import type { Lead, LeadFinanceRecord } from '../types'
import {
  computeEnrollmentStatusAfterDecision,
  isLeadProfileCompleteForEnrollment,
} from './financeEnrollmentStatus'

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

describe('isLeadProfileCompleteForEnrollment (Apps Script required fields)', () => {
  it('true khi đủ field lõi + CCCD', () => {
    expect(isLeadProfileCompleteForEnrollment(lead())).toBe(true)
  })

  it('true khi thiếu systemCode nhưng còn id hồ sơ', () => {
    expect(isLeadProfileCompleteForEnrollment(lead({ systemCode: '' }))).toBe(true)
  })

  it('cho phép CHƯA CÓ CCCD khi nationalIdNotAvailable', () => {
    expect(
      isLeadProfileCompleteForEnrollment(
        lead({ nationalId: '', nationalIdNotAvailable: true }),
      ),
    ).toBe(true)
  })

  it('false khi thiếu ngành / CCCD', () => {
    expect(isLeadProfileCompleteForEnrollment(lead({ majorInterest: '' }))).toBe(false)
    expect(isLeadProfileCompleteForEnrollment(lead({ nationalId: '' }))).toBe(false)
  })
})

describe('computeEnrollmentStatusAfterDecision', () => {
  it('ĐỒNG Ý đủ cọc + hồ sơ đủ → ĐÃ HOÀN THIỆN', () => {
    expect(
      computeEnrollmentStatusAfterDecision(lead(), financeApproved(1_000_000), 'ĐỒNG Ý'),
    ).toBe('ĐÃ HOÀN THIỆN')
  })

  it('ĐỒNG Ý đủ cọc nhưng thiếu field → CỌC THÀNH CÔNG', () => {
    expect(
      computeEnrollmentStatusAfterDecision(
        lead({ majorInterest: '' }),
        financeApproved(1_000_000),
        'ĐỒNG Ý',
      ),
    ).toBe('CỌC THÀNH CÔNG')
  })

  it('hệ 9+ cần 2tr mới cọc', () => {
    const l = lead({ educationLevel: 'Hệ 9+' })
    expect(computeEnrollmentStatusAfterDecision(l, financeApproved(1_000_000), 'ĐỒNG Ý')).toBe(
      'ĐANG HOÀN THIỆN',
    )
    expect(computeEnrollmentStatusAfterDecision(l, financeApproved(2_000_000), 'ĐỒNG Ý')).toBe(
      'ĐÃ HOÀN THIỆN',
    )
  })

  it('TỪ CHỐI → KIỂM TRA LẠI', () => {
    expect(computeEnrollmentStatusAfterDecision(lead(), financeApproved(500_000), 'TỪ CHỐI')).toBe(
      'KIỂM TRA LẠI',
    )
  })
})
