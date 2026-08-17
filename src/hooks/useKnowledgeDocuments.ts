import { useEffect, useMemo, useState } from 'react'
import {
  collection,
  doc,
  limit,
  onSnapshot,
  query,
  where,
  writeBatch,
  Timestamp,
} from 'firebase/firestore'
import type { Firestore } from 'firebase/firestore'
import type { KnowledgeDocument } from '../types'
import { FS_COLLECTIONS } from '../types'
import { getFirestoreDb, isFirebaseConfigured } from '../services/firebase'
import { normalizeKnowledgeCategoryId } from '../utils/knowledgeCategories'
import { subscribeSharedFirestoreQuery } from '../utils/sharedFirestoreQuery'
import { useOrg } from '../contexts/OrgProvider'
import { DEFAULT_ORG_ID } from '../tenancy/orgConstants'
import { leadBelongsToOrg } from '../tenancy/orgQuery'
import { firestoreReadErrorMessage } from '../utils/firestoreReadError'

const stampedLegacyOrgIds = new Set<string>()

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

function sortByUploadedAtDesc(rows: KnowledgeDocument[]): KnowledgeDocument[] {
  return [...rows].sort((a, b) => {
    const am = a.uploadedAt && typeof a.uploadedAt.toMillis === 'function' ? a.uploadedAt.toMillis() : 0
    const bm = b.uploadedAt && typeof b.uploadedAt.toMillis === 'function' ? b.uploadedAt.toMillis() : 0
    return bm - am
  })
}

function mergeById(...lists: KnowledgeDocument[][]): KnowledgeDocument[] {
  const byId = new Map<string, KnowledgeDocument>()
  for (const list of lists) {
    for (const row of list) byId.set(row.id, row)
  }
  return sortByUploadedAtDesc([...byId.values()])
}

/** Gắn orgId cho tài liệu VietMy cũ — query `orgId==` không trả các doc thiếu field này. */
function stampLegacyKnowledgeOrgId(
  db: Firestore,
  orgKey: string,
  docs: { id: string; data: Record<string, unknown> }[],
): void {
  const missing = docs.filter((d) => !String(d.data.orgId ?? '').trim() && !stampedLegacyOrgIds.has(d.id))
  if (!missing.length) return
  for (const d of missing) stampedLegacyOrgIds.add(d.id)
  void (async () => {
    let batch = writeBatch(db)
    let ops = 0
    for (const d of missing) {
      batch.update(doc(db, FS_COLLECTIONS.knowledgeDocuments, d.id), { orgId: orgKey })
      ops++
      if (ops >= 400) {
        await batch.commit()
        batch = writeBatch(db)
        ops = 0
      }
    }
    if (ops) await batch.commit()
  })().catch((e) => {
    console.warn('[knowledge] Không gắn được orgId cho tài liệu cũ.', e)
  })
}

/** Real-time institutional knowledge for RAG — shared listener across mounts. */
export function useKnowledgeDocuments(opts?: { enabled?: boolean }) {
  const enabled = opts?.enabled !== false
  const { effectiveOrgId } = useOrg()
  const orgKey = effectiveOrgId.trim() || DEFAULT_ORG_ID
  const [documents, setDocuments] = useState<KnowledgeDocument[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const configured = useMemo(() => isFirebaseConfigured(), [])

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
        setDocuments([])
        setLoading(false)
        setError(configured ? null : 'Chưa cấu hình Firebase.')
      })
      return
    }

    let scopedRows: KnowledgeDocument[] = []
    let legacyRows: KnowledgeDocument[] = []
    let scopedError: string | null = null
    let scopedLoading = true

    const publish = () => {
      const merged = mergeById(scopedRows, legacyRows)
      setDocuments(merged)
      setError(merged.length ? null : scopedError)
      setLoading(scopedLoading && legacyRows.length === 0)
    }

    // VietMy: tài liệu cũ thiếu orgId không khớp where(orgId==). Chỉ thử khi danh sách theo org trống.
    let unsubLegacy: (() => void) | undefined
    let legacyStarted = false
    const startLegacyIfNeeded = () => {
      if (legacyStarted || orgKey !== DEFAULT_ORG_ID) return
      legacyStarted = true
      unsubLegacy = onSnapshot(
        query(collection(firestore, FS_COLLECTIONS.knowledgeDocuments), limit(500)),
        (snap) => {
          const raw: { id: string; data: Record<string, unknown> }[] = []
          snap.forEach((d) => {
            const data = d.data() as Record<string, unknown>
            if (!leadBelongsToOrg({ orgId: data.orgId as string | null | undefined }, orgKey)) return
            raw.push({ id: d.id, data })
          })
          stampLegacyKnowledgeOrgId(firestore, orgKey, raw)
          legacyRows = raw.map((d) => mapDoc(d.id, d.data)).filter((row): row is KnowledgeDocument => Boolean(row))
          publish()
        },
        (err) => {
          console.warn('[knowledge] Bỏ qua đọc tài liệu thiếu orgId.', err)
          legacyRows = []
          publish()
        },
      )
    }

    const unsubScoped = subscribeSharedFirestoreQuery(
      `knowledgeDocuments:org:${orgKey}:noidx`,
      (db) =>
        query(collection(db, FS_COLLECTIONS.knowledgeDocuments), where('orgId', '==', orgKey), limit(100)),
      mapDoc,
      firestore,
      (rows, err, isLoading) => {
        scopedRows = rows
        scopedLoading = isLoading
        scopedError = err ? firestoreReadErrorMessage(err, 'Không đọc được kho tri thức.') : null
        publish()
        if (!isLoading && rows.length === 0) startLegacyIfNeeded()
      },
    )

    return () => {
      unsubScoped()
      unsubLegacy?.()
    }
  }, [configured, orgKey, enabled])

  return { documents, loading: enabled ? loading : false, error: enabled ? error : null }
}
