import type { Lead, LeadFinanceRecord, LeadPaymentSlotKey, ScholarshipRecord } from '../types'
import { PAYMENT_SLOT_DEFS } from './leadFinance'
import {
  activeFinanceDepositThresholds,
  resolveDepositThresholdVnd,
  type FinanceDepositThresholds,
} from './financeThresholds'
import { sumApprovedPaymentsVnd } from './accountantN8nPayload'
import { foldFinanceStatusText, normalizePaymentApprovalStatus } from './paymentApprovalStatus'
import {
  computeFinanceObligation,
  obligationMeetsTerm1Due,
} from './financeObligation'
import type { FinanceTuitionCatalog } from './financeTuitionCatalog'
import { isLeadProfileCompleteForEnrollment } from './financeEnrollmentStatus'

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

/** Cọc hoặc hoàn thiện phí (trạng thái ghi danh). */
export function leadIsSettledCocOrComplete(lead: Pick<Lead, 'finance'>): boolean {
  const es = foldFinanceStatusText(String(lead.finance?.enrollmentStatus ?? ''))
  return (
    es.includes('COC THANH CONG') ||
    es.includes('DA HOAN THIEN')
  )
}

/** Chỉ cọc — vẫn theo dõi trên hàng đợi. */
export function leadIsCocOnly(lead: Pick<Lead, 'finance'>): boolean {
  const es = foldFinanceStatusText(String(lead.finance?.enrollmentStatus ?? ''))
  return es.includes('COC THANH CONG') && !es.includes('DA HOAN THIEN')
}

/**
 * Đã hoàn thiện phí / đã ghi danh / Full NE → bàn giao, ẩn khỏi theo dõi mặc định.
 */
export function leadIsFeeHandoverDone(
  lead: Pick<Lead, 'finance' | 'status' | 'pipelineStatus'>,
): boolean {
  if (lead.status === 'ENROLLED' || lead.pipelineStatus === 'ENROLLED') return true
  const finance = lead.finance
  if (!finance) return false
  if (isFullNeDone(finance)) return true
  const es = foldFinanceStatusText(String(finance.enrollmentStatus ?? ''))
  return es.includes('DA HOAN THIEN')
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
 * Còn khoản treo duyệt / Full NE (chưa bàn giao).
 * Cọc thành công vẫn có thể treo Full NE hoặc khoản bổ sung chưa duyệt.
 */
export function leadHasPendingAccountantReview(
  lead: Pick<Lead, 'finance' | 'status' | 'pipelineStatus'>,
): boolean {
  const finance = lead.finance
  if (!finance) return false
  if (leadIsFeeHandoverDone(lead)) return false

  for (const { line } of leadPaymentLines(finance)) {
    if (!lineHasMoneyOrBill(line)) continue
    const st = normalizePaymentApprovalStatus(line?.approvalStatus)
    if (st === 'ĐỒNG Ý' || st === 'TỪ CHỐI') continue
    if (st === 'KIỂM TRA LẠI' || !st) return true
  }

  const fullNePending =
    Boolean(finance.reqFullNe) ||
    foldFinanceStatusText(String(finance.fullNeStatus ?? '')).includes('YEU CAU')
  return fullNePending
}

export type AccountantObligationContext = {
  thresholds?: FinanceDepositThresholds
  catalog?: FinanceTuitionCatalog
  scholarshipsById?: Map<string, ScholarshipRecord> | Record<string, ScholarshipRecord>
}

/**
 * Đã duyệt tiền nhưng chưa đủ điều kiện bàn giao (chưa đủ học phí kỳ 1 / chưa đủ field / mới cọc).
 */
export function leadHasIncompleteTuitionProgress(
  lead: Pick<Lead, 'finance' | 'educationLevel' | 'majorInterest' | 'scholarship1Id' | 'scholarship2Id' | 'status' | 'pipelineStatus'> &
    Partial<Lead>,
  thresholds: FinanceDepositThresholds = activeFinanceDepositThresholds(),
  obligationCtx?: AccountantObligationContext,
): boolean {
  if (leadHasPendingAccountantReview(lead)) return false
  if (leadIsFeeHandoverDone(lead)) return false
  const finance = lead.finance
  if (!finance) return false

  const approved = sumApprovedPaymentsVnd(finance)
  if (approved <= 0) return false

  const snap = computeFinanceObligation(lead, {
    catalog: obligationCtx?.catalog,
    thresholds: obligationCtx?.thresholds ?? thresholds,
    scholarshipsById: obligationCtx?.scholarshipsById,
  })

  if (obligationMeetsTerm1Due(snap)) {
    // Đủ tiền nhưng thiếu field → vẫn theo dõi (chưa ĐÃ HOÀN THIỆN)
    return !isLeadProfileCompleteForEnrollment(lead as Lead)
  }

  // Chưa đủ phải đóng kỳ 1 (gồm chỉ mới đủ cọc, hoặc chưa đủ cọc)
  if (leadIsCocOnly(lead)) return true
  const needDeposit = resolveDepositThresholdVnd(lead.educationLevel || '', thresholds)
  return approved < needDeposit || approved < snap.dueTerm1Vnd || snap.tuitionMissing
}

/** Hàng đợi «Cần xử lý»: treo duyệt, nộp thiếu, hoặc chỉ mới cọc — không gồm đã bàn giao. */
export function leadBelongsInAccountantWorkQueue(
  lead: Pick<Lead, 'finance' | 'educationLevel' | 'status' | 'pipelineStatus'> & Partial<Lead>,
  thresholds?: FinanceDepositThresholds,
  obligationCtx?: AccountantObligationContext,
): boolean {
  if (leadIsFeeHandoverDone(lead)) return false
  if (leadLooksLikeLegacySettledWithoutApprovals(lead)) return false
  return (
    leadHasPendingAccountantReview(lead) ||
    leadHasIncompleteTuitionProgress(lead, thresholds, obligationCtx) ||
    leadIsCocOnly(lead)
  )
}

export function countFinanceSlotsWithAmount(lead: Pick<Lead, 'finance'>): number {
  let n = 0
  for (const { line } of leadPaymentLines(lead.finance)) {
    if ((line?.amountVnd ?? 0) > 0) n++
  }
  return n
}

/**
 * Tab mặc định ẩn hồ sơ đã bàn giao (ĐÃ HOÀN THIỆN / Full NE).
 * Cọc thành công vẫn hiện (còn theo dõi).
 */
export function leadPassesShowDoneFilter(
  lead: Pick<Lead, 'finance' | 'status' | 'pipelineStatus'>,
  showDone: boolean,
  statusFilterActive: boolean,
): boolean {
  if (showDone || statusFilterActive) return true
  if (!leadIsFeeHandoverDone(lead)) return true
  return leadHasPendingAccountantReview(lead)
}

/** Ưu tiên: chờ duyệt khoản (mới trước) → nộp thiếu / chỉ cọc → còn lại. */
export function compareAccountantWorkQueueOrder(a: Lead, b: Lead): number {
  const aPend = leadHasPendingAccountantReview(a) ? 0 : 1
  const bPend = leadHasPendingAccountantReview(b) ? 0 : 1
  if (aPend !== bPend) return aPend - bPend

  const aInc = leadHasIncompleteTuitionProgress(a) || leadIsCocOnly(a) ? 0 : 1
  const bInc = leadHasIncompleteTuitionProgress(b) || leadIsCocOnly(b) ? 0 : 1
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
