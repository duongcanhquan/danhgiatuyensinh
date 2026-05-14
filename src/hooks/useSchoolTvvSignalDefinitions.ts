import { useEffect, useState } from 'react'
import { doc, onSnapshot } from 'firebase/firestore'
import type { ProfileCustomScoringSignal } from '../types'
import { FS_COLLECTIONS, SCORING_AUX_TVV_SIGNALS_DOC_ID } from '../types'
import { getFirestoreDb, isFirebaseConfigured } from '../services/firebase'
import { parseSchoolTvvSignalDefinitionsDoc } from '../utils/schoolTvvSignalsFirestore'

/**
 * Định nghĩa tín hiệu TVV tùy chỉnh toàn trường — `scoringAux/tvvSignalDefinitions`.
 */
export function useSchoolTvvSignalDefinitions() {
  const [items, setItems] = useState<ProfileCustomScoringSignal[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!isFirebaseConfigured()) {
      setItems([])
      setLoading(false)
      return
    }
    const db = getFirestoreDb()
    if (!db) {
      setItems([])
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    const ref = doc(db, FS_COLLECTIONS.scoringAux, SCORING_AUX_TVV_SIGNALS_DOC_ID)
    const unsub = onSnapshot(
      ref,
      (snap) => {
        setItems(parseSchoolTvvSignalDefinitionsDoc(snap.data() as Record<string, unknown> | undefined))
        setLoading(false)
      },
      (e) => {
        console.error(e)
        setError('Không đọc được cấu hình tín hiệu TVV toàn trường.')
        setLoading(false)
      },
    )
    return () => unsub()
  }, [])

  return { items, loading, error }
}
