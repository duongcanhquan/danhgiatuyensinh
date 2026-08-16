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
  if (String(finance.fullNeStatus ?? '').trim() === 'YÊU CẦU FULL NE') return true
  const es = String(finance.enrollmentStatus ?? '')
    .trim()
    .toUpperCase()
  return es === 'KIỂM TRA LẠI' || es === 'TỪ CHỐI'
}

export function countFinanceSlotsWithAmount(lead: Pick<Lead, 'finance'>): number {
  let n = 0
  for (const { line } of leadPaymentLines(lead.finance)) {
    if ((line?.amountVnd ?? 0) > 0) n++
  }
  return n
}

/** Apps Script: CỌC THÀNH CÔNG / ĐÃ HOÀN THIỆN — ẩn mặc định trừ khi còn treo. */
export function leadIsSettledCocOrComplete(lead: Pick<Lead, 'finance'>): boolean {
  const es = String(lead.finance?.enrollmentStatus ?? '')
    .trim()
    .toUpperCase()
  return es === 'CỌC THÀNH CÔNG' || es === 'ĐÃ HOÀN THIỆN'
}

/**
 * Toggle «Hiện CỌC THÀNH CÔNG» (Account.html `#showDone`).
 * Ẩn cọc/hoàn thiện trừ khi: bật toggle, đang lọc status, hoặc còn batch/Full NE treo.
 */
export function leadPassesShowDoneFilter(
  lead: Pick<Lead, 'finance'>,
  showDone: boolean,
  statusFilterActive: boolean,
): boolean {
  if (showDone || statusFilterActive) return true
  if (!leadIsSettledCocOrComplete(lead)) return true
  return leadHasPendingAccountantReview(lead)
}

/** Stat bar Account.html — đếm trên toàn DATA (không theo search/filter). */
export function countEnrollmentStatusStats(leads: readonly Pick<Lead, 'finance'>[]): {
  moi: number
  dang: number
  coc: number
  kiemTra: number
  hoanThien: number
} {
  let moi = 0
  let dang = 0
  let coc = 0
  let kiemTra = 0
  let hoanThien = 0
  for (const lead of leads) {
    const es = String(lead.finance?.enrollmentStatus ?? 'MỚI')
      .trim()
      .toUpperCase()
    if (es === 'KIỂM TRA LẠI') kiemTra++
    else if (es === 'CỌC THÀNH CÔNG') coc++
    else if (es === 'ĐÃ HOÀN THIỆN') hoanThien++
    else if (es === 'ĐANG HOÀN THIỆN') dang++
    else moi++
  }
  return { moi, dang, coc, kiemTra, hoanThien }
}
