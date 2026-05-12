import { useEffect, useMemo, useState } from 'react'
import { doc, getDoc, onSnapshot } from 'firebase/firestore'
import { FS_COLLECTIONS } from '../types'
import { getFirestoreDb, isFirebaseConfigured } from '../services/firebase'

/** Một document gom map taskId → payload (tránh nhúng nặng trên doc lead trong list). */
export const LEAD_AI_INSIGHT_AGGREGATE_ID = 'aggregate'

/**
 * Sub-collection `leads/{leadId}/aiInsightTasks/aggregate` — field `tasks` trùng shape legacy `lead.aiInsights`.
 * Khi chưa migrate: một lần đọc doc lead để lấy `aiInsights` cũ.
 */
export function useLeadAiInsightTasks(leadId: string | null) {
  const [tasksById, setTasksById] = useState<Record<string, unknown>>({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const configured = useMemo(() => isFirebaseConfigured(), [])

  useEffect(() => {
    if (!leadId) {
      queueMicrotask(() => {
        setTasksById({})
        setLoading(false)
        setError(null)
      })
      return
    }

    const fs = getFirestoreDb()
    if (!fs) {
      queueMicrotask(() => {
        setTasksById({})
        setLoading(false)
        setError(configured ? null : 'Chưa cấu hình Firebase.')
      })
      return
    }

    const subRef = doc(
      fs,
      FS_COLLECTIONS.leads,
      leadId,
      FS_COLLECTIONS.leadAiInsightTasks,
      LEAD_AI_INSIGHT_AGGREGATE_ID,
    )

    let cancelled = false
    setLoading(true)
    const unsub = onSnapshot(
      subRef,
      (snap) => {
        void (async () => {
          try {
            if (snap.exists()) {
              const data = snap.data() as Record<string, unknown>
              const tasks = data.tasks
              if (tasks && typeof tasks === 'object' && !Array.isArray(tasks)) {
                if (!cancelled) setTasksById(tasks as Record<string, unknown>)
              } else if (!cancelled) setTasksById({})
              if (!cancelled) {
                setLoading(false)
                setError(null)
              }
              return
            }
            const parent = await getDoc(doc(fs, FS_COLLECTIONS.leads, leadId))
            if (cancelled) return
            const legacy = parent.data()?.aiInsights
            if (legacy && typeof legacy === 'object' && !Array.isArray(legacy)) {
              setTasksById(legacy as Record<string, unknown>)
            } else {
              setTasksById({})
            }
            setLoading(false)
            setError(null)
          } catch (e) {
            console.error(e)
            if (!cancelled) {
              setError('Không tải được kết quả AI đã lưu')
              setLoading(false)
            }
          }
        })()
      },
      (err) => {
        console.error(err)
        if (!cancelled) {
          setError(err.message || 'Lỗi đọc aiInsightTasks')
          setLoading(false)
        }
      },
    )

    return () => {
      cancelled = true
      unsub()
    }
  }, [leadId, configured])

  return { tasksById, loading, error }
}
