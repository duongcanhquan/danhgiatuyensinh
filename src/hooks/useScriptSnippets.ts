import { useEffect, useMemo, useState } from 'react'
import { collection, query, where, Timestamp } from 'firebase/firestore'
import type { ScriptSnippet } from '../types'
import { FS_COLLECTIONS, SCRIPT_CATEGORIES } from '../types'
import { getFirestoreDb, isFirebaseConfigured } from '../services/firebase'
import { subscribeSharedFirestoreQuery } from '../utils/sharedFirestoreQuery'
import { useOrg } from '../contexts/OrgProvider'
import { DEFAULT_ORG_ID } from '../tenancy/orgConstants'
import { firestoreReadErrorMessage } from '../utils/firestoreReadError'

function isScriptCategory(x: string): x is ScriptSnippet['category'] {
  return (SCRIPT_CATEGORIES as readonly string[]).includes(x)
}

function mapSnippet(id: string, data: Record<string, unknown>): ScriptSnippet | null {
  try {
    const now = Timestamp.now()
    const mc = Array.isArray(data.matchConditions) ? data.matchConditions : []
    const catRaw = String(data.category ?? 'GREETING')
    const category = isScriptCategory(catRaw) ? catRaw : 'GREETING'
    const lastUpdated =
      (data.lastUpdated as Timestamp) ??
      (data.updatedAt as Timestamp) ??
      (data.createdAt as Timestamp) ??
      now
    return {
      id,
      title: String(data.title ?? 'Snippet'),
      category,
      content: String(data.content ?? ''),
      matchConditions: mc as ScriptSnippet['matchConditions'],
      isActive: data.isActive !== false,
      lastUpdated,
      createdAt: data.createdAt as Timestamp | undefined,
      seedTag: data.seedTag ? String(data.seedTag) : undefined,
    }
  } catch {
    return null
  }
}

export function useScriptSnippets() {
  const { effectiveOrgId } = useOrg()
  const orgKey = effectiveOrgId.trim() || DEFAULT_ORG_ID
  const [snippets, setSnippets] = useState<ScriptSnippet[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const configured = useMemo(() => isFirebaseConfigured(), [])

  useEffect(() => {
    const firestore = getFirestoreDb()
    if (!firestore) {
      queueMicrotask(() => {
        setSnippets([])
        setLoading(false)
        setError(configured ? null : 'Chưa cấu hình Firebase — không đọc scriptSnippets.')
      })
      return
    }

    return subscribeSharedFirestoreQuery(
      `scriptSnippets:org:${orgKey}`,
      (db) => query(collection(db, FS_COLLECTIONS.scriptSnippets), where('orgId', '==', orgKey)),
      mapSnippet,
      firestore,
      (rows, err, isLoading) => {
        setSnippets(rows)
        setError(err ? firestoreReadErrorMessage(err, 'Không đọc được kịch bản.') : null)
        setLoading(isLoading)
      },
    )
  }, [configured, orgKey])

  return { snippets, loading, error }
}
