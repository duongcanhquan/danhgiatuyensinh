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

/** Chỉ cọc (chưa «ĐÃ HOÀN THIỆN»). */
export function leadIsCocOnly(lead: Pick<Lead, 'finance'>): boolean {
  const es = foldFinanceStatusText(String(lead.finance?.enrollmentStatus ?? ''))
  return es.includes('COC THANH CONG') && !es.includes('DA HOAN THIEN')
}

/**
 * Sheet / nghiệp vụ: CỌC THÀNH CÔNG, ĐÃ HOÀN THIỆN, Full NE, ghi danh
 * → đã xong việc kế toán mặc định (ẩn «Cần xử lý»).
 */
export function leadIsFeeHandoverDone(
  lead: Pick<Lead, 'finance' | 'status' | 'pipelineStatus'>,
): boolean {
  if (lead.status === 'ENROLLED' || lead.pipelineStatus === 'ENROLLED') return true
  const finance = lead.finance
  if (!finance) return false
  if (isFullNeDone(finance)) return true
  const es = foldFinanceStatusText(String(finance.enrollmentStatus ?? ''))
  return es.includes('DA HOAN THIEN') || es.includes('COC THANH CONG')
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

/** Còn khoản tiền / bill chưa duyệt hoặc cần kiểm tra lại. */
export function leadHasPendingPaymentApprovals(
  lead: Pick<Lead, 'finance'>,
): boolean {
  const finance = lead.finance
  if (!finance) return false
  for (const { line } of leadPaymentLines(finance)) {
    if (!lineHasMoneyOrBill(line)) continue
    const st = normalizePaymentApprovalStatus(line?.approvalStatus)
    if (st === 'ĐỒNG Ý' || st === 'TỪ CHỐI') continue
    if (st === 'KIỂM TRA LẠI' || !st) return true
  }
  return false
}

/**
 * Còn việc kế toán trên thẻ: khoản chưa duyệt, hoặc Full NE trên hồ sơ chưa bàn giao.
 * CỌC THÀNH CÔNG / ĐÃ HOÀN THIỆN: không bắt «Xác nhận Full NE» — Sheet coi là đã xong.
 */
export function leadHasPendingAccountantReview(
  lead: Pick<Lead, 'finance' | 'status' | 'pipelineStatus'>,
): boolean {
  const finance = lead.finance
  if (!finance) return false
  if (leadHasPendingPaymentApprovals(lead)) return true
  if (leadIsFeeHandoverDone(lead)) return false

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
 * Đã duyệt tiền nhưng chưa đủ điều kiện bàn giao (chưa đủ học phí kỳ 1 / chưa đủ field).
 */
export function leadHasIncompleteTuitionProgress(
  lead: Pick<Lead, 'finance' | 'educationLevel' | 'majorInterest' | 'scholarship1Id' | 'scholarship2Id' | 'status' | 'pipelineStatus'> &
    Partial<Lead>,
  thresholds: FinanceDepositThresholds = activeFinanceDepositThresholds(),
  obligationCtx?: AccountantObligationContext,
): boolean {
  if (leadHasPendingPaymentApprovals(lead)) return false
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

  const needDeposit = resolveDepositThresholdVnd(lead.educationLevel || '', thresholds)
  return approved < needDeposit || approved < snap.dueTerm1Vnd || snap.tuitionMissing
}

/** Hồ sơ Sheet đang thu dở — đã nộp nhưng chưa đủ để cọc. */
export function leadIsDangHoanThien(lead: Pick<Lead, 'finance'>): boolean {
  const es = foldFinanceStatusText(String(lead.finance?.enrollmentStatus ?? ''))
  return es.includes('DANG HOAN THIEN')
}

/**
 * Hàng đợi «Cần duyệt»:
 * 1) tiền/bill mới về chưa duyệt (ưu tiên),
 * 2) trạng thái ĐANG HOÀN THIỆN (đã nộp chưa đủ).
 * Không gồm CỌC / hoàn thiện / Full NE đơn thuần — xem bằng bộ lọc trạng thái.
 */
export function leadBelongsInAccountantWorkQueue(
  lead: Pick<Lead, 'finance' | 'educationLevel' | 'status' | 'pipelineStatus'> & Partial<Lead>,
  _thresholds?: FinanceDepositThresholds,
  _obligationCtx?: AccountantObligationContext,
): boolean {
  if (leadLooksLikeLegacySettledWithoutApprovals(lead)) return false
  if (leadHasPendingPaymentApprovals(lead)) return true
  if (leadIsFeeHandoverDone(lead)) return false
  return leadIsDangHoanThien(lead)
}

export function countFinanceSlotsWithAmount(lead: Pick<Lead, 'finance'>): number {
  let n = 0
  for (const { line } of leadPaymentLines(lead.finance)) {
    if ((line?.amountVnd ?? 0) > 0) n++
  }
  return n
}

/**
 * Tab mặc định ẩn hồ sơ đã bàn giao (CỌC / ĐÃ HOÀN THIỆN / Full NE),
 * trừ khi còn khoản tiền chưa duyệt.
 */
export function leadPassesShowDoneFilter(
  lead: Pick<Lead, 'finance' | 'status' | 'pipelineStatus'>,
  showDone: boolean,
  statusFilterActive: boolean,
): boolean {
  if (showDone || statusFilterActive) return true
  if (!leadIsFeeHandoverDone(lead)) return true
  return leadHasPendingPaymentApprovals(lead)
}

/** Ưu tiên: tiền mới cần duyệt → ĐANG HOÀN THIỆN → còn lại. */
export function compareAccountantWorkQueueOrder(a: Lead, b: Lead): number {
  const aPend = leadHasPendingPaymentApprovals(a) ? 0 : 1
  const bPend = leadHasPendingPaymentApprovals(b) ? 0 : 1
  if (aPend !== bPend) return aPend - bPend

  const aDang = leadIsDangHoanThien(a) ? 0 : 1
  const bDang = leadIsDangHoanThien(b) ? 0 : 1
  if (aDang !== bDang) return aDang - bDang

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
