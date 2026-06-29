import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { doc, onSnapshot } from 'firebase/firestore'
import type { AIIntegrationConfig } from '../types'
import { FS_COLLECTIONS, SCORING_AUX_ORG_AI_DOC_ID } from '../types'
import { getFirestoreDb, isFirebaseConfigured } from '../services/firebase'
import {
  clearOrgAiIntegration,
  parseOrgAiIntegrationDoc,
  saveOrgAiIntegration,
} from '../services/orgAiIntegration'
import { setOrgAiIntegrationCache } from '../utils/aiEngine'
import { useAuth } from '../hooks/useAuth'

type Ctx = {
  orgConfig: AIIntegrationConfig | null
  docExists: boolean
  loading: boolean
  error: string | null
  saveOrgConfig: (config: AIIntegrationConfig) => Promise<void>
  clearOrgConfig: () => Promise<void>
}

const OrgAiIntegrationContext = createContext<Ctx | null>(null)

function fallbackCtx(): Ctx {
  return {
    orgConfig: null,
    docExists: false,
    loading: false,
    error: null,
    saveOrgConfig: async () => {},
    clearOrgConfig: async () => {},
  }
}

export function OrgAiIntegrationProvider({ children }: { children: ReactNode }) {
  const { profile } = useAuth()
  const [orgConfig, setOrgConfig] = useState<AIIntegrationConfig | null>(null)
  const [docExists, setDocExists] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!isFirebaseConfigured()) {
      setOrgAiIntegrationCache(null)
      setOrgConfig(null)
      setDocExists(false)
      setLoading(false)
      return
    }
    const db = getFirestoreDb()
    if (!db) {
      setOrgAiIntegrationCache(null)
      setOrgConfig(null)
      setDocExists(false)
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    const ref = doc(db, FS_COLLECTIONS.scoringAux, SCORING_AUX_ORG_AI_DOC_ID)
    const unsub = onSnapshot(
      ref,
      (snap) => {
        const exists = snap.exists()
        setDocExists(exists)
        const parsed = exists ? parseOrgAiIntegrationDoc(snap.data() as Record<string, unknown>) : null
        setOrgConfig(parsed)
        setOrgAiIntegrationCache(parsed)
        setLoading(false)
      },
      (e) => {
        console.error(e)
        setError('Không đọc được cấu hình AI toàn trường (scoringAux/orgAiIntegration).')
        setOrgAiIntegrationCache(null)
        setOrgConfig(null)
        setLoading(false)
      },
    )
    return () => unsub()
  }, [])

  const saveOrgConfig = useCallback(
    async (config: AIIntegrationConfig) => {
      const db = getFirestoreDb()
      const uid = profile?.id
      if (!db || !uid) throw new Error('Chưa đăng nhập hoặc chưa kết nối Firestore.')
      await saveOrgAiIntegration(db, config, uid)
    },
    [profile?.id],
  )

  const clearOrgConfig = useCallback(async () => {
    const db = getFirestoreDb()
    if (!db) throw new Error('Chưa kết nối Firestore.')
    await clearOrgAiIntegration(db)
  }, [])

  const value = useMemo<Ctx>(
    () => ({
      orgConfig,
      docExists,
      loading,
      error,
      saveOrgConfig,
      clearOrgConfig,
    }),
    [orgConfig, docExists, loading, error, saveOrgConfig, clearOrgConfig],
  )

  return <OrgAiIntegrationContext.Provider value={value}>{children}</OrgAiIntegrationContext.Provider>
}

export function useOrgAiIntegration(): Ctx {
  return useContext(OrgAiIntegrationContext) ?? fallbackCtx()
}
