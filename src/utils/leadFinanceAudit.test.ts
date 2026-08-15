import { describe, expect, it } from 'vitest'
import { emptyFinanceDraft } from './leadFinance'
import {
  describeAccountantPaymentAudit,
  describeFinanceDepositAudit,
} from './leadFinanceAudit'
import { timelineAuditAction } from './leadActivityTimelineLabels'

describe('leadFinanceAudit', () => {
  it('describes deposit with amount and pending accountant', () => {
    const draft = emptyFinanceDraft()
    draft.payments.deposit.amount = '5.000.000'
    draft.payments.deposit.collectedAt = '2026-08-15'
    expect(describeFinanceDepositAudit(draft)).toBe(
      'Nạp tiền: 1. Cọc / Ứng 5.000.000đ, ngày 2026-08-15 (chờ kế toán xác nhận)',
    )
  })

  it('describes accountant approval', () => {
    expect(
      describeAccountantPaymentAudit({
        slotKey: 'deposit',
        decision: 'ĐỒNG Ý',
        amountVnd: 1_500_000,
        collectedAt: '15/08/2026',
      }),
    ).toBe('Kế toán xác nhận tiền: 1. Cọc / Ứng 1.500.000đ, ngày 15/08/2026')
  })
})

describe('timelineAuditAction', () => {
  it('prefers create / money wording over generic SYSTEM_UPDATE', () => {
    expect(timelineAuditAction('SYSTEM_UPDATE', 'Tạo hồ sơ ứng viên mới — mã 2608150001')).toBe(
      'Tạo hồ sơ',
    )
    expect(
      timelineAuditAction('SYSTEM_UPDATE', 'Nạp tiền: 1. Cọc / Ứng 5.000.000đ (chờ kế toán xác nhận)'),
    ).toBe('Nạp tiền')
    expect(
      timelineAuditAction('SYSTEM_UPDATE', 'Kế toán xác nhận tiền: 1. Cọc / Ứng 5.000.000đ'),
    ).toBe('Kế toán xác nhận tiền')
    expect(timelineAuditAction('SYSTEM_UPDATE', 'Đổi ghi chú nội bộ')).toBe('Cập nhật hồ sơ')
  })
})
