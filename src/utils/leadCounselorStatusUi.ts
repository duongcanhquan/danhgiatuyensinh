import type { LeadCounselorStatus } from '../types'
import { LEAD_COUNSELOR_STATUS_LABELS, LEAD_COUNSELOR_STATUS_ORDER } from '../types'

/** Gợi ý ngắn dưới nhãn nút tình trạng. */
export const LEAD_COUNSELOR_STATUS_HINTS: Record<LeadCounselorStatus, string> = {
  NEW: 'Chưa nộp / mới vào',
  INTERESTED: 'Nộp tiền xét tuyển (LPXT)',
  DEPOSIT_PAID: 'Đã đóng cọc — ít cần gọi thêm',
  ENROLLED: 'Đã nhập học',
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
