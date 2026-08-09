import type { CounselorMonthlyKpi } from '../types'
import type { CounselorKpiSummary } from './kpiMap'
import { numKpi } from './kpiMap'

/** Chỉ số có thể bù từ kỳ (kpiDaily + omicall) — lấy max. */
const FILL_MAX_FIELDS = [
  'totalCalls',
  'validCalls',
  'connectedCalls',
  'talkSeconds',
  'validTalkSeconds',
  'uniqueLeadsCalled',
  'crmActions',
  'notesAdded',
  'depositPaidCount',
  'tuitionPaidCount',
  'approvedRevenueVnd',
  'fullNeCount',
  'warmNew',
  'hotNew',
  'newToInterested',
  'toDeposit',
  'toEnrolled',
  'leadCham',
  'lpxtCount',
] as const satisfies readonly (keyof CounselorMonthlyKpi)[]

function emptyMonthly(month: string, counselorUid: string, teamLeadUid?: string | null): CounselorMonthlyKpi {
  return {
    id: counselorUid,
    month,
    counselorUid,
    teamLeadUid: teamLeadUid ?? undefined,
    bonusTier: 'none',
    totalCalls: 0,
    validCalls: 0,
    connectedCalls: 0,
    talkSeconds: 0,
    validTalkSeconds: 0,
    uniqueLeadsCalled: 0,
    crmActions: 0,
    depositPaidCount: 0,
    tuitionPaidCount: 0,
    approvedRevenueVnd: 0,
    fullNeCount: 0,
    warmNew: 0,
    hotNew: 0,
    newToInterested: 0,
    toDeposit: 0,
    toEnrolled: 0,
    notesAdded: 0,
    leadCham: 0,
    lpxtCount: 0,
  }
}

function fromPeriodSummary(month: string, s: CounselorKpiSummary): CounselorMonthlyKpi {
  return {
    ...emptyMonthly(month, s.counselorUid, s.teamLeadUid),
    totalCalls: s.totalCalls,
    validCalls: s.validCalls,
    connectedCalls: s.connectedCalls,
    talkSeconds: s.talkSeconds,
    validTalkSeconds: s.validTalkSeconds,
    uniqueLeadsCalled: s.uniqueLeadsCalled,
    crmActions: s.crmActions,
    notesAdded: s.notesAdded,
    depositPaidCount: s.depositPaidCount,
    tuitionPaidCount: s.tuitionPaidCount,
    approvedRevenueVnd: s.approvedRevenueVnd,
    fullNeCount: s.fullNeCount,
    warmNew: s.warmNew,
    hotNew: s.hotNew,
    newToInterested: s.newToInterested,
    toDeposit: s.toDeposit,
    toEnrolled: s.toEnrolled,
    leadCham: s.leadCham,
    lpxtCount: s.lpxtCount,
  }
}

/**
 * Bù KPI tháng bằng số liệu kỳ (kpiDaily + omicall live): lấy max từng chỉ số
 * để «đã gọi hôm nay» hiện ngay khi rollup kpiMonthly chưa chạy.
 */
export function mergeMonthlyKpiWithPeriodSummaries(
  month: string,
  monthly: CounselorMonthlyKpi[],
  period: CounselorKpiSummary[],
): CounselorMonthlyKpi[] {
  const byUid = new Map<string, CounselorMonthlyKpi>()
  for (const row of monthly) {
    byUid.set(row.counselorUid, { ...row })
  }

  for (const s of period) {
    const uid = s.counselorUid
    if (!uid) continue
    const live = fromPeriodSummary(month, s)
    const official = byUid.get(uid)
    if (!official) {
      byUid.set(uid, live)
      continue
    }
    const merged = { ...official }
    for (const f of FILL_MAX_FIELDS) {
      const a = numKpi(official[f])
      const b = numKpi(live[f])
      if (b > a) (merged[f] as number) = b
    }
    if (!merged.teamLeadUid && live.teamLeadUid) merged.teamLeadUid = live.teamLeadUid
    byUid.set(uid, merged)
  }

  return [...byUid.values()]
}
