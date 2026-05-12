import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  type User,
} from 'firebase/auth'
import { doc, getDoc, setDoc, Timestamp, updateDoc } from 'firebase/firestore'
import type { AuthState, Permission, UserRole, VietMyUserProfile } from '../types'
import { FS_COLLECTIONS } from '../types'
import { defaultPermissionsForRole, hasPermission } from '../auth/permissions'
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
    createdAt: (d.createdAt as Timestamp) ?? now,
    updatedAt: (d.updatedAt as Timestamp) ?? now,
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

/** Tránh treo vô hạn ở «Đang tải hồ sơ…» khi Firestore/Rules/mạng không phản hồi. */
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
      role: isSuper ? 'admin' : 'counselor',
      isActive: true,
      createdAt: now,
      updatedAt: now,
    }
    await setDoc(ref, profile)
    return profile
  }

  const data = snap.data() as Record<string, unknown>
  let role = (data.role as UserRole) ?? 'counselor'
  if (isSuper && role !== 'admin') {
    role = 'admin'
    await updateDoc(ref, { role: 'admin', updatedAt: now })
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
        if (p.role === 'admin') {
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
      signOut,
      signInWithEmail,
      createStaffAccount,
    }),
    [status, firebaseUser, profile, permissions, can, signOut, signInWithEmail, createStaffAccount],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
