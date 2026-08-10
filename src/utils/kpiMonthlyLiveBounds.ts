import { kpiDayKeyFromDate } from './kpiFromOmicallCalls'

const DEFAULT_LIVE_DAYS = 2

function subtractCalendarDays(dayKey: string, days: number): string {
  const [year, month, day] = dayKey.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day - days))
  return date.toISOString().slice(0, 10)
}

/** Giới hạn bù live vào vài ngày cuối của đúng tháng hiện tại. */
export function monthlyLiveMergeBounds(
  month: string,
  requestedDays = DEFAULT_LIVE_DAYS,
  now = new Date(),
): { from: string; to: string } {
  const today = kpiDayKeyFromDate(now)
  if (!/^\d{4}-\d{2}$/.test(month) || !today.startsWith(`${month}-`)) {
    return { from: '', to: '' }
  }

  const days =
    Number.isFinite(requestedDays) && requestedDays >= 1
      ? Math.max(1, Math.floor(requestedDays))
      : DEFAULT_LIVE_DAYS
  const monthStart = `${month}-01`
  const candidate = subtractCalendarDays(today, days - 1)
  return { from: candidate < monthStart ? monthStart : candidate, to: today }
}
