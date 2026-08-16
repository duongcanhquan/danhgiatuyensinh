import { useEffect, useMemo, useRef, useState } from 'react'
import { collection, onSnapshot, query, where } from 'firebase/firestore'
import type { AITask } from '../types'
import { FS_COLLECTIONS } from '../types'
import { getFirestoreDb, isFirebaseConfigured } from '../services/firebase'
import { useAuth } from './useAuth'
import { useOrg } from './useOrg'
import { ensureDefaultCounselingAiTask } from '../services/ensureDefaultCounselingAiTask'
import { DEFAULT_ORG_ID } from '../tenancy/orgConstants'
import { firestoreReadErrorMessage } from '../utils/firestoreReadError'

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

export function useAITasks(opts?: { enabled?: boolean }) {
  const enabled = opts?.enabled !== false
  const { can } = useAuth()
  const { effectiveOrgId } = useOrg()
  const orgKey = effectiveOrgId.trim() || DEFAULT_ORG_ID
  const canSeedTasks = can('config:ai_engine')
  const [tasks, setTasks] = useState<AITask[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const configured = useMemo(() => isFirebaseConfigured(), [])
  const seedAttemptedRef = useRef(false)

  useEffect(() => {
    if (!enabled) {
      queueMicrotask(() => {
        setLoading(false)
      })
      return
    }

    const firestore = getFirestoreDb()
    if (!firestore) {
      queueMicrotask(() => {
        setTasks([])
        setLoading(false)
        setError(configured ? null : 'Chưa cấu hình Firebase.')
      })
      return
    }

    setLoading(true)
    const q = query(collection(firestore, FS_COLLECTIONS.ai_tasks), where('orgId', '==', orgKey))
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
          void ensureDefaultCounselingAiTask(firestore, orgKey).catch((e) => {
            console.warn('[useAITasks] ensureDefaultCounselingAiTask', e)
          })
        }
      },
      (err) => {
        console.error(err)
        setError(firestoreReadErrorMessage(err, 'Không đọc được tác vụ AI của trường.'))
        setLoading(false)
      },
    )
    return () => unsub()
  }, [configured, canSeedTasks, orgKey, enabled])

  return { tasks, loading: enabled ? loading : false, error: enabled ? error : null }
}
