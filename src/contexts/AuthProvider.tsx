import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  type User,
} from 'firebase/auth'
import { doc, getDoc, setDoc, Timestamp, updateDoc } from 'firebase/firestore'
import type { AuthState, Permission, UserRole, VietMyUserProfile } from '../types'
import { FS_COLLECTIONS } from '../types'
import { defaultPermissionsForRole, hasPermission } from '../auth/permissions'
import { isLlmAnalysisAllowedForProfile } from '../auth/llmAccess'
import { getFirebaseAuth, getFirestoreDb, getStaffCreatorAuth } from '../services/firebase'
import { ensureDefaultFirestoreData } from '../services/firestoreBootstrap'
import { AuthContext, type AuthContextValue } from './authContextDefinition'

function devSyntheticProfile(): VietMyUserProfile | null {
  if (!import.meta.env.DEV) return null
  if (getFirebaseAuth()) return null
  const role = import.meta.env.VITE_DEV_IMPERSONATE_ROLE as UserRole | undefined
  if (!role) return null
  const id = String(import.meta.env.VITE_DEV_IMPERSONATE_UID ?? 'local-dev-user')
  const now = Timestamp.now()
  return {
    id,
    email: 'dev@local',
    displayName: 'Dev User',
    role,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  }
}

function mapProfileFromDoc(uid: string, user: User, d: Record<string, unknown>): VietMyUserProfile {
  const now = Timestamp.now()
  return {
    id: uid,
    email: String(d.email ?? user.email ?? ''),
    displayName: String(d.displayName ?? user.displayName ?? ''),
    role: (d.role as UserRole) ?? 'counselor',
    departmentId: d.departmentId as string | undefined,
    professionUnitId: d.professionUnitId as string | undefined,
    managedMajorIds: d.managedMajorIds as string[] | undefined,
    managedCounselorIds: d.managedCounselorIds as string[] | undefined,
    specialtyMajorIds: d.specialtyMajorIds as string[] | undefined,
    maxConcurrentLeads: d.maxConcurrentLeads as number | undefined,
    isActive: d.isActive !== false,
    allowLlmAndAiTasks: d.allowLlmAndAiTasks === true ? true : undefined,
    createdAt: (d.createdAt as Timestamp) ?? now,
    updatedAt: (d.updatedAt as Timestamp) ?? now,
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

/** Tránh treo vô hạn ở màn «Hệ thống đang đăng nhập…» khi Firestore/Rules/mạng không phản hồi. */
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = window.setTimeout(() => {
      reject(new Error(`${label} (quá ${ms / 1000}s — thường do Rules, sai database Firestore, hoặc mạng)`))
    }, ms)
    promise.then(
      (v) => {
        window.clearTimeout(t)
        resolve(v)
      },
      (e) => {
        window.clearTimeout(t)
        reject(e)
      },
    )
  })
}

/** Đồng bộ hồ sơ users/{uid} — retry nhẹ khi mạng / Rules chưa kịp. */
async function syncUserProfileWithRetry(
  db: NonNullable<ReturnType<typeof getFirestoreDb>>,
  user: User,
  attempts = 4,
): Promise<VietMyUserProfile> {
  let last: unknown
  for (let i = 0; i < attempts; i++) {
    try {
      return await syncUserProfile(db, user)
    } catch (e) {
      last = e
      console.warn(`[syncUserProfile] lần ${i + 1}/${attempts}`, e)
      if (i < attempts - 1) await sleep(350 * (i + 1))
    }
  }
  throw last instanceof Error ? last : new Error(String(last))
}

