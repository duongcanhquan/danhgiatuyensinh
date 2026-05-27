import type { Lead, LeadFinanceRecord, LeadPaymentSlotKey } from '../types'
import { PAYMENT_SLOT_DEFS } from './leadFinance'

const SLOT_KEYS: LeadPaymentSlotKey[] = PAYMENT_SLOT_DEFS.map((s) => s.key)

export function leadPaymentLines(finance: LeadFinanceRecord | undefined) {
  return SLOT_KEYS.map((key) => ({ key, line: finance?.payments?.[key] }))
}

/** TVV đã ghi nhận tiền, bill hoặc yêu cầu Full NE — mới vào cổng kế toán. */
export function leadHasFinanceActivity(lead: Pick<Lead, 'finance'>): boolean {
  const finance = lead.finance
  if (!finance) return false
  for (const { line } of leadPaymentLines(finance)) {
    if ((line?.amountVnd ?? 0) > 0) return true
    if (String(line?.receiptUrl ?? '').trim()) return true
  }
  if ((finance.declaredTotalVnd ?? 0) > 0) return true
  if (finance.reqFullNe) return true
  const fn = String(finance.fullNeStatus ?? '').trim()
  if (fn) return true
  return false
}

/** Còn khoản chờ kế toán duyệt / từ chối hoặc chờ xác nhận Full NE. */
export function leadHasPendingAccountantReview(lead: Pick<Lead, 'finance'>): boolean {
  const finance = lead.finance
  if (!finance) return false
  for (const { line } of leadPaymentLines(finance)) {
    const amt = line?.amountVnd ?? 0
    const st = String(line?.approvalStatus ?? '').trim()
    if (amt > 0 && !st) return true
    if (st === 'KIỂM TRA LẠI') return true
  }
  return String(finance.fullNeStatus ?? '').trim() === 'YÊU CẦU FULL NE'
}

export function countFinanceSlotsWithAmount(lead: Pick<Lead, 'finance'>): number {
  let n = 0
  for (const { line } of leadPaymentLines(lead.finance)) {
    if ((line?.amountVnd ?? 0) > 0) n++
  }
  return n
}
