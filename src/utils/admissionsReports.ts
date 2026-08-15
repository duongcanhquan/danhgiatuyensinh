/**
 * Báo cáo tuyển sinh kỳ — parity Dashboard.html `runReportEngine`.
 */
import type { Lead, LeadFinanceRecord, LeadPaymentSlotKey } from '../types'
import { PAYMENT_SLOT_DEFS } from './leadFinance'
import {
  activeFinanceDepositThresholds,
  type FinanceDepositThresholds,
  resolveDepositThresholdVnd,
  resolveLpxtMinVnd,
} from './financeThresholds'

const SLOT_KEYS: LeadPaymentSlotKey[] = PAYMENT_SLOT_DEFS.map((s) => s.key)

/** Keyword nguồn MKT (Dashboard tab MKT — chứa chuỗi này). */
export const ADMISSIONS_MKT_SOURCE_KEYWORDS = [
  'email marketing',
  'facebook',
  'tiktok',
  'google ads',
  'zalo',
  'seeding',
  'hotline',
  'ads',
  'mkt',
  'marketing',
] as const

export type AdmissionsReportLeadInput = {
  id: string
  fullName?: string
  educationLevel?: string
  majorInterest?: string
  source1?: string
  uploaderName?: string
  assignedTo?: string
  createdAtMs: number
  finance?: LeadFinanceRecord
}

export type AdmissionsPeriod = { startMs: number; endMs: number }

export type AdmissionsEvalBucket = 'fullNe' | 'coc' | 'lpxt' | 'dang' | 'moi'

export type AdmissionsReportRow = AdmissionsReportLeadInput & {
  moneyInPeriod: number
  bucket: AdmissionsEvalBucket
  isFullNeInPeriod: boolean
  isMkt: boolean
}

export type AdmissionsReport = {
  rows: AdmissionsReportRow[]
  overview: {
    total: number
    moi: number
    dang: number
    lpxt: number
    coc: number
    fullNe: number
    revenueBySystem: { label: string; amount: number; count: number }[]
  }
  tvvRanking: { name: string; neCount: number; lpxtCount: number; total: number }[]
  mktBySource: { source: string; total: number; neCount: number; lpxtCount: number }[]
  byMajor: {
    major: string
    total: number
    lpxt: number
    coc: number
    fullNe: number
    chua: number
  }[]
}

function str(v: unknown): string {
  return String(v ?? '').trim()
}

export function parseReportDateTs(raw?: string): number {
  const s = str(raw).replace(/^'/, '')
  if (!s) return 0
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    const [y, m, d] = s.slice(0, 10).split('-').map(Number)
    return new Date(y, m - 1, d).getTime()
  }
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/)
  if (m) return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1])).getTime()
  return 0
}

export function isMktSourceLabel(source: string): boolean {
  const t = source.trim().toLowerCase()
  if (!t) return false
  return ADMISSIONS_MKT_SOURCE_KEYWORDS.some((k) => t.includes(k))
}

function moneyApprovedInPeriod(finance: LeadFinanceRecord | undefined, period: AdmissionsPeriod): number {
  let sum = 0
  const pay = finance?.payments ?? {}
  for (const key of SLOT_KEYS) {
    const line = pay[key]
    if (!line) continue
    if (str(line.approvalStatus).toUpperCase() !== 'ĐỒNG Ý') continue
    const amt = line.amountVnd ?? 0
    if (amt <= 0) continue
    const ts = parseReportDateTs(line.approvedAt || line.collectedAt)
    if (ts >= period.startMs && ts <= period.endMs) sum += amt
  }
  return sum
}

function hasFullNeInPeriod(finance: LeadFinanceRecord | undefined, period: AdmissionsPeriod): boolean {
  if (str(finance?.fullNeStatus) !== 'ĐÃ FULL NE') return false
  const ts = parseReportDateTs(finance?.fullNeAt)
  return ts >= period.startMs && ts <= period.endMs
}

