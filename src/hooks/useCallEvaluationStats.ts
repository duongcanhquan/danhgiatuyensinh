import { useEffect, useMemo, useState } from 'react'
import {
  collectionGroup,
  getDocs,
  limit,
  query,
  Timestamp,
  where,
} from 'firebase/firestore'
import { FS_COLLECTIONS } from '../types'
import { getFirestoreDb, isFirebaseConfigured } from '../services/firebase'
import {
  aggregateCallEvaluations,
  evaluationRowsFromInteractionDocs,
  type CallEvaluationAggregates,
} from '../utils/callSessionEvaluationAnalytics'

export type UseCallEvaluationStatsOpts = {
  /** Số ngày lùi (mặc định 90). */
  days?: number
  /** Chỉ đánh giá của TVV này; null = mọi người. */
  authorUid?: string | null
  enabled?: boolean
}

export function useCallEvaluationStats({
  days = 90,
  authorUid = null,
  enabled = true,
}: UseCallEvaluationStatsOpts = {}) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [rows, setRows] = useState<ReturnType<typeof evaluationRowsFromInteractionDocs>>([])

  const fromTs = useMemo(() => {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    d.setDate(d.getDate() - Math.max(1, days - 1))
    return Timestamp.fromDate(d)
  }, [days])

  useEffect(() => {
    if (!enabled) {
      setRows([])
      setLoading(false)
      setError(null)
      return
    }
    const db = getFirestoreDb()
    if (!db || !isFirebaseConfigured()) {
      setRows([])
      setLoading(false)
      setError('Chưa cấu hình Firebase.')
      return
    }

    let cancelled = false
    setLoading(true)
    setError(null)

    ;(async () => {
      try {
        const fetchLimit = 2500
        const q = query(
          collectionGroup(db, FS_COLLECTIONS.interactions),
          where('timestamp', '>=', fromTs),
          limit(fetchLimit),
        )
        const snap = await getDocs(q)
        const docs: { id: string; leadId: string; data: Record<string, unknown> }[] = []
        snap.forEach((d) => {
          const data = d.data() as Record<string, unknown>
          if (!data.callSessionEvaluation) return
          if (authorUid && String(data.authorUid ?? '') !== authorUid) return
          const leadId = String(data.leadId ?? d.ref.parent.parent?.id ?? '')
          if (!leadId) return
          docs.push({ id: d.id, leadId, data })
        })
        const parsed = evaluationRowsFromInteractionDocs(docs)
        parsed.sort((a, b) => b.evaluatedAtMs - a.evaluatedAtMs)
        if (!cancelled) setRows(parsed)
      } catch (e) {
        console.error(e)
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Không tải được thống kê đánh giá gọi.')
          setRows([])
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [enabled, fromTs, authorUid])

  const aggregates: CallEvaluationAggregates = useMemo(
    () => aggregateCallEvaluations(rows),
    [rows],
  )

  return { loading, error, aggregates, rows }
}
