import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { deleteDoc, doc, onSnapshot, setDoc, Timestamp } from 'firebase/firestore'
import type { KpiV2ConfigPersisted } from '../types'
import { FS_COLLECTIONS } from '../types'
import { getFirestoreDb, isFirebaseConfigured } from '../services/firebase'
import { getDefaultKpiV2Config, KPI_V2_FIRESTORE_DOC_ID, mergeKpiV2Config } from '../utils/kpiV2Config'

type Ctx = {
  config: KpiV2ConfigPersisted
  docExists: boolean
  loading: boolean
  error: string | null
  saveConfig: (next: KpiV2ConfigPersisted) => Promise<void>
  resetToBuiltin: () => Promise<void>
}

const KpiV2ConfigContext = createContext<Ctx | null>(null)

function fallbackCtx(): Ctx {
  const config = getDefaultKpiV2Config()
  return {
    config,
    docExists: false,
    loading: false,
    error: null,
    saveConfig: async () => {},
    resetToBuiltin: async () => {},
  }
}

export function KpiV2ConfigProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<KpiV2ConfigPersisted>(() => getDefaultKpiV2Config())
  const [docExists, setDocExists] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!isFirebaseConfigured()) {
      setConfig(getDefaultKpiV2Config())
      setDocExists(false)
      setLoading(false)
      return
    }
    const db = getFirestoreDb()
    if (!db) {
      setConfig(getDefaultKpiV2Config())
      setDocExists(false)
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    const ref = doc(db, FS_COLLECTIONS.scoringAux, KPI_V2_FIRESTORE_DOC_ID)
    const unsub = onSnapshot(
      ref,
      (snap) => {
        setDocExists(snap.exists())
        setConfig(mergeKpiV2Config(snap.exists() ? (snap.data() as Partial<KpiV2ConfigPersisted>) : null))
        setLoading(false)
      },
      (e) => {
        console.error(e)
        setError('Không đọc được cấu hình KPI v2.')
        setConfig(getDefaultKpiV2Config())
        setLoading(false)
      },
    )
    return () => unsub()
  }, [])

  const saveConfig = useCallback(async (next: KpiV2ConfigPersisted) => {
    const db = getFirestoreDb()
    if (!db) throw new Error('Chưa kết nối Firestore.')
    const payload = { ...mergeKpiV2Config(next), updatedAt: Timestamp.now() }
    await setDoc(doc(db, FS_COLLECTIONS.scoringAux, KPI_V2_FIRESTORE_DOC_ID), payload)
  }, [])

  const resetToBuiltin = useCallback(async () => {
    const db = getFirestoreDb()
    if (!db) throw new Error('Chưa kết nối Firestore.')
    await deleteDoc(doc(db, FS_COLLECTIONS.scoringAux, KPI_V2_FIRESTORE_DOC_ID))
  }, [])

  const value = useMemo(
    (): Ctx => ({ config, docExists, loading, error, saveConfig, resetToBuiltin }),
    [config, docExists, loading, error, saveConfig, resetToBuiltin],
  )

  return <KpiV2ConfigContext.Provider value={value}>{children}</KpiV2ConfigContext.Provider>
}

export function useKpiV2Config(): Ctx {
  return useContext(KpiV2ConfigContext) ?? fallbackCtx()
}
