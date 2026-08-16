import type { Lead, LeadPaymentSlotKey } from '../types'
import { PAYMENT_SLOT_DEFS } from './leadFinance'
import { formatVnd } from './accountantN8nPayload'
import { resolveAccountantCounselorName } from './accountantLeadDisplay'
import { normalizePaymentApprovalStatus } from './paymentApprovalStatus'

const SLOT_ORDER: LeadPaymentSlotKey[] = PAYMENT_SLOT_DEFS.map((s) => s.key)

/** Instant tường lịch ICT (UTC+7). */
function ictWallMs(
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
  second = 0,
  ms = 0,
): number {
  const p = (n: number, w = 2) => String(n).padStart(w, '0')
  return Date.parse(
    `${year}-${p(month)}-${p(day)}T${p(hour)}:${p(minute)}:${p(second)}.${p(ms, 3)}+07:00`,
  )
}

function vnCalendarParts(d: Date): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(d)
  return {
    day: Number(parts.find((p) => p.type === 'day')?.value),
    month: Number(parts.find((p) => p.type === 'month')?.value),
    year: Number(parts.find((p) => p.type === 'year')?.value),
  }
}

export function parseFinanceCollectedTs(raw?: string): number {
  const s = String(raw ?? '')
    .trim()
    .replace(/^'/, '')
  if (!s) return 0
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    const [y, m, d] = s.slice(0, 10).split('-').map(Number)
    return ictWallMs(y, m, d)
  }
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/)
  if (m) return ictWallMs(Number(m[3]), Number(m[2]), Number(m[1]))
  return 0
}

export type AccountantDashboardRange = 'today' | 'month' | 'all'

export type AccountantDashboardFilters = {
  range: AccountantDashboardRange
  /** Ngành / nghề — khớp `majorInterest` (chuỗi đầy đủ). Rỗng = tất cả. */
  major: string
  /** Hệ đào tạo — khớp `educationLevel`. Rỗng = tất cả. */
  educationLevel: string
}

export type AccountantNamedTotal = {
  name: string
  amountVnd: number
  amountLabel: string
  studentCount: number
}

export type AccountantDayBucket = {
  label: string
  sortKey: string
  amountVnd: number
  amountLabel: string
  studentCount: number
}

export type AccountantDashboardStats = {
  periodLabel: string
  totalApprovedVnd: number
  totalApprovedLabel: string
  studentCount: number
  paymentCount: number
  byCounselor: AccountantNamedTotal[]
  byMajor: AccountantNamedTotal[]
  byEducation: AccountantNamedTotal[]
  byDay: AccountantDayBucket[]
  majorOptions: string[]
  educationOptions: string[]
}

function rangeBounds(
  range: AccountantDashboardRange,
  at: Date,
): { start: number; end: number; label: string } {
  const { year, month, day } = vnCalendarParts(at)
  if (range === 'today') {
    return {
      start: ictWallMs(year, month, day, 0, 0, 0, 0),
      end: ictWallMs(year, month, day, 23, 59, 59, 999),
      label: `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year}`,
    }
  }
  if (range === 'month') {
    const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate()
    return {
      start: ictWallMs(year, month, 1, 0, 0, 0, 0),
      end: ictWallMs(year, month, lastDay, 23, 59, 59, 999),
      label: `${String(month).padStart(2, '0')}/${year}`,
    }
  }
  return { start: 0, end: Number.MAX_SAFE_INTEGER, label: 'Toàn bộ dữ liệu đã tải' }
}

function dayLabelFromTs(ts: number): { label: string; sortKey: string } {
  const d = new Date(ts)
  const { year, month, day } = vnCalendarParts(d)
  return {
    label: `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}`,
    sortKey: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
  }
}

function counselorLabel(lead: Lead, directoryNames?: Map<string, string>): string {
  return resolveAccountantCounselorName(lead, { directoryNames })
}

type Agg = { amount: number; students: Set<string> }

function bump(map: Map<string, Agg>, key: string, leadId: string, amount: number) {
  const k = key.trim() || 'Khác'
  let row = map.get(k)
  if (!row) {
    row = { amount: 0, students: new Set() }
    map.set(k, row)
  }
  row.amount += amount
  row.students.add(leadId)
}

