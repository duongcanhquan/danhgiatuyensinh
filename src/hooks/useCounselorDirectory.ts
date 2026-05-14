import { useEffect, useMemo, useState } from 'react'
import { collection, onSnapshot, query, Timestamp } from 'firebase/firestore'
import type { VietMyUserProfile } from '../types'
import { FS_COLLECTIONS, USER_ROLES } from '../types'
import { getFirestoreDb, isFirebaseConfigured } from '../services/firebase'

function mapUser(id: string, data: Record<string, unknown>): VietMyUserProfile | null {
  try {
    const now = Timestamp.now()
    const roleRaw = String(data.role ?? 'counselor')
    const allowed = USER_ROLES as readonly string[]
    const role = allowed.includes(roleRaw)
      ? (roleRaw as VietMyUserProfile['role'])
      : 'counselor'
    return {
      id,
      email: String(data.email ?? ''),
      displayName: String(data.displayName ?? ''),
      role,
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

/** Danh bạ `users` — phục vụ routing & dashboard trưởng ngành. */
export function useCounselorDirectory() {
  const [users, setUsers] = useState<VietMyUserProfile[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const configured = useMemo(() => isFirebaseConfigured(), [])

  const counselors = useMemo(
    () => users.filter((u) => u.role === 'counselor' && u.isActive),
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

    const q = query(collection(firestore, FS_COLLECTIONS.users))
    const unsub = onSnapshot(
      q,
      (snap) => {
        const next: VietMyUserProfile[] = []
        snap.forEach((d) => {
          const u = mapUser(d.id, d.data() as Record<string, unknown>)
          if (u) next.push(u)
        })
        setUsers(next)
        setLoading(false)
        setError(null)
      },
      (err) => {
        console.error(err)
        setError(err.message || 'Lỗi đọc users')
        setLoading(false)
      },
    )
    return () => unsub()
  }, [configured])

  return { users, counselors, loading, error }
}
