/**
 * Tổng kết vận hành theo người + thời gian + tình trạng CRM (cọc / nhập học…).
 */
import type { Lead, LeadCounselorStatus } from '../types'
import { leadAssignedUid } from '../auth/leadAccess'
import { leadUploadedAtMs } from './leadUploadedDateRange'

const VN_TZ = 'Asia/Ho_Chi_Minh'

export type OpsDatePreset = 'today' | 'week' | 'month' | 'custom'

export type OpsMonitorMember = {
  counselorUid: string
  displayName: string
}

export type OpsStatusCounts = {
  total: number
  /** Chưa cọc / chưa nhập học — còn cần xử lý */
  open: number
  deposit: number
  enrolled: number
  hot: number
  warm: number
}

export type OpsPersonRow = OpsStatusCounts & {
  counselorUid: string
  displayName: string
}

export type OpsSourceRow = {
  source: string
  total: number
  deposit: number
  enrolled: number
}

function dateKeyFromMs(ms: number): string {
  return new Date(ms).toLocaleDateString('en-CA', { timeZone: VN_TZ })
}

export function todayOpsDateKey(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: VN_TZ })
}

export function shiftOpsDateKey(dateKey: string, days: number): string {
  const [y, m, d] = dateKey.split('-').map(Number)
  const utc = new Date(Date.UTC(y!, m! - 1, d!))
  utc.setUTCDate(utc.getUTCDate() + days)
  const yy = utc.getUTCFullYear()
  const mm = String(utc.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(utc.getUTCDate()).padStart(2, '0')
  return `${yy}-${mm}-${dd}`
}

export function monthStartOpsKey(dateKey: string): string {
  return `${dateKey.slice(0, 7)}-01`
}

export function resolveOpsDateRange(
  preset: OpsDatePreset,
  customFrom?: string,
  customTo?: string,
): { fromKey: string; toKey: string } {
  const today = todayOpsDateKey()
  if (preset === 'today') return { fromKey: today, toKey: today }
  if (preset === 'week') return { fromKey: shiftOpsDateKey(today, -6), toKey: today }
  if (preset === 'month') return { fromKey: monthStartOpsKey(today), toKey: today }
  const from = (customFrom || today).trim() || today
  const to = (customTo || today).trim() || today
  return from <= to ? { fromKey: from, toKey: to } : { fromKey: to, toKey: from }
}

/** Ngày tải lên (ưu tiên) — khớp bộ lọc ngày trên Hồ sơ. */
function leadOpsDateKey(lead: Lead): string | null {
  const ms = leadUploadedAtMs(lead)
  if (!ms) return null
  return dateKeyFromMs(ms)
}

export function leadInOpsDateRange(lead: Lead, fromKey: string, toKey: string): boolean {
  const key = leadOpsDateKey(lead)
  if (!key) return false
  return key >= fromKey && key <= toKey
}

function emptyCounts(): OpsStatusCounts {
  return { total: 0, open: 0, deposit: 0, enrolled: 0, hot: 0, warm: 0 }
}

function bump(counts: OpsStatusCounts, lead: Lead): void {
  counts.total += 1
  const crm = lead.status as LeadCounselorStatus | undefined
  if (crm === 'ENROLLED') counts.enrolled += 1
  else if (crm === 'DEPOSIT_PAID') counts.deposit += 1
  else counts.open += 1
  const tag = lead.priorityTag
  if (tag === 'HOT' || tag === 'HOT+') counts.hot += 1
  if (tag === 'WARM' || tag === 'WARM+') counts.warm += 1
}

function leadSourceLabel(lead: Lead): string {
  return String(lead.source1 || lead.source || '').trim() || 'Khác'
}

export function sumOpsStatusCounts(rows: OpsStatusCounts[]): OpsStatusCounts {
  return rows.reduce(
    (acc, r) => ({
      total: acc.total + r.total,
      open: acc.open + r.open,
      deposit: acc.deposit + r.deposit,
      enrolled: acc.enrolled + r.enrolled,
      hot: acc.hot + r.hot,
      warm: acc.warm + r.warm,
    }),
    emptyCounts(),
  )
}

function leadPassesOpsFilters(
  lead: Lead,
  opts: {
    memberSet: Set<string>
    counselorUidFilter?: string | null
    sourceFilter?: string | null
    crmFilter?: LeadCounselorStatus | 'open' | null
  },
): boolean {
  const uid = leadAssignedUid(lead)
  if (!uid || !opts.memberSet.has(uid)) return false
  if (opts.counselorUidFilter && uid !== opts.counselorUidFilter) return false
  if (opts.sourceFilter) {
    if (leadSourceLabel(lead).toLowerCase() !== opts.sourceFilter.trim().toLowerCase()) return false
  }
  if (opts.crmFilter) {
    const crm = lead.status as LeadCounselorStatus | undefined
    if (opts.crmFilter === 'open') {
      if (crm === 'DEPOSIT_PAID' || crm === 'ENROLLED') return false
    } else if (crm !== opts.crmFilter) {
      return false
    }
  }
  return true
}

/**
 * Gom hồ sơ theo TVV trong khoảng ngày tải lên / tạo (khớp Hồ sơ).
 */
export function buildOpsPersonRows(input: {
  members: OpsMonitorMember[]
  leads: Lead[]
  fromKey: string
  toKey: string
  counselorUidFilter?: string | null
  sourceFilter?: string | null
  crmFilter?: LeadCounselorStatus | 'open' | null
}): OpsPersonRow[] {
  const memberSet = new Set(input.members.map((m) => m.counselorUid))
  const byUid = new Map<string, OpsStatusCounts>()
  for (const m of input.members) {
    byUid.set(m.counselorUid, emptyCounts())
  }

  const filterUid = input.counselorUidFilter?.trim() || null

  for (const lead of input.leads) {
    if (!leadInOpsDateRange(lead, input.fromKey, input.toKey)) continue
    if (
      !leadPassesOpsFilters(lead, {
        memberSet,
        counselorUidFilter: filterUid,
        sourceFilter: input.sourceFilter,
        crmFilter: input.crmFilter,
      })
    ) {
      continue
    }
    const uid = leadAssignedUid(lead)!
    const bucket = byUid.get(uid)
    if (!bucket) continue
    bump(bucket, lead)
  }

  return input.members
    .map((m) => ({
      counselorUid: m.counselorUid,
      displayName: m.displayName,
      ...(byUid.get(m.counselorUid) ?? emptyCounts()),
    }))
    .filter((r) => !filterUid || r.counselorUid === filterUid)
    .sort((a, b) => b.total - a.total || a.displayName.localeCompare(b.displayName, 'vi'))
}

export function buildOpsSourceRows(input: {
  members: OpsMonitorMember[]
  leads: Lead[]
  fromKey: string
  toKey: string
  counselorUidFilter?: string | null
  sourceFilter?: string | null
  crmFilter?: LeadCounselorStatus | 'open' | null
}): OpsSourceRow[] {
  const memberSet = new Set(input.members.map((m) => m.counselorUid))
  const map = new Map<string, OpsSourceRow>()
  for (const lead of input.leads) {
    if (!leadInOpsDateRange(lead, input.fromKey, input.toKey)) continue
    if (
      !leadPassesOpsFilters(lead, {
        memberSet,
        counselorUidFilter: input.counselorUidFilter,
        sourceFilter: input.sourceFilter,
        crmFilter: input.crmFilter,
      })
    ) {
      continue
    }
    const source = leadSourceLabel(lead)
    const cur = map.get(source) ?? { source, total: 0, deposit: 0, enrolled: 0 }
    cur.total += 1
    if (lead.status === 'ENROLLED') cur.enrolled += 1
    else if (lead.status === 'DEPOSIT_PAID') cur.deposit += 1
    map.set(source, cur)
  }
  return [...map.values()].sort((a, b) => b.total - a.total || a.source.localeCompare(b.source, 'vi'))
}
