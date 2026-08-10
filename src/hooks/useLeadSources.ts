import { useEffect, useMemo, useState } from 'react'
import { collection, onSnapshot, orderBy, query, where, type DocumentData } from 'firebase/firestore'
import type { LeadSourceRecord } from '../types'
import { FS_COLLECTIONS } from '../types'
import { getFirestoreDb, isFirebaseConfigured } from '../services/firebase'
import { activeLeadSources, mapLeadSourceDoc } from '../utils/leadProfileCatalog'
import { useOrg } from '../contexts/OrgProvider'
import { DEFAULT_ORG_ID } from '../tenancy/orgConstants'
import { firestoreReadErrorMessage } from '../utils/firestoreReadError'

export function useLeadSources() {
  const { effectiveOrgId } = useOrg()
  const orgKey = effectiveOrgId.trim() || DEFAULT_ORG_ID
  const [items, setItems] = useState<LeadSourceRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const configured = isFirebaseConfigured()

  useEffect(() => {
    const db = getFirestoreDb()
    if (!db) {
      setItems([])
      setLoading(false)
      setError(configured ? null : 'Chưa cấu hình Firebase.')
      return
    }
    const q = query(
      collection(db, FS_COLLECTIONS.leadSources),
      where('orgId', '==', orgKey),
      orderBy('sortOrder', 'asc'),
    )
    const unsub = onSnapshot(
      q,
      (snap) => {
        const rows = snap.docs.map((d) => mapLeadSourceDoc(d.id, d.data() as DocumentData))
        setItems(rows)
        setLoading(false)
        setError(null)
      },
      (e) => {
        console.error(e)
        setError(firestoreReadErrorMessage(e, 'Không tải được danh mục nguồn.'))
        setLoading(false)
      },
    )
    return () => unsub()
  }, [configured, orgKey])

  const active = useMemo(() => activeLeadSources(items), [items])

  return { items, active, loading, error }
}
