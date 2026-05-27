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
    }
    if (c.recordingFileUrl) s.recordings += 1

    if (s.totalCalls > 0) s.activeDays = Math.max(s.activeDays, 1)
    m.set(uid, s)
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

/** Cộng số cuộc gọi từ omicallCalls vào summary kpiDaily khi kpiDaily = 0 nhưng đã có log gọi. */
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
    if (kpi.totalCalls === 0 && calls.totalCalls > 0) {
      const merged = { ...kpi }
      for (const f of CALL_KPI_FIELDS) {
        ;(merged[f] as number) = calls[f] as number
      }
      if (!merged.teamLeadUid && calls.teamLeadUid) merged.teamLeadUid = calls.teamLeadUid
      if (calls.activeDays > 0) merged.activeDays = calls.activeDays
      out.push(merged)
      continue
    }
    out.push(kpi)
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
    }
    if (c.recordingFileUrl) row.recordings += 1
  }

  return rows
}
