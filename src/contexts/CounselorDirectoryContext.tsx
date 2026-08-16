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
import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  Timestamp,
  where,
  type DocumentData,
  type QuerySnapshot,
} from 'firebase/firestore'
import { canOwnFieldStaffTeam, normalizeUserRole } from '../auth/roleUtils'
import type { VietMyUserProfile } from '../types'
import { FS_COLLECTIONS } from '../types'
import { getFirestoreDb, isFirebaseConfigured } from '../services/firebase'
import { useAuth } from '../hooks/useAuth'
import { useOrg } from './OrgProvider'
import { DEFAULT_ORG_ID } from '../tenancy/orgConstants'
import { isPlatformSuperAdminRole } from '../tenancy/orgId'
import { leadBelongsToOrg, shouldUseLegacyMissingOrgIdRead } from '../tenancy/orgQuery'
import { scheduleIdleAttach } from '../utils/scheduleIdleAttach'

function mapUser(id: string, data: Record<string, unknown>): VietMyUserProfile | null {
  try {
    const now = Timestamp.now()
    const role = normalizeUserRole(String(data.role ?? 'counselor'))
    const rawOrg = data.orgId
    const orgId =
      role === 'super_admin'
        ? null
        : typeof rawOrg === 'string' && rawOrg.trim()
          ? rawOrg.trim()
          : // Legacy thiếu orgId — gắn mặc định VietMy ở client (đồng bộ leadBelongsToOrg).
            DEFAULT_ORG_ID
    return {
      id,
      email: String(data.email ?? ''),
      displayName: String(data.displayName ?? ''),
      role,
      orgId,
      departmentId: data.departmentId ? String(data.departmentId) : undefined,
      professionUnitId: data.professionUnitId ? String(data.professionUnitId) : undefined,
      managedMajorIds: Array.isArray(data.managedMajorIds) ? data.managedMajorIds.map(String) : undefined,
      managedCounselorIds: Array.isArray(data.managedCounselorIds)
        ? data.managedCounselorIds.map(String)
        : undefined,
      specialtyMajorIds: Array.isArray(data.specialtyMajorIds)
        ? data.specialtyMajorIds.map(String)
        : undefined,
      maxConcurrentLeads:
        data.maxConcurrentLeads !== undefined ? Number(data.maxConcurrentLeads) : undefined,
      isActive: data.isActive !== false,
      allowLlmAndAiTasks: data.allowLlmAndAiTasks === true ? true : undefined,
      showOnPublicRegistrationPortal: data.showOnPublicRegistrationPortal === true ? true : undefined,
      omicallSipUser: data.omicallSipUser ? String(data.omicallSipUser) : undefined,
      omicallSipPassword: data.omicallSipPassword ? String(data.omicallSipPassword) : undefined,
      omicallAgentId: data.omicallAgentId ? String(data.omicallAgentId) : undefined,
      omicallOutboundNumber: data.omicallOutboundNumber
        ? String(data.omicallOutboundNumber)
        : undefined,
      extraPermissions: Array.isArray(data.extraPermissions)
        ? (data.extraPermissions as VietMyUserProfile['extraPermissions'])
        : undefined,
      deniedPermissions: Array.isArray(data.deniedPermissions)
        ? (data.deniedPermissions as VietMyUserProfile['deniedPermissions'])
        : undefined,
      createdAt: (data.createdAt as Timestamp) ?? now,
      updatedAt: (data.updatedAt as Timestamp) ?? now,
    }
  } catch {
    return null
  }
}

/** Doc Firestore thuộc trường đang xem (kể cả thiếu orgId trên VietMy). */
function userDocBelongsToOrg(data: Record<string, unknown>, scopeOrgId: string): boolean {
  const role = normalizeUserRole(String(data.role ?? 'counselor'))
  // Super admin nền tảng: luôn hiện khi đang xem VietMy (danh sách vận hành).
  if (role === 'super_admin') {
    return shouldUseLegacyMissingOrgIdRead(scopeOrgId)
  }
  const raw = data.orgId
  const orgId = typeof raw === 'string' ? raw.trim() : ''
  return leadBelongsToOrg({ orgId: orgId || null }, scopeOrgId)
}

const DIRECTORY_SNAPSHOT_DEBOUNCE_MS = 100

type CounselorDirectoryState = {
  users: VietMyUserProfile[]
  counselors: VietMyUserProfile[]
  fieldStaff: VietMyUserProfile[]
  loading: boolean
  error: string | null
}

const CounselorDirectoryContext = createContext<CounselorDirectoryState | null>(null)

