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
