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
import { collection, onSnapshot, query, Timestamp, where, type DocumentData, type QuerySnapshot } from 'firebase/firestore'
import { normalizeUserRole } from '../auth/roleUtils'
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

function directorySnapshotSignature(snap: QuerySnapshot<DocumentData>, omitOrgFilter: boolean, scopeOrgId: string): string {
  const parts: string[] = []
  snap.forEach((d) => {
    const raw = d.data() as Record<string, unknown>
    if (omitOrgFilter && !userDocBelongsToOrg(raw, scopeOrgId)) return
    const u = raw.updatedAt as { seconds?: number; nanoseconds?: number } | undefined
    const sec = u && typeof u.seconds === 'number' ? u.seconds : 0
    const nano = u && typeof u.nanoseconds === 'number' ? u.nanoseconds : 0
    const active = raw.isActive === false ? '0' : '1'
    parts.push(`${d.id}:${sec}.${nano}:${active}:${String(raw.role ?? '')}`)
  })
  parts.sort()
  return parts.join('|')
}

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

  const isPlatform = isPlatformSuperAdminRole(profile?.role, profile?.orgId ?? null)

  const counselors = useMemo(
    () => users.filter((u) => u.role === 'counselor' && u.isActive),
    [users],
  )

  const fieldStaff = useMemo(
    () => users.filter((u) => (u.role === 'counselor' || u.role === 'ctv') && u.isActive),
    [users],
  )

  useEffect(() => {
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
     * Superadmin + VietMy: bỏ where(orgId) để lấy nhân sự cũ thiếu orgId (Rules isPlatform).
     * Admin trường / org khác: where(orgId==) — bắt buộc theo multi-tenant Rules.
     */
    const omitOrgFilter = isPlatform && shouldUseLegacyMissingOrgIdRead(scopeOrgId)
    const qy = omitOrgFilter
      ? query(collection(firestore, FS_COLLECTIONS.users))
      : query(collection(firestore, FS_COLLECTIONS.users), where('orgId', '==', scopeOrgId))

    const applySnapshot = (snap: QuerySnapshot<DocumentData>) => {
      const sig = directorySnapshotSignature(snap, omitOrgFilter, scopeOrgId)
      if (sig === lastSigRef.current) {
        setLoading(false)
        return
      }
      lastSigRef.current = sig
      const next: VietMyUserProfile[] = []
      snap.forEach((d) => {
        const raw = d.data() as Record<string, unknown>
        if (!omitOrgFilter || userDocBelongsToOrg(raw, scopeOrgId)) {
          const row = mapUser(d.id, raw)
          if (row) next.push(row)
        }
      })
      startTransition(() => {
        setUsers(next)
        setLoading(false)
        setError(null)
      })
    }

    const unsubIdle = scheduleIdleAttach(() =>
      onSnapshot(
        qy,
        (snap) => {
          pendingSnapRef.current = snap
          if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current)
          const flush = () => {
            debounceTimerRef.current = null
            const latest = pendingSnapRef.current
            pendingSnapRef.current = null
            if (latest) applySnapshot(latest)
          }
          if (isFirstSnapRef.current) {
            isFirstSnapRef.current = false
            flush()
            return
          }
          debounceTimerRef.current = setTimeout(flush, DIRECTORY_SNAPSHOT_DEBOUNCE_MS)
        },
        (e) => {
          console.error(e)
          if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current)
          debounceTimerRef.current = null
          setUsers([])
          setLoading(false)
          setError(e instanceof Error ? e.message : 'Không đọc được danh bạ nhân sự.')
        },
      ),
    )
    return () => {
      unsubIdle()
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current)
      pendingSnapRef.current = null
    }
  }, [configured, scopeOrgId, isPlatform])

  const value = useMemo(
    (): CounselorDirectoryState => ({ users, counselors, fieldStaff, loading, error }),
    [users, counselors, fieldStaff, loading, error],
  )

  return <CounselorDirectoryContext.Provider value={value}>{children}</CounselorDirectoryContext.Provider>
}

export function useCounselorDirectoryState(): CounselorDirectoryState {
  const ctx = useContext(CounselorDirectoryContext)
  if (!ctx) {
    throw new Error('useCounselorDirectory cần CounselorDirectoryProvider.')
  }
  return ctx
}