async function syncUserProfile(db: NonNullable<ReturnType<typeof getFirestoreDb>>, user: User) {
  const ref = doc(db, FS_COLLECTIONS.users, user.uid)
  const superEmail = (import.meta.env.VITE_SUPER_ADMIN_EMAIL as string | undefined)?.trim().toLowerCase()
  const isSuper = Boolean(user.email && superEmail && user.email.toLowerCase() === superEmail)
  const snap = await getDoc(ref)
  const now = Timestamp.now()

  if (!snap.exists()) {
    const profile: VietMyUserProfile = {
      id: user.uid,
      email: user.email ?? '',
      displayName: user.displayName || user.email?.split('@')[0] || 'Người dùng',
      role: isSuper ? 'super_admin' : 'counselor',
      isActive: true,
      createdAt: now,
      updatedAt: now,
    }
    await setDoc(ref, profile)
    return profile
  }

  const data = snap.data() as Record<string, unknown>
  let role = (data.role as UserRole) ?? 'counselor'
  if (isSuper && role !== 'super_admin') {
    role = 'super_admin'
    await updateDoc(ref, { role: 'super_admin', updatedAt: now })
  }
  return mapProfileFromDoc(user.uid, user, { ...data, role })
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthState['status']>('unknown')
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<VietMyUserProfile | null>(null)

  useEffect(() => {
    const auth = getFirebaseAuth()
    const db = getFirestoreDb()
    if (!auth) {
      queueMicrotask(() => {
        const syn = devSyntheticProfile()
        if (syn) {
          setProfile(syn)
          setStatus('authenticated')
          setFirebaseUser(null)
        } else {
          setProfile(null)
          setStatus('unauthenticated')
          setFirebaseUser(null)
        }
      })
      return
    }

    const unsub = onAuthStateChanged(auth, async (user) => {
      setFirebaseUser(user)
      if (!user) {
        setProfile(null)
        setStatus('unauthenticated')
        return
      }
      if (!db) {
        setProfile(null)
        setStatus('authenticated')
        return
      }
      setStatus('authenticating')
      try {
        const p = await withTimeout(syncUserProfileWithRetry(db, user), 22_000, 'Đồng bộ users/{uid}')
        if (p.role === 'admin' || p.role === 'super_admin') {
          void ensureDefaultFirestoreData(db, user.uid).catch((e) => {
            console.warn('[firestoreBootstrap]', e)
          })
        }
        setProfile(p)
        setStatus('authenticated')
      } catch (e) {
        console.error('[syncUserProfile] thất bại sau retry — thường do Firestore Rules chặn ghi/đọc users/', user.uid, e)
        setProfile(null)
        setStatus('authenticated')
      }
    })
    return () => unsub()
  }, [])

  const permissions = useMemo(() => {
    if (!profile) return [] as const
    return defaultPermissionsForRole(profile.role)
  }, [profile])

  const can = useCallback((p: Permission) => hasPermission(permissions, p), [permissions])

  const canRunLlmAnalysis = useMemo(() => {
    if (!profile) return false
    return hasPermission(permissions, 'ai:use') && isLlmAnalysisAllowedForProfile(profile)
  }, [profile, permissions])

  const signOut = useCallback(async () => {
    const auth = getFirebaseAuth()
    if (auth) await auth.signOut()
  }, [])

  const signInWithEmail = useCallback(async (email: string, password: string) => {
    const auth = getFirebaseAuth()
    if (!auth) throw new Error('Firebase Auth chưa cấu hình.')
    const normalized = email.trim().toLowerCase()
    await signInWithEmailAndPassword(auth, normalized, password)
  }, [])

  const createStaffAccount = useCallback(
    async (input: {
      email: string
      password: string
      displayName: string
      role: UserRole
    }) => {
      if (!hasPermission(permissions, 'config:users')) {
        throw new Error('Chỉ quản trị mới được thêm nhân sự.')
      }
      if (input.role === 'super_admin' && profile?.role !== 'super_admin') {
        throw new Error('Chỉ Siêu quản trị mới được tạo tài khoản Siêu quản trị.')
      }
      const secondary = getStaffCreatorAuth()
      const db = getFirestoreDb()
      if (!secondary || !db) throw new Error('Không khởi tạo được Firebase.')
      const email = input.email.trim()
      const cred = await createUserWithEmailAndPassword(secondary.auth, email, input.password)
      await secondary.signOutSecondary()
      const now = Timestamp.now()
      await setDoc(doc(db, FS_COLLECTIONS.users, cred.user.uid), {
        email,
        displayName: input.displayName.trim() || email.split('@')[0],
        role: input.role,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      })
    },
    [permissions, profile?.role],
  )

  const updateStaffProfile = useCallback(
    async (input: {
      userId: string
      displayName?: string
      role?: UserRole
      isActive?: boolean
      allowLlmAndAiTasks?: boolean
    }) => {
      if (!hasPermission(permissions, 'config:users')) {
        throw new Error('Chỉ quản trị mới được sửa nhân sự.')
      }
      const db = getFirestoreDb()
      if (!db) throw new Error('Firestore chưa cấu hình.')
      const uid = input.userId.trim()
      if (!uid) throw new Error('Thiếu userId.')

      const ref = doc(db, FS_COLLECTIONS.users, uid)
      const snap = await getDoc(ref)
      if (!snap.exists()) throw new Error('Không tìm thấy users/{uid}.')
      const data = snap.data() as Record<string, unknown>
      const currentRole = (data.role as UserRole) ?? 'counselor'

      if (currentRole === 'super_admin' && profile?.role !== 'super_admin') {
        throw new Error('Chỉ Siêu quản trị mới chỉnh được tài khoản Siêu quản trị khác.')
      }
      if (input.role === 'super_admin' && profile?.role !== 'super_admin') {
        throw new Error('Chỉ Siêu quản trị mới gán được vai trò Siêu quản trị.')
      }
      if (input.role !== undefined && input.role !== 'super_admin' && currentRole === 'super_admin') {
        throw new Error('Chỉ Siêu quản trị mới đổi vai trò tài khoản Siêu quản trị.')
      }

      if (firebaseUser?.uid === uid && input.role !== undefined) {
        const cur = profile?.role
        if (cur === 'super_admin' && input.role !== 'super_admin') {
          throw new Error('Không tự đổi vai trò Siêu quản trị trên chính tài khoản đang đăng nhập.')
        }
        if (cur === 'admin' && input.role !== 'admin') {
          throw new Error('Không tự hạ cấp quản trị trên chính tài khoản đang đăng nhập.')
        }
      }
      if (firebaseUser?.uid === uid) {
        if (input.isActive === false) {
          throw new Error('Không tự vô hiệu hóa chính tài khoản đang đăng nhập.')
        }
      }
      const patch: Record<string, unknown> = { updatedAt: Timestamp.now() }
      if (input.displayName !== undefined) patch.displayName = input.displayName.trim()
      if (input.role !== undefined) patch.role = input.role
      if (input.isActive !== undefined) patch.isActive = input.isActive
      if (input.allowLlmAndAiTasks !== undefined) patch.allowLlmAndAiTasks = input.allowLlmAndAiTasks
      await updateDoc(ref, patch)
    },
    [permissions, firebaseUser?.uid, profile?.role],
  )

  const sendStaffPasswordResetEmail = useCallback(
    async (email: string) => {
      if (!hasPermission(permissions, 'config:users')) {
        throw new Error('Chỉ quản trị mới gửi được email đặt lại mật khẩu.')
      }
      const auth = getFirebaseAuth()
      if (!auth) throw new Error('Firebase Auth chưa cấu hình.')
      const normalized = email.trim().toLowerCase()
      if (!normalized) throw new Error('Thiếu email.')
      await sendPasswordResetEmail(auth, normalized)
    },
    [permissions],
  )

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      firebaseUid: firebaseUser?.uid ?? profile?.id ?? null,
      profile,
      permissions,
      firebaseUser,
      can,
      canRunLlmAnalysis,
      signOut,
      signInWithEmail,
      createStaffAccount,
      updateStaffProfile,
      sendStaffPasswordResetEmail,
    }),
    [
      status,
      firebaseUser,
      profile,
      permissions,
      can,
      canRunLlmAnalysis,
      signOut,
      signInWithEmail,
      createStaffAccount,
      updateStaffProfile,
      sendStaffPasswordResetEmail,
    ],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
