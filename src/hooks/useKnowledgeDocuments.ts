import { useEffect, useMemo, useState } from 'react'
import { collection, limit, orderBy, query, Timestamp } from 'firebase/firestore'
import type { KnowledgeDocument } from '../types'
import { FS_COLLECTIONS } from '../types'
import { getFirestoreDb, isFirebaseConfigured } from '../services/firebase'
import { normalizeKnowledgeCategoryId } from '../utils/knowledgeCategories'
import { subscribeSharedFirestoreQuery } from '../utils/sharedFirestoreQuery'

function mapDoc(id: string, data: Record<string, unknown>): KnowledgeDocument | null {
  try {
    const type = normalizeKnowledgeCategoryId(String(data.type ?? 'POLICY')) || 'POLICY'
    const uploadedAt =
      data.uploadedAt && typeof data.uploadedAt === 'object' && 'toMillis' in (data.uploadedAt as object)
        ? (data.uploadedAt as Timestamp)
        : Timestamp.now()
    return {
      id,
      title: String(data.title ?? '').trim() || 'Không tiêu đề',
      content: String(data.content ?? ''),
      type,
      uploadedAt,
    }
  } catch {
    return null
  }
}

const SHARED_KEY = 'knowledgeDocuments:v1'

/** Real-time institutional knowledge for RAG — shared listener across mounts. */
export function useKnowledgeDocuments() {
  const [documents, setDocuments] = useState<KnowledgeDocument[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const configured = useMemo(() => isFirebaseConfigured(), [])

  useEffect(() => {
    const firestore = getFirestoreDb()
    if (!firestore) {
      queueMicrotask(() => {
        setDocuments([])
        setLoading(false)
        setError(configured ? null : 'Chưa cấu hình Firebase.')
      })
      return
    }

    return subscribeSharedFirestoreQuery(
      SHARED_KEY,
      (db) =>
        query(collection(db, FS_COLLECTIONS.knowledgeDocuments), orderBy('uploadedAt', 'desc'), limit(100)),
      mapDoc,
      firestore,
      (rows, err, isLoading) => {
        setDocuments(rows)
        setError(err)
        setLoading(isLoading)
      },
    )
  }, [configured])

  return { documents, loading, error }
}
