import { useEffect, useMemo, useState } from 'react'
import { collection, onSnapshot, query, Timestamp } from 'firebase/firestore'
import type { ConsultingPlaybook } from '../types'
import { FS_COLLECTIONS } from '../types'
import { getFirestoreDb, isFirebaseConfigured } from '../services/firebase'

function mapPlaybook(id: string, data: Record<string, unknown>): ConsultingPlaybook | null {
  try {
    const now = Timestamp.now()
    const triggers = Array.isArray(data.triggerConditions) ? data.triggerConditions : []
    return {
      id,
      title: String(data.title ?? 'Playbook'),
      isActive: data.isActive !== false,
      priority: Number(data.priority ?? 0),
      triggerConditions: triggers as ConsultingPlaybook['triggerConditions'],
      strategy: String(data.strategy ?? ''),
      keySellingPoints: Array.isArray(data.keySellingPoints)
        ? data.keySellingPoints.map(String)
        : undefined,
      objectionHandling: Array.isArray(data.objectionHandling)
        ? data.objectionHandling.map(String)
        : [],
      matchKeywords: Array.isArray(data.matchKeywords)
        ? data.matchKeywords.map((x) => String(x).trim()).filter(Boolean)
        : undefined,
      matchAllLeads: data.matchAllLeads === true,
      createdAt: (data.createdAt as Timestamp) ?? now,
      updatedAt: (data.updatedAt as Timestamp) ?? now,
      createdBy: data.createdBy ? String(data.createdBy) : undefined,
      seedTag: data.seedTag ? String(data.seedTag) : undefined,
    }
  } catch {
    return null
  }
}

export function useConsultingPlaybooks() {
  const [playbooks, setPlaybooks] = useState<ConsultingPlaybook[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const configured = useMemo(() => isFirebaseConfigured(), [])

  useEffect(() => {
    const firestore = getFirestoreDb()
    if (!firestore) {
      queueMicrotask(() => {
        setPlaybooks([])
        setLoading(false)
        setError(configured ? null : 'Chưa cấu hình Firebase — không đọc playbooks.')
      })
      return
    }

    const q = query(collection(firestore, FS_COLLECTIONS.consultingPlaybooks))
    const unsub = onSnapshot(
      q,
      (snap) => {
        const next: ConsultingPlaybook[] = []
        snap.forEach((d) => {
          const p = mapPlaybook(d.id, d.data() as Record<string, unknown>)
          if (p) next.push(p)
        })
        setPlaybooks(next)
        setLoading(false)
        setError(null)
      },
      (err) => {
        console.error(err)
        setError(err.message || 'Lỗi đọc consultingPlaybooks')
        setLoading(false)
      },
    )
    return () => unsub()
  }, [configured])

  return { playbooks, loading, error }
}
