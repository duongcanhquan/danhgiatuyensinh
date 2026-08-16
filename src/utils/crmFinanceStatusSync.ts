import type { LeadCounselorStatus } from '../types'

const CRM_PROGRESS_RANK: Record<LeadCounselorStatus, number> = {
  NEW: 0,
  INTERESTED: 1,
  DEPOSIT_PAID: 2,
  ENROLLED: 3,
  SUMMER_MELT: -1,
  DEAD: -1,
}

function foldVi(raw: string): string {
  return raw
    .trim()
    .toUpperCase()
    .replace(/[đĐ]/g, 'D')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/\s+/g, ' ')
}

/**
 * Gợi ý tình trạng CRM từ tình trạng thu phí (kế toán / Sheet).
 * Chỉ các mốc «đã cọc / nhập học» — không hạ NEW←cọc khi từ chối.
 */
export function counselorStatusSuggestedFromEnrollment(
  enrollmentStatus: string | undefined | null,
): LeadCounselorStatus | null {
  const es = foldVi(String(enrollmentStatus ?? ''))
  if (!es) return null
  if (es.includes('DA HOAN THIEN') || es.includes('NHAP HOC') || es.includes('GHI DANH')) {
    return 'ENROLLED'
  }
  if (es.includes('COC THANH CONG') || es === 'COC' || es.includes('DA COC')) {
    return 'DEPOSIT_PAID'
  }
  return null
}

/**
 * Chỉ nâng CRM khi thu phí đã vượt mốc (không đè Hủy / Không tiềm năng; không hạ bậc).
 */
export function crmStatusUpgradeFromEnrollment(
  currentStatus: string | undefined | null,
  enrollmentStatus: string | undefined | null,
): LeadCounselorStatus | null {
  const suggested = counselorStatusSuggestedFromEnrollment(enrollmentStatus)
  if (!suggested) return null
  const cur = (String(currentStatus ?? 'NEW').trim() || 'NEW') as LeadCounselorStatus
  if (cur === 'DEAD' || cur === 'SUMMER_MELT') return null
  const curRank = CRM_PROGRESS_RANK[cur] ?? 0
  const nextRank = CRM_PROGRESS_RANK[suggested] ?? 0
  if (nextRank <= curRank) return null
  return suggested
}
