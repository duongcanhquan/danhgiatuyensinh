import type { Timestamp } from 'firebase/firestore'

type TsLike = Pick<Timestamp, 'toMillis'> | { toMillis: () => number }

export type LeadUploadedDateFields = {
  uploadedAt?: TsLike | null
  createdAt?: TsLike | null
}

/** Ưu tiên ngày tải lên hệ thống; không có thì ngày tạo. */
export function leadUploadedAtMs(lead: LeadUploadedDateFields): number {
  const ts = lead.uploadedAt ?? lead.createdAt
  if (ts && typeof ts.toMillis === 'function') return ts.toMillis()
  return 0
}

const YMD_RE = /^(\d{4})-(\d{2})-(\d{2})$/

/** 00:00:00.000 Asia/Ho_Chi_Minh (VN không DST → +07 cố định). */
export function vnCalendarDayStartMs(ymd: string): number | null {
  const s = ymd.trim()
  if (!YMD_RE.test(s)) return null
  const ms = Date.parse(`${s}T00:00:00+07:00`)
  return Number.isFinite(ms) ? ms : null
}

/** 23:59:59.999 cùng ngày VN. */
export function vnCalendarDayEndMs(ymd: string): number | null {
  const start = vnCalendarDayStartMs(ymd)
  if (start == null) return null
  return start + 24 * 60 * 60 * 1000 - 1
}

function normalizeRange(fromYmd: string, toYmd: string): { from: string; to: string } {
  let from = fromYmd.trim()
  let to = toYmd.trim()
  if (from && to && from > to) {
    const tmp = from
    from = to
    to = tmp
  }
  return { from, to }
}

/**
 * Khớp khoảng ngày tải lên (inclusive, giờ VN).
 * Không có from/to → luôn khớp. Có khoảng mà lead thiếu timestamp → không khớp.
 * Chuỗi ngày không phải YYYY-MM-DD hợp lệ → không khớp (tránh bỏ qua bound).
 */
export function leadMatchesUploadedDateRange(
  lead: LeadUploadedDateFields,
  fromYmd: string,
  toYmd: string,
): boolean {
  const { from, to } = normalizeRange(fromYmd, toYmd)
  if (!from && !to) return true
  if (from && vnCalendarDayStartMs(from) == null) return false
  if (to && vnCalendarDayEndMs(to) == null) return false
  const ms = leadUploadedAtMs(lead)
  if (!ms) return false
  if (from) {
    const start = vnCalendarDayStartMs(from)
    if (start != null && ms < start) return false
  }
  if (to) {
    const end = vnCalendarDayEndMs(to)
    if (end != null && ms > end) return false
  }
  return true
}

/** Chuẩn hóa input ngày từ UI/URL — chỉ giữ YYYY-MM-DD. */
export function sanitizeUploadedYmd(raw: string): string {
  const s = raw.trim()
  return vnCalendarDayStartMs(s) != null ? s : ''
}

export function formatUploadedDateRangeChip(fromYmd: string, toYmd: string): string {
  const { from, to } = normalizeRange(fromYmd, toYmd)
  const fmt = (ymd: string) => {
    const m = ymd.match(YMD_RE)
    if (!m) return ymd
    return `${m[3]}/${m[2]}/${m[1]}`
  }
  if (from && to) return from === to ? `Ngày tải: ${fmt(from)}` : `Ngày tải: ${fmt(from)} – ${fmt(to)}`
  if (from) return `Ngày tải: từ ${fmt(from)}`
  if (to) return `Ngày tải: đến ${fmt(to)}`
  return 'Ngày tải'
}
