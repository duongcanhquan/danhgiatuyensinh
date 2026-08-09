/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  startTransition,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { collection, onSnapshot, query, Timestamp, where } from 'firebase/firestore'
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

    /**
     * Superadmin + VietMy: bỏ where(orgId) để lấy nhân sự cũ thiếu orgId (Rules isPlatform).
     * Admin trường / org khác: where(orgId==) — bắt buộc theo multi-tenant Rules.
     */
    const omitOrgFilter = isPlatform && shouldUseLegacyMissingOrgIdRead(scopeOrgId)
    const qy = omitOrgFilter
      ? query(collection(firestore, FS_COLLECTIONS.users))
      : query(collection(firestore, FS_COLLECTIONS.users), where('orgId', '==', scopeOrgId))

    const unsubIdle = scheduleIdleAttach(() =>
      onSnapshot(
        qy,
        (snap) => {
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
        },
        (e) => {
          console.error(e)
          setUsers([])
          setLoading(false)
          setError(e instanceof Error ? e.message : 'Không đọc được danh bạ nhân sự.')
        },
      ),
    )
    return () => unsubIdle()
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
