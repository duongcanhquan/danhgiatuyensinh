import type { Lead, LeadFinanceRecord, LeadPaymentSlotKey, ScholarshipRecord } from '../types'
import { PAYMENT_SLOT_DEFS } from './leadFinance'
import {
  activeFinanceDepositThresholds,
  type FinanceDepositThresholds,
  resolveDepositThresholdVnd,
} from './financeThresholds'
import { normalizePaymentApprovalStatus } from './paymentApprovalStatus'
import {
  computeFinanceObligation,
  obligationMeetsTerm1Due,
} from './financeObligation'
import type { FinanceTuitionCatalog } from './financeTuitionCatalog'

const PAYMENT_KEYS: LeadPaymentSlotKey[] = PAYMENT_SLOT_DEFS.map((s) => s.key)

function approvedTotal(finance: LeadFinanceRecord | undefined): number {
  const pay = finance?.payments ?? {}
  let sum = 0
  for (const key of PAYMENT_KEYS) {
    const line = pay[key]
    if (normalizePaymentApprovalStatus(line?.approvalStatus) === 'ĐỒNG Ý' && line?.amountVnd) {
      sum += line.amountVnd
    }
  }
  return sum
}

function hasText(v: unknown): boolean {
  return String(v ?? '').trim().length > 0
}

/**
 * Field bắt buộc sau khi đủ cọc → «ĐÃ HOÀN THIỆN» (Apps Script processPaymentDecision
 * requiredIndices map sang Lead).
 */
export function isLeadProfileCompleteForEnrollment(lead: Lead): boolean {
  const hasId =
    lead.nationalIdNotAvailable === true ||
    hasText(lead.nationalId) ||
    String(lead.nationalId ?? '')
      .trim()
      .toUpperCase() === 'CHƯA CÓ'

  const checks: boolean[] = [
    hasText(lead.systemCode) || hasText(lead.id),
    hasText(lead.fullName),
    hasText(lead.gender),
    hasText(lead.dateOfBirth),
    hasText(lead.phone),
    hasText(lead.studentEmail),
    hasText(lead.permanentAddress) || hasText(lead.address),
    hasText(lead.educationLevel),
    hasText(lead.majorInterest),
    hasText(lead.placeOfBirth),
    hasText(lead.ethnicity),
    hasId,
    hasText(lead.fatherName),
    hasText(lead.fatherPhone),
    hasText(lead.motherName),
    hasText(lead.motherPhone),
    hasText(lead.highSchool),
    hasText(lead.province),
    hasText(lead.hanoiArea) || hasText(lead.currentResidence),
  ]
  return checks.every(Boolean)
}

export type EnrollmentDecisionContext = {
  thresholds?: FinanceDepositThresholds
  catalog?: FinanceTuitionCatalog
  scholarshipsById?: Map<string, ScholarshipRecord> | Record<string, ScholarshipRecord>
}

function isThresholdsOnly(
  v: FinanceDepositThresholds | EnrollmentDecisionContext,
): v is FinanceDepositThresholds {
  return (
    typeof v === 'object' &&
    v != null &&
    'depositStandardVnd' in v &&
    !('catalog' in v) &&
    !('scholarshipsById' in v) &&
    !('thresholds' in v)
  )
}

/**
 * Sau khi kế toán duyệt / từ chối.
 * ĐÃ HOÀN THIỆN = đủ «phải đóng kỳ 1» (học phí − HB kỳ 1) + đủ field hồ sơ.
 * CỌC = đã đạt ngưỡng cọc nhưng chưa đủ điều kiện hoàn thiện.
 */
export function computeEnrollmentStatusAfterDecision(
  lead: Lead,
  finance: LeadFinanceRecord,
  decision: 'ĐỒNG Ý' | 'TỪ CHỐI',
  thresholdsOrCtx: FinanceDepositThresholds | EnrollmentDecisionContext = activeFinanceDepositThresholds(),
): string {
  if (decision === 'TỪ CHỐI') return 'KIỂM TRA LẠI'

  const ctx: EnrollmentDecisionContext = isThresholdsOnly(thresholdsOrCtx)
    ? { thresholds: thresholdsOrCtx }
    : thresholdsOrCtx

  const thresholds = ctx.thresholds ?? activeFinanceDepositThresholds()
  const total = approvedTotal(finance)
  const deposit = resolveDepositThresholdVnd(lead.educationLevel, thresholds)
  const snap = computeFinanceObligation(
    { ...lead, finance },
    {
      catalog: ctx.catalog,
      thresholds,
      scholarshipsById: ctx.scholarshipsById,
    },
  )

  if (obligationMeetsTerm1Due(snap) && isLeadProfileCompleteForEnrollment(lead)) {
    return 'ĐÃ HOÀN THIỆN'
  }
  if (total >= deposit) return 'CỌC THÀNH CÔNG'
  if (total > 0) return 'ĐANG HOÀN THIỆN'
  return finance.enrollmentStatus?.trim() || 'MỚI'
}

export function defaultEnrollmentStatus(finance?: LeadFinanceRecord): string {
  return finance?.enrollmentStatus?.trim() || 'MỚI'
}
