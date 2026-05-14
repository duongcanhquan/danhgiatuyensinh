import { useEffect, useMemo, useState } from 'react'
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore'
import type { ScoringRuleTemplateDoc } from '../types'
import { FS_COLLECTIONS } from '../types'
import { getFirestoreDb, isFirebaseConfigured } from '../services/firebase'
import { customRuleTemplateFromDoc } from '../utils/ruleLibrary'
import { parseScoringRuleTemplateDoc } from '../utils/scoringRuleTemplatesFirestore'

export function useScoringRuleTemplates() {
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
    const q = query(collection(db, FS_COLLECTIONS.scoringRuleTemplates), orderBy('order', 'asc'))
    const unsub = onSnapshot(
      q,
      (snap) => {
        setError(null)
        const out: ScoringRuleTemplateDoc[] = []
        snap.forEach((d) => {
          const p = parseScoringRuleTemplateDoc(d.id, d.data() as Record<string, unknown>)
          if (p) out.push(p)
        })
        setDocs(out)
        setLoading(false)
      },
      (err) => {
        setError(err.message || 'Lỗi đọc scoringRuleTemplates')
        setLoading(false)
      },
    )
    return () => unsub()
  }, [])

  const ruleLibraryTemplates = useMemo(() => docs.map((d) => customRuleTemplateFromDoc(d)), [docs])

  return { docs, ruleLibraryTemplates, loading, error }
}