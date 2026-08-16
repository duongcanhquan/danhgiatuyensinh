import type { Lead, LeadCounselorStatus } from '../types'
import { LEAD_COUNSELOR_STATUS_LABELS, LEAD_COUNSELOR_STATUS_ORDER } from '../types'
import { foldFinanceStatusText } from './paymentApprovalStatus'

/**
 * Hồ sơ đã ghi danh / đã hoàn thiện phí — ẩn khỏi danh sách mặc định;
 * chỉ hiện khi lọc Tình trạng / Thu phí tương ứng, hoặc đang tìm mã/SĐT, hoặc xuất Excel.
 * «Đã cọc» vẫn hiện để TVV ưu tiên đẩy phí / hồ sơ mới.
 */
export const LEAD_COUNSELOR_STATUS_HIDDEN_BY_DEFAULT: readonly LeadCounselorStatus[] = [
  'ENROLLED',
] as const

/** Lọc «Thu phí» mà cần thấy hồ sơ đã bàn giao. */
const ENROLLMENT_FILTERS_SHOW_HANDOVER = new Set(['DA_HOAN_THIEN', 'GHI_DANH', 'FULL_NE'])

/** Trạng thái còn hiện khi lọc «Tất cả». */
export const LEAD_COUNSELOR_STATUS_DEFAULT_VISIBLE: readonly LeadCounselorStatus[] =
  LEAD_COUNSELOR_STATUS_ORDER.filter((s) => !LEAD_COUNSELOR_STATUS_HIDDEN_BY_DEFAULT.includes(s))

function leadIsHandoverForList(lead: Pick<Lead, 'status' | 'pipelineStatus' | 'finance'>): boolean {
  if (lead.status === 'ENROLLED' || lead.pipelineStatus === 'ENROLLED') return true
  const finance = lead.finance
  if (!finance) return false
  const fn = foldFinanceStatusText(String(finance.fullNeStatus ?? ''))
  if (fn.includes('DA FULL')) return true
  const es = foldFinanceStatusText(String(finance.enrollmentStatus ?? ''))
  return es.includes('DA HOAN THIEN')
}

/** @deprecated dùng leadIsHandoverHiddenByDefault — giữ tên cũ cho import cũ. */
export function leadIsDepositDoneHiddenByDefault(
  lead: Pick<Lead, 'status' | 'pipelineStatus' | 'finance'> | { status?: LeadCounselorStatus | string | null },
): boolean {
  return leadIsHandoverHiddenByDefault(lead as Pick<Lead, 'status' | 'pipelineStatus' | 'finance'>)
}

export function leadIsHandoverHiddenByDefault(
  lead: Pick<Lead, 'status' | 'pipelineStatus' | 'finance'>,
): boolean {
  return leadIsHandoverForList(lead)
}

/**
 * @param crmFilter — lọc Tình trạng CRM (`ALL` | LeadCounselorStatus)
 * @param searching — đang tìm theo ô tìm (mã/SĐT) → vẫn hiện hồ sơ đã bàn giao nếu khớp
 * @param enrollmentFilter — lọc Thu phí; khi chọn Đã hoàn thiện / Ghi danh / Full NE thì không ẩn mặc định
 */
export function leadMatchesCrmListVisibility(
  lead: Pick<Lead, 'status' | 'pipelineStatus' | 'finance'> | { status?: LeadCounselorStatus | string | null },
  crmFilter: string,
  searching: boolean,
  enrollmentFilter: string = 'ALL',
): boolean {
  if (searching) return true
  if (crmFilter === 'ENROLLED') {
    return lead.status === 'ENROLLED' || (lead as Lead).pipelineStatus === 'ENROLLED'
  }
  if (crmFilter === 'DEPOSIT_PAID') return lead.status === 'DEPOSIT_PAID'
  if (crmFilter !== 'ALL') return true

  const ef = String(enrollmentFilter || 'ALL').trim().toUpperCase()
  if (ENROLLMENT_FILTERS_SHOW_HANDOVER.has(ef)) return true

  return !leadIsHandoverHiddenByDefault(lead as Pick<Lead, 'status' | 'pipelineStatus' | 'finance'>)
}

/** Gợi ý ngắn dưới nhãn nút tình trạng. */
export const LEAD_COUNSELOR_STATUS_HINTS: Record<LeadCounselorStatus, string> = {
  NEW: 'Chưa nộp / mới vào',
  INTERESTED: 'Nộp tiền xét tuyển (LPXT)',
  DEPOSIT_PAID: 'Đã cọc — còn theo dõi học phí kỳ 1',
  ENROLLED: 'Đã nhập học / hoàn thiện — bàn giao',
  SUMMER_MELT: 'Rút / hủy sau khi đã tiến xa',
  DEAD: 'Không còn theo đuổi',
}

const TONE: Record<LeadCounselorStatus, { idle: string; active: string }> = {
  NEW: {
    idle: 'border-slate-300 bg-white text-slate-800 hover:border-slate-500',
    active: 'border-slate-800 bg-slate-800 text-white ring-2 ring-slate-400/50',
  },
  INTERESTED: {
    idle: 'border-sky-300 bg-sky-50 text-sky-950 hover:border-sky-500',
    active: 'border-sky-700 bg-sky-600 text-white ring-2 ring-sky-300/60',
  },
  DEPOSIT_PAID: {
    idle: 'border-emerald-300 bg-emerald-50 text-emerald-950 hover:border-emerald-500',
    active: 'border-emerald-700 bg-emerald-600 text-white ring-2 ring-emerald-300/60',
  },
  ENROLLED: {
    idle: 'border-violet-300 bg-violet-50 text-violet-950 hover:border-violet-500',
    active: 'border-violet-700 bg-violet-600 text-white ring-2 ring-violet-300/60',
  },
  SUMMER_MELT: {
    idle: 'border-amber-300 bg-amber-50 text-amber-950 hover:border-amber-500',
    active: 'border-amber-600 bg-amber-500 text-amber-950 ring-2 ring-amber-300/60',
  },
  DEAD: {
    idle: 'border-rose-300 bg-rose-50 text-rose-950 hover:border-rose-500',
    active: 'border-rose-700 bg-rose-600 text-white ring-2 ring-rose-300/60',
  },
}

export function leadCounselorStatusButtonClass(
  status: LeadCounselorStatus,
  selected: boolean,
): string {
  return selected ? TONE[status].active : TONE[status].idle
}

export function leadCounselorStatusBadgeClass(status: LeadCounselorStatus): string {
  switch (status) {
    case 'NEW':
      return 'bg-slate-100 text-slate-800'
    case 'INTERESTED':
      return 'bg-sky-100 text-sky-900'
    case 'DEPOSIT_PAID':
      return 'bg-emerald-100 text-emerald-900'
    case 'ENROLLED':
      return 'bg-violet-100 text-violet-900'
    case 'SUMMER_MELT':
      return 'bg-amber-100 text-amber-950'
    case 'DEAD':
      return 'bg-rose-100 text-rose-950'
    default:
      return 'bg-slate-100 text-slate-800'
  }
}

export { LEAD_COUNSELOR_STATUS_LABELS, LEAD_COUNSELOR_STATUS_ORDER }
