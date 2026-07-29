import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { deleteDoc, doc, onSnapshot, setDoc, Timestamp } from 'firebase/firestore'
import type { KpiV2ConfigPersisted } from '../types'
import { FS_COLLECTIONS } from '../types'
import { getFirestoreDb, isFirebaseConfigured } from '../services/firebase'
import { getDefaultKpiV2Config, KPI_V2_FIRESTORE_DOC_ID, mergeKpiV2Config } from '../utils/kpiV2Config'
import { DEFAULT_ORG_ID } from '../tenancy/orgConstants'
import { orgSettingsDocSegments } from '../tenancy/orgSettingsPaths'
import { pickOrgSettingsSnapshot } from '../tenancy/dualReadOrgSettings'

type Ctx = {
  config: KpiV2ConfigPersisted
  docExists: boolean
  /** Phase 0: orgSettings | legacy scoringAux | none */
  configSource: 'orgSettings' | 'legacy' | 'none'
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
    configSource: 'none',
    loading: false,
    error: null,
    saveConfig: async () => {},
    resetToBuiltin: async () => {},
  }
}

export function KpiV2ConfigProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<KpiV2ConfigPersisted>(() => getDefaultKpiV2Config())
  const [docExists, setDocExists] = useState(false)
  const [configSource, setConfigSource] = useState<'orgSettings' | 'legacy' | 'none'>('none')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [orgSnap, setOrgSnap] = useState<{ exists: boolean; data: Partial<KpiV2ConfigPersisted> | null }>({
    exists: false,
    data: null,
  })
  const [legacySnap, setLegacySnap] = useState<{ exists: boolean; data: Partial<KpiV2ConfigPersisted> | null }>({
    exists: false,
    data: null,
  })
  const [orgReady, setOrgReady] = useState(false)
  const [legacyReady, setLegacyReady] = useState(false)

  useEffect(() => {
    if (!isFirebaseConfigured()) {
      setConfig(getDefaultKpiV2Config())
      setDocExists(false)
      setConfigSource('none')
      setLoading(false)
      return
    }
    const db = getFirestoreDb()
    if (!db) {
      setConfig(getDefaultKpiV2Config())
      setDocExists(false)
      setConfigSource('none')
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    setOrgReady(false)
    setLegacyReady(false)

    const orgRef = doc(db, ...orgSettingsDocSegments(DEFAULT_ORG_ID, KPI_V2_FIRESTORE_DOC_ID))
    const legacyRef = doc(db, FS_COLLECTIONS.scoringAux, KPI_V2_FIRESTORE_DOC_ID)

    const unsubOrg = onSnapshot(
      orgRef,
      (snap) => {
        setOrgSnap({
          exists: snap.exists(),
          data: snap.exists() ? (snap.data() as Partial<KpiV2ConfigPersisted>) : null,
        })
        setOrgReady(true)
      },
      (e) => {
        console.error(e)
        setError('Không đọc được cấu hình KPI (orgSettings).')
        setOrgSnap({ exists: false, data: null })
        setOrgReady(true)
      },
    )
    const unsubLegacy = onSnapshot(
      legacyRef,
      (snap) => {
        setLegacySnap({
          exists: snap.exists(),
          data: snap.exists() ? (snap.data() as Partial<KpiV2ConfigPersisted>) : null,
        })
        setLegacyReady(true)
      },
      (e) => {
        console.error(e)
        setError('Không đọc được cấu hình KPI v2.')
        setLegacySnap({ exists: false, data: null })
        setLegacyReady(true)
      },
    )
    return () => {
      unsubOrg()
      unsubLegacy()
    }
  }, [])

  useEffect(() => {
    if (!orgReady || !legacyReady) return
    const picked = pickOrgSettingsSnapshot({
      orgSettingsExists: orgSnap.exists,
      orgSettingsData: orgSnap.data,
      legacyExists: legacySnap.exists,
      legacyData: legacySnap.data,
    })
    setConfigSource(picked.source)
    setDocExists(picked.source !== 'none')
    setConfig(mergeKpiV2Config(picked.data))
    setLoading(false)
  }, [orgReady, legacyReady, orgSnap, legacySnap])

  const saveConfig = useCallback(async (next: KpiV2ConfigPersisted) => {
    const db = getFirestoreDb()
    if (!db) throw new Error('Chưa kết nối Firestore.')
    const payload = { ...mergeKpiV2Config(next), updatedAt: Timestamp.now(), orgId: DEFAULT_ORG_ID }
    const orgRef = doc(db, ...orgSettingsDocSegments(DEFAULT_ORG_ID, KPI_V2_FIRESTORE_DOC_ID))
    const legacyRef = doc(db, FS_COLLECTIONS.scoringAux, KPI_V2_FIRESTORE_DOC_ID)
    // Phase 0: write orgSettings primary + mirror legacy for old readers
    await setDoc(orgRef, payload)
    await setDoc(legacyRef, payload)
  }, [])

  const resetToBuiltin = useCallback(async () => {
    const db = getFirestoreDb()
    if (!db) throw new Error('Chưa kết nối Firestore.')
    const orgRef = doc(db, ...orgSettingsDocSegments(DEFAULT_ORG_ID, KPI_V2_FIRESTORE_DOC_ID))
    const legacyRef = doc(db, FS_COLLECTIONS.scoringAux, KPI_V2_FIRESTORE_DOC_ID)
    await Promise.allSettled([deleteDoc(orgRef), deleteDoc(legacyRef)])
  }, [])

  const value = useMemo(
    (): Ctx => ({ config, docExists, configSource, loading, error, saveConfig, resetToBuiltin }),
    [config, docExists, configSource, loading, error, saveConfig, resetToBuiltin],
  )

  return <KpiV2ConfigContext.Provider value={value}>{children}</KpiV2ConfigContext.Provider>
}

export function useKpiV2Config(): Ctx {
  return useContext(KpiV2ConfigContext) ?? fallbackCtx()
}
