import { todayDateKey } from './kpiDisplay'

export type TeamRosterMemberInput = {
  counselorUid: string
  displayName: string
}

export type TeamRosterLeadInput = {
  id: string
  assigneeUid: string | null
  callWorkBucket?: 'uncalled' | 'callback' | 'called' | null
  lastCallDispositionId?: string | null
  lastCallAtMs?: number | null
}

export type TeamRosterCallEvent = {
  leadId: string
  atMs: number
}

export type TeamRosterSummaryRow = {
  counselorUid: string
  displayName: string
  totalLeads: number
  calledLeads: number
  successLeads: number
  unsuccessfulLeads: number
  calledInDay: number
  calledInWeek: number
  calledInMonth: number
  callRateDay: number
  callRateWeek: number
  callRateMonth: number
}

const HOT_DISPOSITION = 'college_hot'
const VN_TZ = 'Asia/Ho_Chi_Minh'

function dateKeyFromMs(ms: number): string {
  return new Date(ms).toLocaleDateString('en-CA', { timeZone: VN_TZ })
}

/** Trừ `days` lịch (theo khóa ngày VN), trả về khóa YYYY-MM-DD. */
function shiftDateKey(dateKey: string, days: number): string {
  const [y, m, d] = dateKey.split('-').map(Number)
  const utc = new Date(Date.UTC(y!, m! - 1, d!))
  utc.setUTCDate(utc.getUTCDate() + days)
  const yy = utc.getUTCFullYear()
  const mm = String(utc.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(utc.getUTCDate()).padStart(2, '0')
  return `${yy}-${mm}-${dd}`
}

function monthStartKey(dateKey: string): string {
  return `${dateKey.slice(0, 7)}-01`
}

function rate(n: number, d: number): number {
  if (d <= 0) return 0
  return n / d
}

function isCalledLead(lead: TeamRosterLeadInput): boolean {
  if (lead.callWorkBucket === 'callback' || lead.callWorkBucket === 'called') return true
  if (lead.callWorkBucket === 'uncalled') return false
  if (lead.lastCallDispositionId?.trim()) return true
  return Boolean(lead.lastCallAtMs)
}

function buildLeadCallDateKeys(
  heldLeadIds: Set<string>,
  leadsById: Map<string, TeamRosterLeadInput>,
  callEvents: readonly TeamRosterCallEvent[],
): Map<string, Set<string>> {
  const byLead = new Map<string, Set<string>>()
  const touch = (leadId: string, key: string) => {
    if (!heldLeadIds.has(leadId)) return
    let set = byLead.get(leadId)
    if (!set) {
      set = new Set()
      byLead.set(leadId, set)
    }
    set.add(key)
  }

  for (const ev of callEvents) {
    if (!ev.atMs) continue
    touch(ev.leadId, dateKeyFromMs(ev.atMs))
  }

  for (const leadId of heldLeadIds) {
    const lead = leadsById.get(leadId)
    const ms = lead?.lastCallAtMs
    if (!ms) continue
    touch(leadId, dateKeyFromMs(ms))
  }

  return byLead
}

function countLeadsCalledInRange(
  heldLeadIds: Iterable<string>,
  callDatesByLead: Map<string, Set<string>>,
  fromKey: string,
  toKey: string,
): number {
  let n = 0
  for (const leadId of heldLeadIds) {
    const keys = callDatesByLead.get(leadId)
    if (!keys) continue
    for (const k of keys) {
      if (k >= fromKey && k <= toKey) {
        n += 1
        break
      }
    }
  }
  return n
}

/**
 * Tổng hợp bảng «Nhóm của tôi»: lead đang giữ, đã gọi, HOT / không HOT, tỷ lệ gọi kỳ.
 */
export function buildTeamRosterSummary(input: {
  members: readonly TeamRosterMemberInput[]
  leads: readonly TeamRosterLeadInput[]
  callEvents: readonly TeamRosterCallEvent[]
  now?: Date
}): TeamRosterSummaryRow[] {
  const now = input.now ?? new Date()
  const todayKey = todayDateKey(now)
  const weekFromKey = shiftDateKey(todayKey, -6)
  const monthFromKey = monthStartKey(todayKey)

  const leadsByAssignee = new Map<string, TeamRosterLeadInput[]>()
  const leadsById = new Map<string, TeamRosterLeadInput>()
  for (const lead of input.leads) {
    leadsById.set(lead.id, lead)
    const uid = lead.assigneeUid?.trim()
    if (!uid) continue
    const list = leadsByAssignee.get(uid)
    if (list) list.push(lead)
    else leadsByAssignee.set(uid, [lead])
  }

  return input.members.map((member) => {
    const held = leadsByAssignee.get(member.counselorUid) ?? []
    const heldIds = new Set(held.map((l) => l.id))
    const callDatesByLead = buildLeadCallDateKeys(heldIds, leadsById, input.callEvents)

    let calledLeads = 0
    let successLeads = 0
    let unsuccessfulLeads = 0
    for (const lead of held) {
      if (isCalledLead(lead)) calledLeads += 1
      const disp = lead.lastCallDispositionId?.trim()
      if (!disp) continue
      if (disp === HOT_DISPOSITION) successLeads += 1
      else unsuccessfulLeads += 1
    }

    const totalLeads = held.length
    const calledInDay = countLeadsCalledInRange(heldIds, callDatesByLead, todayKey, todayKey)
    const calledInWeek = countLeadsCalledInRange(heldIds, callDatesByLead, weekFromKey, todayKey)
    const calledInMonth = countLeadsCalledInRange(heldIds, callDatesByLead, monthFromKey, todayKey)

    return {
      counselorUid: member.counselorUid,
      displayName: member.displayName,
      totalLeads,
      calledLeads,
      successLeads,
      unsuccessfulLeads,
      calledInDay,
      calledInWeek,
      calledInMonth,
      callRateDay: rate(calledInDay, totalLeads),
      callRateWeek: rate(calledInWeek, totalLeads),
      callRateMonth: rate(calledInMonth, totalLeads),
    }
  })
}

export function sumTeamRosterRows(rows: readonly TeamRosterSummaryRow[]): Omit<
  TeamRosterSummaryRow,
  'counselorUid' | 'displayName'
> {
  const totalLeads = rows.reduce((s, r) => s + r.totalLeads, 0)
  const calledInDay = rows.reduce((s, r) => s + r.calledInDay, 0)
  const calledInWeek = rows.reduce((s, r) => s + r.calledInWeek, 0)
  const calledInMonth = rows.reduce((s, r) => s + r.calledInMonth, 0)
  return {
    totalLeads,
    calledLeads: rows.reduce((s, r) => s + r.calledLeads, 0),
    successLeads: rows.reduce((s, r) => s + r.successLeads, 0),
    unsuccessfulLeads: rows.reduce((s, r) => s + r.unsuccessfulLeads, 0),
    calledInDay,
    calledInWeek,
    calledInMonth,
    callRateDay: rate(calledInDay, totalLeads),
    callRateWeek: rate(calledInWeek, totalLeads),
    callRateMonth: rate(calledInMonth, totalLeads),
  }
}
