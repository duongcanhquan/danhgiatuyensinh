import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { deleteDoc, doc, onSnapshot, setDoc, Timestamp } from 'firebase/firestore'
import type { LeadClassificationConfigPersisted } from '../types'
import { FS_COLLECTIONS, SCORING_AUX_LEAD_CLASSIFICATION_DOC_ID } from '../types'
import { getFirestoreDb, isFirebaseConfigured } from '../services/firebase'
import {
  buildLeadClassificationRuntime,
  getDefaultLeadClassificationConfig,
  mergeLeadClassificationConfig,
  parseLeadClassificationDoc,
  type LeadClassificationRuntime,
} from '../utils/leadClassificationConfig'

type Ctx = {
  merged: LeadClassificationConfigPersisted
  runtime: LeadClassificationRuntime
  rulesFromRemote: boolean
  loading: boolean
  error: string | null
  saveRules: (next: LeadClassificationConfigPersisted) => Promise<void>
  resetToBuiltin: () => Promise<void>
}

const LeadClassificationRulesContext = createContext<Ctx | null>(null)

export function LeadClassificationRulesProvider({ children }: { children: ReactNode }) {
  const [merged, setMerged] = useState<LeadClassificationConfigPersisted>(() => getDefaultLeadClassificationConfig())
  const [rulesFromRemote, setRulesFromRemote] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!isFirebaseConfigured()) {
      setMerged(getDefaultLeadClassificationConfig())
      setRulesFromRemote(false)
      setLoading(false)
      return
    }
    const db = getFirestoreDb()
    if (!db) {
      setMerged(getDefaultLeadClassificationConfig())
      setRulesFromRemote(false)
      setLoading(false)
      return
    }
    setLoading(true)
    const ref = doc(db, FS_COLLECTIONS.scoringAux, SCORING_AUX_LEAD_CLASSIFICATION_DOC_ID)
    const unsub = onSnapshot(
      ref,
      (snap) => {
        const parsed = snap.exists() ? parseLeadClassificationDoc(snap.data() as Record<string, unknown>) : null
        setRulesFromRemote(Boolean(parsed))
        setMerged(mergeLeadClassificationConfig(parsed))
        setLoading(false)
      },
      (e) => {
        console.error(e)
        setError('Không đọc được cấu hình phân loại nhãn.')
        setMerged(getDefaultLeadClassificationConfig())
        setRulesFromRemote(false)
        setLoading(false)
      },
    )
    return () => unsub()
  }, [])

  const runtime = useMemo(() => buildLeadClassificationRuntime(merged), [merged])

  const saveRules = useCallback(async (next: LeadClassificationConfigPersisted) => {
    const db = getFirestoreDb()
    if (!db) return
    const ref = doc(db, FS_COLLECTIONS.scoringAux, SCORING_AUX_LEAD_CLASSIFICATION_DOC_ID)
    const clean = mergeLeadClassificationConfig(next)
    await setDoc(ref, { ...clean, updatedAt: Timestamp.now() })
  }, [])

  const resetToBuiltin = useCallback(async () => {
    const db = getFirestoreDb()
    if (!db) return
    await deleteDoc(doc(db, FS_COLLECTIONS.scoringAux, SCORING_AUX_LEAD_CLASSIFICATION_DOC_ID))
  }, [])

  const value = useMemo(
    () => ({ merged, runtime, rulesFromRemote, loading, error, saveRules, resetToBuiltin }),
    [merged, runtime, rulesFromRemote, loading, error, saveRules, resetToBuiltin],
  )

  return <LeadClassificationRulesContext.Provider value={value}>{children}</LeadClassificationRulesContext.Provider>
}

export function useLeadClassificationRules(): Ctx {
  const v = useContext(LeadClassificationRulesContext)
  if (!v) {
    const merged = getDefaultLeadClassificationConfig()
    return {
      merged,
      runtime: buildLeadClassificationRuntime(merged),
      rulesFromRemote: false,
      loading: false,
      error: null,
      saveRules: async () => {},
      resetToBuiltin: async () => {},
    }
  }
  return v
}
