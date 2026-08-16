import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  createUserWithEmailAndPassword,
  EmailAuthProvider,
  onAuthStateChanged,
  reauthenticateWithCredential,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  updatePassword,
  type User,
} from 'firebase/auth'
import { doc, getDoc, onSnapshot, setDoc, Timestamp, updateDoc, deleteField } from 'firebase/firestore'
import type { AuthState, Permission, UserRole, VietMyUserProfile } from '../types'
import { FS_COLLECTIONS } from '../types'
import { hasPermission, resolveEffectivePermissions } from '../auth/permissions'
import { type OrgRoleCapabilities } from '../utils/roleCapabilitiesConfig'
import { subscribeRoleCapabilities } from '../utils/roleCapabilitiesSubscribe'
import { canOwnFieldStaffTeam, isFieldStaffRole, normalizeUserRole } from '../auth/roleUtils'
import { isUserInExplicitTeamRoster } from '../utils/teamScope'
import { isLlmAnalysisAllowedForProfile } from '../auth/llmAccess'
import { getFirebaseAuth, getFirestoreDb, getStaffCreatorAuth } from '../services/firebase'
import { ensureDefaultFirestoreData } from '../services/firestoreBootstrap'
import { ensureDefaultCounselingAiTask } from '../services/ensureDefaultCounselingAiTask'
import { defaultAccountantEmailFromEnv } from '../auth/accountantPortal'
import { adminStaffAccountAction } from '../services/adminStaffAccount'
import { AuthContext, type AuthContextValue } from './authContextDefinition'
import { DEFAULT_ORG_ID } from '../tenancy/orgConstants'
import { claimsMatchProfile } from '../tenancy/authClaims'
import {
  defaultSuperAdminEmailFromEnv,
  shouldAttemptSuperAdminBootstrap,
} from '../tenancy/superAdminBootstrap'
import { refreshOwnAuthClaims } from '../services/refreshOwnAuthClaims'

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
    orgId: role === 'super_admin' ? null : DEFAULT_ORG_ID,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  }
}

