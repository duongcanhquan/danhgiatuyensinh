import type { Lead } from '../types'
import {
  accountantFinanceStatusTag,
  statusTagClass,
  type AccountantStatusTag,
} from './accountantLeadDisplay'
import { intakeProgramsMatch } from './intakeProgramRecent'
import { leadUploadedAtMs } from './leadUploadedDateRange'

/** Giá trị lọc «Tình trạng» trên danh sách Hồ sơ. */
export const LEAD_TINH_TRANG_FILTER_OPTIONS: readonly { v: string; t: string }[] = [
  { v: 'ALL', t: 'Tất cả' },
  { v: 'MOI', t: 'Mới' },
  { v: 'DANG_HOAN_THIEN', t: 'Đang hoàn thiện' },
  { v: 'COC_THANH_CONG', t: 'Cọc thành công' },
  { v: 'DA_HOAN_THIEN', t: 'Đã hoàn thiện' },
  { v: 'KIEM_TRA_LAI', t: 'Kiểm tra lại' },
  { v: 'FULL_NE', t: 'Full NE' },
  { v: 'GHI_DANH', t: 'Ghi danh' },
] as const

const TINH_TRANG_LABEL: Record<AccountantStatusTag, string> = {
  Mới: 'Mới',
  'Đang hoàn thiện': 'Đang hoàn thiện',
  Cọc: 'Cọc thành công',
  'Ghi danh': 'Ghi danh',
  'Hoàn thiện phí': 'Đã hoàn thiện',
  'Kiểm tra lại': 'Kiểm tra lại',
  'Full NE': 'Full NE',
}

export function leadTinhTrangTag(lead: Lead): AccountantStatusTag {
  return accountantFinanceStatusTag(lead)
}

export function leadTinhTrangLabel(lead: Lead): string {
  return TINH_TRANG_LABEL[leadTinhTrangTag(lead)]
}

export function leadTinhTrangClass(lead: Lead): string {
  return statusTagClass(leadTinhTrangTag(lead))
}

export function parseTinhTrangFromUrl(raw: string | null): string {
  const x = (raw ?? '').trim().toUpperCase()
  if (!x || x === 'ALL') return 'ALL'
  const ok = LEAD_TINH_TRANG_FILTER_OPTIONS.some((o) => o.v === x)
  return ok ? x : 'ALL'
}

export function leadMatchesTinhTrangFilter(lead: Lead, filter: string): boolean {
  if (!filter || filter === 'ALL') return true
  const tag = leadTinhTrangTag(lead)
  switch (filter) {
    case 'MOI':
      return tag === 'Mới'
    case 'DANG_HOAN_THIEN':
      return tag === 'Đang hoàn thiện'
    case 'COC_THANH_CONG':
      return tag === 'Cọc'
    case 'DA_HOAN_THIEN':
      return tag === 'Hoàn thiện phí'
    case 'KIEM_TRA_LAI':
      return tag === 'Kiểm tra lại'
    case 'FULL_NE':
      return tag === 'Full NE'
    case 'GHI_DANH':
      return tag === 'Ghi danh'
    default:
      return true
  }
}

/** Nhãn cột Nguồn: đợt nhập hoặc kênh nguồn. */
export function leadNguonDisplay(lead: Lead): string {
  const prog = (lead.intakeProgram ?? '').trim()
  if (prog) return prog
  const src = String(lead.source1 ?? lead.source ?? '').trim()
  return src
}

/** Lọc Nguồn = khớp đợt nhập hoặc kênh nguồn. */
export function leadMatchesNguonFilter(lead: Lead, value: string): boolean {
  if (!value || value === 'ALL') return true
  if (value === '__UNSET__') {
    return !leadNguonDisplay(lead)
  }
  if (intakeProgramsMatch(lead.intakeProgram, value)) return true
  const src = String(lead.source1 ?? lead.source ?? '').trim()
  return intakeProgramsMatch(src, value)
}

function isSparseLead(lead: Lead): boolean {
  const nameOk = (lead.fullName ?? '').trim().length >= 2
  const phoneOk = (lead.phone ?? '').replace(/\s+/g, '').length >= 9
  return !nameOk || !phoneOk
}

/**
 * Thứ tự danh sách cổng / Mẫu 3:
 * mới & đang xử lý → đã đóng phí (Full NE / hoàn thiện) → thiếu thông tin → cọc xong (cuối).
 * Trong mỗi nhóm: đăng ký mới nhất trước.
 */
export function leadPortalListSortRank(lead: Lead): number {
  const tag = leadTinhTrangTag(lead)
  if (tag === 'Mới' || tag === 'Đang hoàn thiện' || tag === 'Kiểm tra lại') {
    return isSparseLead(lead) ? 25 : 10
  }
  if (tag === 'Full NE' || tag === 'Hoàn thiện phí') return 20
  if (tag === 'Cọc') return 40
  if (tag === 'Ghi danh') return 45
  return 30
}

export function compareLeadsPortalListOrder(a: Lead, b: Lead): number {
  const ra = leadPortalListSortRank(a)
  const rb = leadPortalListSortRank(b)
  if (ra !== rb) return ra - rb
  const ta = leadUploadedAtMs(a)
  const tb = leadUploadedAtMs(b)
  if (tb !== ta) return tb - ta
  return (a.fullName || '').localeCompare(b.fullName || '', 'vi')
}
