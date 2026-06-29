import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { deleteDoc, doc, onSnapshot, setDoc, Timestamp } from 'firebase/firestore'
import type { KpiEvaluationConfigPersisted } from '../types'
import { FS_COLLECTIONS, SCORING_AUX_KPI_EVAL_DOC_ID } from '../types'
import { getFirestoreDb, isFirebaseConfigured } from '../services/firebase'
import {
  buildKpiEvaluationRuntime,
  getDefaultKpiEvaluationRules,
  mergeKpiEvaluationRules,
  parseKpiEvaluationDoc,
  type KpiEvaluationRuntime,
} from '../utils/kpiEvaluationRules'

type Ctx = {
  merged: KpiEvaluationConfigPersisted
  runtime: KpiEvaluationRuntime
  docExists: boolean
  rulesFromRemote: boolean
  loading: boolean
  error: string | null
  saveRules: (next: KpiEvaluationConfigPersisted) => Promise<void>
  resetToBuiltin: () => Promise<void>
}

const KpiEvaluationRulesContext = createContext<Ctx | null>(null)

function fallbackCtx(): Ctx {
  const merged = getDefaultKpiEvaluationRules()
  return {
    merged,
    runtime: buildKpiEvaluationRuntime(merged),
    docExists: false,
    rulesFromRemote: false,
    loading: false,
    error: null,
    saveRules: async () => {},
    resetToBuiltin: async () => {},
  }
}

export function KpiEvaluationRulesProvider({ children }: { children: ReactNode }) {
  const [merged, setMerged] = useState<KpiEvaluationConfigPersisted>(() => getDefaultKpiEvaluationRules())
  const [docExists, setDocExists] = useState(false)
  const [rulesFromRemote, setRulesFromRemote] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!isFirebaseConfigured()) {
      setMerged(getDefaultKpiEvaluationRules())
      setDocExists(false)
      setRulesFromRemote(false)
      setLoading(false)
      return
    }
    const db = getFirestoreDb()
    if (!db) {
      setMerged(getDefaultKpiEvaluationRules())
      setDocExists(false)
      setRulesFromRemote(false)
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    const ref = doc(db, FS_COLLECTIONS.scoringAux, SCORING_AUX_KPI_EVAL_DOC_ID)
    const unsub = onSnapshot(
      ref,
      (snap) => {
        const exists = snap.exists()
        setDocExists(exists)
        const parsed = exists ? parseKpiEvaluationDoc(snap.data() as Record<string, unknown>) : null
        setRulesFromRemote(Boolean(parsed))
        setMerged(mergeKpiEvaluationRules(parsed))
        setLoading(false)
      },
      (e) => {
        console.error(e)
        setError('Không đọc được cấu hình KPI (scoringAux/kpiEvaluationConfig).')
        setMerged(getDefaultKpiEvaluationRules())
        setDocExists(false)
        setRulesFromRemote(false)
        setLoading(false)
      },
    )
    return () => unsub()
  }, [])

  const runtime = useMemo(() => buildKpiEvaluationRuntime(merged), [merged])

  const saveRules = useCallback(async (next: KpiEvaluationConfigPersisted) => {
    if (!isFirebaseConfigured()) return
    const db = getFirestoreDb()
    if (!db) return
    const ref = doc(db, FS_COLLECTIONS.scoringAux, SCORING_AUX_KPI_EVAL_DOC_ID)
    const clean = mergeKpiEvaluationRules(next)
    await setDoc(ref, {
      ...clean,
      updatedAt: Timestamp.now(),
    })
  }, [])

  const resetToBuiltin = useCallback(async () => {
    if (!isFirebaseConfigured()) return
    const db = getFirestoreDb()
    if (!db) return
    const ref = doc(db, FS_COLLECTIONS.scoringAux, SCORING_AUX_KPI_EVAL_DOC_ID)
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

  return <KpiEvaluationRulesContext.Provider value={value}>{children}</KpiEvaluationRulesContext.Provider>
}

export function useKpiEvaluationRules(): Ctx {
  const v = useContext(KpiEvaluationRulesContext)
  return v ?? fallbackCtx()
}