function mapProfileFromDoc(uid: string, user: User, d: Record<string, unknown>): VietMyUserProfile {
  const now = Timestamp.now()
  const role = normalizeUserRole(String(d.role ?? 'counselor'))
  const rawOrg = d.orgId
  // Superadmin nền tảng: luôn coi như không gắn trường (dù Firestore còn orgId cũ)
  let orgId: string | null | undefined
  if (role === 'super_admin') {
    orgId = null
  } else if (typeof rawOrg === 'string' && rawOrg.trim()) {
    orgId = rawOrg.trim()
  } else if (rawOrg === null || rawOrg === '') {
    // Thiếu / null → coi như chưa gắn; syncUserProfile sẽ backfill vietmy.
    orgId = undefined
  } else {
    orgId = undefined
  }
  return {
    id: uid,
    email: String(d.email ?? user.email ?? ''),
    displayName: String(d.displayName ?? user.displayName ?? ''),
    role,
    orgId,
    departmentId: d.departmentId as string | undefined,
    professionUnitId: d.professionUnitId as string | undefined,
    managedMajorIds: d.managedMajorIds as string[] | undefined,
    managedCounselorIds: d.managedCounselorIds as string[] | undefined,
    specialtyMajorIds: d.specialtyMajorIds as string[] | undefined,
    maxConcurrentLeads: d.maxConcurrentLeads as number | undefined,
    isActive: d.isActive !== false,
    allowLlmAndAiTasks: d.allowLlmAndAiTasks === true ? true : undefined,
    showOnPublicRegistrationPortal: d.showOnPublicRegistrationPortal === true ? true : undefined,
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

function firebaseAuthErrorCode(err: unknown): string {
  if (err && typeof err === 'object' && 'code' in err && typeof (err as { code: unknown }).code === 'string') {
    return (err as { code: string }).code
  }
  return ''
}

async function syncUserProfile(db: NonNullable<ReturnType<typeof getFirestoreDb>>, user: User) {
  const ref = doc(db, FS_COLLECTIONS.users, user.uid)
  const superEmail = defaultSuperAdminEmailFromEnv()
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
      orgId: isSuper ? null : DEFAULT_ORG_ID,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    }
    try {
      await setDoc(ref, profile)
    } catch (e) {
      console.error('[syncUserProfile] không tạo được users/{uid}', user.uid, e)
      throw e instanceof Error ? e : new Error(String(e))
    }
    return profile
  }

  const data = snap.data() as Record<string, unknown>
  let role = normalizeUserRole(String(data.role ?? 'counselor'))

  /** Clear orgId trên Firestore — cần claim platform; nếu Rules từ chối vẫn cho đăng nhập (UI đã coi super_admin = null). */
  const clearSuperAdminOrgBinding = async (alsoSetRole: boolean) => {
    try {
      const patch: Record<string, unknown> = { orgId: deleteField(), updatedAt: now }
      if (alsoSetRole) patch.role = 'super_admin'
      await updateDoc(ref, patch)
    } catch (e) {
      console.warn('[syncUserProfile] không xóa được orgId super_admin (cần claim platform)', e)
    }
  }

  if (isSuper && role !== 'super_admin') {
    role = 'super_admin'
    await clearSuperAdminOrgBinding(true)
    data.role = 'super_admin'
    data.orgId = null
  } else if (isSuper || role === 'super_admin') {
    // Siêu quản trị nền tảng: không gắn orgId trường (backfill Phase 0 từng gắn nhầm → mất switcher)
    role = 'super_admin'
    if (data.orgId != null && String(data.orgId).trim() !== '') {
      await clearSuperAdminOrgBinding(String(data.role) !== 'super_admin')
      data.orgId = null
    } else if (String(data.role) !== 'super_admin') {
      try {
        await updateDoc(ref, { role: 'super_admin', updatedAt: now })
      } catch (e) {
        console.warn('[syncUserProfile] không gán role super_admin', e)
      }
    }
    data.role = 'super_admin'
  } else if (String(data.role) !== role && (data.role === 'head_of_profession' || data.role === 'head_of_department')) {
    // Rules cấm tự đổi role — migrate best-effort; vẫn đăng nhập với role đã normalize.
    try {
      await updateDoc(ref, { role: 'team_lead', updatedAt: now })
    } catch (e) {
      console.warn('[syncUserProfile] không migrate role legacy → team_lead (Rules)', e)
    }
    data.role = 'team_lead'
  }
  // Phase 1: school users without orgId get vietmy backfill on login
  const existingOrg = typeof data.orgId === 'string' ? data.orgId.trim() : ''
  if (!isSuper && role !== 'super_admin' && !existingOrg) {
    try {
      await updateDoc(ref, { orgId: DEFAULT_ORG_ID, updatedAt: now })
      data.orgId = DEFAULT_ORG_ID
    } catch (e) {
      console.warn('[syncUserProfile] không backfill orgId (Rules) — dùng mặc định trên client', e)
      data.orgId = DEFAULT_ORG_ID
    }
  }
  return mapProfileFromDoc(user.uid, user, { ...data, role })
}

