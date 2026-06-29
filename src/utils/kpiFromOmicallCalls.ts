import type { CounselorDailyKpi } from '../types'
import type { OmicallCallRecord } from '../types'
import { emptyKpiSummary, type CounselorKpiSummary } from './kpiMap'
import { tsMsCall } from './omicallCallMap'

/** Ngày KPI theo giờ Việt Nam (khớp kpiDaily trên Functions). */
export function kpiDayKeyFromMs(ms: number): string {
  return new Date(ms).toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' })
}

export function kpiDayKeyFromDate(d: Date): string {
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' })
}

/** Khoảng thời gian theo ngày KPI (giờ Việt Nam) — dùng cho truy vấn Firestore. */
export function vnDayRangeFromKeys(from: string, to: string): { from: Date; to: Date } {
  return {
    from: new Date(`${from}T00:00:00+07:00`),
    to: new Date(`${to}T23:59:59.999+07:00`),
  }
}

export function daysInMonthKey(monthKey: string): number {
  const [y, m] = monthKey.split('-').map(Number)
  if (!y || !m) return 30
  return new Date(y, m, 0).getDate()
}

/** HL trên client — khớp logic server (≥ minBillSeconds + có lead + TVV). */
export function evaluateClientValidCall(params: {
  billSeconds: number
  leadId?: string
  counselorUid?: string
  minBillSeconds?: number
}): { isValidCall: boolean; invalidReason?: string } {
  const min = params.minBillSeconds ?? 45
  if (!params.counselorUid?.trim()) return { isValidCall: false, invalidReason: 'missing_counselor' }
  if (!params.leadId?.trim()) return { isValidCall: false, invalidReason: 'missing_lead' }
  if (params.billSeconds < min) return { isValidCall: false, invalidReason: 'short_call' }
  return { isValidCall: true }
}

function dayKeyForCall(c: OmicallCallRecord): string {
  const ms = tsMsCall(c.endedAt ?? c.startedAt ?? c.createdAt)
  return ms > 0 ? kpiDayKeyFromMs(ms) : kpiDayKeyFromDate(new Date())
}

/** Gộp omicallCalls → hàng KPI theo TVV (khi kpiDaily chưa có hoặc thiếu). */
export function foldOmicallCallsToKpiSummaries(
  calls: OmicallCallRecord[],
  dates: string[],
): CounselorKpiSummary[] {
  const dateSet = new Set(dates)
  const m = new Map<string, CounselorKpiSummary>()
  const uniqueByUid = new Map<string, Set<string>>()
  const activeDaysByUid = new Map<string, Set<string>>()

  for (const c of calls) {
    const day = dayKeyForCall(c)
    if (dates.length > 0 && !dateSet.has(day)) continue
    const uid = c.counselorUid
    if (!uid) continue

    const s = m.get(uid) ?? emptyKpiSummary(uid)
    if (c.teamLeadUid) s.teamLeadUid = c.teamLeadUid

    s.totalCalls += 1
    if (c.direction === 'outbound') s.outboundCalls += 1
    if (c.direction === 'inbound') s.inboundCalls += 1
    if (c.outcome === 'CONNECTED') s.connectedCalls += 1
    else s.missedCalls += 1
    const talk = c.billSeconds || c.answerSeconds || 0
    s.talkSeconds += talk
    if (c.isValidCall) {
      s.validCalls += 1
      s.validTalkSeconds += talk
      if (c.leadId) {
        const set = uniqueByUid.get(uid) ?? new Set<string>()
        set.add(c.leadId)
        uniqueByUid.set(uid, set)
      }
    }
    if (c.recordingFileUrl) s.recordings += 1

    const daySet = activeDaysByUid.get(uid) ?? new Set<string>()
    daySet.add(day)
    activeDaysByUid.set(uid, daySet)
    m.set(uid, s)
  }

  for (const [uid, s] of m) {
    s.uniqueLeadsCalled = uniqueByUid.get(uid)?.size ?? 0
    s.activeDays = activeDaysByUid.get(uid)?.size ?? (s.totalCalls > 0 ? 1 : 0)
  }

  return [...m.values()].sort((a, b) => b.validCalls - a.validCalls || b.totalCalls - a.totalCalls)
}

const CALL_KPI_FIELDS: (keyof CounselorKpiSummary)[] = [
  'totalCalls',
  'validCalls',
  'uniqueLeadsCalled',
  'outboundCalls',
  'inboundCalls',
  'connectedCalls',
  'missedCalls',
  'talkSeconds',
  'validTalkSeconds',
  'ringSeconds',
  'recordings',
]

