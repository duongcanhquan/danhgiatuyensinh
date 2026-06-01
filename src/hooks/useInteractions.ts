import { useEffect, useMemo, useState } from 'react'
import {
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
  type Timestamp,
} from 'firebase/firestore'
import type { Interaction, UserRole } from '../types'
import { FS_COLLECTIONS } from '../types'
import { getFirestoreDb, isFirebaseConfigured } from '../services/firebase'

function mapInteraction(
  id: string,
  leadId: string,
  data: Record<string, unknown>,
): Interaction | null {
  try {
    const ts = (data.timestamp as Timestamp) ?? (data.createdAt as Timestamp)
    if (!ts) return null
    return {
      id,
      leadId,
      channel: (data.channel as Interaction['channel']) ?? 'NOTE',
      authorUid: String(data.authorUid ?? ''),
      authorRole: (data.authorRole as UserRole) ?? 'counselor',
      timestamp: ts,
      counselorNote: data.counselorNote !== undefined ? String(data.counselorNote) : undefined,
      callOutcome: data.callOutcome as Interaction['callOutcome'],
      durationSeconds:
        data.durationSeconds !== undefined ? Number(data.durationSeconds) : undefined,
      aiSentiment: data.aiSentiment as Interaction['aiSentiment'],
      callSessionTags: Array.isArray(data.callSessionTags)
        ? (data.callSessionTags as Interaction['callSessionTags'])
        : undefined,
      callAiAssessment: data.callAiAssessment as Interaction['callAiAssessment'],
      callSessionEvaluation: data.callSessionEvaluation as Interaction['callSessionEvaluation'],
      evaluationTag: data.evaluationTag !== undefined ? String(data.evaluationTag) : undefined,
      snapshotCrmStatus: data.snapshotCrmStatus as Interaction['snapshotCrmStatus'],
      snapshotPipelineStatus: data.snapshotPipelineStatus as Interaction['snapshotPipelineStatus'],
      snapshotPriorityTag: data.snapshotPriorityTag as Interaction['snapshotPriorityTag'],
    }
  } catch {
    return null
  }
}

/** Sub-collection `leads/{leadId}/interactions` — real-time. */
export function useInteractions(leadId: string | null) {
  const [interactions, setInteractions] = useState<Interaction[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const configured = useMemo(() => isFirebaseConfigured(), [])

  useEffect(() => {
    if (!leadId) {
      queueMicrotask(() => {
        setInteractions([])
        setLoading(false)
      })
      return
    }
    const firestore = getFirestoreDb()
    if (!firestore) {
      queueMicrotask(() => {
        setInteractions([])
        setLoading(false)
        setError(
          configured ? null : 'Chưa cấu hình Firebase — không đọc được tương tác.',
        )
      })
      return
    }

    queueMicrotask(() => setLoading(true))
    const q = query(
      collection(firestore, FS_COLLECTIONS.leads, leadId, FS_COLLECTIONS.interactions),
      orderBy('timestamp', 'desc'),
      limit(120),
    )

    const unsub = onSnapshot(
      q,
      (snap) => {
        const next: Interaction[] = []
        snap.forEach((d) => {
          const row = mapInteraction(d.id, leadId, d.data() as Record<string, unknown>)
          if (row) next.push(row)
        })
        setInteractions(next)
        setLoading(false)
        setError(null)
      },
      (err) => {
        console.error(err)
        setError(err.message || 'Lỗi đọc interactions')
        setLoading(false)
      },
    )
    return () => unsub()
  }, [leadId, configured])

  return { interactions, loading, error }
}
