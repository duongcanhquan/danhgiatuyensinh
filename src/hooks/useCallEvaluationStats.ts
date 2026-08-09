import { useEffect, useMemo, useState } from 'react'
import {
  collectionGroup,
  getDocs,
  limit,
  query,
  Timestamp,
  where,
  type QueryConstraint,
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
  /** Chỉ đánh giá của TVV này; null = mọi người (trần đọc thấp hơn). */
  authorUid?: string | null
  enabled?: boolean
}

/** Trần đọc collectionGroup — ưu tiên lọc authorUid để tránh quét cả org. */
const EVAL_STATS_CAP_SELF = 800
const EVAL_STATS_CAP_GLOBAL = 500

export function useCallEvaluationStats({
  days = 90,
  authorUid = null,
  enabled = true,
}: UseCallEvaluationStatsOpts = {}) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
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
      setNotice(null)
      return
    }
    const db = getFirestoreDb()
    if (!db || !isFirebaseConfigured()) {
      setRows([])
      setLoading(false)
      setError('Chưa cấu hình Firebase.')
      setNotice(null)
      return
    }

    let cancelled = false
    setLoading(true)
    setError(null)
    setNotice(null)

    const author = authorUid?.trim() || ''
    const fetchLimit = author ? EVAL_STATS_CAP_SELF : EVAL_STATS_CAP_GLOBAL

    ;(async () => {
      try {
        const constraints: QueryConstraint[] = [where('timestamp', '>=', fromTs), limit(fetchLimit)]
        if (author) constraints.unshift(where('authorUid', '==', author))

        let snap
        try {
          snap = await getDocs(query(collectionGroup(db, FS_COLLECTIONS.interactions), ...constraints))
        } catch {
          // Index authorUid+timestamp chưa sẵn → chỉ lọc theo thời gian (trần thấp).
          snap = await getDocs(
            query(
              collectionGroup(db, FS_COLLECTIONS.interactions),
              where('timestamp', '>=', fromTs),
              limit(fetchLimit),
            ),
          )
        }

        const docs: { id: string; leadId: string; data: Record<string, unknown> }[] = []
        snap.forEach((d) => {
          const data = d.data() as Record<string, unknown>
          if (!data.callSessionEvaluation) return
          if (author && String(data.authorUid ?? '') !== author) return
          const leadId = String(data.leadId ?? d.ref.parent.parent?.id ?? '')
          if (!leadId) return
          docs.push({ id: d.id, leadId, data })
        })
        const parsed = evaluationRowsFromInteractionDocs(docs)
        parsed.sort((a, b) => b.evaluatedAtMs - a.evaluatedAtMs)
        if (!cancelled) {
          setRows(parsed)
          if (snap.size >= fetchLimit) {
            setNotice(
              `Đã đọc tối đa ${fetchLimit.toLocaleString('vi-VN')} dòng tương tác gần đây — thu hẹp phạm vi nếu thiếu đánh giá.`,
            )
          }
        }
      } catch (e) {
        console.error(e)
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Không tải được thống kê đánh giá gọi.')
          setRows([])
          setNotice(null)
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

  return { loading, error, notice, aggregates, rows }
}
