import { useEffect, useMemo, useState } from 'react'
import { collection, onSnapshot, query, where } from 'firebase/firestore'
import type { ScoringRuleTemplateDoc } from '../types'
import { FS_COLLECTIONS } from '../types'
import { getFirestoreDb, isFirebaseConfigured } from '../services/firebase'
import { ruleLibraryTemplateFromFirestoreDoc } from '../utils/ruleLibrary'
import { parseScoringRuleTemplateDoc } from '../utils/scoringRuleTemplatesFirestore'
import { useOrg } from './useOrg'
import { DEFAULT_ORG_ID } from '../tenancy/orgConstants'
import { firestoreReadErrorMessage } from '../utils/firestoreReadError'

export function useScoringRuleTemplates() {
  const { effectiveOrgId } = useOrg()
  const orgKey = effectiveOrgId.trim() || DEFAULT_ORG_ID
  const [docs, setDocs] = useState<ScoringRuleTemplateDoc[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const db = getFirestoreDb()
    if (!isFirebaseConfigured() || !db) {
      setLoading(false)
      setDocs([])
      return
    }
    setLoading(true)
    const q = query(collection(db, FS_COLLECTIONS.scoringRuleTemplates), where('orgId', '==', orgKey))
    const unsub = onSnapshot(
      q,
      (snap) => {
        setError(null)
        const out: ScoringRuleTemplateDoc[] = []
        snap.forEach((d) => {
          const p = parseScoringRuleTemplateDoc(d.id, d.data() as Record<string, unknown>)
          if (p) out.push(p)
        })
        out.sort((a, b) => a.order - b.order || a.title.localeCompare(b.title, 'vi'))
        setDocs(out)
        setLoading(false)
      },
      (err) => {
        setError(firestoreReadErrorMessage(err, 'Không đọc được mẫu quy tắc chấm điểm.'))
        setLoading(false)
      },
    )
    return () => unsub()
  }, [orgKey])

  const ruleLibraryTemplates = useMemo(() => docs.map((d) => ruleLibraryTemplateFromFirestoreDoc(d)), [docs])

  return { docs, ruleLibraryTemplates, loading, error }
}
