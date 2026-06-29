import { useEffect, useMemo, useRef, useState } from 'react'
import { collection, onSnapshot, query } from 'firebase/firestore'
import type { AITask } from '../types'
import { FS_COLLECTIONS } from '../types'
import { getFirestoreDb, isFirebaseConfigured } from '../services/firebase'
import { useAuth } from './useAuth'
import { ensureDefaultCounselingAiTask } from '../services/ensureDefaultCounselingAiTask'

function mapAITask(id: string, data: Record<string, unknown>): AITask | null {
  try {
    const tf = data.targetFields
    const targetFields = Array.isArray(tf) ? tf.map((x) => String(x)) : []
    const schemaRaw = data.expectedOutputSchema
    const expectedOutputSchema =
      schemaRaw && typeof schemaRaw === 'object' && !Array.isArray(schemaRaw)
        ? Object.fromEntries(
            Object.entries(schemaRaw as Record<string, unknown>).map(([k, v]) => [k, String(v)]),
          )
        : {}
    return {
      id,
      name: String(data.name ?? 'Task'),
      systemPrompt: String(data.systemPrompt ?? ''),
      userEmphasis: String(data.userEmphasis ?? ''),
      targetFields,
      expectedOutputSchema,
    }
  } catch {
    return null
  }
}

export function useAITasks() {
  const { can } = useAuth()
  const canSeedTasks = can('config:ai_engine')
  const [tasks, setTasks] = useState<AITask[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const configured = useMemo(() => isFirebaseConfigured(), [])
  const seedAttemptedRef = useRef(false)

  useEffect(() => {
    const firestore = getFirestoreDb()
    if (!firestore) {
      queueMicrotask(() => {
        setTasks([])
        setLoading(false)
        setError(configured ? null : 'Chưa cấu hình Firebase.')
      })
      return
    }

    const q = query(collection(firestore, FS_COLLECTIONS.ai_tasks))
    const unsub = onSnapshot(
      q,
      (snap) => {
        const next: AITask[] = []
        snap.forEach((d) => {
          const t = mapAITask(d.id, d.data() as Record<string, unknown>)
          if (t) next.push(t)
        })
        next.sort((a, b) => a.name.localeCompare(b.name, 'vi'))
        setTasks(next)
        setLoading(false)
        setError(null)
        if (next.length === 0 && canSeedTasks && !seedAttemptedRef.current) {
          seedAttemptedRef.current = true
          void ensureDefaultCounselingAiTask(firestore).catch((e) => {
            console.warn('[useAITasks] ensureDefaultCounselingAiTask', e)
          })
        }
      },
      (err) => {
        console.error(err)
        setError(err.message || 'Lỗi đọc ai_tasks')
        setLoading(false)
      },
    )
    return () => unsub()
  }, [configured, canSeedTasks])

  return { tasks, loading, error, configured }
}
