import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { deleteDoc, doc, onSnapshot, setDoc, Timestamp } from 'firebase/firestore'
import type { InfoScoreRulesPersisted } from '../types'
import type { InfoScoreRuntime } from '../utils/infoScoreRules'
import { FS_COLLECTIONS, SCORING_AUX_INFO_SCORE_DOC_ID } from '../types'
import { getFirestoreDb, isFirebaseConfigured } from '../services/firebase'
import {
  buildInfoScoreRuntime,
  getDefaultInfoScoreRules,
  mergeInfoScoreRules,
  parseInfoScoreDoc,
} from '../utils/infoScoreRules'

type Ctx = {
  merged: InfoScoreRulesPersisted
  runtime: InfoScoreRuntime
  /** Có document trên Firestore (kể cả nội dung không parse được). */
  docExists: boolean
  /** Công thức đọc được từ server (schema hợp lệ). */
  rulesFromRemote: boolean
  loading: boolean
  error: string | null
  saveRules: (next: InfoScoreRulesPersisted) => Promise<void>
  resetToBuiltin: () => Promise<void>
}

const InfoScoreRulesContext = createContext<Ctx | null>(null)

export function InfoScoreRulesProvider({ children }: { children: ReactNode }) {
  const [merged, setMerged] = useState<InfoScoreRulesPersisted>(() => getDefaultInfoScoreRules())
  const [docExists, setDocExists] = useState(false)
  const [rulesFromRemote, setRulesFromRemote] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!isFirebaseConfigured()) {
      setMerged(getDefaultInfoScoreRules())
      setDocExists(false)
      setRulesFromRemote(false)
      setLoading(false)
      return
    }
    const db = getFirestoreDb()
    if (!db) {
      setMerged(getDefaultInfoScoreRules())
      setDocExists(false)
      setRulesFromRemote(false)
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    const ref = doc(db, FS_COLLECTIONS.scoringAux, SCORING_AUX_INFO_SCORE_DOC_ID)
    const unsub = onSnapshot(
      ref,
      (snap) => {
        const exists = snap.exists()
        setDocExists(exists)
        const parsed = exists ? parseInfoScoreDoc(snap.data() as Record<string, unknown>) : null
        setRulesFromRemote(Boolean(parsed))
        setMerged(mergeInfoScoreRules(parsed))
        setLoading(false)
      },
      (e) => {
        console.error(e)
        setError('Không đọc được cấu hình điểm thông tin (scoringAux/infoScoreConfig).')
        setMerged(getDefaultInfoScoreRules())
        setDocExists(false)
        setRulesFromRemote(false)
        setLoading(false)
      },
    )
    return () => unsub()
  }, [])

  const runtime = useMemo(() => buildInfoScoreRuntime(merged, rulesFromRemote), [merged, rulesFromRemote])

  const saveRules = useCallback(async (next: InfoScoreRulesPersisted) => {
    if (!isFirebaseConfigured()) return
    const db = getFirestoreDb()
    if (!db) return
    const ref = doc(db, FS_COLLECTIONS.scoringAux, SCORING_AUX_INFO_SCORE_DOC_ID)
    const clean = mergeInfoScoreRules(next)
    await setDoc(ref, {
      ...clean,
      updatedAt: Timestamp.now(),
    })
  }, [])

  const resetToBuiltin = useCallback(async () => {
    if (!isFirebaseConfigured()) return
    const db = getFirestoreDb()
    if (!db) return
    const ref = doc(db, FS_COLLECTIONS.scoringAux, SCORING_AUX_INFO_SCORE_DOC_ID)
    await deleteDoc(ref)
  }, [])

  const value = useMemo(
    () => ({
      merged,
      runtime,
      docExists,
      rulesFromRemote,
      loading,
      error,
      saveRules,
      resetToBuiltin,
    }),
    [merged, runtime, docExists, rulesFromRemote, loading, error, saveRules, resetToBuiltin],
  )

  return <InfoScoreRulesContext.Provider value={value}>{children}</InfoScoreRulesContext.Provider>
}

export function useInfoScoreRules(): Ctx {
  const v = useContext(InfoScoreRulesContext)
  if (!v) {
    const merged = getDefaultInfoScoreRules()
    return {
      merged,
      runtime: buildInfoScoreRuntime(merged, false),
      docExists: false,
      rulesFromRemote: false,
      loading: false,
      error: null,
      saveRules: async () => {},
      resetToBuiltin: async () => {},
    }
  }
  return v
}