function leadTouchesPeriod(lead: AdmissionsReportLeadInput, period: AdmissionsPeriod): boolean {
  if (lead.createdAtMs >= period.startMs && lead.createdAtMs <= period.endMs) return true
  if (moneyApprovedInPeriod(lead.finance, period) > 0) return true
  if (hasFullNeInPeriod(lead.finance, period)) return true
  return false
}

function depositThreshold(
  educationLevel: string,
  thresholds: FinanceDepositThresholds = activeFinanceDepositThresholds(),
): number {
  return resolveDepositThresholdVnd(educationLevel, thresholds)
}

function is9Plus(educationLevel: string): boolean {
  return String(educationLevel).toUpperCase().includes('9+')
}

/**
 * Đánh giá độc quyền trên bản clone kỳ (chỉ tiền/Full NE trong kỳ — như Dashboard).
 * Thứ tự: fullNE → cọc → lpxt → đang → mới.
 */
export function evaluatePeriodBucket(
  educationLevel: string,
  moneyInPeriod: number,
  isFullNeInPeriod: boolean,
  thresholds: FinanceDepositThresholds = activeFinanceDepositThresholds(),
): AdmissionsEvalBucket {
  if (isFullNeInPeriod) return 'fullNe'
  const threshold = depositThreshold(educationLevel, thresholds)
  if (moneyInPeriod >= threshold) return 'coc'
  if (!is9Plus(educationLevel) && moneyInPeriod >= resolveLpxtMinVnd(thresholds)) return 'lpxt'
  if (moneyInPeriod > 0) return 'dang'
  return 'moi'
}

function systemGroupLabel(educationLevel: string): string {
  const sys = String(educationLevel || '').toUpperCase()
  if (sys.includes('DU HỌC') || sys.includes('NGẮN HẠN') || sys.includes('SBS')) return 'Ngắn hạn & Du học'
  if (sys.includes('TRUNG CẤP') || sys.includes('SƠ CẤP')) return 'Trung cấp / Sơ cấp'
  return 'Cao đẳng / 9+'
}

export function leadToAdmissionsInput(lead: Lead): AdmissionsReportLeadInput {
  const createdAt = lead.createdAt as { toMillis?: () => number } | undefined
  const uploadedAt = lead.uploadedAt as { toMillis?: () => number } | undefined
  return {
    id: lead.id,
    fullName: lead.fullName,
    educationLevel: lead.educationLevel,
    majorInterest: lead.majorInterest,
    source1: lead.source1,
    uploaderName: lead.uploaderName,
    assignedTo: lead.assignedTo ?? undefined,
    createdAtMs: createdAt?.toMillis?.() ?? uploadedAt?.toMillis?.() ?? 0,
    finance: lead.finance,
  }
}

