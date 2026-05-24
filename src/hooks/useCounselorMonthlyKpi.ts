import { useEffect, useMemo, useState } from 'react'
import { collection, doc, getDoc, getDocs } from 'firebase/firestore'
import type { CounselorMonthlyKpi } from '../types'
import { FS_COLLECTIONS } from '../types'
import { getFirestoreDb, isFirebaseConfigured } from '../services/firebase'
import { useAuth } from './useAuth'
import { numKpi } from '../utils/kpiMap'

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
    updatedAt: data.updatedAt as CounselorMonthlyKpi['updatedAt'],
  }
}

export function currentMonthKey(d = new Date()): string {
  return d.toISOString().slice(0, 7)
}

export function useCounselorMonthlyKpi(month: string) {
  const { firebaseUser, profile, can } = useAuth()
  const [rows, setRows] = useState<CounselorMonthlyKpi[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const canGlobal = can('analytics:advanced') || can('leads:read:global')
  const canTeam = can('leads:read:team_scope')

  useEffect(() => {
    const db = getFirestoreDb()
    if (!db || !isFirebaseConfigured() || !firebaseUser || !month) {
      setRows([])
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    ;(async () => {
      try {
        if (!canGlobal && !canTeam) {
          const snap = await getDoc(
            doc(db, FS_COLLECTIONS.kpiMonthly, month, 'counselors', firebaseUser.uid),
          )
          setRows(snap.exists() ? [mapMonthly(snap.id, snap.data() as Record<string, unknown>)] : [])
          return
        }
        const snap = await getDocs(collection(db, FS_COLLECTIONS.kpiMonthly, month, 'counselors'))
        const next: CounselorMonthlyKpi[] = []
        snap.forEach((d) => {
          const row = mapMonthly(d.id, d.data() as Record<string, unknown>)
          if (!canGlobal && canTeam && row.teamLeadUid !== profile?.id) return
          next.push(row)
        })
        if (!cancelled) setRows(next.sort((a, b) => (a.rankInScope ?? 99) - (b.rankInScope ?? 99)))
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Không đọc KPI tháng.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [canGlobal, canTeam, firebaseUser, month, profile?.id])

  const ranked = useMemo(
    () => [...rows].sort((a, b) => (a.rankInScope ?? 999) - (b.rankInScope ?? 999)),
    [rows],
  )

  return { rows: ranked, loading, error }
}