function toNamedTotals(map: Map<string, Agg>, limit = 12): AccountantNamedTotal[] {
  return [...map.entries()]
    .map(([name, v]) => ({
      name,
      amountVnd: v.amount,
      amountLabel: formatVnd(v.amount),
      studentCount: v.students.size,
    }))
    .sort((a, b) => b.amountVnd - a.amountVnd || b.studentCount - a.studentCount)
    .slice(0, limit)
}

function leadMatchesFilters(lead: Lead, filters: AccountantDashboardFilters): boolean {
  if (filters.major) {
    if (String(lead.majorInterest ?? '').trim() !== filters.major) return false
  }
  if (filters.educationLevel) {
    if (String(lead.educationLevel ?? '').trim() !== filters.educationLevel) return false
  }
  return true
}

/** Dashboard kế toán: tổng thu đã duyệt theo ngày/tháng, xếp TVV / ngành / hệ. */
export function buildAccountantDashboardStats(
  leads: readonly Lead[],
  filters: AccountantDashboardFilters,
  opts?: { at?: Date; directoryNames?: Map<string, string> },
): AccountantDashboardStats {
  const at = opts?.at ?? new Date()
  const { start, end, label } = rangeBounds(filters.range, at)

  const majorOpts = new Set<string>()
  const eduOpts = new Set<string>()

  for (const lead of leads) {
    const major = String(lead.majorInterest ?? '').trim()
    const edu = String(lead.educationLevel ?? '').trim()
    if (major) majorOpts.add(major)
    if (edu) eduOpts.add(edu)
  }

  const byCounselor = new Map<string, Agg>()
  const byMajor = new Map<string, Agg>()
  const byEducation = new Map<string, Agg>()
  const byDay = new Map<string, Agg & { label: string }>()
  const studentsInPeriod = new Set<string>()
  let totalApprovedVnd = 0
  let paymentCount = 0

  for (const lead of leads) {
    if (!leadMatchesFilters(lead, filters)) continue
    const pay = lead.finance?.payments ?? {}
    for (const key of SLOT_ORDER) {
      const line = pay[key]
      if (!line) continue
      const status = normalizePaymentApprovalStatus(line.approvalStatus)
      const amt = Number(line.amountVnd) || 0
      if (status !== 'ĐỒNG Ý' || amt <= 0) continue
      const ts = parseFinanceCollectedTs(line.collectedAt)
      if (!ts || ts < start || ts > end) continue

      totalApprovedVnd += amt
      paymentCount++
      studentsInPeriod.add(lead.id)

      bump(byCounselor, counselorLabel(lead, opts?.directoryNames), lead.id, amt)
      bump(byMajor, String(lead.majorInterest ?? '').trim() || 'Chưa chọn ngành', lead.id, amt)
      bump(byEducation, String(lead.educationLevel ?? '').trim() || 'Chưa chọn hệ', lead.id, amt)

      const day = dayLabelFromTs(ts)
      let dayRow = byDay.get(day.sortKey)
      if (!dayRow) {
        dayRow = { amount: 0, students: new Set(), label: day.label }
        byDay.set(day.sortKey, dayRow)
      }
      dayRow.amount += amt
      dayRow.students.add(lead.id)
    }
  }

  const dayBuckets: AccountantDayBucket[] = [...byDay.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([, v]) => ({
      label: v.label,
      sortKey: '',
      amountVnd: v.amount,
      amountLabel: formatVnd(v.amount),
      studentCount: v.students.size,
    }))
  // restore sortKey for stability
  const sortedKeys = [...byDay.keys()].sort()
  for (let i = 0; i < dayBuckets.length; i++) {
    dayBuckets[i]!.sortKey = sortedKeys[i]!
  }

  return {
    periodLabel: label,
    totalApprovedVnd,
    totalApprovedLabel: formatVnd(totalApprovedVnd),
    studentCount: studentsInPeriod.size,
    paymentCount,
    byCounselor: toNamedTotals(byCounselor),
    byMajor: toNamedTotals(byMajor),
    byEducation: toNamedTotals(byEducation),
    byDay: dayBuckets.slice(-14),
    majorOptions: [...majorOpts].sort((a, b) => a.localeCompare(b, 'vi')),
    educationOptions: [...eduOpts].sort((a, b) => a.localeCompare(b, 'vi')),
  }
}
