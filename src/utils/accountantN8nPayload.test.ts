import { describe, expect, it } from 'vitest'
import type { Lead } from '../types'
import {
  buildAccountantDecisionWebhookBody,
  formatVnd,
  sumApprovedPaymentsVnd,
  sumRecordedPaymentsVnd,
} from './accountantN8nPayload'

const lead = {
  id: 'lead1',
  customerId: 'SV-001',
  fullName: 'Nguyen Van A',
  phone: '0912345678',
  assignedTo: 'tvv1',
} as Lead

describe('accountantN8nPayload', () => {
  it('sums recorded and approved totals', () => {
    const finance = {
      payments: {
        deposit: { amountVnd: 1_000_000, approvalStatus: 'ĐỒNG Ý' as const },
        supplementL1: { amountVnd: 500_000, approvalStatus: '' },
      },
    }
    expect(sumRecordedPaymentsVnd(finance)).toBe(1_500_000)
    expect(sumApprovedPaymentsVnd(finance)).toBe(1_000_000)
  })

  it('builds rich webhook body with counselor and totals', () => {
    const finance = {
      payments: {
        deposit: {
          amountVnd: 2_000_000,
          approvalStatus: 'ĐỒNG Ý' as const,
          receiptUrl: 'https://storage/bill.pdf',
          collectedAt: '24/05/2026',
        },
      },
      declaredTotalVnd: 2_000_000,
      enrollmentStatus: 'ĐANG HOÀN THIỆN',
    }
    const body = buildAccountantDecisionWebhookBody(
      {
        lead,
        finance,
        decision: 'ĐỒNG Ý',
        batch: 1,
        slotKey: 'deposit',
        amountVnd: 2_000_000,
        counselor: { id: 'tvv1', name: 'Tran TVV', email: 'tvv@school.vn' },
        scholarship1Label: 'HB 50%',
      },
      { legacy: true },
    )
    expect(body.student_name).toBe('Nguyen Van A')
    expect(body.counselor_name).toBe('Tran TVV')
    expect(body.amount_vnd).toBe(2_000_000)
    expect(body.total_recorded_vnd).toBe(2_000_000)
    expect(body.receipt_url).toContain('bill.pdf')
    expect(String(body.message_vi)).toContain('Nguyen Van A')
    expect(String(body.message_vi)).toContain('Tran TVV')
    expect(String(body.message_vi)).toContain(formatVnd(2_000_000))
  })

  it('includes rejection reason when declined', () => {
    const finance = {
      payments: {
        deposit: { amountVnd: 1_000_000, approvalStatus: 'TỪ CHỐI' as const, approvalNote: 'Bill mờ' },
      },
    }
    const body = buildAccountantDecisionWebhookBody(
      {
        lead,
        finance,
        decision: 'TỪ CHỐI',
        batch: 1,
        slotKey: 'deposit',
        amountVnd: 1_000_000,
        approvalNote: 'Bill mờ',
        counselor: { id: 'tvv1', name: 'Tran TVV', email: '' },
      },
      {},
    )
    expect(body.rejection_reason).toBe('Bill mờ')
    expect(String(body.message_vi)).toContain('TỪ CHỐI')
    expect(String(body.message_vi)).toContain('Bill mờ')
  })
})
