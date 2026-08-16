import type { Lead, LeadFinanceRecord, LeadPaymentSlotKey } from '../types'
import { PAYMENT_SLOT_DEFS } from './leadFinance'
import {
  activeFinanceDepositThresholds,
  resolveDepositThresholdVnd,
  type FinanceDepositThresholds,
} from './financeThresholds'
import { sumApprovedPaymentsVnd } from './accountantN8nPayload'
import { foldFinanceStatusText, normalizePaymentApprovalStatus } from './paymentApprovalStatus'

export { foldFinanceStatusText, normalizePaymentApprovalStatus } from './paymentApprovalStatus'

const SLOT_KEYS: LeadPaymentSlotKey[] = PAYMENT_SLOT_DEFS.map((s) => s.key)

export function leadPaymentLines(finance: LeadFinanceRecord | undefined) {
  return SLOT_KEYS.map((key) => ({ key, line: finance?.payments?.[key] }))
}

function lineHasMoneyOrBill(line: { amountVnd?: number; receiptUrl?: string } | undefined): boolean {
  if (!line) return false
  if ((line.amountVnd ?? 0) > 0) return true
  return Boolean(String(line.receiptUrl ?? '').trim())
}

/** TVV đã ghi nhận tiền, bill hoặc yêu cầu Full NE — mới vào cổng kế toán. */
export function leadHasFinanceActivity(lead: Pick<Lead, 'finance'>): boolean {
  const finance = lead.finance
  if (!finance) return false
  for (const { line } of leadPaymentLines(finance)) {
    if (lineHasMoneyOrBill(line)) return true
  }
  if ((finance.declaredTotalVnd ?? 0) > 0) return true
  if (finance.reqFullNe) return true
  const fn = String(finance.fullNeStatus ?? '').trim()
  if (fn) return true
  return false
}

function isFullNeDone(finance: LeadFinanceRecord): boolean {
  const fn = foldFinanceStatusText(String(finance.fullNeStatus ?? ''))
  return fn.includes('DA FULL')
}

/** Cọc / hoàn thiện phí theo trạng thái ghi danh (Sheet cột 39/42). */
export function leadIsSettledCocOrComplete(lead: Pick<Lead, 'finance'>): boolean {
  const es = foldFinanceStatusText(String(lead.finance?.enrollmentStatus ?? ''))
  return (
    es === 'COC THANH CONG' ||
    es.includes('COC THANH CONG') ||
    es === 'DA HOAN THIEN' ||
    es.includes('DA HOAN THIEN')
  )
}

/**
 * Import Sheet: nhiều dòng đã «CỌC THÀNH CÔNG» / Full NE nhưng cột duyệt trống.
 * Chỉ áp dụng khi trạng thái ghi danh đã xong — không ẩn khoản TVV mới nộp đủ tiền chưa duyệt.
 */
export function leadLooksLikeLegacySettledWithoutApprovals(
  lead: Pick<Lead, 'finance'>,
): boolean {
  const finance = lead.finance
  if (!finance) return false
  if (!leadIsSettledCocOrComplete(lead) && !isFullNeDone(finance)) return false

  let moneyLines = 0
  for (const { line } of leadPaymentLines(finance)) {
    if (!lineHasMoneyOrBill(line)) continue
    moneyLines++
    const st = normalizePaymentApprovalStatus(line?.approvalStatus)
    if (st) return false
  }
  return moneyLines > 0
}

/**
 * Còn việc kế toán phải xử lý trên khoản thu / Full NE.
 * Không đưa hồ sơ đã cọc/hoàn thiện từ Sheet cũ (tiền có, cột duyệt trống) vào chờ duyệt.
 */
