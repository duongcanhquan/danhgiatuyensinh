/** Định dạng hiển thị KPI — dùng chung Command Center, KPI view, My Day. */

export function fmtKpiNum(n: number): string {
  return n.toLocaleString('vi-VN')
}

export function fmtKpiMinutes(seconds: number): string {
  const minutes = Math.round(seconds / 60)
  return `${minutes.toLocaleString('vi-VN')} phút`
}

export function fmtKpiVnd(amount: number): string {
  if (!amount) return '0 đ'
  return `${amount.toLocaleString('vi-VN')} đ`
}

export function fmtKpiPct(n: number, d: number): string {
  if (!d) return '0%'
  return `${Math.round((n / d) * 100)}%`
}

export function todayDateKey(d = new Date()): string {
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' })
}

/** Cộng/trừ ngày lịch theo khóa YYYY-MM-DD (không lệch timezone). */
export function shiftVnDateKey(dateKey: string, days: number): string {
  const [y, m, d] = dateKey.split('-').map(Number)
  if (!y || !m || !d) return dateKey
  const utc = new Date(Date.UTC(y, m - 1, d))
  utc.setUTCDate(utc.getUTCDate() + days)
  const yy = utc.getUTCFullYear()
  const mm = String(utc.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(utc.getUTCDate()).padStart(2, '0')
  return `${yy}-${mm}-${dd}`
}

/** Khoảng mặc định N ngày gần nhất (giờ VN), gồm hôm nay. */
export function defaultVnDateRange(daysBack = 6): { from: string; to: string } {
  const to = todayDateKey()
  return { from: shiftVnDateKey(to, -Math.max(0, daysBack)), to }
}
