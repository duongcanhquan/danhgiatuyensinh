import { useEffect, useMemo, useState } from 'react'
import { collection, doc, getDoc, getDocs } from 'firebase/firestore'
import type { CounselorMonthlyKpi } from '../types'
import { FS_COLLECTIONS } from '../types'
import { getFirestoreDb, isFirebaseConfigured } from '../services/firebase'
import { useAuth } from './useAuth'
import { useCounselorDirectory } from './useCounselorDirectory'
import { numKpi } from '../utils/kpiMap'
import { enrichTeamLeadUidOnRows, counselorInTeamLeadScope } from '../utils/kpiTeamLeadEnrich'
import { mergeMonthlyKpiWithPeriodSummaries } from '../utils/kpiMonthlyMerge'
import { useCounselorKpiDateRange } from './useCounselorKpiDateRange'
import { kpiDayKeyFromDate } from '../utils/kpiFromOmicallCalls'

function mapMonthly(id: string, data: Record<string, unknown>): CounselorMonthlyKpi {
  return {
    id,
    month: String(data.month ?? ''),
    counselorUid: String(data.counselorUid ?? id),
    teamLeadUid: data.teamLeadUid ? String(data.teamLeadUid) : undefined,
    rankInScope: numKpi(data.rankInScope),
    bonusTier: (data.bonusTier as CounselorMonthlyKpi['bonusTier']) ?? 'none',
    totalCalls: numKpi(data.totalCalls),
    validCalls: numKpi(data.validCalls),
    connectedCalls: numKpi(data.connectedCalls),
    talkSeconds: numKpi(data.talkSeconds),
    validTalkSeconds: numKpi(data.validTalkSeconds),
    uniqueLeadsCalled: numKpi(data.uniqueLeadsCalled),
    crmActions: numKpi(data.crmActions),
    depositPaidCount: numKpi(data.depositPaidCount),
    tuitionPaidCount: numKpi(data.tuitionPaidCount),
    approvedRevenueVnd: numKpi(data.approvedRevenueVnd),
    fullNeCount: numKpi(data.fullNeCount),
    warmNew: numKpi(data.warmNew),
    hotNew: numKpi(data.hotNew),
    newToInterested: numKpi(data.newToInterested),
    toDeposit: numKpi(data.toDeposit),
    toEnrolled: numKpi(data.toEnrolled),
    notesAdded: numKpi(data.notesAdded),
    leadCham: numKpi(data.leadCham),
    lpxtCount: numKpi(data.lpxtCount),
    updatedAt: data.updatedAt as CounselorMonthlyKpi['updatedAt'],
  }
}

export function currentMonthKey(d = new Date()): string {
  return kpiDayKeyFromDate(d).slice(0, 7)
}

function monthDateBounds(month: string): { from: string; to: string } {
  const [y, m] = month.split('-').map(Number)
  if (!y || !m) {
    const today = kpiDayKeyFromDate(new Date())
    return { from: today, to: today }
  }
  const last = new Date(y, m, 0).getDate()
  const from = `${month}-01`
  const monthEnd = `${month}-${String(last).padStart(2, '0')}`
  const today = kpiDayKeyFromDate(new Date())
  const to = today.startsWith(month) && today < monthEnd ? today : monthEnd
  return { from, to }
}

export function useCounselorMonthlyKpi(month: string, options?: { mergeLiveCalls?: boolean }) {
  const mergeLiveCalls = options?.mergeLiveCalls !== false
  const { firebaseUser, profile, can } = useAuth()
  const { users: directory } = useCounselorDirectory()
  const [officialRows, setOfficialRows] = useState<CounselorMonthlyKpi[]>([])
  const [loadingOfficial, setLoadingOfficial] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const canGlobal = can('analytics:advanced') || can('leads:read:global')
  const canTeam = can('leads:read:team_scope') || can('dashboard:team_lead')
  const { from, to } = useMemo(
    () => (mergeLiveCalls ? monthDateBounds(month) : { from: '', to: '' }),
    [month, mergeLiveCalls],
  )
  const {
    summaries: periodSummaries,
    loading: periodLoading,
    error: periodError,
  } = useCounselorKpiDateRange(from, to)

  useEffect(() => {
    const db = getFirestoreDb()
    if (!db || !isFirebaseConfigured() || !firebaseUser || !month) {
      setOfficialRows([])
      setLoadingOfficial(false)
      return
    }
    let cancelled = false
    setLoadingOfficial(true)
    setError(null)
    ;(async () => {
      try {
        if (!canGlobal && !canTeam) {
          const snap = await getDoc(
            doc(db, FS_COLLECTIONS.kpiMonthly, month, 'counselors', firebaseUser.uid),
          )
          const next = snap.exists()
            ? [mapMonthly(snap.id, snap.data() as Record<string, unknown>)]
            : []
          if (!cancelled) setOfficialRows(next)
          return
        }
        const snap = await getDocs(collection(db, FS_COLLECTIONS.kpiMonthly, month, 'counselors'))
        const next: CounselorMonthlyKpi[] = []
        snap.forEach((d) => {
          next.push(mapMonthly(d.id, d.data() as Record<string, unknown>))
        })
        if (!cancelled) setOfficialRows(next)
      } catch (e) {
        if (!cancelled) {
          const raw = e instanceof Error ? e.message : ''
          const denied =
            /permission|insufficient/i.test(raw) ||
            (typeof e === 'object' &&
              e !== null &&
              'code' in e &&
              String((e as { code?: string }).code) === 'permission-denied')
          setError(
            denied
              ? 'Chưa mở quyền đọc KPI tháng trên hệ thống. Báo quản trị deploy lại Firestore rules (kpiMonthly).'
              : raw || 'Không đọc KPI tháng.',
          )
        }
      } finally {
        if (!cancelled) setLoadingOfficial(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [canGlobal, canTeam, firebaseUser, month])

  const rows = useMemo(() => {
    const merged = mergeMonthlyKpiWithPeriodSummaries(month, officialRows, periodSummaries)
    const enriched = enrichTeamLeadUidOnRows(merged, directory)
    const scoped = enriched.filter((row) => {
      if (canGlobal) return true
      if (!canTeam || !profile) return row.counselorUid === firebaseUser?.uid
      return counselorInTeamLeadScope(row.counselorUid, profile, directory, row.teamLeadUid)
    })
    return scoped.sort((a, b) => (a.rankInScope ?? 999) - (b.rankInScope ?? 999))
  }, [month, officialRows, periodSummaries, directory, canGlobal, canTeam, profile, firebaseUser?.uid])

  return {
    rows,
    loading: loadingOfficial || periodLoading,
    error: error || periodError,
  }
}
