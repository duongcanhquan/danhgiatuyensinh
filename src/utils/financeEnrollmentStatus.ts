import type { Lead, LeadFinanceRecord, LeadPaymentSlotKey } from '../types'
import { PAYMENT_SLOT_DEFS } from './leadFinance'
import {
  activeFinanceDepositThresholds,
  type FinanceDepositThresholds,
  resolveDepositThresholdVnd,
} from './financeThresholds'

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

/** Sau khi kế toán duyệt / từ chối — giống `processPaymentDecision` hệ cũ (cột 39). */
export function computeEnrollmentStatusAfterDecision(
  lead: Lead,
  finance: LeadFinanceRecord,
  decision: 'ĐỒNG Ý' | 'TỪ CHỐI',
  thresholds: FinanceDepositThresholds = activeFinanceDepositThresholds(),
): string {
  if (decision === 'TỪ CHỐI') return 'KIỂM TRA LẠI'

  const total = approvedTotal(finance)
  const threshold = resolveDepositThresholdVnd(lead.educationLevel, thresholds)
  if (total >= threshold) {
    return isLeadProfileCompleteForEnrollment(lead) ? 'ĐÃ HOÀN THIỆN' : 'CỌC THÀNH CÔNG'
  }
  if (total > 0) return 'ĐANG HOÀN THIỆN'
  return finance.enrollmentStatus?.trim() || 'MỚI'
}

export function defaultEnrollmentStatus(finance?: LeadFinanceRecord): string {
  return finance?.enrollmentStatus?.trim() || 'MỚI'
}
