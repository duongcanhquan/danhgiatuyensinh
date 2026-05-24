import { useEffect, useMemo, useState } from 'react'
import { collection, getDocs } from 'firebase/firestore'
import type { CounselorDailyKpi } from '../types'
import { FS_COLLECTIONS } from '../types'
import { getFirestoreDb, isFirebaseConfigured } from '../services/firebase'
import { useAuth } from './useAuth'
import { foldKpiRows, mapKpiDoc, sumKpiSummaries } from '../utils/kpiMap'

function dateKeysBetween(from: string, to: string): string[] {
  const start = new Date(`${from}T00:00:00`)
  const end = new Date(`${to}T00:00:00`)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) return []
  const out: string[] = []
  const cur = new Date(start)
  while (cur <= end) {
    out.push(cur.toISOString().slice(0, 10))
    cur.setDate(cur.getDate() + 1)
  }
  return out
}

/** KPI daily gộp theo khoảng ngày tùy chọn (admin / team). */
export function useCounselorKpiDateRange(from: string, to: string, counselorUidFilter?: string) {
  const { firebaseUser, profile, can } = useAuth()
  const [rows, setRows] = useState<CounselorDailyKpi[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const dates = useMemo(() => dateKeysBetween(from, to), [from, to])
  const canGlobal = can('analytics:advanced') || can('leads:read:global')
  const canTeam = can('leads:read:team_scope')

  useEffect(() => {
    const db = getFirestoreDb()
    if (!db || !isFirebaseConfigured() || !firebaseUser || dates.length === 0) {
      setRows([])
      setLoading(false)
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
            const { getDoc, doc } = await import('firebase/firestore')
            const snap = await getDoc(doc(db, FS_COLLECTIONS.kpiDaily, date, 'counselors', firebaseUser.uid))
            if (snap.exists()) next.push(mapKpiDoc(snap.id, snap.data() as Record<string, unknown>))
            continue
          }
          const snap = await getDocs(collection(db, FS_COLLECTIONS.kpiDaily, date, 'counselors'))
          snap.forEach((d) => {
            const row = mapKpiDoc(d.id, d.data() as Record<string, unknown>)
            if (!canGlobal && canTeam && row.teamLeadUid !== profile?.id) return
            next.push(row)
          })
        }
        if (!cancelled) setRows(next)
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Không đọc KPI.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [canGlobal, canTeam, dates, firebaseUser, profile?.id])

  const summaries = useMemo(() => {
    const all = foldKpiRows(rows, '30d')
    if (!counselorUidFilter) return all
    return all.filter((s) => s.counselorUid === counselorUidFilter)
  }, [rows, counselorUidFilter])
  const totals = useMemo(() => sumKpiSummaries(summaries), [summaries])

  return { rows, summaries, totals, loading, error, dayCount: dates.length }
}
