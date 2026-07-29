/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { collection, onSnapshot, query, where } from 'firebase/firestore'
import { useAuth } from '../hooks/useAuth'
import { FS_COLLECTIONS, type Organization } from '../types'
import { getFirestoreDb, isFirebaseConfigured } from '../services/firebase'
import { DEFAULT_ORG_ID } from '../tenancy/orgConstants'
import { resolveEffectiveOrgId } from '../tenancy/effectiveOrgId'
import { isPlatformSuperAdminRole } from '../tenancy/orgId'
import { readStoredActiveOrgId, writeStoredActiveOrgId } from '../tenancy/activeOrgStorage'
import { loadOrgN8nWebhooks } from '../utils/n8nWebhooksConfig'
import { loadOrgIntegrationHub } from '../integrations/orgIntegrationHub'
import { loadInviteDocumentsConfig } from '../utils/inviteDocumentsConfig'
import { loadReceiptStorageConfig } from '../utils/receiptStorageConfig'
import { loadRoleCapabilities } from '../utils/roleCapabilitiesConfig'
import { loadCommsAutomationConfig } from '../utils/commsAutomationConfig'

export type OrgOption = { id: string; name: string; slug: string; status: 'active' | 'suspended' }

type OrgContextValue = {
  effectiveOrgId: string
  activeOrgId: string | null
  setActiveOrgId: (orgId: string) => void
  isPlatformSuperAdmin: boolean
  organizations: OrgOption[]
  organizationsLoading: boolean
  currentOrgLabel: string
}

const OrgContext = createContext<OrgContextValue | null>(null)

const FALLBACK_ORGS: OrgOption[] = [
  { id: DEFAULT_ORG_ID, name: 'Cao đẳng Việt Mỹ', slug: DEFAULT_ORG_ID, status: 'active' },
]

export function OrgProvider({ children }: { children: ReactNode }) {
  const { profile } = useAuth()
  const [activeOrgId, setActiveOrgIdState] = useState<string | null>(() => readStoredActiveOrgId())
  const [organizations, setOrganizations] = useState<OrgOption[]>(FALLBACK_ORGS)
  const [organizationsLoading, setOrganizationsLoading] = useState(false)

  const isPlatformSuperAdmin = isPlatformSuperAdminRole(profile?.role, profile?.orgId ?? null)

  const setActiveOrgId = useCallback((orgId: string) => {
    const next = orgId.trim()
    setActiveOrgIdState(next || null)
    writeStoredActiveOrgId(next)
  }, [])

  const effectiveOrgId = useMemo(
    () =>
      resolveEffectiveOrgId({
        role: profile?.role,
        profileOrgId: profile?.orgId,
        activeOrgId,
      }),
    [profile?.role, profile?.orgId, activeOrgId],
  )

  useEffect(() => {
    if (!isPlatformSuperAdmin) return
    if (!isFirebaseConfigured()) return
    const db = getFirestoreDb()
    if (!db) return
    setOrganizationsLoading(true)
    const qy = query(collection(db, FS_COLLECTIONS.organizations), where('status', '==', 'active'))
    const unsub = onSnapshot(
      qy,
      (snap) => {
        const rows: OrgOption[] = snap.docs.map((d) => {
          const data = d.data() as Partial<Organization>
          return {
            id: d.id,
            name: String(data.name ?? d.id),
            slug: String(data.slug ?? d.id),
            status: data.status === 'suspended' ? 'suspended' : 'active',
          }
        })
        setOrganizations(rows.length ? rows : FALLBACK_ORGS)
        setOrganizationsLoading(false)
        // Nếu activeOrgId lưu local không còn trong danh sách → về VietMy
        setActiveOrgIdState((prev) => {
          if (!prev) return prev
          const ok = rows.some((r) => r.id === prev) || prev === DEFAULT_ORG_ID
          if (ok) return prev
          writeStoredActiveOrgId(DEFAULT_ORG_ID)
          return DEFAULT_ORG_ID
        })
      },
      () => {
        setOrganizations(FALLBACK_ORGS)
        setOrganizationsLoading(false)
      },
    )
    return () => unsub()
  }, [isPlatformSuperAdmin])

  /** Nạp webhook n8n + hub + giấy mời + chứng từ + email/tin nhắn theo trường đang chọn. */
  useEffect(() => {
    if (!profile) return
    if (!isFirebaseConfigured()) return
    const db = getFirestoreDb()
    if (!db) return
    void loadOrgN8nWebhooks(db, effectiveOrgId)
    void loadOrgIntegrationHub(db, effectiveOrgId)
    void loadInviteDocumentsConfig(db, effectiveOrgId)
    void loadReceiptStorageConfig(db, effectiveOrgId)
    void loadRoleCapabilities(db, effectiveOrgId)
    void loadCommsAutomationConfig(db, effectiveOrgId)
  }, [profile, effectiveOrgId])

  const currentOrgLabel = useMemo(() => {
    const hit = organizations.find((o) => o.id === effectiveOrgId)
    return hit?.name ?? effectiveOrgId
  }, [organizations, effectiveOrgId])

  const value = useMemo(
    (): OrgContextValue => ({
      effectiveOrgId,
      activeOrgId,
      setActiveOrgId,
      isPlatformSuperAdmin,
      organizations,
      organizationsLoading,
      currentOrgLabel,
    }),
    [
      effectiveOrgId,
      activeOrgId,
      setActiveOrgId,
      isPlatformSuperAdmin,
      organizations,
      organizationsLoading,
      currentOrgLabel,
    ],
  )

  return <OrgContext.Provider value={value}>{children}</OrgContext.Provider>
}

export function useOrg(): OrgContextValue {
  const ctx = useContext(OrgContext)
  if (!ctx) {
    return {
      effectiveOrgId: DEFAULT_ORG_ID,
      activeOrgId: null,
      setActiveOrgId: () => {},
      isPlatformSuperAdmin: false,
      organizations: FALLBACK_ORGS,
      organizationsLoading: false,
      currentOrgLabel: 'Cao đẳng Việt Mỹ',
    }
  }
  return ctx
}