/** Force ID token refresh when custom claims lag behind Firestore profile. */
async function ensureAuthClaimsFresh(
  user: User,
  profile: Pick<VietMyUserProfile, 'role' | 'orgId'>,
): Promise<void> {
  try {
    const token = await user.getIdTokenResult()
    const claims = {
      role: typeof token.claims.role === 'string' ? token.claims.role : undefined,
      orgId: typeof token.claims.orgId === 'string' ? token.claims.orgId : '',
      platform: token.claims.platform === true,
    }
    const isSuper = profile.role === 'super_admin'
    // Superadmin: luôn gọi refresh ít nhất một lần nếu thiếu platform — tránh mất quyền đọc leads
    if (!isSuper && claimsMatchProfile(claims, { role: profile.role, orgId: profile.orgId })) return
    if (isSuper && claims.platform === true && claims.role === 'super_admin') return
    try {
      await refreshOwnAuthClaims()
    } catch (e) {
      // Function may not be deployed yet — still try local token refresh
      console.warn('[ensureAuthClaimsFresh] refreshOwnAuthClaims', e)
    }
    await user.getIdToken(true)
  } catch (e) {
    console.warn('[ensureAuthClaimsFresh]', e)
  }
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
        setProfile(p)
        if (p.isActive === false) {
          const auth = getFirebaseAuth()
          if (auth) await auth.signOut()
          setProfile(null)
          setStatus('unauthenticated')
          return
        }
        // Đồng bộ Auth claims (orgId/role) trước khi mở shell — tránh permission-denied Rules.
        try {
          await Promise.race([
            ensureAuthClaimsFresh(user, p),
            new Promise<void>((resolve) => {
              window.setTimeout(resolve, 8_000)
            }),
          ])
        } catch (e) {
          console.warn('[ensureAuthClaimsFresh]', e)
        }
        setStatus('authenticated')
        if (p.role === 'admin' || p.role === 'super_admin') {
          void ensureDefaultFirestoreData(db, user.uid).catch((e) => {
            console.warn('[firestoreBootstrap]', e)
          })
          void ensureDefaultCounselingAiTask(db, p.orgId?.trim() || DEFAULT_ORG_ID).catch((e) => {
            console.warn('[ensureDefaultCounselingAiTask]', e)
          })
        }
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

  const [orgCaps, setOrgCaps] = useState<OrgRoleCapabilities | null>(null)

  useEffect(() => {
    const orgId = profile?.orgId?.trim()
    if (!orgId || profile?.role === 'super_admin') {
      setOrgCaps(null)
      return
    }
    const db = getFirestoreDb()
    if (!db) return
    return subscribeRoleCapabilities(db, orgId, setOrgCaps)
  }, [profile?.orgId, profile?.role])

  const permissions = useMemo(() => resolveEffectivePermissions(profile, orgCaps), [profile, orgCaps])

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
    try {
      await signInWithEmailAndPassword(auth, normalized, password)
    } catch (err) {
      const code = firebaseAuthErrorCode(err)
      const superEmail = defaultSuperAdminEmailFromEnv()
      if (
        !shouldAttemptSuperAdminBootstrap({
          email: normalized,
          password,
          errorCode: code,
          superAdminEmail: superEmail,
        })
      ) {
        throw err
      }
      try {
        // Lần đầu: tạo tài khoản Auth cho đúng email Siêu quản trị (mật khẩu do người dùng nhập).
        await createUserWithEmailAndPassword(auth, normalized, password)
      } catch (createErr) {
        const createCode = firebaseAuthErrorCode(createErr)
        if (createCode === 'auth/email-already-in-use') throw err
        throw createErr
      }
    }
  }, [])

  const changeOwnPassword = useCallback(async (currentPassword: string, newPassword: string) => {
    const auth = getFirebaseAuth()
    const user = auth?.currentUser
    if (!auth || !user?.email) throw new Error('Bạn cần đăng nhập lại để đổi mật khẩu.')
    const next = newPassword.trim()
    if (next.length < 6) throw new Error('Mật khẩu mới tối thiểu 6 ký tự.')
    const cred = EmailAuthProvider.credential(user.email, currentPassword)
    await reauthenticateWithCredential(user, cred)
    await updatePassword(user, next)
  }, [])

  const createStaffAccount = useCallback(
    async (input: {
      email: string
      password: string
      displayName: string
      role: UserRole
      orgId?: string | null
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
      if (
        (input.omicallSipUser !== undefined ||
          input.omicallSipPassword !== undefined ||
          input.omicallAgentId !== undefined ||
          input.omicallOutboundNumber !== undefined) &&
        !hasPermission(permissions, 'config:omicall')
      ) {
        throw new Error('Chỉ Quản lý có quyền tổng đài mới gán số nội bộ / mật khẩu SIP.')
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
      const resolvedOrgId =
        normalizedRole === 'super_admin'
          ? null
          : (input.orgId?.trim() || profile?.orgId?.trim() || DEFAULT_ORG_ID)
      await setDoc(doc(db, FS_COLLECTIONS.users, cred.user.uid), {
        email,
        displayName: input.displayName.trim() || email.split('@')[0],
        role: normalizedRole,
        orgId: resolvedOrgId,
        isActive: true,
        createdAt: now,
        updatedAt: now,
        ...teamMeta,
        ...(canOwnFieldStaffTeam(normalizedRole)
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
      orgId?: string | null
      allowLlmAndAiTasks?: boolean
      showOnPublicRegistrationPortal?: boolean
      extraPermissions?: Permission[]
      deniedPermissions?: Permission[]
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
        if (!isUserInExplicitTeamRoster(profile, targetProfile)) {
          throw new Error('Chỉ được sửa tư vấn viên / CTV trong nhóm bạn quản lý.')
        }
        if (input.role !== undefined && input.role !== 'counselor' && input.role !== 'ctv') {
          throw new Error('Trưởng nhóm không đổi vai trò sang quản trị.')
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
      const prevActive = data.isActive !== false
      const patch: Record<string, unknown> = { updatedAt: Timestamp.now() }
      if (input.displayName !== undefined) patch.displayName = input.displayName.trim()
      if (input.role !== undefined) patch.role = normalizeUserRole(input.role)
      const activeChanged = input.isActive !== undefined && input.isActive !== prevActive
      if (activeChanged) patch.isActive = input.isActive
      if (input.orgId !== undefined) {
        if (profile?.role !== 'super_admin') {
          throw new Error('Chỉ Siêu quản trị mới đổi trường gắn với nhân sự.')
        }
        const nextRole = input.role !== undefined ? normalizeUserRole(input.role) : normalizeUserRole(String(currentRole))
        if (nextRole === 'super_admin') {
          patch.orgId = deleteField()
        } else {
          const oid = input.orgId == null ? '' : String(input.orgId).trim()
          if (!oid) throw new Error('Thiếu mã trường khi gán quản lý / nhân sự.')
          patch.orgId = oid
        }
      }
      if (input.allowLlmAndAiTasks !== undefined) patch.allowLlmAndAiTasks = input.allowLlmAndAiTasks
      if (input.showOnPublicRegistrationPortal !== undefined) {
        const nextRoleForPortal =
          input.role !== undefined ? normalizeUserRole(input.role) : normalizeUserRole(String(currentRole))
        patch.showOnPublicRegistrationPortal =
          isFieldStaffRole(nextRoleForPortal) && input.showOnPublicRegistrationPortal === true
      }
      if (input.extraPermissions !== undefined) {
        if (!canAll) throw new Error('Chỉ Quản lý trường / Siêu quản trị mới phân quyền chi tiết.')
        patch.extraPermissions = input.extraPermissions
      }
      if (input.deniedPermissions !== undefined) {
        if (!canAll) throw new Error('Chỉ Quản lý trường / Siêu quản trị mới thu hồi quyền chi tiết.')
        patch.deniedPermissions = input.deniedPermissions
      }
      if (input.managedCounselorIds !== undefined) {
        const nextRoleForRoster =
          input.role !== undefined ? normalizeUserRole(input.role) : normalizeUserRole(String(currentRole))
        patch.managedCounselorIds = canOwnFieldStaffTeam(nextRoleForRoster)
          ? input.managedCounselorIds.filter(Boolean).slice(0, 60)
          : []
      } else {
        const nextRoleForRoster =
          input.role !== undefined ? normalizeUserRole(input.role) : normalizeUserRole(String(currentRole))
        const existingRoster = Array.isArray(data.managedCounselorIds) ? data.managedCounselorIds : []
        if (!canOwnFieldStaffTeam(nextRoleForRoster) && existingRoster.length > 0) {
          patch.managedCounselorIds = []
        }
      }
      if (
        input.omicallSipUser !== undefined ||
        input.omicallSipPassword !== undefined ||
        input.omicallAgentId !== undefined ||
        input.omicallOutboundNumber !== undefined
      ) {
        if (!hasPermission(permissions, 'config:omicall')) {
          throw new Error('Chỉ Quản lý có quyền tổng đài mới gán số nội bộ / mật khẩu SIP.')
        }
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
      // Chỉ gọi CF khi thật sự đổi khóa/mở đăng nhập — tránh chờ cold start ~10–30s mỗi lần «Lưu».
      if (activeChanged && input.isActive !== undefined) {
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
    [permissions, firebaseUser, profile],
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
      changeOwnPassword,
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
      changeOwnPassword,
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
