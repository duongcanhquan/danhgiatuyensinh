/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { deleteDoc, doc, onSnapshot, setDoc, Timestamp } from 'firebase/firestore'
import type { KpiV2ConfigPersisted } from '../types'
import { FS_COLLECTIONS } from '../types'
import { getFirestoreDb, isFirebaseConfigured } from '../services/firebase'
import { getDefaultKpiV2Config, KPI_V2_FIRESTORE_DOC_ID, mergeKpiV2Config } from '../utils/kpiV2Config'
import { DEFAULT_ORG_ID } from '../tenancy/orgConstants'
import { orgSettingsDocSegments } from '../tenancy/orgSettingsPaths'
import { useOrg } from './OrgProvider'

type Ctx = {
  config: KpiV2ConfigPersisted
  docExists: boolean
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
  const { effectiveOrgId } = useOrg()
  const orgKey = effectiveOrgId || DEFAULT_ORG_ID
  const [config, setConfig] = useState<KpiV2ConfigPersisted>(() => getDefaultKpiV2Config())
  const [docExists, setDocExists] = useState(false)
  const [configSource, setConfigSource] = useState<'orgSettings' | 'legacy' | 'none'>('none')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  /** Chỉ đọc scoringAux khi orgSettings chưa có doc. */
  const [needLegacy, setNeedLegacy] = useState(false)

  useEffect(() => {
    if (!isFirebaseConfigured()) {
      setConfig(getDefaultKpiV2Config())
      setDocExists(false)
      setConfigSource('none')
      setLoading(false)
      setNeedLegacy(false)
      return
    }
    const db = getFirestoreDb()
    if (!db) {
      setConfig(getDefaultKpiV2Config())
      setDocExists(false)
      setConfigSource('none')
      setLoading(false)
      setNeedLegacy(false)
      return
    }
    setLoading(true)
    setError(null)
    setNeedLegacy(false)

    const orgRef = doc(db, ...orgSettingsDocSegments(orgKey, KPI_V2_FIRESTORE_DOC_ID))
    const unsubOrg = onSnapshot(
      orgRef,
      (snap) => {
        if (snap.exists()) {
          setConfig(mergeKpiV2Config(snap.data() as Partial<KpiV2ConfigPersisted>))
          setDocExists(true)
          setConfigSource('orgSettings')
          setNeedLegacy(false)
          setLoading(false)
          return
        }
        setNeedLegacy(true)
      },
      (e) => {
        console.error(e)
        setError('Không đọc được cấu hình KPI (orgSettings).')
        setNeedLegacy(true)
      },
    )
    return () => unsubOrg()
  }, [orgKey])

  useEffect(() => {
    if (!needLegacy) return
    if (!isFirebaseConfigured()) return
    const db = getFirestoreDb()
    if (!db) return

    const legacyRef = doc(db, FS_COLLECTIONS.scoringAux, KPI_V2_FIRESTORE_DOC_ID)
    const unsubLegacy = onSnapshot(
      legacyRef,
      (snap) => {
        if (snap.exists()) {
          setConfig(mergeKpiV2Config(snap.data() as Partial<KpiV2ConfigPersisted>))
          setDocExists(true)
          setConfigSource('legacy')
        } else {
          setConfig(getDefaultKpiV2Config())
          setDocExists(false)
          setConfigSource('none')
        }
        setLoading(false)
      },
      (e) => {
        console.error(e)
        setError('Không đọc được cấu hình KPI v2.')
        setConfig(getDefaultKpiV2Config())
        setDocExists(false)
        setConfigSource('none')
        setLoading(false)
      },
    )
    return () => unsubLegacy()
  }, [needLegacy, orgKey])

  const saveConfig = useCallback(
    async (next: KpiV2ConfigPersisted) => {
      const db = getFirestoreDb()
      if (!db) throw new Error('Chưa kết nối Firestore.')
      const payload = { ...mergeKpiV2Config(next), updatedAt: Timestamp.now(), orgId: orgKey }
      const orgRef = doc(db, ...orgSettingsDocSegments(orgKey, KPI_V2_FIRESTORE_DOC_ID))
      const legacyRef = doc(db, FS_COLLECTIONS.scoringAux, KPI_V2_FIRESTORE_DOC_ID)
      await setDoc(orgRef, payload)
      // Mirror only for default org during Phase 1 transition
      if (orgKey === DEFAULT_ORG_ID) {
        await setDoc(legacyRef, payload)
      }
    },
    [orgKey],
  )

  const resetToBuiltin = useCallback(async () => {
    const db = getFirestoreDb()
    if (!db) throw new Error('Chưa kết nối Firestore.')
    const orgRef = doc(db, ...orgSettingsDocSegments(orgKey, KPI_V2_FIRESTORE_DOC_ID))
    const ops = [deleteDoc(orgRef)]
    if (orgKey === DEFAULT_ORG_ID) {
      ops.push(deleteDoc(doc(db, FS_COLLECTIONS.scoringAux, KPI_V2_FIRESTORE_DOC_ID)))
    }
    await Promise.allSettled(ops)
  }, [orgKey])

  const value = useMemo(
    (): Ctx => ({ config, docExists, configSource, loading, error, saveConfig, resetToBuiltin }),
    [config, docExists, configSource, loading, error, saveConfig, resetToBuiltin],
  )

  return <KpiV2ConfigContext.Provider value={value}>{children}</KpiV2ConfigContext.Provider>
}

export function useKpiV2Config(): Ctx {
  return useContext(KpiV2ConfigContext) ?? fallbackCtx()
}
