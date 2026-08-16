import { describe, expect, it } from 'vitest'
import type { Lead, ScholarshipRecord } from '../types'
import {
  computeFinanceObligation,
  equalSplitTermAllocations,
  obligationMeetsTerm1Due,
  scholarshipTerm1CreditVnd,
} from './financeObligation'
import type { FinanceTuitionCatalog } from './financeTuitionCatalog'
import { resolveTuitionTerm1FromCatalog } from './financeTuitionCatalog'

const catalog: FinanceTuitionCatalog = {
  rows: [
    {
      id: '1',
      majorLabel: 'Thiết kế đồ họa',
      educationLevel: 'Cao đẳng chính quy',
      tuitionTerm1Vnd: 10_000_000,
    },
  ],
}

const hbEarly: ScholarshipRecord = {
  id: 'hb1',
  label: 'Early Bird',
  category: 'cdcq',
  amountVnd: 5_000_000,
  sortOrder: 1,
  isActive: true,
  termCount: 5,
  termAllocationsVnd: [1_000_000, 1_000_000, 1_000_000, 1_000_000, 1_000_000],
}

describe('equalSplitTermAllocations', () => {
  it('chia đều có dư đồng', () => {
    expect(equalSplitTermAllocations(5_000_000, 5)).toEqual([
      1_000_000, 1_000_000, 1_000_000, 1_000_000, 1_000_000,
    ])
    expect(equalSplitTermAllocations(10_000_001, 3)).toEqual([3_333_334, 3_333_334, 3_333_333])
  })
})

describe('scholarshipTerm1CreditVnd', () => {
  it('lấy phần kỳ 1 từ phân bổ', () => {
    expect(scholarshipTerm1CreditVnd(hbEarly)).toBe(1_000_000)
  })

  it('fallback chia đều khi chỉ có termCount', () => {
    expect(scholarshipTerm1CreditVnd({ amountVnd: 5_000_000, termCount: 5 })).toBe(1_000_000)
  })

  it('không trừ cả tổng khi thiếu kỳ', () => {
    expect(scholarshipTerm1CreditVnd({ amountVnd: 5_000_000 })).toBe(0)
  })
})

describe('resolveTuitionTerm1FromCatalog', () => {
  it('khớp ngành + hệ', () => {
    const r = resolveTuitionTerm1FromCatalog('Thiết kế đồ họa', 'Cao đẳng chính quy', catalog)
    expect(r.missing).toBe(false)
    expect(r.tuitionTerm1Vnd).toBe(10_000_000)
  })

  it('thiếu ngành → missing', () => {
    expect(resolveTuitionTerm1FromCatalog('Không có', 'Cao đẳng', catalog).missing).toBe(true)
  })
})

describe('computeFinanceObligation', () => {
  it('phải đóng = học phí − HB kỳ 1', () => {
    const lead = {
      majorInterest: 'Thiết kế đồ họa',
      educationLevel: 'Cao đẳng chính quy',
      scholarship1Id: 'hb1',
      finance: {
        payments: { deposit: { amountVnd: 1_000_000, approvalStatus: 'ĐỒNG Ý' } },
      },
    } as Lead
    const snap = computeFinanceObligation(lead, {
      catalog,
      scholarshipsById: new Map([['hb1', hbEarly]]),
      thresholds: { lpxtMinVnd: 150_000, depositStandardVnd: 1_000_000, depositNinePlusVnd: 2_000_000 },
    })
    expect(snap.tuitionTerm1Vnd).toBe(10_000_000)
    expect(snap.scholarshipTerm1Vnd).toBe(1_000_000)
    expect(snap.dueTerm1Vnd).toBe(9_000_000)
    expect(snap.approvedVnd).toBe(1_000_000)
    expect(obligationMeetsTerm1Due(snap)).toBe(false)
  })

  it('đủ tiền kỳ 1 sau HB', () => {
    const lead = {
      majorInterest: 'Thiết kế đồ họa',
      educationLevel: 'Cao đẳng chính quy',
      scholarship1Id: 'hb1',
      finance: {
        payments: {
          deposit: { amountVnd: 1_000_000, approvalStatus: 'ĐỒNG Ý' },
          supplementL1: { amountVnd: 8_000_000, approvalStatus: 'ĐỒNG Ý' },
        },
      },
    } as Lead
    const snap = computeFinanceObligation(lead, {
      catalog,
      scholarshipsById: new Map([['hb1', hbEarly]]),
    })
    expect(snap.approvedVnd).toBe(9_000_000)
    expect(obligationMeetsTerm1Due(snap)).toBe(true)
  })
})
