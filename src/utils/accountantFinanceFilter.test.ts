import { describe, expect, it } from 'vitest'
import { Timestamp } from 'firebase/firestore'
import type { Lead } from '../types'
import {
  leadHasFinanceActivity,
  leadHasPendingAccountantReview,
  leadHasIncompleteTuitionProgress,
  leadBelongsInAccountantWorkQueue,
  leadIsSettledCocOrComplete,
  leadPassesShowDoneFilter,
  leadLooksLikeLegacySettledWithoutApprovals,
  normalizePaymentApprovalStatus,
  compareAccountantWorkQueueOrder,
  countEnrollmentStatusStats,
} from './accountantFinanceFilter'

const base = { id: '1', fullName: 'A', educationLevel: 'Cao đẳng' } as Lead

function withTs(partial: Partial<Lead> & { id: string }, ms: number): Lead {
  const t = Timestamp.fromMillis(ms)
  return { ...base, ...partial, createdAt: t, updatedAt: t } as Lead
}

describe('normalizePaymentApprovalStatus', () => {
  it('recognizes common Sheet variants as ĐỒNG Ý', () => {
    expect(normalizePaymentApprovalStatus('ĐỒNG Ý')).toBe('ĐỒNG Ý')
    expect(normalizePaymentApprovalStatus('Dong y')).toBe('ĐỒNG Ý')
    expect(normalizePaymentApprovalStatus('Đã duyệt')).toBe('ĐỒNG Ý')
    expect(normalizePaymentApprovalStatus('x')).toBe('ĐỒNG Ý')
    expect(normalizePaymentApprovalStatus('OK')).toBe('ĐỒNG Ý')
  })

  it('does not treat negative phrases as approved', () => {
    expect(normalizePaymentApprovalStatus('Chưa xác nhận')).toBe('KIỂM TRA LẠI')
    expect(normalizePaymentApprovalStatus('KHÔNG ĐỒNG Ý')).toBe('TỪ CHỐI')
    expect(normalizePaymentApprovalStatus('Chưa duyệt')).toBe('KIỂM TRA LẠI')
  })
})