export function buildAdmissionsReport(
  leads: AdmissionsReportLeadInput[],
  period: AdmissionsPeriod,
  filters?: { tvvNames?: string[] },
): AdmissionsReport {
  const tvvFilter = filters?.tvvNames?.map((n) => n.trim()).filter(Boolean)
  const tvvSet = tvvFilter?.length ? new Set(tvvFilter.map((n) => n.toLowerCase())) : null

  const rows: AdmissionsReportRow[] = []
  for (const lead of leads) {
    if (!leadTouchesPeriod(lead, period)) continue
    const tvvName = str(lead.uploaderName || lead.assignedTo || 'Khác')
    if (tvvSet && !tvvSet.has(tvvName.toLowerCase())) continue

    const moneyInPeriod = moneyApprovedInPeriod(lead.finance, period)
    const isFullNeInPeriod = hasFullNeInPeriod(lead.finance, period)
    const bucket = evaluatePeriodBucket(lead.educationLevel ?? '', moneyInPeriod, isFullNeInPeriod)

    rows.push({
      ...lead,
      moneyInPeriod,
      bucket,
      isFullNeInPeriod,
      isMkt: isMktSourceLabel(lead.source1 ?? ''),
    })
  }

  const overview = {
    total: rows.length,
    moi: 0,
    dang: 0,
    lpxt: 0,
    coc: 0,
    fullNe: 0,
    revenueBySystem: [] as { label: string; amount: number; count: number }[],
  }
  const revMap = new Map<string, { amount: number; count: number }>()
  for (const r of rows) {
    overview[r.bucket]++
    if (r.moneyInPeriod > 0) {
      const label = systemGroupLabel(r.educationLevel ?? '')
      const cur = revMap.get(label) ?? { amount: 0, count: 0 }
      cur.amount += r.moneyInPeriod
      cur.count++
      revMap.set(label, cur)
    }
  }
  overview.revenueBySystem = [...revMap.entries()].map(([label, v]) => ({ label, ...v }))

  const tvvMap = new Map<string, { neCount: number; lpxtCount: number; total: number }>()
  for (const r of rows) {
    const name = str(r.uploaderName || r.assignedTo || 'Khác')
    const cur = tvvMap.get(name) ?? { neCount: 0, lpxtCount: 0, total: 0 }
    cur.total++
    if (r.bucket === 'coc' || r.bucket === 'fullNe') cur.neCount++
    if (r.bucket === 'lpxt') cur.lpxtCount++
    tvvMap.set(name, cur)
  }
  const tvvRanking = [...tvvMap.entries()]
    .map(([name, v]) => ({ name, ...v }))
    .sort((a, b) => b.neCount - a.neCount || b.total - a.total || a.name.localeCompare(b.name, 'vi'))

  const mktMap = new Map<string, { total: number; neCount: number; lpxtCount: number }>()
  for (const r of rows) {
    if (!r.isMkt) continue
    const source = str(r.source1) || 'Khác'
    const cur = mktMap.get(source) ?? { total: 0, neCount: 0, lpxtCount: 0 }
    cur.total++
    if (r.bucket === 'coc' || r.bucket === 'fullNe') cur.neCount++
    if (r.bucket === 'lpxt') cur.lpxtCount++
    mktMap.set(source, cur)
  }
  const mktBySource = [...mktMap.entries()]
    .map(([source, v]) => ({ source, ...v }))
    .sort((a, b) => b.neCount - a.neCount || b.total - a.total)

  const majorMap = new Map<
    string,
    { total: number; lpxt: number; coc: number; fullNe: number; chua: number }
  >()
  for (const r of rows) {
    const major = str(r.majorInterest) || 'Chưa chọn ngành'
    const cur = majorMap.get(major) ?? { total: 0, lpxt: 0, coc: 0, fullNe: 0, chua: 0 }
    cur.total++
    if (r.bucket === 'fullNe') cur.fullNe++
    else if (r.bucket === 'coc') cur.coc++
    else if (r.bucket === 'lpxt') cur.lpxt++
    else cur.chua++
    majorMap.set(major, cur)
  }
  const byMajor = [...majorMap.entries()]
    .map(([major, v]) => ({ major, ...v }))
    .sort((a, b) => b.total - a.total || a.major.localeCompare(b.major, 'vi'))

  return { rows, overview, tvvRanking, mktBySource, byMajor }
}

/** Kỳ mặc định: đầu tháng ICT → cuối ngày hôm nay. */
export function defaultAdmissionsPeriod(now = new Date()): AdmissionsPeriod {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now)
  const day = Number(parts.find((p) => p.type === 'day')?.value)
  const month = Number(parts.find((p) => p.type === 'month')?.value)
  const year = Number(parts.find((p) => p.type === 'year')?.value)
  return {
    startMs: new Date(year, month - 1, 1, 0, 0, 0, 0).getTime(),
    endMs: new Date(year, month - 1, day, 23, 59, 59, 999).getTime(),
  }
}

export function periodFromDateInputs(startIso: string, endIso: string): AdmissionsPeriod | null {
  const s = startIso.trim()
  const e = endIso.trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || !/^\d{4}-\d{2}-\d{2}$/.test(e)) return null
  const [ys, ms, ds] = s.split('-').map(Number)
  const [ye, me, de] = e.split('-').map(Number)
  const startMs = new Date(ys, ms - 1, ds, 0, 0, 0, 0).getTime()
  const endMs = new Date(ye, me - 1, de, 23, 59, 59, 999).getTime()
  if (endMs < startMs) return null
  return { startMs, endMs }
}
