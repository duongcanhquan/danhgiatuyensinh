/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  startTransition,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { collection, onSnapshot, query, where, type DocumentData, type QuerySnapshot } from 'firebase/firestore'
import type { MasterCatalogDefinition, MasterDataEntry } from '../types'
import { FS_COLLECTIONS } from '../types'
import { getFirestoreDb, isFirebaseConfigured } from '../services/firebase'
import { processMasterDataDocs } from '../utils/masterDataRegistry'
import { scheduleIdleAttach } from '../utils/scheduleIdleAttach'
import { useAuth } from '../hooks/useAuth'
import { useOrg } from './OrgProvider'
import { DEFAULT_ORG_ID } from '../tenancy/orgConstants'
import { leadBelongsToOrg } from '../tenancy/orgQuery'
import { firestoreReadErrorMessage } from '../utils/firestoreReadError'

const MASTER_SNAPSHOT_DEBOUNCE_MS = 80

function snapshotSignatureFromDocs(docs: Array<{ id: string; data: Record<string, unknown> }>): string {
  return docs
    .map(({ id, data }) => {
      const u = data.updatedAt as { seconds?: number; nanoseconds?: number } | undefined
      const sec = u && typeof u.seconds === 'number' ? u.seconds : 0
      const nano = u && typeof u.nanoseconds === 'number' ? u.nanoseconds : 0
      const raw = data.entries
      const n = Array.isArray(raw) ? raw.length : 0
      const cats = data.catalogs
      const c = Array.isArray(cats) ? cats.length : 0
      return `${id}:${sec}.${nano}:${n}:${c}`
    })
    .sort()
    .join('|')
}

type MasterDataState = {
  byKind: Record<string, MasterDataEntry[]>
  catalogs: MasterCatalogDefinition[]
  loading: boolean
  error: string | null
  configured: boolean
}

const MasterDataContext = createContext<MasterDataState | null>(null)

export function MasterDataProvider({ children }: { children: ReactNode }) {
  const { profile } = useAuth()
  const { effectiveOrgId, isPlatformSuperAdmin } = useOrg()
  const orgKey = effectiveOrgId.trim() || DEFAULT_ORG_ID
  const [byKind, setByKind] = useState<Record<string, MasterDataEntry[]>>({})
  const [catalogs, setCatalogs] = useState<MasterCatalogDefinition[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const configured = useMemo(() => isFirebaseConfigured(), [])
  const lastSigRef = useRef<string | null>(null)
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingSnapRef = useRef<QuerySnapshot<DocumentData> | null>(null)
  const isFirstMasterSnapRef = useRef(true)

  useEffect(() => {
    if (!profile) {
      queueMicrotask(() => {
        setByKind({})
        setCatalogs([])
        setLoading(false)
        setError(null)
      })
      return
    }

    const firestore = getFirestoreDb()
    if (!firestore) {
      queueMicrotask(() => {
        setByKind({})
        setCatalogs([])
        setLoading(false)
        setError(configured ? null : 'Chưa cấu hình Firebase. Không thể tải master data.')
      })
      return
    }

    setLoading(true)
    setError(null)
    lastSigRef.current = null
    isFirstMasterSnapRef.current = true

    // School users: bắt buộc where(orgId==) — query cả collection → permission-denied dưới Rules multi-tenant.
    // Superadmin + VietMy: đọc không lọc để gồm doc legacy thiếu orgId.
    const allowLegacyUnscoped = isPlatformSuperAdmin && orgKey === DEFAULT_ORG_ID
    const q = allowLegacyUnscoped
      ? query(collection(firestore, FS_COLLECTIONS.masterData))
      : query(collection(firestore, FS_COLLECTIONS.masterData), where('orgId', '==', orgKey))

    const applySnapshot = (snap: QuerySnapshot<DocumentData>) => {
      let docs = snap.docs.map((d) => ({ id: d.id, data: d.data() as Record<string, unknown> }))
      if (allowLegacyUnscoped) {
        docs = docs.filter((d) => leadBelongsToOrg({ orgId: d.data.orgId as string | null | undefined }, orgKey))
      }
      const sig = snapshotSignatureFromDocs(docs)
      if (sig === lastSigRef.current) {
        setLoading(false)
        return
      }
      lastSigRef.current = sig
      const { catalogs: nextCatalogs, byKind: nextByKind } = processMasterDataDocs(docs)
      startTransition(() => {
        setCatalogs(nextCatalogs)
        setByKind(nextByKind)
        setLoading(false)
        setError(null)
      })
    }

    const unsubIdle = scheduleIdleAttach(() =>
      onSnapshot(
        q,
        (snap) => {
          pendingSnapRef.current = snap
          if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current)
          const flush = () => {
            debounceTimerRef.current = null
            const latest = pendingSnapRef.current
            pendingSnapRef.current = null
            if (latest) applySnapshot(latest)
          }
          if (isFirstMasterSnapRef.current) {
            isFirstMasterSnapRef.current = false
            flush()
            return
          }
          debounceTimerRef.current = setTimeout(flush, MASTER_SNAPSHOT_DEBOUNCE_MS)
        },
        (err) => {
          console.error(err)
          if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current)
          debounceTimerRef.current = null
          setError(firestoreReadErrorMessage(err, 'Không đọc được danh mục dữ liệu.'))
          setLoading(false)
        },
      ),
    )
    return () => {
      unsubIdle()
      isFirstMasterSnapRef.current = true
      lastSigRef.current = null
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current)
    }
  }, [configured, orgKey, isPlatformSuperAdmin, profile?.id])

  const value = useMemo(
    () => ({ byKind, catalogs, loading, error, configured }),
    [byKind, catalogs, loading, error, configured],
  )

  return <MasterDataContext.Provider value={value}>{children}</MasterDataContext.Provider>
}

export function useMasterDataState(): MasterDataState {
  const ctx = useContext(MasterDataContext)
  if (!ctx) {
    return {
      byKind: {},
      catalogs: [],
      loading: false,
      error: null,
      configured: false,
    }
  }
  return ctx
}
