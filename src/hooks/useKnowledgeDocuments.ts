import { useEffect, useMemo, useState } from 'react'
import { collection, limit, onSnapshot, orderBy, query, Timestamp } from 'firebase/firestore'
import type { KnowledgeDocument, KnowledgeDocumentType } from '../types'
import { FS_COLLECTIONS } from '../types'
import { getFirestoreDb, isFirebaseConfigured } from '../services/firebase'

function mapDoc(id: string, data: Record<string, unknown>): KnowledgeDocument | null {
  try {
    const typeRaw = String(data.type ?? 'POLICY').toUpperCase()
    const allowed: KnowledgeDocumentType[] = ['TUITION', 'POLICY', 'MAJOR_INFO']
    const type = (allowed.includes(typeRaw as KnowledgeDocumentType) ? typeRaw : 'POLICY') as KnowledgeDocumentType
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

/** Real-time institutional knowledge for RAG (Firestore `knowledgeDocuments`). */
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

    const q = query(
      collection(firestore, FS_COLLECTIONS.knowledgeDocuments),
      orderBy('uploadedAt', 'desc'),
      limit(100),
    )
    const unsub = onSnapshot(
      q,
      (snap) => {
        const next: KnowledgeDocument[] = []
        snap.forEach((d) => {
          const row = mapDoc(d.id, d.data() as Record<string, unknown>)
          if (row) next.push(row)
        })
        setDocuments(next)
        setLoading(false)
        setError(null)
      },
      (err) => {
        console.error(err)
        setError(err.message || 'Lỗi đọc knowledgeDocuments')
        setLoading(false)
      },
    )
    return () => unsub()
  }, [configured])

  return { documents, loading, error }
}
