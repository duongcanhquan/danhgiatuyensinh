/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { collection, onSnapshot, query, Timestamp, where } from 'firebase/firestore'
import { normalizeUserRole } from '../auth/roleUtils'
import type { VietMyUserProfile } from '../types'
import { FS_COLLECTIONS } from '../types'
import { getFirestoreDb, isFirebaseConfigured } from '../services/firebase'
import { useAuth } from '../hooks/useAuth'
import { useOrg } from './OrgProvider'
import { DEFAULT_ORG_ID } from '../tenancy/orgConstants'
import { isPlatformSuperAdminRole } from '../tenancy/orgId'

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
          : DEFAULT_ORG_ID
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
      createdAt: (data.createdAt as Timestamp) ?? now,
      updatedAt: (data.updatedAt as Timestamp) ?? now,
    }
  } catch {
    return null
  }
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
    return (profile?.orgId?.trim() || DEFAULT_ORG_ID)
  }, [profile?.role, profile?.orgId, effectiveOrgId])

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
    const qy = query(collection(firestore, FS_COLLECTIONS.users), where('orgId', '==', scopeOrgId))
    const unsub = onSnapshot(
      qy,
      (snap) => {
        const next: VietMyUserProfile[] = []
        snap.forEach((d) => {
          const row = mapUser(d.id, d.data() as Record<string, unknown>)
          if (row) next.push(row)
        })
        setUsers(next)
        setLoading(false)
        setError(null)
      },
      (e) => {
        console.error(e)
        setUsers([])
        setLoading(false)
        setError(e instanceof Error ? e.message : 'Không đọc được danh bạ nhân sự.')
      },
    )
    return () => unsub()
  }, [configured, scopeOrgId])

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