export function CounselorDirectoryProvider({ children }: { children: ReactNode }) {
  const { profile } = useAuth()
  const { effectiveOrgId } = useOrg()
  const [users, setUsers] = useState<VietMyUserProfile[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const configured = useMemo(() => isFirebaseConfigured(), [])
  const lastSigRef = useRef<string | null>(null)
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingSnapRef = useRef<QuerySnapshot<DocumentData> | null>(null)
  const isFirstSnapRef = useRef(true)

  const scopeOrgId = useMemo(() => {
    if (isPlatformSuperAdminRole(profile?.role, profile?.orgId ?? null)) {
      return effectiveOrgId || DEFAULT_ORG_ID
    }
    return profile?.orgId?.trim() || DEFAULT_ORG_ID
  }, [profile?.role, profile?.orgId, effectiveOrgId])

  const rosterIdsKey = useMemo(() => {
    if (!profile || !canOwnFieldStaffTeam(profile.role)) return ''
    return [...new Set((profile.managedCounselorIds ?? []).map(String).filter(Boolean))].sort().join(',')
  }, [profile])

  const counselors = useMemo(
    () => users.filter((u) => u.role === 'counselor' && u.isActive),
    [users],
  )

  const fieldStaff = useMemo(
    () => users.filter((u) => (u.role === 'counselor' || u.role === 'ctv') && u.isActive),
    [users],
  )

  useEffect(() => {
    // Chưa đăng nhập xong — không mở listener users (tránh chậm + permission-denied trên /login).
    if (!profile) {
      queueMicrotask(() => {
        setUsers([])
        setLoading(false)
        setError(null)
      })
      return
    }

    const firestore = getFirestoreDb()
    if (!firestore) {
      queueMicrotask(() => {
        setUsers([])
        setLoading(false)
        setError(configured ? null : 'Chưa cấu hình Firebase — không đọc users.')
      })
      return
    }

    setLoading(true)
    lastSigRef.current = null
    isFirstSnapRef.current = true

    /**
     * Live theo orgId.
     * Superadmin + VietMy: bổ sung users thiếu orgId (full scan — chỉ nền tảng mới đọc được mọi doc).
     * Trưởng nhóm / quản lý trường: hydrate từng UID trong managedCounselorIds nếu chưa có trong danh bạ.
     */
    const isPlatform = isPlatformSuperAdminRole(profile?.role, profile?.orgId ?? null)
    const needLegacyFill = isPlatform && shouldUseLegacyMissingOrgIdRead(scopeOrgId)
    const qy = query(collection(firestore, FS_COLLECTIONS.users), where('orgId', '==', scopeOrgId))
    const scopedByIdRef = { current: new Map<string, VietMyUserProfile>() }
    const legacyByIdRef = { current: new Map<string, VietMyUserProfile>() }
    const rosterByIdRef = { current: new Map<string, VietMyUserProfile>() }
    let cancelled = false
    let legacyReady = !needLegacyFill
    let scopedReady = false
    let legacyTimer: ReturnType<typeof setInterval> | null = null
    let legacyInFlight = false
    let rosterInFlight = false

    const rosterUidList = rosterIdsKey ? rosterIdsKey.split(',').filter(Boolean) : []

    const publishMerged = (opts?: { fromLegacyError?: string | null }) => {
      if (cancelled) return
      const merged = new Map<string, VietMyUserProfile>()
      for (const [id, row] of scopedByIdRef.current) merged.set(id, row)
      for (const [id, row] of legacyByIdRef.current) {
        if (!merged.has(id)) merged.set(id, row)
      }
      for (const [id, row] of rosterByIdRef.current) {
        if (!merged.has(id)) merged.set(id, row)
      }
      const next = [...merged.values()]
      const sig = next
        .map(
          (u) =>
            `${u.id}:${u.updatedAt?.seconds ?? 0}:${u.isActive ? 1 : 0}:${u.role}:${(u.managedCounselorIds ?? []).join(',')}`,
        )
        .sort()
        .join('|')
      const ready = scopedReady && legacyReady
      if (sig === lastSigRef.current && ready) {
        setLoading(false)
        return
      }
      lastSigRef.current = sig
      startTransition(() => {
        if (cancelled) return
        setUsers(next)
        if (ready) {
          setLoading(false)
          setError(opts?.fromLegacyError ?? null)
        }
      })
    }

    const applyScopedSnapshot = (snap: QuerySnapshot<DocumentData>) => {
      if (cancelled) return
      const next = new Map<string, VietMyUserProfile>()
      snap.forEach((d) => {
        const row = mapUser(d.id, d.data() as Record<string, unknown>)
        if (row) next.set(d.id, row)
      })
      scopedByIdRef.current = next
      scopedReady = true
      publishMerged()
      void hydrateMissingRosterMembers()
    }

    const hydrateMissingRosterMembers = async () => {
      if (!rosterUidList.length || rosterInFlight || cancelled) return
      const missing = rosterUidList.filter(
        (id) =>
          !scopedByIdRef.current.has(id) &&
          !legacyByIdRef.current.has(id) &&
          !rosterByIdRef.current.has(id),
      )
      if (!missing.length) return
      rosterInFlight = true
      try {
        const next = new Map(rosterByIdRef.current)
        await Promise.all(
          missing.map(async (uid) => {
            try {
              const snap = await getDoc(doc(firestore, FS_COLLECTIONS.users, uid))
              if (!snap.exists() || cancelled) return
              const raw = snap.data() as Record<string, unknown>
              // Roster TL: vẫn hydrate nếu cùng trường (hoặc legacy thiếu orgId trên VietMy).
              if (!userDocBelongsToOrg(raw, scopeOrgId)) return
              const row = mapUser(snap.id, raw)
              if (row) next.set(row.id, row)
            } catch (e) {
              console.warn('[CounselorDirectory] roster hydrate', uid, e)
            }
          }),
        )
        if (cancelled) return
        rosterByIdRef.current = next
        publishMerged()
      } finally {
        rosterInFlight = false
      }
    }

    const fillLegacyMissingOrg = async () => {
      if (!needLegacyFill || legacyInFlight || cancelled) return
      legacyInFlight = true
      try {
        const snap = await getDocs(collection(firestore, FS_COLLECTIONS.users))
        if (cancelled) return
        const next = new Map<string, VietMyUserProfile>()
        snap.forEach((d) => {
          const raw = d.data() as Record<string, unknown>
          const oid = typeof raw.orgId === 'string' ? raw.orgId.trim() : ''
          if (oid) return
          if (!userDocBelongsToOrg(raw, scopeOrgId)) return
          const row = mapUser(d.id, raw)
          if (row) next.set(d.id, row)
        })
        legacyByIdRef.current = next
        legacyReady = true
        publishMerged()
        void hydrateMissingRosterMembers()
      } catch (e) {
        console.error(e)
        if (cancelled) return
        legacyReady = true
        publishMerged({
          fromLegacyError:
            e instanceof Error ? e.message : 'Không bổ sung được nhân sự thiếu orgId (legacy).',
        })
      } finally {
        legacyInFlight = false
      }
    }

    const unsubIdle = scheduleIdleAttach(() =>
      onSnapshot(
        qy,
        (snap) => {
          if (cancelled) return
          pendingSnapRef.current = snap
          if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current)
          const flush = () => {
            debounceTimerRef.current = null
            const latest = pendingSnapRef.current
            pendingSnapRef.current = null
            if (latest) applyScopedSnapshot(latest)
          }
          if (isFirstSnapRef.current) {
            isFirstSnapRef.current = false
            flush()
            if (needLegacyFill) void fillLegacyMissingOrg()
            else void hydrateMissingRosterMembers()
            return
          }
          debounceTimerRef.current = setTimeout(flush, DIRECTORY_SNAPSHOT_DEBOUNCE_MS)
        },
        (e) => {
          if (cancelled) return
          console.error(e)
          if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current)
          debounceTimerRef.current = null
          setUsers([])
          setLoading(false)
          setError(e instanceof Error ? e.message : 'Không đọc được danh bạ nhân sự.')
        },
      ),
    )

    if (needLegacyFill) {
      legacyTimer = setInterval(() => {
        void fillLegacyMissingOrg()
      }, 10 * 60_000)
    }

    return () => {
      cancelled = true
      unsubIdle()
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current)
      if (legacyTimer) clearInterval(legacyTimer)
      pendingSnapRef.current = null
    }
  }, [configured, scopeOrgId, rosterIdsKey, profile?.role, profile?.orgId])

  const value = useMemo(
    (): CounselorDirectoryState => ({ users, counselors, fieldStaff, loading, error }),
    [users, counselors, fieldStaff, loading, error],
  )

  return <CounselorDirectoryContext.Provider value={value}>{children}</CounselorDirectoryContext.Provider>
}

export function useCounselorDirectoryState(): CounselorDirectoryState {
  const ctx = useContext(CounselorDirectoryContext)
  if (!ctx) {
    // Panel OMICall / hook KPI có thể render ngoài Layout — không crash; số liệu nhóm tạm rỗng.
    return { users: [], counselors: [], fieldStaff: [], loading: false, error: null }
  }
  return ctx
}
