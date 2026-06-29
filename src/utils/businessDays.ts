const VN_TZ = 'Asia/Ho_Chi_Minh'

function parseDayKey(day: string): { y: number; m: number; d: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day.trim())
  if (!m) return null
  return { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) }
}

function weekdayUtcFromDayKey(day: string): number {
  const p = parseDayKey(day)
  if (!p) return 0
  return new Date(Date.UTC(p.y, p.m - 1, p.d)).getUTCDay()
}

export function isWeekendDayKey(day: string): boolean {
  const wd = weekdayUtcFromDayKey(day)
  return wd === 0 || wd === 6
}

export function isBusinessHoliday(day: string, holidays: readonly string[]): boolean {
  return holidays.includes(day)
}

export function isBusinessDayKey(day: string, holidays: readonly string[] = []): boolean {
  if (isWeekendDayKey(day)) return false
  if (isBusinessHoliday(day, holidays)) return false
  return true
}

export function daysInMonthKey(monthKey: string): string[] {
  const m = /^(\d{4})-(\d{2})$/.exec(monthKey.trim())
  if (!m) return []
  const y = Number(m[1])
  const mo = Number(m[2])
  const last = new Date(y, mo, 0).getDate()
  const out: string[] = []
  for (let d = 1; d <= last; d++) {
    out.push(`${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`)
  }
  return out
}

export function countBusinessDaysInMonth(monthKey: string, holidays: readonly string[] = []): number {
  return daysInMonthKey(monthKey).filter((d) => isBusinessDayKey(d, holidays)).length
}

export function scaleDailyTargetToMonth(dailyTarget: number, monthKey: string, holidays: readonly string[] = []): number {
  const biz = countBusinessDaysInMonth(monthKey, holidays)
  return Math.round(dailyTarget * Math.max(1, biz))
}

export function todayDayKeyVn(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: VN_TZ })
}
