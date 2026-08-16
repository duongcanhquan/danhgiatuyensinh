import type { Lead } from '../types'
import {
  accountantFinanceStatusTag,
  statusTagClass,
  type AccountantStatusTag,
} from './accountantLeadDisplay'
import { intakeProgramsMatch } from './intakeProgramRecent'
import { leadUploadedAtMs } from './leadUploadedDateRange'

/** Giá trị lọc «Thu phí» trên danh sách Hồ sơ (kế toán — khác «Tình trạng» CRM). */
export const LEAD_TINH_TRANG_FILTER_OPTIONS: readonly { v: string; t: string }[] = [
  { v: 'ALL', t: 'Tất cả' },
  { v: 'MOI', t: 'Chưa thu phí' },
  { v: 'DANG_HOAN_THIEN', t: 'Đang hoàn thiện' },
  { v: 'COC_THANH_CONG', t: 'Cọc thành công' },
  { v: 'DA_HOAN_THIEN', t: 'Đã hoàn thiện' },
  { v: 'KIEM_TRA_LAI', t: 'Kiểm tra lại' },
  { v: 'CHO_FULL_NE', t: 'Chờ Full NE' },
  { v: 'FULL_NE', t: 'Full NE' },
  { v: 'GHI_DANH', t: 'Ghi danh' },
] as const

const TINH_TRANG_LABEL: Record<AccountantStatusTag, string> = {
  Mới: 'Chưa thu phí',
  'Đang hoàn thiện': 'Đang hoàn thiện',
  Cọc: 'Cọc thành công',
  'Ghi danh': 'Ghi danh',
  'Hoàn thiện phí': 'Đã hoàn thiện',
  'Kiểm tra lại': 'Kiểm tra lại',
  'Chờ Full NE': 'Chờ Full NE',
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
      // «Đã hoàn thiện» trên thanh Tổng = đã nộp xong / bàn giao (cọc · hoàn thiện phí · Full NE · ghi danh).
      return (
        tag === 'Hoàn thiện phí' ||
        tag === 'Cọc' ||
        tag === 'Full NE' ||
        tag === 'Ghi danh'
      )
    case 'KIEM_TRA_LAI':
      return tag === 'Kiểm tra lại'
    case 'CHO_FULL_NE':
      return tag === 'Chờ Full NE'
    case 'FULL_NE':
      return tag === 'Full NE'
    case 'GHI_DANH':
      return tag === 'Ghi danh'
    default:
      return true
  }
}

/** Lọc Thu phí cần nạp cả hồ sơ đã bàn giao (kể cả CRM ENROLLED). */
export function enrollmentFilterShowsHandoverLeads(filter: string): boolean {
  const f = String(filter || '').trim().toUpperCase()
  return (
    f === 'COC_THANH_CONG' ||
    f === 'DA_HOAN_THIEN' ||
    f === 'GHI_DANH' ||
    f === 'FULL_NE'
  )
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
  if (tag === 'Mới' || tag === 'Đang hoàn thiện' || tag === 'Kiểm tra lại' || tag === 'Chờ Full NE') {
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
