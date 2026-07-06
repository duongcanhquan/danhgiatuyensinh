import { useCallback, useEffect, useState } from 'react'
import { doc, getDoc } from 'firebase/firestore'
import type { ProfileCustomScoringSignal } from '../types'
import { FS_COLLECTIONS, SCORING_AUX_TVV_SIGNALS_DOC_ID } from '../types'
import { getFirestoreDb, isFirebaseConfigured } from '../services/firebase'
import { getCached } from '../utils/firestoreStaticCache'
import { parseSchoolTvvSignalDefinitionsDoc } from '../utils/schoolTvvSignalsFirestore'

const CACHE_KEY = 'scoringAux/tvvSignalDefinitions'
const CACHE_TTL_MS = 10 * 60_000

/**
 * Định nghĩa tín hiệu TVV tùy chỉnh toàn trường — `scoringAux/tvvSignalDefinitions`.
 * One-shot getDoc + cache RAM (ít đổi, không giữ listener).
 */
export function useSchoolTvvSignalDefinitions() {
  const [items, setItems] = useState<ProfileCustomScoringSignal[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(() => {
    const db = getFirestoreDb()
    if (!db || !isFirebaseConfigured()) {
      setItems([])
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    void getCached(
      CACHE_KEY,
      async () => {
        const snap = await getDoc(doc(db, FS_COLLECTIONS.scoringAux, SCORING_AUX_TVV_SIGNALS_DOC_ID))
        return parseSchoolTvvSignalDefinitionsDoc(snap.data() as Record<string, unknown> | undefined)
      },
      CACHE_TTL_MS,
    )
      .then((parsed) => {
        setItems(parsed)
        setLoading(false)
      })
      .catch((e) => {
        console.error(e)
        setError('Không đọc được cấu hình tín hiệu TVV toàn trường.')
        setLoading(false)
      })
  }, [])

  useEffect(() => {
    reload()
  }, [reload])

  return { items, loading, error, reload }
}
