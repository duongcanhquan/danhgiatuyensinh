import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { deleteDoc, doc, onSnapshot, setDoc, Timestamp } from 'firebase/firestore'
import type { CallEvalDimension } from '../types'
import { FS_COLLECTIONS, SCORING_AUX_CALL_SESSION_DOC_ID } from '../types'
import { getFirestoreDb, isFirebaseConfigured } from '../services/firebase'
import {
  CALL_EVAL_CONFIG_VERSION,
  getDefaultCallEvaluationConfig,
  mergeCallEvaluationConfig,
  parseCallEvaluationConfigDoc,
} from '../utils/callSessionEvaluation'

type Ctx = {
  dimensions: CallEvalDimension[]
  configFromRemote: boolean
  loading: boolean
  error: string | null
  saveDimensions: (next: CallEvalDimension[]) => Promise<void>
  resetToBuiltin: () => Promise<void>
}

const CallSessionConfigContext = createContext<Ctx | null>(null)

function fallbackCtx(): Ctx {
  return {
    dimensions: getDefaultCallEvaluationConfig(),
    configFromRemote: false,
    loading: false,
    error: null,
    saveDimensions: async () => {},
    resetToBuiltin: async () => {},
  }
}

export function CallSessionConfigProvider({ children }: { children: ReactNode }) {
  const [dimensions, setDimensions] = useState<CallEvalDimension[]>(() => getDefaultCallEvaluationConfig())
  const [configFromRemote, setConfigFromRemote] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!isFirebaseConfigured()) {
      setDimensions(getDefaultCallEvaluationConfig())
      setConfigFromRemote(false)
      setLoading(false)
      return
    }
    const db = getFirestoreDb()
    if (!db) {
      setDimensions(getDefaultCallEvaluationConfig())
      setConfigFromRemote(false)
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    const ref = doc(db, FS_COLLECTIONS.scoringAux, SCORING_AUX_CALL_SESSION_DOC_ID)
    const unsub = onSnapshot(
      ref,
      (snap) => {
        const exists = snap.exists()
        const parsed = exists ? parseCallEvaluationConfigDoc(snap.data() as Record<string, unknown>) : null
        setConfigFromRemote(Boolean(parsed))
        setDimensions(mergeCallEvaluationConfig(parsed))
        setLoading(false)
      },
      (e) => {
        console.error(e)
        setError('Không đọc được bảng đánh giá cuộc gọi.')
        setDimensions(getDefaultCallEvaluationConfig())
        setConfigFromRemote(false)
        setLoading(false)
      },
    )
    return () => unsub()
  }, [])

  const saveDimensions = useCallback(async (next: CallEvalDimension[]) => {
    if (!isFirebaseConfigured()) return
    const db = getFirestoreDb()
    if (!db) return
    const ref = doc(db, FS_COLLECTIONS.scoringAux, SCORING_AUX_CALL_SESSION_DOC_ID)
    const clean = mergeCallEvaluationConfig(next)
    await setDoc(ref, {
      version: CALL_EVAL_CONFIG_VERSION,
      dimensions: clean,
      updatedAt: Timestamp.now(),
    })
  }, [])

  const resetToBuiltin = useCallback(async () => {
    if (!isFirebaseConfigured()) return
    const db = getFirestoreDb()
    if (!db) return
    const ref = doc(db, FS_COLLECTIONS.scoringAux, SCORING_AUX_CALL_SESSION_DOC_ID)
    await deleteDoc(ref)
  }, [])

  const value = useMemo(
    () => ({
      dimensions,
      configFromRemote,
      loading,
      error,
      saveDimensions,
      resetToBuiltin,
    }),
    [dimensions, configFromRemote, loading, error, saveDimensions, resetToBuiltin],
  )

  return <CallSessionConfigContext.Provider value={value}>{children}</CallSessionConfigContext.Provider>
}

export function useCallSessionConfig(): Ctx {
  const ctx = useContext(CallSessionConfigContext)
  if (!ctx) throw new Error('useCallSessionConfig phải dùng trong CallSessionConfigProvider')
  return ctx
}

export function useCallSessionConfigOptional(): Ctx {
  return useContext(CallSessionConfigContext) ?? fallbackCtx()
}
