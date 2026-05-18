import { useEffect, useMemo, useState } from 'react'
import { collection, doc, getDoc, getDocs } from 'firebase/firestore'
import type { CounselorDailyKpi } from '../types'
import { FS_COLLECTIONS } from '../types'
import { getFirestoreDb, isFirebaseConfigured } from '../services/firebase'
import { useAuth } from './useAuth'

export type KpiRangePreset = '7d' | '30d'

function dateKey(d: Date): string {
  return d.toISOString().slice(0, 10)
}

export function kpiDateKeys(preset: KpiRangePreset): string[] {
  const days = preset === '30d' ? 30 : 7
  const out: string[] = []
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    d.setDate(d.getDate() - i)
    out.push(dateKey(d))
  }
  return out
}

function num(v: unknown): number {
  const n = Number(v ?? 0)
  return Number.isFinite(n) ? n : 0
}

function mapKpi(id: string, data: Record<string, unknown>): CounselorDailyKpi {
  return {
    id,
    date: String(data.date ?? ''),
    counselorUid: data.counselorUid ? String(data.counselorUid) : undefined,
    teamLeadUid: data.teamLeadUid ? String(data.teamLeadUid) : undefined,
    totalCalls: num(data.totalCalls),
    outboundCalls: num(data.outboundCalls),
    inboundCalls: num(data.inboundCalls),
    connectedCalls: num(data.connectedCalls),
    missedCalls: num(data.missedCalls),
    talkSeconds: num(data.talkSeconds),
    ringSeconds: num(data.ringSeconds),
    recordings: num(data.recordings),
    crmActions: num(data.crmActions),
    notesAdded: num(data.notesAdded),
    statusChanges: num(data.statusChanges),
    reassignments: num(data.reassignments),
    aiRuns: num(data.aiRuns),
    depositPaidCount: num(data.depositPaidCount),
    tuitionPaidCount: num(data.tuitionPaidCount),
    paidCount: num(data.paidCount),
    depositRevenueVnd: num(data.depositRevenueVnd),
    tuitionRevenueVnd: num(data.tuitionRevenueVnd),
    approvedRevenueVnd: num(data.approvedRevenueVnd),
    fullNeCount: num(data.fullNeCount),
    updatedAt: data.updatedAt as CounselorDailyKpi['updatedAt'],
  }
}

export type CounselorKpiSummary = {
  counselorUid: string
  totalCalls: number
  outboundCalls: number
  inboundCalls: number
  connectedCalls: number
  missedCalls: number
  talkSeconds: number
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
  activeDays: number
}

function emptySummary(counselorUid: string): CounselorKpiSummary {
  return {
    counselorUid,
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
    activeDays: 0,
  }
}

export function useCounselorKpi(range: KpiRangePreset) {
  const { firebaseUser, profile, can } = useAuth()
  const [rows, setRows] = useState<CounselorDailyKpi[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const dates = useMemo(() => kpiDateKeys(range), [range])
  const canGlobal = can('analytics:advanced') || can('leads:read:global')
  const canTeam = can('leads:read:team_scope')

  useEffect(() => {
    const db = getFirestoreDb()
    if (!db || !isFirebaseConfigured() || !firebaseUser) {
      setRows([])
      setLoading(false)
      setError(null)
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)
    ;(async () => {
      try {
        const next: CounselorDailyKpi[] = []
        for (const date of dates) {
          if (!canGlobal && !canTeam) {
            const snap = await getDoc(
              doc(db, FS_COLLECTIONS.kpiDaily, date, 'counselors', firebaseUser.uid),
            )
            if (snap.exists()) next.push(mapKpi(snap.id, snap.data() as Record<string, unknown>))
            continue
          }
          const snap = await getDocs(collection(db, FS_COLLECTIONS.kpiDaily, date, 'counselors'))
          snap.forEach((d) => {
            const row = mapKpi(d.id, d.data() as Record<string, unknown>)
            if (!canGlobal && canTeam && row.teamLeadUid !== profile?.id) return
            next.push(row)
          })
        }
        if (!cancelled) setRows(next)
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Không đọc được KPI OMICall.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [canGlobal, canTeam, dates, firebaseUser, profile?.id])

  const summaries = useMemo(() => {
    const m = new Map<string, CounselorKpiSummary>()
    for (const r of rows) {
      const uid = r.counselorUid || r.id
      const s = m.get(uid) ?? emptySummary(uid)
      s.totalCalls += r.totalCalls
      s.outboundCalls += r.outboundCalls
      s.inboundCalls += r.inboundCalls
      s.connectedCalls += r.connectedCalls
      s.missedCalls += r.missedCalls
      s.talkSeconds += r.talkSeconds
      s.ringSeconds += r.ringSeconds
      s.recordings += r.recordings
      s.crmActions += r.crmActions ?? 0
      s.notesAdded += r.notesAdded ?? 0
      s.statusChanges += r.statusChanges ?? 0
      s.reassignments += r.reassignments ?? 0
      s.aiRuns += r.aiRuns ?? 0
      s.depositPaidCount += r.depositPaidCount ?? 0
      s.tuitionPaidCount += r.tuitionPaidCount ?? 0
      s.paidCount += r.paidCount ?? 0
      s.depositRevenueVnd += r.depositRevenueVnd ?? 0
      s.tuitionRevenueVnd += r.tuitionRevenueVnd ?? 0
      s.approvedRevenueVnd += r.approvedRevenueVnd ?? 0
      s.fullNeCount += r.fullNeCount ?? 0
      if (r.totalCalls > 0) s.activeDays += 1
      m.set(uid, s)
    }
    return [...m.values()].sort((a, b) => b.totalCalls - a.totalCalls)
  }, [rows])

  const totals = useMemo(() => {
    return summaries.reduce(
      (acc, r) => {
        acc.totalCalls += r.totalCalls
        acc.connectedCalls += r.connectedCalls
        acc.missedCalls += r.missedCalls
        acc.talkSeconds += r.talkSeconds
        acc.recordings += r.recordings
        acc.crmActions += r.crmActions
        acc.depositPaidCount += r.depositPaidCount
        acc.tuitionPaidCount += r.tuitionPaidCount
        acc.paidCount += r.paidCount
        acc.approvedRevenueVnd += r.approvedRevenueVnd
        acc.fullNeCount += r.fullNeCount
        return acc
      },
      {
        totalCalls: 0,
        connectedCalls: 0,
        missedCalls: 0,
        talkSeconds: 0,
        recordings: 0,
        crmActions: 0,
        depositPaidCount: 0,
        tuitionPaidCount: 0,
        paidCount: 0,
        approvedRevenueVnd: 0,
        fullNeCount: 0,
      },
    )
  }, [summaries])

  return { dates, rows, summaries, totals, loading, error }
}
