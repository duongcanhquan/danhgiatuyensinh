import { useEffect, useMemo, useState } from 'react'
import { collection, query, where, Timestamp } from 'firebase/firestore'
import type { ConsultingPlaybook } from '../types'
import { FS_COLLECTIONS } from '../types'
import { parsePlaybookContentCategory } from '../utils/playbookContentCategories'
import { getFirestoreDb, isFirebaseConfigured } from '../services/firebase'
import { subscribeSharedFirestoreQuery } from '../utils/sharedFirestoreQuery'
import { useOrg } from '../contexts/OrgProvider'
import { DEFAULT_ORG_ID } from '../tenancy/orgConstants'
import { firestoreReadErrorMessage } from '../utils/firestoreReadError'

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
      contentCategory: parsePlaybookContentCategory(data.contentCategory),
    }
  } catch {
    return null
  }
}

export function useConsultingPlaybooks(opts?: { enabled?: boolean }) {
  const enabled = opts?.enabled !== false
  const { effectiveOrgId } = useOrg()
  const orgKey = effectiveOrgId.trim() || DEFAULT_ORG_ID
  const [playbooks, setPlaybooks] = useState<ConsultingPlaybook[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const configured = useMemo(() => isFirebaseConfigured(), [])

  useEffect(() => {
    if (!enabled) {
      queueMicrotask(() => {
        setPlaybooks([])
        setLoading(false)
        setError(null)
      })
      return
    }

    const firestore = getFirestoreDb()
    if (!firestore) {
      queueMicrotask(() => {
        setPlaybooks([])
        setLoading(false)
        setError(configured ? null : 'Chưa cấu hình Firebase — không đọc playbooks.')
      })
      return
    }

    setLoading(true)
    return subscribeSharedFirestoreQuery(
      `consultingPlaybooks:org:${orgKey}`,
      (db) => query(collection(db, FS_COLLECTIONS.consultingPlaybooks), where('orgId', '==', orgKey)),
      mapPlaybook,
      firestore,
      (rows, err, isLoading) => {
        setPlaybooks(rows)
        setError(err ? firestoreReadErrorMessage(err, 'Không đọc được playbook.') : null)
        setLoading(isLoading)
      },
    )
  }, [configured, enabled, orgKey])

  return { playbooks, loading, error }
}
