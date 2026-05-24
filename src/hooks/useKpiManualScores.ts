import { useCallback, useEffect, useState } from 'react'
import { collection, doc, getDocs, setDoc, Timestamp } from 'firebase/firestore'
import type { KpiManualScoreRecord } from '../types'
import { FS_COLLECTIONS } from '../types'
import { getFirestoreDb, isFirebaseConfigured } from '../services/firebase'
import { useAuth } from './useAuth'

function mapManual(id: string, month: string, data: Record<string, unknown>): KpiManualScoreRecord {
  return {
    counselorUid: id,
    month,
    complianceScore: Math.max(0, Math.min(100, Math.round(Number(data.complianceScore ?? 0)))),
    note: data.note ? String(data.note) : undefined,
    updatedBy: data.updatedBy ? String(data.updatedBy) : undefined,
    updatedAt: data.updatedAt as KpiManualScoreRecord['updatedAt'],
  }
}

export function useKpiManualScores(month: string) {
  const { firebaseUser } = useAuth()
  const [scores, setScores] = useState<Map<string, KpiManualScoreRecord>>(new Map())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const db = getFirestoreDb()
    if (!db || !isFirebaseConfigured() || !month) {
      setScores(new Map())
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    ;(async () => {
      try {
        const snap = await getDocs(collection(db, FS_COLLECTIONS.kpiManualScores, month, 'counselors'))
        const m = new Map<string, KpiManualScoreRecord>()
        snap.forEach((d) => m.set(d.id, mapManual(d.id, month, d.data() as Record<string, unknown>)))
        if (!cancelled) setScores(m)
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Không đọc điểm tuân thủ.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [month])

  const saveComplianceScore = useCallback(
    async (counselorUid: string, complianceScore: number, note?: string) => {
      const db = getFirestoreDb()
      if (!db || !month || !firebaseUser) return
      const ref = doc(db, FS_COLLECTIONS.kpiManualScores, month, 'counselors', counselorUid)
      const payload = {
        complianceScore: Math.max(0, Math.min(100, Math.round(complianceScore))),
        note: note?.trim() || null,
        updatedBy: firebaseUser.uid,
        updatedAt: Timestamp.now(),
      }
      await setDoc(ref, payload, { merge: true })
      setScores((prev) =>
        new Map(prev).set(counselorUid, {
          counselorUid,
          month,
          complianceScore: payload.complianceScore,
          note: note?.trim() || undefined,
          updatedBy: firebaseUser.uid,
          updatedAt: payload.updatedAt,
        }),
      )
    },
    [month, firebaseUser],
  )

  return { scores, loading, error, saveComplianceScore }
}
