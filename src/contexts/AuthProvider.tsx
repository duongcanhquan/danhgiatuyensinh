import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  type User,
} from 'firebase/auth'
import { doc, getDoc, onSnapshot, setDoc, Timestamp, updateDoc } from 'firebase/firestore'
import type { AuthState, Permission, UserRole, VietMyUserProfile } from '../types'
import { FS_COLLECTIONS } from '../types'
import { hasPermission, resolveEffectivePermissions } from '../auth/permissions'
import { normalizeUserRole } from '../auth/roleUtils'
import { isUserInManagerTeamScope } from '../utils/teamScope'
import { isLlmAnalysisAllowedForProfile } from '../auth/llmAccess'
import { getFirebaseAuth, getFirestoreDb, getStaffCreatorAuth } from '../services/firebase'
import { ensureDefaultFirestoreData } from '../services/firestoreBootstrap'
import { ensureDefaultCounselingAiTask } from '../services/ensureDefaultCounselingAiTask'
import { defaultAccountantEmailFromEnv } from '../auth/accountantPortal'
import { adminStaffAccountAction } from '../services/adminStaffAccount'
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
    role: normalizeUserRole(String(d.role ?? 'counselor')),
    departmentId: d.departmentId as string | undefined,
    professionUnitId: d.professionUnitId as string | undefined,
    managedMajorIds: d.managedMajorIds as string[] | undefined,
    managedCounselorIds: d.managedCounselorIds as string[] | undefined,
    specialtyMajorIds: d.specialtyMajorIds as string[] | undefined,
    maxConcurrentLeads: d.maxConcurrentLeads as number | undefined,
    isActive: d.isActive !== false,
    allowLlmAndAiTasks: d.allowLlmAndAiTasks === true ? true : undefined,
    omicallSipUser: d.omicallSipUser ? String(d.omicallSipUser) : undefined,
    omicallSipPassword: d.omicallSipPassword ? String(d.omicallSipPassword) : undefined,
    omicallAgentId: d.omicallAgentId ? String(d.omicallAgentId) : undefined,
    omicallOutboundNumber: d.omicallOutboundNumber ? String(d.omicallOutboundNumber) : undefined,
    extraPermissions: d.extraPermissions as VietMyUserProfile['extraPermissions'],
    deniedPermissions: d.deniedPermissions as VietMyUserProfile['deniedPermissions'],
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
  const superEmail = String(import.meta.env.VITE_SUPER_ADMIN_EMAIL ?? 'quan.duong@caodangvietmy.edu.vn')
    .trim()
    .toLowerCase()
  const accountantEmail = defaultAccountantEmailFromEnv()
  const isSuper = Boolean(user.email && superEmail && user.email.toLowerCase() === superEmail)
  const isDefaultAccountant = Boolean(user.email && user.email.toLowerCase() === accountantEmail)
  const snap = await getDoc(ref)
  const now = Timestamp.now()

  if (!snap.exists()) {
    const profile: VietMyUserProfile = {
      id: user.uid,
      email: user.email ?? '',
      displayName: user.displayName || user.email?.split('@')[0] || 'Người dùng',
      role: isSuper ? 'super_admin' : isDefaultAccountant ? 'accountant' : 'counselor',
      isActive: true,
      createdAt: now,
      updatedAt: now,
    }
    await setDoc(ref, profile)
    return profile
  }

  const data = snap.data() as Record<string, unknown>
  let role = normalizeUserRole(String(data.role ?? 'counselor'))
  if (isSuper && role !== 'super_admin') {
    role = 'super_admin'
    await updateDoc(ref, { role: 'super_admin', updatedAt: now })
  } else if (String(data.role) !== role && (data.role === 'head_of_profession' || data.role === 'head_of_department')) {
    await updateDoc(ref, { role: 'team_lead', updatedAt: now })
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
          void ensureDefaultCounselingAiTask(db).catch((e) => {
            console.warn('[ensureDefaultCounselingAiTask]', e)
          })
        }
        setProfile(p)
        if (p.isActive === false) {
          const auth = getFirebaseAuth()
          if (auth) await auth.signOut()
          setProfile(null)
          setStatus('unauthenticated')
          return
        }
        setStatus('authenticated')
      } catch (e) {
        console.error('[syncUserProfile] thất bại sau retry — thường do Firestore Rules chặn ghi/đọc users/', user.uid, e)
        setProfile(null)
        setStatus('authenticated')
      }
    })
    return () => unsub()
  }, [])

  /** Cập nhật quyền (allowLlmAndAiTasks, role…) ngay khi Quản lý sửa users/{uid} — không cần đăng xuất. */
  useEffect(() => {
    const db = getFirestoreDb()
    const user = firebaseUser
    if (!db || !user || status !== 'authenticated') return
    const ref = doc(db, FS_COLLECTIONS.users, user.uid)
    return onSnapshot(
      ref,
      (snap) => {
        if (!snap.exists()) return
        setProfile(mapProfileFromDoc(user.uid, user, snap.data() as Record<string, unknown>))
      },
      (e) => console.warn('[profile snapshot]', e),
    )
  }, [firebaseUser, status])

  const permissions = useMemo(() => resolveEffectivePermissions(profile), [profile])

  const can = useCallback((p: Permission) => hasPermission(permissions, p), [permissions])

  const canRunLlmAnalysis = useMemo(() => {
    if (!profile) return false
    return hasPermission(permissions, 'ai:use') && isLlmAnalysisAllowedForProfile(profile)
  }, [profile, permissions])

  const signOut = useCallback(async () => {
    const auth = getFirebaseAuth()
    if (auth) await auth.signOut()
  }, [])

  const reloadProfile = useCallback(async () => {
    const auth = getFirebaseAuth()
    const db = getFirestoreDb()
    const user = auth?.currentUser
    if (!user || !db) return
    try {
      const p = await syncUserProfileWithRetry(db, user)
      setProfile(p)
    } catch (e) {
      console.warn('[reloadProfile]', e)
    }
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
      managedCounselorIds?: string[]
      omicallSipUser?: string
      omicallSipPassword?: string
      omicallAgentId?: string
      omicallOutboundNumber?: string
    }) => {
      const canAll = hasPermission(permissions, 'config:users')
      const canAcctStaff = hasPermission(permissions, 'finance:manage_accountants')
      if (!canAll && !canAcctStaff) {
        throw new Error('Chỉ quản trị (hoặc quản lý kế toán trên cổng kế toán) mới được tạo tài khoản.')
      }
      if (canAcctStaff && !canAll) {
        if (input.role !== 'accountant') {
          throw new Error('Cổng kế toán chỉ được tạo tài khoản vai trò Kế toán.')
        }
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
      const teamMeta = {}
      const normalizedRole = normalizeUserRole(input.role)
      const omicallSipUser = input.omicallSipUser?.trim()
      const omicallSipPassword = input.omicallSipPassword?.trim()
      const omicallAgentId = input.omicallAgentId?.trim()
      const omicallOutboundNumber = input.omicallOutboundNumber?.trim()
      await setDoc(doc(db, FS_COLLECTIONS.users, cred.user.uid), {
        email,
        displayName: input.displayName.trim() || email.split('@')[0],
        role: normalizedRole,
        isActive: true,
        createdAt: now,
        updatedAt: now,
        ...teamMeta,
        ...(normalizedRole === 'team_lead'
          ? {
              managedCounselorIds: (input.managedCounselorIds ?? []).filter(Boolean).slice(0, 60),
            }
          : {}),
        ...(omicallSipUser ? { omicallSipUser } : {}),
        ...(omicallSipPassword ? { omicallSipPassword } : {}),
        ...(omicallAgentId ? { omicallAgentId } : {}),
        ...(omicallOutboundNumber ? { omicallOutboundNumber } : {}),
      })
    },
    [permissions, profile],
  )

  const updateStaffProfile = useCallback(
    async (input: {
      userId: string
      displayName?: string
      role?: UserRole
      isActive?: boolean
      allowLlmAndAiTasks?: boolean
      managedCounselorIds?: string[]
      omicallSipUser?: string
      omicallSipPassword?: string
      omicallAgentId?: string
      omicallOutboundNumber?: string
    }) => {
      const canAll = hasPermission(permissions, 'config:users')
      const canTeam = hasPermission(permissions, 'config:users:team')
      const canAcctStaff = hasPermission(permissions, 'finance:manage_accountants')
      if (!canAll && !canTeam && !canAcctStaff) {
        throw new Error('Bạn không có quyền sửa nhân sự.')
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

      if (canAcctStaff && !canAll && !canTeam) {
        if (normalizeUserRole(String(data.role ?? '')) !== 'accountant') {
          throw new Error('Chỉ được sửa tài khoản vai trò Kế toán.')
        }
      }

      if (canTeam && !canAll && !canAcctStaff && profile) {
        const targetProfile = mapProfileFromDoc(uid, firebaseUser!, data)
        if (!isUserInManagerTeamScope(profile, targetProfile, [targetProfile])) {
          throw new Error('Chỉ được sửa tư vấn viên trong nhóm bạn quản lý.')
        }
        if (input.role !== undefined && input.role !== 'counselor') {
          throw new Error('Quản lý nhóm không đổi vai trò sang quản trị.')
        }
      }

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
      if (input.role !== undefined) patch.role = normalizeUserRole(input.role)
      if (input.isActive !== undefined) patch.isActive = input.isActive
      if (input.allowLlmAndAiTasks !== undefined) patch.allowLlmAndAiTasks = input.allowLlmAndAiTasks
      if (input.managedCounselorIds !== undefined) {
        patch.managedCounselorIds = input.managedCounselorIds.filter(Boolean).slice(0, 60)
      }
      if (input.omicallSipUser !== undefined) {
        const v = input.omicallSipUser.trim()
        patch.omicallSipUser = v || null
      }
      if (input.omicallSipPassword !== undefined) {
        const v = input.omicallSipPassword.trim()
        patch.omicallSipPassword = v || null
      }
      if (input.omicallAgentId !== undefined) {
        const v = input.omicallAgentId.trim()
        patch.omicallAgentId = v || null
      }
      if (input.omicallOutboundNumber !== undefined) {
        const v = input.omicallOutboundNumber.trim()
        patch.omicallOutboundNumber = v || null
      }
      await updateDoc(ref, patch)
      if (input.isActive !== undefined) {
        const acctOnly = canAcctStaff && !canAll && !canTeam
        try {
          await adminStaffAccountAction(
            uid,
            input.isActive ? 'enable_login' : 'disable_login',
            acctOnly ? { accountantPortalOnly: true } : undefined,
          )
        } catch (e) {
          console.warn('[updateStaffProfile] đồng bộ Auth', e)
        }
      }
    },
    [permissions, firebaseUser?.uid, profile?.role],
  )

  const disableStaffLogin = useCallback(
    async (userId: string, opts?: { accountantPortalOnly?: boolean }) => {
      if (firebaseUser?.uid === userId) {
        throw new Error('Không tự vô hiệu hóa chính tài khoản đang đăng nhập.')
      }
      await adminStaffAccountAction(userId, 'disable_login', opts)
    },
    [firebaseUser?.uid],
  )

  const enableStaffLogin = useCallback(
    async (userId: string, opts?: { accountantPortalOnly?: boolean }) => {
      await adminStaffAccountAction(userId, 'enable_login', opts)
    },
    [],
  )

  const deleteStaffAccount = useCallback(
    async (userId: string, opts?: { accountantPortalOnly?: boolean }) => {
      if (firebaseUser?.uid === userId) {
        throw new Error('Không xóa chính tài khoản đang đăng nhập.')
      }
      await adminStaffAccountAction(userId, 'delete', opts)
    },
    [firebaseUser?.uid],
  )

  const setStaffPassword = useCallback(
    async (userId: string, newPassword: string) => {
      if (!hasPermission(permissions, 'config:users')) {
        throw new Error('Chỉ quản trị mới được đặt mật khẩu trực tiếp.')
      }
      const uid = userId.trim()
      const pwd = newPassword.trim()
      if (!uid) throw new Error('Thiếu user.')
      if (pwd.length < 6) throw new Error('Mật khẩu mới cần ít nhất 6 ký tự.')
      if (firebaseUser?.uid === uid) {
        throw new Error('Đổi mật khẩu của chính bạn qua menu tài khoản / Firebase, không qua đây.')
      }
      await adminStaffAccountAction(uid, 'set_password', { newPassword: pwd })
    },
    [permissions, firebaseUser?.uid],
  )

  const sendStaffPasswordResetEmail = useCallback(
    async (email: string) => {
      const canUsers = hasPermission(permissions, 'config:users')
      const canAcctStaff = hasPermission(permissions, 'finance:manage_accountants')
      if (!canUsers && !canAcctStaff) {
        throw new Error('Không có quyền gửi email đặt lại mật khẩu.')
      }
      const auth = getFirebaseAuth()
      if (!auth) throw new Error('Firebase Auth chưa cấu hình.')
      const normalized = email.trim().toLowerCase()
      if (!normalized) throw new Error('Thiếu email.')
      await sendPasswordResetEmail(auth, normalized)
    },
    [permissions],
  )

  const createAccountantStaff = useCallback(
    async (input: { email: string; password: string; displayName: string }) => {
      if (!hasPermission(permissions, 'finance:manage_accountants')) {
        throw new Error('Bạn không có quyền thêm kế toán viên.')
      }
      await createStaffAccount({
        email: input.email,
        password: input.password,
        displayName: input.displayName,
        role: 'accountant',
      })
    },
    [permissions, createStaffAccount],
  )

  const updateAccountantStaff = useCallback(
    async (input: { userId: string; displayName?: string; isActive?: boolean }) => {
      if (!hasPermission(permissions, 'finance:manage_accountants')) {
        throw new Error('Bạn không có quyền sửa kế toán viên.')
      }
      const db = getFirestoreDb()
      if (!db) throw new Error('Firestore chưa cấu hình.')
      const ref = doc(db, FS_COLLECTIONS.users, input.userId.trim())
      const snap = await getDoc(ref)
      if (!snap.exists()) throw new Error('Không tìm thấy user.')
      const data = snap.data() as Record<string, unknown>
      if (normalizeUserRole(String(data.role ?? '')) !== 'accountant') {
        throw new Error('Chỉ được sửa tài khoản vai trò Kế toán.')
      }
      await updateStaffProfile({
        userId: input.userId,
        displayName: input.displayName,
        isActive: input.isActive,
      })
    },
    [permissions, updateStaffProfile],
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
      reloadProfile,
      signInWithEmail,
      createStaffAccount,
      updateStaffProfile,
      setStaffPassword,
      sendStaffPasswordResetEmail,
      createAccountantStaff,
      updateAccountantStaff,
      disableStaffLogin,
      enableStaffLogin,
      deleteStaffAccount,
    }),
    [
      status,
      firebaseUser,
      profile,
      permissions,
      can,
      canRunLlmAnalysis,
      signOut,
      reloadProfile,
      signInWithEmail,
      createStaffAccount,
      updateStaffProfile,
      setStaffPassword,
      sendStaffPasswordResetEmail,
      createAccountantStaff,
      updateAccountantStaff,
      disableStaffLogin,
      enableStaffLogin,
      deleteStaffAccount,
    ],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