/** Bù số cuộc gọi từ omicallCalls khi kpiDaily chưa kịp đồng bộ — lấy max từng chỉ số. */
export function mergeCallKpiFromOmicall(
  kpiSummaries: CounselorKpiSummary[],
  fromCalls: CounselorKpiSummary[],
): CounselorKpiSummary[] {
  if (!fromCalls.length) return kpiSummaries

  const callByUid = new Map(fromCalls.map((s) => [s.counselorUid, s]))
  const kpiByUid = new Map(kpiSummaries.map((s) => [s.counselorUid, s]))
  const allUids = new Set([...callByUid.keys(), ...kpiByUid.keys()])

  const out: CounselorKpiSummary[] = []
  for (const uid of allUids) {
    const kpi = kpiByUid.get(uid)
    const calls = callByUid.get(uid)
    if (!calls) {
      if (kpi) out.push(kpi)
      continue
    }
    if (!kpi) {
      out.push(calls)
      continue
    }
    const merged = { ...kpi }
    let bumped = false
    for (const f of CALL_KPI_FIELDS) {
      const live = calls[f] as number
      const official = kpi[f] as number
      if (live > official) {
        ;(merged[f] as number) = live
        bumped = true
      }
    }
    const metadataChanged =
      (!merged.teamLeadUid && Boolean(calls.teamLeadUid)) || calls.activeDays > merged.activeDays
    if (!merged.teamLeadUid && calls.teamLeadUid) merged.teamLeadUid = calls.teamLeadUid
    if (calls.activeDays > merged.activeDays) merged.activeDays = calls.activeDays
    out.push(bumped || metadataChanged || kpi.totalCalls === 0 ? merged : kpi)
  }

  return out.sort((a, b) => b.validCalls - a.validCalls || b.totalCalls - a.totalCalls)
}

export function dailyRowsFromOmicallCalls(
  calls: OmicallCallRecord[],
  dates: string[],
): CounselorDailyKpi[] {
  const dateSet = new Set(dates)
  const rows: CounselorDailyKpi[] = []
  const keyCount = new Map<string, CounselorDailyKpi>()
  const uniqueLeadsByKey = new Map<string, Set<string>>()

  for (const c of calls) {
    const day = dayKeyForCall(c)
    if (dates.length > 0 && !dateSet.has(day)) continue
    const uid = c.counselorUid
    if (!uid) continue
    const key = `${day}_${uid}`
    let row = keyCount.get(key)
    if (!row) {
      row = {
        id: uid,
        date: day,
        counselorUid: uid,
        teamLeadUid: c.teamLeadUid,
        totalCalls: 0,
        outboundCalls: 0,
        inboundCalls: 0,
        connectedCalls: 0,
        missedCalls: 0,
        talkSeconds: 0,
        ringSeconds: 0,
        recordings: 0,
        crmActions: 0,
        notesAdded: 0,
        statusChanges: 0,
        reassignments: 0,
        aiRuns: 0,
        depositPaidCount: 0,
        tuitionPaidCount: 0,
        paidCount: 0,
        depositRevenueVnd: 0,
        tuitionRevenueVnd: 0,
        approvedRevenueVnd: 0,
        fullNeCount: 0,
        validCalls: 0,
        validTalkSeconds: 0,
        uniqueLeadsCalled: 0,
        warmNew: 0,
        hotNew: 0,
        newToInterested: 0,
        toDeposit: 0,
        toEnrolled: 0,
      }
      keyCount.set(key, row)
      rows.push(row)
    }
    row.totalCalls += 1
    if (c.direction === 'outbound') row.outboundCalls += 1
    if (c.direction === 'inbound') row.inboundCalls += 1
    if (c.outcome === 'CONNECTED') row.connectedCalls += 1
    else row.missedCalls += 1
    const talk = c.billSeconds || c.answerSeconds || 0
    row.talkSeconds += talk
    if (c.isValidCall) {
      row.validCalls = (row.validCalls ?? 0) + 1
      row.validTalkSeconds = (row.validTalkSeconds ?? 0) + talk
      if (c.leadId) {
        const leadSet = uniqueLeadsByKey.get(key) ?? new Set<string>()
        leadSet.add(c.leadId)
        uniqueLeadsByKey.set(key, leadSet)
      }
    }
    if (c.recordingFileUrl) row.recordings += 1
  }

  for (const row of rows) {
    const key = `${row.date}_${row.counselorUid}`
    row.uniqueLeadsCalled = uniqueLeadsByKey.get(key)?.size ?? 0
  }

  return rows
}