export function leadHasPendingAccountantReview(lead: Pick<Lead, 'finance'>): boolean {
  const finance = lead.finance
  if (!finance) return false

  const fullNePending =
    !isFullNeDone(finance) &&
    (Boolean(finance.reqFullNe) ||
      foldFinanceStatusText(String(finance.fullNeStatus ?? '')).includes('YEU CAU'))

  if (leadLooksLikeLegacySettledWithoutApprovals(lead)) {
    return fullNePending
  }

  for (const { line } of leadPaymentLines(finance)) {
    if (!lineHasMoneyOrBill(line)) continue
    const st = normalizePaymentApprovalStatus(line?.approvalStatus)
    if (st === 'ĐỒNG Ý' || st === 'TỪ CHỐI') continue
    if (st === 'KIỂM TRA LẠI' || !st) return true
  }

  return fullNePending
}
/**
 * Đã có tiền được duyệt nhưng chưa đủ ngưỡng cọc / chưa Full NE — «nộp thiếu».
 * Không gồm hồ sơ đang treo duyệt khoản (ưu tiên chờ duyệt).
 */
export function leadHasIncompleteTuitionProgress(
  lead: Pick<Lead, 'finance' | 'educationLevel'>,
  thresholds: FinanceDepositThresholds = activeFinanceDepositThresholds(),
): boolean {
  if (leadHasPendingAccountantReview(lead)) return false
  const finance = lead.finance
  if (!finance) return false
  if (isFullNeDone(finance)) return false
  if (leadIsSettledCocOrComplete(lead)) return false

  const approved = sumApprovedPaymentsVnd(finance)
  if (approved <= 0) return false
  const need = resolveDepositThresholdVnd(lead.educationLevel || '', thresholds)
  return approved < need
}

/** Hàng đợi mặc định «Chờ duyệt»: treo duyệt / kiểm tra lại / nộp thiếu. */
export function leadBelongsInAccountantWorkQueue(
  lead: Pick<Lead, 'finance' | 'educationLevel'>,
  thresholds?: FinanceDepositThresholds,
): boolean {
  return leadHasPendingAccountantReview(lead) || leadHasIncompleteTuitionProgress(lead, thresholds)
}

export function countFinanceSlotsWithAmount(lead: Pick<Lead, 'finance'>): number {
  let n = 0
  for (const { line } of leadPaymentLines(lead.finance)) {
    if ((line?.amountVnd ?? 0) > 0) n++
  }
  return n
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
  const finance = lead.finance
  if (!finance) return true
  if (!leadIsSettledCocOrComplete(lead) && !isFullNeDone(finance)) return true
  return leadHasPendingAccountantReview(lead)
}

/** Ưu tiên: chờ duyệt khoản (mới trước) → nộp thiếu → còn lại. */
export function compareAccountantWorkQueueOrder(a: Lead, b: Lead): number {
  const aPend = leadHasPendingAccountantReview(a) ? 0 : 1
  const bPend = leadHasPendingAccountantReview(b) ? 0 : 1
  if (aPend !== bPend) return aPend - bPend

  const aInc = leadHasIncompleteTuitionProgress(a) ? 0 : 1
  const bInc = leadHasIncompleteTuitionProgress(b) ? 0 : 1
  if (aInc !== bInc) return aInc - bInc

  const aMs = a.updatedAt?.toMillis?.() ?? a.createdAt?.toMillis?.() ?? a.uploadedAt?.toMillis?.() ?? 0
  const bMs = b.updatedAt?.toMillis?.() ?? b.createdAt?.toMillis?.() ?? b.uploadedAt?.toMillis?.() ?? 0
  return bMs - aMs
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
    const es = foldFinanceStatusText(String(lead.finance?.enrollmentStatus ?? 'MỚI'))
    if (es.includes('KIEM TRA')) kiemTra++
    else if (es.includes('COC THANH CONG')) coc++
    else if (es.includes('DA HOAN THIEN')) hoanThien++
    else if (es.includes('DANG HOAN THIEN')) dang++
    else moi++
  }
  return { moi, dang, coc, kiemTra, hoanThien }
}
