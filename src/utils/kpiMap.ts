import type { CounselorDailyKpi } from '../types'

export function numKpi(v: unknown): number {
  const n = Number(v ?? 0)
  return Number.isFinite(n) ? n : 0
}

export function mapKpiDoc(id: string, data: Record<string, unknown>): CounselorDailyKpi {
  return {
    id,
    date: String(data.date ?? ''),
    counselorUid: data.counselorUid ? String(data.counselorUid) : undefined,
    teamLeadUid: data.teamLeadUid ? String(data.teamLeadUid) : undefined,
    totalCalls: numKpi(data.totalCalls),
    outboundCalls: numKpi(data.outboundCalls),
    inboundCalls: numKpi(data.inboundCalls),
    connectedCalls: numKpi(data.connectedCalls),
    missedCalls: numKpi(data.missedCalls),
    talkSeconds: numKpi(data.talkSeconds),
    ringSeconds: numKpi(data.ringSeconds),
    recordings: numKpi(data.recordings),
    crmActions: numKpi(data.crmActions),
    notesAdded: numKpi(data.notesAdded),
    statusChanges: numKpi(data.statusChanges),
    reassignments: numKpi(data.reassignments),
    aiRuns: numKpi(data.aiRuns),
    depositPaidCount: numKpi(data.depositPaidCount),
    tuitionPaidCount: numKpi(data.tuitionPaidCount),
    paidCount: numKpi(data.paidCount),
    depositRevenueVnd: numKpi(data.depositRevenueVnd),
    tuitionRevenueVnd: numKpi(data.tuitionRevenueVnd),
    approvedRevenueVnd: numKpi(data.approvedRevenueVnd),
    fullNeCount: numKpi(data.fullNeCount),
    validCalls: numKpi(data.validCalls),
    validTalkSeconds: numKpi(data.validTalkSeconds),
    leadCham: numKpi(data.leadCham),
    lpxtCount: numKpi(data.lpxtCount),
    uniqueLeadsCalled: numKpi(data.uniqueLeadsCalled),
    warmNew: numKpi(data.warmNew),
    hotNew: numKpi(data.hotNew),
    newToInterested: numKpi(data.newToInterested),
    toDeposit: numKpi(data.toDeposit),
    toEnrolled: numKpi(data.toEnrolled),
    updatedAt: data.updatedAt as CounselorDailyKpi['updatedAt'],
  }
}

export type CounselorKpiSummary = {
  counselorUid: string
  teamLeadUid?: string | null
  totalCalls: number
  validCalls: number
  leadCham: number
  lpxtCount: number
  uniqueLeadsCalled: number
  outboundCalls: number
  inboundCalls: number
  connectedCalls: number
  missedCalls: number
  talkSeconds: number
  validTalkSeconds: number
  ringSeconds: number
  recordings: number
  crmActions: number
  notesAdded: number
  statusChanges: number
  reassignments: number
  aiRuns: number
  depositPaidCount: number
  tuitionPaidCount: number
  paidCount: number
  depositRevenueVnd: number
  tuitionRevenueVnd: number
  approvedRevenueVnd: number
  fullNeCount: number
  warmNew: number
  hotNew: number
  newToInterested: number
  toDeposit: number
  toEnrolled: number
  activeDays: number
}

export function emptyKpiSummary(counselorUid: string): CounselorKpiSummary {
  return {
    counselorUid,
    totalCalls: 0,
    validCalls: 0,
    leadCham: 0,
    lpxtCount: 0,
    uniqueLeadsCalled: 0,
    outboundCalls: 0,
    inboundCalls: 0,
    connectedCalls: 0,
    missedCalls: 0,
    talkSeconds: 0,
    validTalkSeconds: 0,
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
    warmNew: 0,
    hotNew: 0,
    newToInterested: 0,
    toDeposit: 0,
    toEnrolled: 0,
    activeDays: 0,
  }
}

const SUM_FIELDS: (keyof CounselorKpiSummary)[] = [
  'totalCalls',
  'validCalls',
  'leadCham',
  'lpxtCount',
  'uniqueLeadsCalled',
  'outboundCalls',
  'inboundCalls',
  'connectedCalls',
  'missedCalls',
  'talkSeconds',
  'validTalkSeconds',
  'ringSeconds',
  'recordings',
  'crmActions',
  'notesAdded',
  'statusChanges',
  'reassignments',
  'aiRuns',
  'depositPaidCount',
  'tuitionPaidCount',
  'paidCount',
  'depositRevenueVnd',
  'tuitionRevenueVnd',
  'approvedRevenueVnd',
  'fullNeCount',
  'warmNew',
  'hotNew',
  'newToInterested',
  'toDeposit',
  'toEnrolled',
]

export function foldKpiRows(
  rows: CounselorDailyKpi[],
  range: 'today' | '7d' | '30d',
): CounselorKpiSummary[] {
  const m = new Map<string, CounselorKpiSummary>()
  for (const r of rows) {
    const uid = r.counselorUid || r.id
    const s = m.get(uid) ?? emptyKpiSummary(uid)
    if (r.teamLeadUid) s.teamLeadUid = r.teamLeadUid
    for (const f of SUM_FIELDS) {
      const v = r[f as keyof CounselorDailyKpi]
      if (typeof v === 'number') (s[f] as number) += v
    }
    if (range !== 'today' && r.totalCalls > 0) s.activeDays += 1
    m.set(uid, s)
  }
  return [...m.values()].sort((a, b) => b.validCalls - a.validCalls || b.totalCalls - a.totalCalls)
}

export function sumKpiSummaries(summaries: CounselorKpiSummary[]): Omit<CounselorKpiSummary, 'counselorUid' | 'activeDays'> {
  const acc = emptyKpiSummary('_')
  for (const r of summaries) {
    for (const f of SUM_FIELDS) {
      ;(acc[f] as number) += r[f] as number
    }
  }
  return acc
}
