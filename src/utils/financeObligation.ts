/**
 * Lớp nghĩa vụ phải đóng kỳ 1 = học phí ngành − HB kỳ 1 (− HB2 kỳ 1).
 */
import type { Lead, ScholarshipRecord } from '../types'
import {
  activeFinanceTuitionCatalog,
  resolveTuitionTerm1FromCatalog,
  type FinanceTuitionCatalog,
} from './financeTuitionCatalog'
import {
  activeFinanceDepositThresholds,
  resolveDepositThresholdVnd,
  type FinanceDepositThresholds,
} from './financeThresholds'
import { sumApprovedPaymentsVnd } from './accountantN8nPayload'

export type FinanceObligationSnapshot = {
  tuitionTerm1Vnd: number
  scholarshipTerm1Vnd: number
  dueTerm1Vnd: number
  approvedVnd: number
  depositThresholdVnd: number
  remainingVnd: number
  /** Chưa có dòng giá ngành → không được coi ĐÃ HOÀN THIỆN theo tiền. */
  tuitionMissing: boolean
}

/** Phần HB trừ vào kỳ 1; không có phân bổ → 0 (không đoán trừ cả tổng). */
export function scholarshipTerm1CreditVnd(s: Pick<ScholarshipRecord, 'termAllocationsVnd' | 'termCount' | 'amountVnd'> | null | undefined): number {
  if (!s) return 0
  const alloc = Array.isArray(s.termAllocationsVnd) ? s.termAllocationsVnd : []
  if (alloc.length > 0) {
    const n = Number(alloc[0])
    return Number.isFinite(n) && n > 0 ? Math.round(n) : 0
  }
  const terms = Math.round(Number(s.termCount) || 0)
  const total = Math.round(Number(s.amountVnd) || 0)
  if (terms >= 1 && total > 0) return Math.round(total / terms)
  return 0
}

export function equalSplitTermAllocations(totalVnd: number, termCount: number): number[] {
  const n = Math.max(0, Math.round(termCount))
  if (n <= 0) return []
  const total = Math.max(0, Math.round(totalVnd))
  const base = Math.floor(total / n)
  const rem = total - base * n
  return Array.from({ length: n }, (_, i) => base + (i < rem ? 1 : 0))
}

export function computeFinanceObligation(
  lead: Pick<Lead, 'majorInterest' | 'educationLevel' | 'finance' | 'scholarship1Id' | 'scholarship2Id'>,
  opts?: {
    catalog?: FinanceTuitionCatalog
    thresholds?: FinanceDepositThresholds
    scholarshipsById?: Map<string, ScholarshipRecord> | Record<string, ScholarshipRecord>
  },
): FinanceObligationSnapshot {
  const catalog = opts?.catalog ?? activeFinanceTuitionCatalog()
  const thresholds = opts?.thresholds ?? activeFinanceDepositThresholds()
  const resolved = resolveTuitionTerm1FromCatalog(lead.majorInterest, lead.educationLevel, catalog)
  const lookup = (id: string | undefined): ScholarshipRecord | undefined => {
    if (!id) return undefined
    const map = opts?.scholarshipsById
    if (!map) return undefined
    if (map instanceof Map) return map.get(id)
    return map[id]
  }
  const hb1 = scholarshipTerm1CreditVnd(lookup(lead.scholarship1Id))
  const hb2 = scholarshipTerm1CreditVnd(lookup(lead.scholarship2Id))
  const scholarshipTerm1Vnd = hb1 + hb2
  const dueTerm1Vnd = resolved.missing
    ? 0
    : Math.max(0, resolved.tuitionTerm1Vnd - scholarshipTerm1Vnd)
  const approvedVnd = sumApprovedPaymentsVnd(lead.finance)
  const depositThresholdVnd = resolveDepositThresholdVnd(lead.educationLevel || '', thresholds)
  return {
    tuitionTerm1Vnd: resolved.tuitionTerm1Vnd,
    scholarshipTerm1Vnd,
    dueTerm1Vnd,
    approvedVnd,
    depositThresholdVnd,
    remainingVnd: Math.max(0, dueTerm1Vnd - approvedVnd),
    tuitionMissing: resolved.missing,
  }
}

/** Đủ tiền kỳ 1 để xét hoàn thiện phí (cần thêm field hồ sơ). */
export function obligationMeetsTerm1Due(snap: FinanceObligationSnapshot): boolean {
  if (snap.tuitionMissing) return false
  if (snap.dueTerm1Vnd <= 0) return snap.approvedVnd > 0
  return snap.approvedVnd >= snap.dueTerm1Vnd
}
