import type { Lead, LeadFinanceRecord, LeadPaymentSlotKey } from '../types'
import { PAYMENT_SLOT_DEFS } from './leadFinance'

const PAYMENT_KEYS: LeadPaymentSlotKey[] = PAYMENT_SLOT_DEFS.map((s) => s.key)

function approvedTotal(finance: LeadFinanceRecord | undefined): number {
  const pay = finance?.payments ?? {}
  let sum = 0
  for (const key of PAYMENT_KEYS) {
    const line = pay[key]
    if (line?.approvalStatus === 'ĐỒNG Ý' && line.amountVnd) sum += line.amountVnd
  }
  return sum
}

function depositThreshold(educationLevel: string): number {
  return String(educationLevel).toUpperCase().includes('9+') ? 2_000_000 : 1_000_000
}

/** Sau khi kế toán duyệt / từ chối — giống `processPaymentDecision` hệ cũ (cột 39). */
export function computeEnrollmentStatusAfterDecision(
  lead: Lead,
  finance: LeadFinanceRecord,
  decision: 'ĐỒNG Ý' | 'TỪ CHỐI',
): string {
  if (decision === 'TỪ CHỐI') return 'KIỂM TRA LẠI'

  const total = approvedTotal(finance)
  const threshold = depositThreshold(lead.educationLevel)
  if (total >= threshold) return 'CỌC THÀNH CÔNG'
  if (total > 0) return 'ĐANG HOÀN THIỆN'
  return finance.enrollmentStatus?.trim() || 'MỚI'
}

export function defaultEnrollmentStatus(finance?: LeadFinanceRecord): string {
  return finance?.enrollmentStatus?.trim() || 'MỚI'
}
