import { describe, expect, it } from 'vitest'
import type { Lead } from '../types'
import {
  leadHasFinanceActivity,
  leadHasPendingAccountantReview,
  leadIsSettledCocOrComplete,
  leadPassesShowDoneFilter,
  countEnrollmentStatusStats,
} from './accountantFinanceFilter'

const base = { id: '1', fullName: 'A' } as Lead

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
