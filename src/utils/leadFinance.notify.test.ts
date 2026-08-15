import { describe, expect, it } from 'vitest'
import type { Lead } from '../types'
import {
  buildFinanceSavePlan,
  emptyFinanceDraft,
  financeDraftNotifiesN8n,
  financeNotifySlotKeys,
} from './leadFinance'

function leadStub(finance?: Lead['finance']): Lead {
  return {
    id: 'L1',
    fullName: 'Test',
    phone: '090',
    status: 'new',
    finance,
  } as Lead
}

describe('financeDraftNotifiesN8n', () => {
  it('false when empty or only date', () => {
    const d = emptyFinanceDraft()
    expect(financeDraftNotifiesN8n(d)).toBe(false)
    d.payments.deposit.collectedAt = '2026-08-15'
    expect(financeDraftNotifiesN8n(d)).toBe(false)
  })

  it('true when amount or bill', () => {
    const d = emptyFinanceDraft()
    d.payments.deposit.amount = '1000000'
    expect(financeDraftNotifiesN8n(d)).toBe(true)
    expect(financeNotifySlotKeys(d)).toEqual(['deposit'])
  })
})

describe('buildFinanceSavePlan triggerN8n', () => {
  it('does not fire n8n for date-only with zero money', () => {
    const draft = emptyFinanceDraft()
    draft.payments.deposit.collectedAt = '2026-08-15'
    const plan = buildFinanceSavePlan(leadStub(), draft)
    expect(plan.triggerN8n).toBe(false)
    expect(plan.changedSlots).toEqual([])
  })

  it('does not fire n8n for date-only when amount already saved', () => {
    const draft = emptyFinanceDraft()
    draft.payments.deposit.amount = '1000000'
    draft.payments.deposit.collectedAt = '2026-08-16'
    const plan = buildFinanceSavePlan(
      leadStub({
        payments: {
          deposit: { amountVnd: 1_000_000, collectedAt: '15/08/2026', approvalStatus: 'ĐỒNG Ý' },
        },
      }),
      draft,
    )
    expect(plan.triggerN8n).toBe(false)
    expect(plan.resetApprovalSlots).toEqual([])
    expect(plan.firestoreFinance.payments?.deposit?.approvalStatus).toBe('ĐỒNG Ý')
  })

  it('fires n8n when deposit amount > 0', () => {
    const draft = emptyFinanceDraft()
    draft.payments.deposit.amount = '1500000'
    draft.payments.deposit.collectedAt = '2026-08-15'
    const plan = buildFinanceSavePlan(leadStub(), draft)
    expect(plan.triggerN8n).toBe(true)
    expect(plan.changedSlots).toContain('deposit')
  })

  it('fires n8n when clearing previously recorded money', () => {
    const draft = emptyFinanceDraft()
    const plan = buildFinanceSavePlan(
      leadStub({
        payments: { deposit: { amountVnd: 1_000_000, approvalStatus: 'ĐỒNG Ý' } },
      }),
      draft,
    )
    expect(plan.triggerN8n).toBe(true)
    expect(plan.resetApprovalSlots).toContain('deposit')
  })

  it('does not fire when saving unchanged empty finance', () => {
    const plan = buildFinanceSavePlan(leadStub(), emptyFinanceDraft())
    expect(plan.triggerN8n).toBe(false)
  })
})
