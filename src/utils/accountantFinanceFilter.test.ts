import { describe, expect, it } from 'vitest'
import type { Lead } from '../types'
import { leadHasFinanceActivity, leadHasPendingAccountantReview } from './accountantFinanceFilter'

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
})