describe('accountantFinanceFilter', () => {
  it('ignores leads without money recorded', () => {
    expect(leadHasFinanceActivity({ ...base, finance: undefined })).toBe(false)
    expect(leadHasFinanceActivity({ ...base, finance: { payments: {} } })).toBe(false)
  })

  it('includes leads with amount or receipt', () => {
    expect(
      leadHasFinanceActivity({
        ...base,
        finance: { payments: { deposit: { amountVnd: 1_000_000 } } },
      }),
    ).toBe(true)
    expect(
      leadHasFinanceActivity({
        ...base,
        finance: { payments: { deposit: { receiptUrl: 'https://x/bill.pdf' } } },
      }),
    ).toBe(true)
  })

  it('detects pending approval', () => {
    expect(
      leadHasPendingAccountantReview({
        ...base,
        finance: { payments: { deposit: { amountVnd: 500_000, approvalStatus: '' } } },
      }),
    ).toBe(true)
    expect(
      leadHasPendingAccountantReview({
        ...base,
        finance: { payments: { deposit: { amountVnd: 500_000, approvalStatus: 'ĐỒNG Ý' } } },
      }),
    ).toBe(false)
  })

  it('hides legacy settled imports with money but blank approvals', () => {
    const legacy = {
      ...base,
      finance: {
        enrollmentStatus: 'CỌC THÀNH CÔNG',
        payments: { deposit: { amountVnd: 2_000_000, approvalStatus: '' } },
      },
    } as Lead
    expect(leadLooksLikeLegacySettledWithoutApprovals(legacy)).toBe(true)
    expect(leadHasPendingAccountantReview(legacy)).toBe(false)
    expect(leadBelongsInAccountantWorkQueue(legacy)).toBe(false)
  })

  it('still queues new deposits that meet threshold but are not yet approved', () => {
    const enoughMoney = {
      ...base,
      educationLevel: 'Cao đẳng',
      finance: {
        enrollmentStatus: 'MỚI',
        payments: { deposit: { amountVnd: 1_000_000, approvalStatus: '' } },
      },
    } as Lead
    expect(leadHasPendingAccountantReview(enoughMoney)).toBe(true)
  })

  it('keeps pending when settled but a new unpaid slot appears', () => {
    const settledButNew = {
      ...base,
      finance: {
        enrollmentStatus: 'CỌC THÀNH CÔNG',
        payments: {
          deposit: { amountVnd: 1_000_000, approvalStatus: 'ĐỒNG Ý' },
          supplementL1: { amountVnd: 500_000, approvalStatus: '' },
        },
      },
    } as Lead
    expect(leadHasPendingAccountantReview(settledButNew)).toBe(true)
    expect(leadBelongsInAccountantWorkQueue(settledButNew)).toBe(true)
  })

  it('flags incomplete tuition when approved below threshold', () => {
    const partial = {
      ...base,
      educationLevel: 'Cao đẳng',
      finance: {
        enrollmentStatus: 'ĐANG HOÀN THIỆN',
        payments: { deposit: { amountVnd: 300_000, approvalStatus: 'ĐỒNG Ý' } },
      },
    } as Lead
    expect(leadHasPendingAccountantReview(partial)).toBe(false)
    expect(leadHasIncompleteTuitionProgress(partial)).toBe(true)
    expect(leadBelongsInAccountantWorkQueue(partial)).toBe(true)
  })

  it('after reject with all slots terminal, not actionable pending', () => {
    const rejected = {
      ...base,
      finance: {
        enrollmentStatus: 'KIỂM TRA LẠI',
        payments: {
          deposit: { amountVnd: 500_000, approvalStatus: 'TỪ CHỐI', approvalNote: 'Sai bill' },
        },
      },
    } as Lead
    expect(leadHasPendingAccountantReview(rejected)).toBe(false)
    expect(leadBelongsInAccountantWorkQueue(rejected)).toBe(false)
  })

  it('queues when reqFullNe is set even without YEU CAU text', () => {
    const req = {
      ...base,
      finance: {
        enrollmentStatus: 'CỌC THÀNH CÔNG',
        reqFullNe: true,
        payments: { deposit: { amountVnd: 2_000_000, approvalStatus: 'ĐỒNG Ý' } },
      },
    } as Lead
    expect(leadHasPendingAccountantReview(req)).toBe(true)
  })

  it('Hiện CỌC: ẩn cọc/hoàn thiện trừ khi còn treo hoặc bật toggle', () => {
    const settled = {
      ...base,
      finance: {
        enrollmentStatus: 'CỌC THÀNH CÔNG',
        payments: { deposit: { amountVnd: 1_000_000, approvalStatus: 'ĐỒNG Ý' } },
      },
    } as Lead
    expect(leadIsSettledCocOrComplete(settled)).toBe(true)
    expect(leadPassesShowDoneFilter(settled, false, false)).toBe(false)
    expect(leadPassesShowDoneFilter(settled, true, false)).toBe(true)
    expect(leadPassesShowDoneFilter(settled, false, true)).toBe(true)

    const settledButPending = {
      ...base,
      finance: {
        enrollmentStatus: 'CỌC THÀNH CÔNG',
        payments: {
          deposit: { amountVnd: 1_000_000, approvalStatus: 'ĐỒNG Ý' },
          supplementL1: { amountVnd: 500_000, approvalStatus: '' },
        },
      },
    } as Lead
    expect(leadPassesShowDoneFilter(settledButPending, false, false)).toBe(true)
  })

  it('sorts pending approval before incomplete, newest first within group', () => {
    const pendingNew = withTs(
      {
        id: 'p1',
        finance: { payments: { deposit: { amountVnd: 100_000, approvalStatus: '' } } },
      },
      2000,
    )
    const pendingOld = withTs(
      {
        id: 'p0',
        finance: { payments: { deposit: { amountVnd: 100_000, approvalStatus: '' } } },
      },
      1000,
    )
    const incomplete = withTs(
      {
        id: 'i1',
        finance: {
          enrollmentStatus: 'ĐANG HOÀN THIỆN',
          payments: { deposit: { amountVnd: 200_000, approvalStatus: 'ĐỒNG Ý' } },
        },
      },
      3000,
    )
    const ordered = [incomplete, pendingOld, pendingNew].sort(compareAccountantWorkQueueOrder)
    expect(ordered.map((l) => l.id)).toEqual(['p1', 'p0', 'i1'])
  })

  it('stats enrollment trên toàn DATA', () => {
    const rows = [
      { ...base, id: '1', finance: { enrollmentStatus: 'MỚI', payments: { deposit: { amountVnd: 1 } } } },
      { ...base, id: '2', finance: { enrollmentStatus: 'ĐANG HOÀN THIỆN', payments: { deposit: { amountVnd: 1 } } } },
      { ...base, id: '3', finance: { enrollmentStatus: 'CỌC THÀNH CÔNG', payments: { deposit: { amountVnd: 1 } } } },
      { ...base, id: '4', finance: { enrollmentStatus: 'KIỂM TRA LẠI', payments: { deposit: { amountVnd: 1 } } } },
      { ...base, id: '5', finance: { enrollmentStatus: 'ĐÃ HOÀN THIỆN', payments: { deposit: { amountVnd: 1 } } } },
    ] as Lead[]
    expect(countEnrollmentStatusStats(rows)).toEqual({
      moi: 1,
      dang: 1,
      coc: 1,
      kiemTra: 1,
      hoanThien: 1,
    })
  })
})
