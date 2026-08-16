import { useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { doc, Timestamp, writeBatch } from 'firebase/firestore'
import {
  KeyRound,
  Phone,
  Plus,
  Search,
  Shield,
  UserPlus,
  Users,
  UsersRound,
} from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { useOrg } from '../hooks/useOrg'
import { useCounselorDirectory } from '../hooks/useCounselorDirectory'
import { ViewportModal } from '../components/ViewportModal'
import {
  FS_COLLECTIONS,
  USER_ROLE_LABELS,
  type Permission,
  type UserRole,
  type VietMyUserProfile,
} from '../types'
import { getFirestoreDb } from '../services/firebase'
import {
  canAppearOnPublicRegistrationPortal,
  canOwnFieldStaffTeam,
  isAdminLikeRole,
  isFieldStaffRole,
  isSuperAdminRole,
} from '../auth/roleUtils'
import { STAFF_ASSIGNABLE_PERMISSIONS } from '../utils/roleCapabilitiesConfig'
import { defaultPermissionsForRole } from '../auth/permissions'
import { confirmDangerousStaffAccountDelete } from '../utils/dangerousDeleteConfirm'
import { StaffExcelImportPanel } from '../components/StaffExcelImportPanel'
import { BentoCell, BentoGrid, BentoStat } from '../components/bento'
import {
  counselorIdsInManagerScope,
  explicitManagedCounselorIds,
  isUserInExplicitTeamRoster,
  patchesForCounselorTeamAssignment,
  primaryTeamLeadForCounselor,
  teamLeadUsesExplicitRoster,
  teamLeadsForCounselor,
} from '../utils/teamScope'

/** Vai trò quản trị được tạo trong app; kế toán chỉ Siêu quản trị được gán. */
const ROLES_BASE: UserRole[] = ['counselor', 'ctv', 'team_lead', 'admin', 'marketing']
const ROLES_WITH_ACCOUNTANT: UserRole[] = [...ROLES_BASE, 'accountant']

type StaffMainTab = 'list' | 'teams' | 'add'

/** Quản lý gán số nội bộ / mật khẩu SIP cho nhân viên gọi điện và Trưởng nhóm. */
function canAssignOmicallSip(role: UserRole): boolean {
  return role === 'counselor' || role === 'ctv' || role === 'team_lead' || role === 'admin'
}

function fieldClass() {
  return 'mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-[var(--color-primary)]/50 focus:ring-2 focus:ring-[var(--color-primary)]/20'
}

function SectionCard({
  title,
  hint,
  children,
  icon,
}: {
  title: string
  hint?: string
  children: ReactNode
  icon?: ReactNode
}) {
  return (
    <div className="rounded-xl border border-slate-200/90 bg-slate-50/60 p-3 sm:p-3.5">
      <div className="mb-2.5 flex items-start gap-2">
        {icon ? <span className="mt-0.5 text-slate-500">{icon}</span> : null}
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-900">{title}</p>
          {hint ? <p className="mt-0.5 text-xs leading-snug text-slate-600">{hint}</p> : null}
        </div>
      </div>
      <div className="space-y-2.5">{children}</div>
    </div>
  )
}

export function StaffManagementView({
  embedded = false,
  teamScopeOnly = false,
}: {
  embedded?: boolean
  teamScopeOnly?: boolean
}) {
  const {
    can,
    createStaffAccount,
    updateStaffProfile,
    setStaffPassword,
    sendStaffPasswordResetEmail,
    disableStaffLogin,
    enableStaffLogin,
    deleteStaffAccount,
    profile,
    firebaseUser,
    reloadProfile,
  } = useAuth()
  const { effectiveOrgId } = useOrg()
  const canStaffAll = can('config:users')
  const canStaffTeam = can('config:users:team')
  const canAccessStaff = canStaffAll || canStaffTeam
  const canOmicallConfig = can('config:omicall')
  const assignableRoles = useMemo((): UserRole[] => {
    if (teamScopeOnly) return ['counselor', 'ctv']
    if (profile?.role === 'super_admin') return [...ROLES_WITH_ACCOUNTANT, 'super_admin']
    return [...ROLES_BASE]
  }, [profile?.role, teamScopeOnly])
  const { users, loading, error: directoryError, fieldStaff } = useCounselorDirectory()

  const [mainTab, setMainTab] = useState<StaffMainTab>('list')
  const [listQuery, setListQuery] = useState('')
  const [roleFilter, setRoleFilter] = useState<UserRole | 'all'>('all')
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all')

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [role, setRole] = useState<UserRole>('counselor')
  const [createTeamIds, setCreateTeamIds] = useState<string[]>([])
  const [createOmicallUser, setCreateOmicallUser] = useState('')
  const [createOmicallPassword, setCreateOmicallPassword] = useState('')
  const [createOmicallOutbound, setCreateOmicallOutbound] = useState('')
  const [createOmicallAgentId, setCreateOmicallAgentId] = useState('')
  const [showCreateOmicall, setShowCreateOmicall] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const [editing, setEditing] = useState<VietMyUserProfile | null>(null)
  const [editDisplayName, setEditDisplayName] = useState('')
  const [editRole, setEditRole] = useState<UserRole>('counselor')
  const [editActive, setEditActive] = useState(true)
  const [editAllowLlm, setEditAllowLlm] = useState(false)
  const [editShowOnPortal, setEditShowOnPortal] = useState(false)
  const [editExtraPerms, setEditExtraPerms] = useState<Permission[]>([])
  const [editDeniedPerms, setEditDeniedPerms] = useState<Permission[]>([])
  const [editOmicallUser, setEditOmicallUser] = useState('')
  const [editOmicallPassword, setEditOmicallPassword] = useState('')
  const [editOmicallAgentId, setEditOmicallAgentId] = useState('')
  const [editOmicallOutbound, setEditOmicallOutbound] = useState('')
  const [editTeamIds, setEditTeamIds] = useState<string[]>([])
  const [editTeamLeadId, setEditTeamLeadId] = useState('')
  const [editBusy, setEditBusy] = useState(false)
  const [editNewPassword, setEditNewPassword] = useState('')
  const [resetPwdBusy, setResetPwdBusy] = useState(false)
  const [editMsg, setEditMsg] = useState<string | null>(null)
  const [editErr, setEditErr] = useState<string | null>(null)

  const counselorPickList = useMemo(() => {
    if (teamScopeOnly && profile) {
      // Khớp bộ lọc lead / KPI: roster rõ + fallback khoa/phòng khi chưa gán UID.
      const team = new Set(counselorIdsInManagerScope(profile, users))
      return fieldStaff.filter((c) => team.has(c.id))
    }
    return fieldStaff
  }, [fieldStaff, teamScopeOnly, profile, users])

  const teamLeads = useMemo(
    () => users.filter((u) => canOwnFieldStaffTeam(u.role) && u.isActive !== false),
    [users],
  )

  const teamLeadMembers = useMemo(() => {
    const map = new Map<string, VietMyUserProfile[]>()
    for (const lead of teamLeads) {
      // Chỉ hiện sale đã gán rõ trên roster — tránh nhầm «cùng khoa» thành đã gán nhóm.
      const ids = new Set(explicitManagedCounselorIds(lead))
      map.set(
        lead.id,
        fieldStaff.filter((c) => ids.has(c.id)),
      )
    }
    return map
  }, [teamLeads, fieldStaff])

  const unassignedCounselors = useMemo(() => {
    if (teamScopeOnly) return []
    return fieldStaff.filter((c) => teamLeadsForCounselor(c.id, users).length === 0)
  }, [fieldStaff, users, teamScopeOnly])

  const sortedUsers = useMemo(() => {
    let list = users
    if (teamScopeOnly && profile) {
      const teamIds = new Set(counselorIdsInManagerScope(profile, users))
      list = users.filter((u) => teamIds.has(u.id) || u.id === profile.id)
    }
    return [...list].sort((a, b) => {
      const la = (a.displayName || a.email).toLocaleLowerCase('vi')
      const lb = (b.displayName || b.email).toLocaleLowerCase('vi')
      return la.localeCompare(lb, 'vi')
    })
  }, [users, teamScopeOnly, profile])

  const filteredUsers = useMemo(() => {
    const q = listQuery.trim().toLowerCase()
    return sortedUsers.filter((u) => {
      if (roleFilter !== 'all' && u.role !== roleFilter) return false
      if (statusFilter === 'active' && u.isActive === false) return false
      if (statusFilter === 'inactive' && u.isActive !== false) return false
      if (!q) return true
      const hay = `${u.displayName ?? ''} ${u.email} ${USER_ROLE_LABELS[u.role]}`.toLowerCase()
      return hay.includes(q)
    })
  }, [sortedUsers, listQuery, roleFilter, statusFilter])

  const stats = useMemo(() => {
    const active = sortedUsers.filter((u) => u.isActive !== false).length
    const inactive = sortedUsers.length - active
    return {
      total: sortedUsers.length,
      active,
      inactive,
      leads: teamLeads.length,
      unassigned: unassignedCounselors.length,
    }
  }, [sortedUsers, teamLeads.length, unassignedCounselors.length])

  const selfUid = firebaseUser?.uid ?? profile?.id ?? null

  if (!canAccessStaff) {
    return (
      <div className="rounded-2xl border border-amber-300/60 bg-amber-50/90 p-6 text-sm text-amber-900">
        Bạn không có quyền quản lý nhân sự. Liên hệ <strong>Quản lý</strong> hoặc <strong>Trưởng nhóm</strong>.
      </div>
    )
  }

  const canManageUser = (u: VietMyUserProfile) => {
    if (isSuperAdminRole(u.role) && !isSuperAdminRole(profile?.role)) return false
    if (u.role === 'accountant' && !isSuperAdminRole(profile?.role)) return false
    if (canStaffAll) return true
    if (!profile || !teamScopeOnly) return false
    return isUserInExplicitTeamRoster(profile, u)
  }

  const toggleTeamId = (ids: string[], uid: string, on: boolean) => {
    if (on) return [...new Set([...ids, uid])]
    return ids.filter((x) => x !== uid)
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setMsg(null)
    setErr(null)
    setBusy(true)
    try {
      const omicallPayload =
        canAssignOmicallSip(role) && canOmicallConfig
          ? {
              ...(createOmicallUser.trim() ? { omicallSipUser: createOmicallUser.trim() } : {}),
              ...(createOmicallPassword.trim() ? { omicallSipPassword: createOmicallPassword.trim() } : {}),
              ...(createOmicallOutbound.trim() ? { omicallOutboundNumber: createOmicallOutbound.trim() } : {}),
              ...(createOmicallAgentId.trim() ? { omicallAgentId: createOmicallAgentId.trim() } : {}),
            }
          : {}
      await createStaffAccount({
        email,
        password,
        displayName,
        role,
        orgId: role === 'super_admin' ? null : effectiveOrgId,
        ...(canOwnFieldStaffTeam(role) ? { managedCounselorIds: createTeamIds } : {}),
        ...omicallPayload,
      })
      setMsg(`Đã tạo tài khoản cho ${email}`)
      setEmail('')
      setPassword('')
      setDisplayName('')
      setRole('counselor')
      setCreateTeamIds([])
      setCreateOmicallUser('')
      setCreateOmicallPassword('')
      setCreateOmicallOutbound('')
      setCreateOmicallAgentId('')
      setShowCreateOmicall(false)
      setMainTab('list')
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Không tạo được tài khoản')
    } finally {
      setBusy(false)
    }
  }

  const sendPasswordResetForEditing = () => {
    if (!editing?.email?.trim()) return
    void (async () => {
      setResetPwdBusy(true)
      setEditErr(null)
      setEditMsg(null)
      try {
        await sendStaffPasswordResetEmail(editing.email)
        setEditMsg(`Đã gửi email đặt lại mật khẩu tới ${editing.email}. Kiểm tra hộp thư / spam.`)
      } catch (e: unknown) {
        const m = e instanceof Error ? e.message : 'Không gửi được email.'
        setEditErr(
          m.includes('user-not-found')
            ? 'Firebase không thấy user với email này (chưa tạo Auth hoặc email khác).'
            : m,
        )
      } finally {
        setResetPwdBusy(false)
      }
    })()
  }

  const openEdit = (u: VietMyUserProfile) => {
    if (!canManageUser(u)) return
    setEditing(u)
    setEditDisplayName(u.displayName || '')
    setEditRole(u.role)
    setEditActive(u.isActive !== false)
    setEditAllowLlm(u.allowLlmAndAiTasks === true)
    setEditShowOnPortal(u.showOnPublicRegistrationPortal === true)
    setEditExtraPerms([...(u.extraPermissions ?? [])])
    setEditDeniedPerms([...(u.deniedPermissions ?? [])])
    setEditOmicallUser(u.omicallSipUser ?? '')
    setEditOmicallPassword(u.omicallSipPassword ?? '')
    setEditOmicallAgentId(u.omicallAgentId ?? '')
    setEditOmicallOutbound(u.omicallOutboundNumber ?? '')
    setEditTeamIds(u.managedCounselorIds ?? [])
    const primaryLead = primaryTeamLeadForCounselor(u.id, users)
    setEditTeamLeadId(primaryLead?.id ?? '')
    setEditMsg(null)
    setEditErr(null)
    setEditNewPassword('')
  }

  const saveEdit = async (e: FormEvent) => {
    e.preventDefault()
    if (!editing) return
    setEditBusy(true)
    setEditMsg(null)
    setEditErr(null)
    try {
      const isSelf = selfUid !== null && editing.id === selfUid
      await updateStaffProfile({
        userId: editing.id,
        displayName: editDisplayName,
        ...(!isSuperAdminRole(editing.role) ? { allowLlmAndAiTasks: editAllowLlm } : {}),
        ...(canStaffAll &&
        !isAdminLikeRole(editRole) &&
        !isSuperAdminRole(editRole) &&
        editRole !== 'accountant'
          ? { extraPermissions: editExtraPerms, deniedPermissions: editDeniedPerms }
          : canStaffAll && (isAdminLikeRole(editRole) || editRole === 'accountant')
            ? { extraPermissions: [], deniedPermissions: [] }
            : {}),
        ...(canOmicallConfig && canAssignOmicallSip(editRole)
          ? {
              omicallSipUser: editOmicallUser,
              omicallSipPassword: editOmicallPassword,
              omicallAgentId: editOmicallAgentId,
              omicallOutboundNumber: editOmicallOutbound,
            }
          : canOmicallConfig &&
              canAssignOmicallSip(editing.role) &&
              !canAssignOmicallSip(editRole)
            ? {
                omicallSipUser: '',
                omicallSipPassword: '',
                omicallAgentId: '',
                omicallOutboundNumber: '',
              }
            : {}),
        ...(!isSelf
          ? {
              role: editRole,
              ...(editActive !== (editing.isActive !== false) ? { isActive: editActive } : {}),
            }
          : {}),
        ...(canOwnFieldStaffTeam(editRole)
          ? { managedCounselorIds: editTeamIds }
          : canOwnFieldStaffTeam(editing.role) || (editing.managedCounselorIds?.length ?? 0) > 0
            ? { managedCounselorIds: [] }
            : {}),
        ...(canAppearOnPublicRegistrationPortal(editRole) ||
        canAppearOnPublicRegistrationPortal(editing.role)
          ? {
              showOnPublicRegistrationPortal: canAppearOnPublicRegistrationPortal(editRole)
                ? editShowOnPortal
                : false,
            }
          : {}),
      })
      if (
        canStaffAll &&
        (isFieldStaffRole(editRole) ||
          (isFieldStaffRole(editing.role) && !canOwnFieldStaffTeam(editRole)))
      ) {
        const patches = patchesForCounselorTeamAssignment(
          editing.id,
          editTeamLeadId || null,
          users,
        )
        if (patches.length) {
          const db = getFirestoreDb()
          if (!db) throw new Error('Firestore chưa cấu hình.')
          const batch = writeBatch(db)
          const now = Timestamp.now()
          for (const patch of patches) {
            batch.update(doc(db, FS_COLLECTIONS.users, patch.userId), {
              managedCounselorIds: patch.managedCounselorIds,
              updatedAt: now,
            })
          }
          await batch.commit()
        }
      }
      const pwd = editNewPassword.trim()
      if (pwd) {
        if (!canStaffAll) throw new Error('Chỉ Quản lý trường được đặt mật khẩu nhân sự.')
        if (pwd.length < 6) throw new Error('Mật khẩu mới cần ít nhất 6 ký tự.')
        await setStaffPassword(editing.id, pwd)
        setEditNewPassword('')
        setEditMsg('Đã lưu thay đổi và đặt mật khẩu mới.')
      } else {
        setEditMsg('Đã lưu thay đổi.')
      }
      if (isSelf) {
        await reloadProfile()
      }
      setEditing(null)
    } catch (e: unknown) {
      setEditErr(e instanceof Error ? e.message : 'Không lưu được')
    } finally {
      setEditBusy(false)
    }
  }

  const toggleActive = async (u: VietMyUserProfile, next: boolean) => {
    const label = next ? 'Kích hoạt' : 'Vô hiệu (khóa đăng nhập)'
    if (!window.confirm(`${label} tài khoản «${u.email}»?`)) return
    setErr(null)
    setMsg(null)
    try {
      if (next) await enableStaffLogin(u.id)
      else await disableStaffLogin(u.id)
      setMsg(next ? `Đã kích hoạt ${u.email}` : `Đã vô hiệu hóa ${u.email} — không đăng nhập được.`)
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Không cập nhật được')
    }
  }

  const removeUser = async (u: VietMyUserProfile) => {
    if (!confirmDangerousStaffAccountDelete(u.displayName || u.email || u.id)) return
    setErr(null)
    setMsg(null)
    try {
      await deleteStaffAccount(u.id)
      if (editing?.id === u.id) setEditing(null)
      setMsg(`Đã xóa tài khoản ${u.email}`)
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Không xóa được tài khoản')
    }
  }

  const teamMemberPicker = (
    selected: string[],
    onChange: (ids: string[]) => void,
    idPrefix: string,
  ) => (
    <fieldset className="rounded-xl border border-slate-200 bg-white px-3 py-3">
      <legend className="px-1 text-sm font-medium text-slate-800">Sale / CTV trong nhóm</legend>
      {counselorPickList.length === 0 ? (
        <p className="text-xs text-slate-600">Chưa có sale / CTV trong danh bạ.</p>
      ) : (
        <ul className="max-h-40 space-y-1.5 overflow-y-auto text-sm">
          {counselorPickList.map((c) => (
            <li key={c.id}>
              <label className="flex cursor-pointer items-center gap-2 rounded-lg px-1 py-0.5 hover:bg-slate-50">
                <input
                  type="checkbox"
                  className="h-4 w-4 cursor-pointer rounded border-slate-300 accent-[var(--color-primary)]"
                  checked={selected.includes(c.id)}
                  onChange={(e) => onChange(toggleTeamId(selected, c.id, e.target.checked))}
                  id={`${idPrefix}-${c.id}`}
                />
                <span className="text-slate-800">{c.displayName || c.email}</span>
              </label>
            </li>
          ))}
        </ul>
      )}
    </fieldset>
  )

  const tabs: { id: StaffMainTab; label: string; show: boolean }[] = [
    { id: 'list', label: 'Danh sách', show: true },
    { id: 'teams', label: 'Nhóm sale', show: canStaffAll && !teamScopeOnly },
    { id: 'add', label: 'Thêm nhân sự', show: canStaffAll },
  ]

  const initialOf = (u: VietMyUserProfile) => {
    const raw = (u.displayName || u.email || '?').trim()
    return raw.slice(0, 1).toUpperCase()
  }

  return (
    <div className="space-y-4 sm:space-y-5">
      {embedded ? null : (
        <header className="space-y-1">
          <h1 className="text-xl font-semibold tracking-tight text-slate-900">
            {teamScopeOnly ? 'Nhóm tư vấn' : 'Quản lý nhân sự'}
          </h1>
          <p className="max-w-2xl text-sm text-slate-600">
            {teamScopeOnly
              ? 'Xem và sửa TVV / CTV trong nhóm bạn. Đặt mật khẩu do Quản lý trường.'
              : 'Tạo tài khoản, gán nhóm, mật khẩu và quyền — một chỗ cho cả trường.'}
          </p>
        </header>
      )}

      {teamScopeOnly && profile && !teamLeadUsesExplicitRoster(profile) ? (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          Chưa có danh sách sale rõ trên hồ sơ nhóm. Nhờ Quản lý trường gán TVV/CTV vào nhóm bạn.
        </p>
      ) : null}

      <BentoGrid tight>
        <BentoStat label="Nhân sự" value={stats.total} hint={loading ? 'Đang tải…' : `${stats.active} đang dùng`} />
        <BentoStat label="Đang hoạt động" value={stats.active} tone="accent" />
        {canStaffAll && !teamScopeOnly ? (
          <>
            <BentoStat
              label="Cầm nhóm"
              value={stats.leads}
              hint="Trưởng nhóm / Quản lý có roster"
            />
            <BentoStat
              label="Chưa gán nhóm"
              value={stats.unassigned}
              tone={stats.unassigned > 0 ? 'ink' : 'default'}
              hint={stats.unassigned > 0 ? 'Cần gán vào nhóm' : 'Đã đủ nhóm'}
            />
          </>
        ) : (
          <BentoStat label="Đã khóa" value={stats.inactive} />
        )}
      </BentoGrid>

      {(msg || err || directoryError) && (
        <div className="space-y-2">
          {directoryError ? (
            <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-900">
              Không đọc được danh sách: {directoryError}
            </p>
          ) : null}
          {err ? <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{err}</p> : null}
          {msg ? (
            <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{msg}</p>
          ) : null}
        </div>
      )}

      <div
        className="flex flex-wrap gap-1 rounded-xl border border-slate-200/90 bg-white p-1 shadow-sm"
        role="tablist"
        aria-label="Mục quản lý nhân sự"
      >
        {tabs
          .filter((t) => t.show)
          .map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={mainTab === t.id}
              onClick={() => setMainTab(t.id)}
              className={[
                'inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold transition duration-150',
                mainTab === t.id
                  ? 'bg-[var(--color-primary)] text-white shadow-sm'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
              ].join(' ')}
            >
              {t.id === 'list' ? <Users className="h-3.5 w-3.5" aria-hidden /> : null}
              {t.id === 'teams' ? <UsersRound className="h-3.5 w-3.5" aria-hidden /> : null}
              {t.id === 'add' ? <UserPlus className="h-3.5 w-3.5" aria-hidden /> : null}
              {t.label}
            </button>
          ))}
      </div>

      {mainTab === 'list' ? (
        <BentoCell className="p-3 sm:p-4" colSpan={4}>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                {teamScopeOnly ? 'Nhân viên trong nhóm' : 'Danh sách nhân sự'}
              </h2>
              <p className="text-xs text-slate-500">
                {filteredUsers.length}/{sortedUsers.length} người · bấm Sửa để đổi nhóm, mật khẩu, quyền
              </p>
            </div>
            {canStaffAll ? (
              <button
                type="button"
                onClick={() => setMainTab('add')}
                className="inline-flex min-h-9 cursor-pointer items-center justify-center gap-1.5 rounded-xl bg-[var(--color-primary)] px-3 py-2 text-sm font-semibold text-white transition hover:brightness-110"
              >
                <Plus className="h-4 w-4" aria-hidden />
                Thêm nhanh
              </button>
            ) : null}
          </div>

          <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto_auto]">
            <label className="relative block">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
              <input
                value={listQuery}
                onChange={(e) => setListQuery(e.target.value)}
                placeholder="Tìm tên, email, vai trò…"
                className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-[var(--color-primary)]/20"
              />
            </label>
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value as UserRole | 'all')}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
              aria-label="Lọc vai trò"
            >
              <option value="all">Mọi vai trò</option>
              {assignableRoles.map((r) => (
                <option key={r} value={r}>
                  {USER_ROLE_LABELS[r]}
                </option>
              ))}
            </select>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as 'all' | 'active' | 'inactive')}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
              aria-label="Lọc trạng thái"
            >
              <option value="all">Mọi trạng thái</option>
              <option value="active">Đang dùng</option>
              <option value="inactive">Đã khóa</option>
            </select>
          </div>

          {loading ? <p className="mt-4 text-sm text-slate-600">Đang tải…</p> : null}
          {!loading && !directoryError && sortedUsers.length === 0 ? (
            <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
              Chưa thấy nhân sự trong trường đang chọn.
            </p>
          ) : null}
          {!loading && filteredUsers.length === 0 && sortedUsers.length > 0 ? (
            <p className="mt-4 text-sm text-slate-600">Không khớp bộ lọc — thử xóa ô tìm hoặc đổi vai trò.</p>
          ) : null}

          <ul className="mt-3 divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200/90 bg-white">
            {filteredUsers.map((u) => {
              const isSelf = selfUid !== null && u.id === selfUid
              const inactive = u.isActive === false
              const targetSuper = isSuperAdminRole(u.role)
              const viewerSuper = profile?.role === 'super_admin'
              const canStaffEdit = !targetSuper || viewerSuper
              const llmOk = targetSuper || u.allowLlmAndAiTasks === true
              const members = canOwnFieldStaffTeam(u.role) ? (teamLeadMembers.get(u.id) ?? []) : []
              const primaryLead = isFieldStaffRole(u.role)
                ? primaryTeamLeadForCounselor(u.id, users)
                : null
              const unassignedCounselor =
                isFieldStaffRole(u.role) && teamLeadsForCounselor(u.id, users).length === 0
              return (
                <li
                  key={u.id}
                  className={[
                    'flex flex-col gap-2 px-3 py-3 transition sm:flex-row sm:items-center sm:justify-between',
                    inactive ? 'bg-slate-50/80 opacity-80' : 'hover:bg-slate-50/70',
                  ].join(' ')}
                >
                  <div className="flex min-w-0 items-start gap-3">
                    <span
                      className={[
                        'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-sm font-bold',
                        inactive
                          ? 'bg-slate-200 text-slate-600'
                          : 'bg-[var(--color-primary-soft)] text-[var(--color-primary)]',
                      ].join(' ')}
                      aria-hidden
                    >
                      {initialOf(u)}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-slate-900">
                        {u.displayName || u.email}
                        {isSelf ? (
                          <span className="ml-2 rounded-md bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-amber-900">
                            Bạn
                          </span>
                        ) : null}
                      </p>
                      <p className="truncate text-xs text-slate-500">{u.email}</p>
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] font-semibold text-slate-700">
                          {USER_ROLE_LABELS[u.role]}
                        </span>
                        {inactive ? (
                          <span className="rounded-md bg-slate-200 px-1.5 py-0.5 text-[11px] font-semibold text-slate-700">
                            Đã khóa
                          </span>
                        ) : null}
                        {llmOk ? (
                          <span className="rounded-md bg-sky-100 px-1.5 py-0.5 text-[11px] font-semibold text-sky-900">
                            AI
                          </span>
                        ) : !targetSuper &&
                          (u.role === 'counselor' || u.role === 'ctv' || u.role === 'team_lead') ? (
                          <span className="rounded-md bg-amber-100 px-1.5 py-0.5 text-[11px] font-semibold text-amber-900">
                            Chưa AI
                          </span>
                        ) : null}
                        {canOwnFieldStaffTeam(u.role) ? (
                          <span className="rounded-md bg-violet-100 px-1.5 py-0.5 text-[11px] font-medium text-violet-900">
                            Nhóm: {members.length ? `${members.length} sale` : 'Chưa gán sale'}
                          </span>
                        ) : null}
                        {primaryLead ? (
                          <span className="rounded-md bg-emerald-50 px-1.5 py-0.5 text-[11px] font-medium text-emerald-900">
                            Thuộc: {primaryLead.displayName || primaryLead.email}
                          </span>
                        ) : null}
                        {unassignedCounselor ? (
                          <span className="rounded-md bg-amber-100 px-1.5 py-0.5 text-[11px] font-semibold text-amber-900">
                            Chưa gán nhóm
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-1.5 sm:justify-end">
                    {canStaffEdit && canManageUser(u) ? (
                      <>
                        <button
                          type="button"
                          onClick={() => openEdit(u)}
                          className="cursor-pointer rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-800 transition hover:bg-slate-50"
                        >
                          Sửa
                        </button>
                        {!isSelf ? (
                          inactive ? (
                            <button
                              type="button"
                              onClick={() => void toggleActive(u, true)}
                              className="cursor-pointer rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs font-semibold text-emerald-900 transition hover:bg-emerald-100"
                            >
                              Mở lại
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => void toggleActive(u, false)}
                              className="cursor-pointer rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs font-semibold text-amber-950 transition hover:bg-amber-100"
                            >
                              Khóa
                            </button>
                          )
                        ) : null}
                        {!isSelf ? (
                          <button
                            type="button"
                            onClick={() => void removeUser(u)}
                            className="cursor-pointer rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-xs font-semibold text-rose-900 transition hover:bg-rose-100"
                          >
                            Xóa
                          </button>
                        ) : null}
                      </>
                    ) : (
                      <span className="self-center rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-600">
                        Siêu QT
                      </span>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        </BentoCell>
      ) : null}

      {mainTab === 'teams' && canStaffAll && !teamScopeOnly ? (
        <BentoGrid>
          <BentoCell className="p-4" colSpan={4}>
            <h2 className="text-base font-semibold text-slate-900">Nhóm sale</h2>
            <p className="mt-1 text-sm text-slate-600">
              Mỗi Trưởng nhóm / Quản lý cầm nhóm có danh sách TVV–CTV. Bấm «Chỉnh nhóm» để tick người.
            </p>
            {teamLeads.length === 0 ? (
              <p className="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-700">
                Chưa có ai cầm nhóm. Tạo tài khoản vai trò Trưởng nhóm hoặc Quản lý, rồi gán sale ở tab này / form Sửa.
              </p>
            ) : (
              <ul className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {teamLeads.map((lead) => {
                  const members = teamLeadMembers.get(lead.id) ?? []
                  const explicit = teamLeadUsesExplicitRoster(lead)
                  return (
                    <li
                      key={lead.id}
                      className="flex flex-col rounded-xl border border-slate-200 bg-white p-3 shadow-sm"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-semibold text-slate-900">{lead.displayName || lead.email}</p>
                          <p className="text-xs text-slate-500">
                            {lead.role === 'admin' ? 'Quản lý · cầm nhóm' : USER_ROLE_LABELS[lead.role]}
                          </p>
                          {!explicit ? (
                            <p className="mt-1 text-xs text-amber-800">Nên chọn sale rõ trong «Chỉnh nhóm».</p>
                          ) : null}
                        </div>
                        <button
                          type="button"
                          onClick={() => openEdit(lead)}
                          className="shrink-0 cursor-pointer rounded-lg border border-[var(--color-primary)]/40 bg-[var(--color-primary-soft)] px-2.5 py-1.5 text-xs font-semibold text-[var(--color-primary)] transition hover:brightness-95"
                        >
                          Chỉnh nhóm
                        </button>
                      </div>
                      <p className="mt-2 text-xs font-medium text-slate-600">{members.length} sale</p>
                      {members.length > 0 ? (
                        <ul className="mt-2 flex flex-wrap gap-1">
                          {members.slice(0, 8).map((m) => (
                            <li
                              key={m.id}
                              className="rounded-md border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[11px] text-slate-800"
                            >
                              {m.displayName || m.email}
                            </li>
                          ))}
                          {members.length > 8 ? (
                            <li className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-600">
                              +{members.length - 8}
                            </li>
                          ) : null}
                        </ul>
                      ) : (
                        <p className="mt-2 text-xs text-slate-500">Chưa gán TVV.</p>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
            {unassignedCounselors.length > 0 ? (
              <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50/90 p-3">
                <p className="text-sm font-semibold text-amber-950">
                  Chưa thuộc nhóm ({unassignedCounselors.length})
                </p>
                <ul className="mt-2 flex flex-wrap gap-1.5">
                  {unassignedCounselors.map((c) => (
                    <li key={c.id}>
                      <button
                        type="button"
                        onClick={() => openEdit(c)}
                        className="cursor-pointer rounded-lg border border-amber-300 bg-white px-2 py-1 text-xs font-medium text-amber-950 transition hover:bg-amber-100"
                      >
                        {c.displayName || c.email}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </BentoCell>
        </BentoGrid>
      ) : null}

      {mainTab === 'add' && canStaffAll ? (
        <BentoGrid>
          <BentoCell className="p-4 sm:p-5" colSpan={2} rowSpan={2}>
            <h2 className="text-base font-semibold text-slate-900">Thêm một người</h2>
            <p className="mt-1 text-sm text-slate-600">Điền email, mật khẩu tạm, vai trò — rồi giao cho họ đổi mật khẩu sau.</p>
            <form onSubmit={(e) => void submit(e)} className="mt-4 space-y-3">
              <label className="block text-sm font-medium text-slate-700">
                Email đăng nhập
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={fieldClass()}
                />
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-sm font-medium text-slate-700">
                  Mật khẩu ban đầu
                  <input
                    type="password"
                    required
                    minLength={6}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className={fieldClass()}
                  />
                </label>
                <label className="block text-sm font-medium text-slate-700">
                  Họ tên hiển thị
                  <input
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    className={fieldClass()}
                  />
                </label>
              </div>
              <label className="block text-sm font-medium text-slate-700">
                Vai trò
                <select
                  value={role}
                  onChange={(e) => {
                    const r = e.target.value as UserRole
                    setRole(r)
                    if (!canOwnFieldStaffTeam(r)) setCreateTeamIds([])
                    if (!canAssignOmicallSip(r)) {
                      setCreateOmicallUser('')
                      setCreateOmicallPassword('')
                      setCreateOmicallOutbound('')
                      setCreateOmicallAgentId('')
                      setShowCreateOmicall(false)
                    }
                  }}
                  className={fieldClass()}
                >
                  {assignableRoles.map((r) => (
                    <option key={r} value={r}>
                      {USER_ROLE_LABELS[r]}
                    </option>
                  ))}
                </select>
              </label>
              {role === 'accountant' ? (
                <p className="rounded-lg border border-emerald-200 bg-emerald-50/80 px-3 py-2 text-xs leading-snug text-emerald-950">
                  Kế toán đăng nhập tại <strong>/ke-toan/login</strong> — có nút đổi mật khẩu trên cổng đó.
                </p>
              ) : null}
              {canOwnFieldStaffTeam(role) ? teamMemberPicker(createTeamIds, setCreateTeamIds, 'create') : null}
              {canAssignOmicallSip(role) && canOmicallConfig ? (
                <div>
                  <button
                    type="button"
                    onClick={() => setShowCreateOmicall((v) => !v)}
                    className="cursor-pointer text-xs font-semibold text-sky-800 underline-offset-2 hover:underline"
                  >
                    {showCreateOmicall ? 'Ẩn tổng đài' : 'Gán số tổng đài (tuỳ chọn)'}
                  </button>
                  {showCreateOmicall ? (
                    <div className="mt-2 space-y-2 rounded-xl border border-sky-200 bg-sky-50/50 p-3">
                      <label className="block text-sm font-medium text-slate-700">
                        Số nội bộ
                        <input
                          value={createOmicallUser}
                          onChange={(e) => setCreateOmicallUser(e.target.value)}
                          className={fieldClass()}
                          placeholder="vd. 100"
                          autoComplete="off"
                        />
                      </label>
                      <label className="block text-sm font-medium text-slate-700">
                        Mật khẩu SIP
                        <input
                          type="password"
                          value={createOmicallPassword}
                          onChange={(e) => setCreateOmicallPassword(e.target.value)}
                          className={fieldClass()}
                          autoComplete="new-password"
                        />
                      </label>
                      <label className="block text-sm font-medium text-slate-700">
                        Đầu số gọi ra
                        <input
                          value={createOmicallOutbound}
                          onChange={(e) => setCreateOmicallOutbound(e.target.value)}
                          className={fieldClass()}
                          autoComplete="off"
                        />
                      </label>
                      <label className="block text-sm font-medium text-slate-700">
                        Agent ID
                        <input
                          value={createOmicallAgentId}
                          onChange={(e) => setCreateOmicallAgentId(e.target.value)}
                          className={`${fieldClass()} font-mono`}
                          autoComplete="off"
                        />
                      </label>
                    </div>
                  ) : null}
                </div>
              ) : null}
              <button
                type="submit"
                disabled={busy}
                className="w-full cursor-pointer rounded-xl bg-[var(--color-primary)] py-2.5 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-50"
              >
                {busy ? 'Đang tạo…' : 'Tạo tài khoản'}
              </button>
            </form>
          </BentoCell>
          <BentoCell className="p-4 sm:p-5" colSpan={2} variant="muted">
            <h2 className="text-base font-semibold text-slate-900">Nhập nhiều người (Excel)</h2>
            <p className="mt-1 text-sm text-slate-600">Dùng khi thêm hàng loạt TVV trước khi gắn hồ sơ.</p>
            <div className="mt-3">
              <StaffExcelImportPanel />
            </div>
          </BentoCell>
        </BentoGrid>
      ) : null}

      {editing ? (
        <ViewportModal
          open
          onClose={() => setEditing(null)}
          title="Sửa nhân sự"
          subtitle={editing.email}
          titleId="staff-edit-title"
          size="xl"
          closeDisabled={editBusy || resetPwdBusy}
          footer={
            <>
              <button
                type="submit"
                form="staff-edit-form"
                disabled={editBusy || resetPwdBusy}
                className="cursor-pointer rounded-xl bg-[var(--color-primary)] px-4 py-2.5 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-50"
              >
                {editBusy ? 'Đang lưu…' : 'Lưu thay đổi'}
              </button>
              <button
                type="button"
                disabled={editBusy || resetPwdBusy}
                onClick={() => setEditing(null)}
                className="cursor-pointer rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-800 transition hover:bg-slate-50"
              >
                Hủy
              </button>
            </>
          }
        >
            <form id="staff-edit-form" onSubmit={(e) => void saveEdit(e)} className="space-y-3">
              <SectionCard title="Thông tin cơ bản" hint="Họ tên, vai trò, trạng thái đăng nhập">
                <label className="block text-sm font-medium text-slate-700">
                  Họ tên hiển thị
                  <input
                    value={editDisplayName}
                    onChange={(e) => setEditDisplayName(e.target.value)}
                    className={fieldClass()}
                  />
                </label>
                <label className="block text-sm font-medium text-slate-700">
                  Vai trò
                  <select
                    value={editRole}
                    onChange={(e) => {
                      const r = e.target.value as UserRole
                      setEditRole(r)
                      if (!canOwnFieldStaffTeam(r)) setEditTeamIds([])
                    }}
                    disabled={selfUid === editing.id}
                    className={`${fieldClass()} disabled:opacity-60`}
                  >
                    {assignableRoles.map((r) => (
                      <option key={r} value={r}>
                        {USER_ROLE_LABELS[r]}
                      </option>
                    ))}
                  </select>
                </label>
                {editRole === 'accountant' ? (
                  <p className="text-xs text-emerald-800">
                    Kế toán đăng nhập tại <strong>/ke-toan/login</strong>.
                  </p>
                ) : null}
                <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-800">
                  <input
                    type="checkbox"
                    className="cursor-pointer"
                    checked={editActive}
                    onChange={(e) => setEditActive(e.target.checked)}
                    disabled={selfUid === editing.id}
                  />
                  Tài khoản đang hoạt động
                </label>
              </SectionCard>

              {(canOwnFieldStaffTeam(editRole) || isFieldStaffRole(editRole)) && canStaffAll ? (
                <SectionCard
                  title="Nhóm làm việc"
                  hint="Gán sale vào người cầm nhóm, hoặc chọn nhóm cho TVV/CTV"
                  icon={<UsersRound className="h-4 w-4" />}
                >
                  {canOwnFieldStaffTeam(editRole)
                    ? teamMemberPicker(editTeamIds, setEditTeamIds, 'edit')
                    : null}
                  {isFieldStaffRole(editRole) ? (
                    <label className="block text-sm font-medium text-slate-700">
                      Thuộc nhóm của
                      <select
                        value={editTeamLeadId}
                        onChange={(e) => setEditTeamLeadId(e.target.value)}
                        className={fieldClass()}
                      >
                        <option value="">— Chưa gán / gỡ khỏi nhóm —</option>
                        {teamLeads.map((lead) => (
                          <option key={lead.id} value={lead.id}>
                            {lead.displayName || lead.email} —{' '}
                            {lead.role === 'admin' ? 'Quản lý (cầm nhóm)' : 'Trưởng nhóm'}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : null}
                  {canAppearOnPublicRegistrationPortal(editRole) ? (
                    <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-emerald-200/80 bg-emerald-50/70 px-3 py-2 text-sm text-slate-800">
                      <input
                        type="checkbox"
                        className="mt-0.5 h-4 w-4 cursor-pointer rounded border-slate-300 accent-emerald-600"
                        checked={editShowOnPortal}
                        onChange={(e) => setEditShowOnPortal(e.target.checked)}
                      />
                      <span>
                        <span className="font-semibold">Hiện trên cổng đăng ký</span>
                        <span className="mt-0.5 block text-xs text-slate-600">
                          Sinh viên chọn thầy/cô này khi điền form công khai (TVV, CTV, trưởng nhóm hoặc quản lý).
                        </span>
                      </span>
                    </label>
                  ) : null}
                </SectionCard>
              ) : null}

              <SectionCard
                title="Mật khẩu đăng nhập"
                hint="Đặt ngay hoặc gửi email — người dùng cũng đổi được sau khi đăng nhập"
                icon={<KeyRound className="h-4 w-4" />}
              >
                {canStaffAll ? (
                  <>
                    <label className="block text-sm font-medium text-slate-700">
                      Mật khẩu mới (tuỳ chọn)
                      <input
                        type="password"
                        value={editNewPassword}
                        onChange={(e) => setEditNewPassword(e.target.value)}
                        minLength={6}
                        autoComplete="new-password"
                        placeholder="Để trống nếu không đổi"
                        disabled={selfUid === editing.id}
                        className={`${fieldClass()} disabled:bg-slate-100`}
                      />
                    </label>
                    {selfUid === editing.id ? (
                      <p className="text-xs text-amber-800">Đổi mật khẩu của bạn ở menu bên trái (Đổi mật khẩu).</p>
                    ) : (
                      <button
                        type="button"
                        disabled={resetPwdBusy || editBusy || !editing.email?.trim()}
                        onClick={sendPasswordResetForEditing}
                        className="w-full cursor-pointer rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
                      >
                        {resetPwdBusy ? 'Đang gửi…' : 'Gửi email đặt lại mật khẩu'}
                      </button>
                    )}
                  </>
                ) : (
                  <p className="text-xs text-slate-600">Đặt mật khẩu do Quản lý trường thực hiện.</p>
                )}
              </SectionCard>

              <SectionCard title="AI & quyền thêm" icon={<Shield className="h-4 w-4" />}>
                {isSuperAdminRole(editing.role) ? (
                  <p className="text-xs text-sky-900">Siêu quản trị luôn được dùng AI trên CRM.</p>
                ) : (
                  <label className="flex cursor-pointer items-start gap-2.5 text-sm text-slate-800">
                    <input
                      type="checkbox"
                      className="mt-0.5 h-4 w-4 cursor-pointer rounded accent-violet-600"
                      checked={editAllowLlm}
                      onChange={(e) => setEditAllowLlm(e.target.checked)}
                    />
                    <span className="font-semibold">Cho phép dùng AI trên hồ sơ</span>
                  </label>
                )}
                {canStaffAll &&
                !isAdminLikeRole(editRole) &&
                !isSuperAdminRole(editRole) &&
                editRole !== 'accountant' ? (
                  <ul className="space-y-2 border-t border-slate-200/80 pt-2">
                    {STAFF_ASSIGNABLE_PERMISSIONS.map((item) => {
                      const roleHas = defaultPermissionsForRole(editRole).includes(item.permission)
                      const grantedExtra = editExtraPerms.includes(item.permission)
                      const denied = editDeniedPerms.includes(item.permission)
                      const effectiveOn = denied ? false : roleHas || grantedExtra
                      return (
                        <li key={item.permission}>
                          <label className="flex cursor-pointer items-start gap-2 text-sm text-slate-800">
                            <input
                              type="checkbox"
                              className="mt-0.5 cursor-pointer"
                              checked={effectiveOn}
                              onChange={(e) => {
                                const on = e.target.checked
                                setEditDeniedPerms((prev) => prev.filter((p) => p !== item.permission))
                                setEditExtraPerms((prev) => {
                                  const without = prev.filter((p) => p !== item.permission)
                                  if (on && !roleHas) return [...without, item.permission]
                                  return without
                                })
                                if (!on && roleHas) {
                                  setEditDeniedPerms((prev) =>
                                    prev.includes(item.permission) ? prev : [...prev, item.permission],
                                  )
                                }
                              }}
                            />
                            <span>
                              <span className="font-medium">{item.label}</span>
                              <span className="mt-0.5 block text-[11px] text-slate-500">{item.hint}</span>
                            </span>
                          </label>
                        </li>
                      )
                    })}
                  </ul>
                ) : null}
              </SectionCard>

              {canOmicallConfig && canAssignOmicallSip(editRole) ? (
                <SectionCard
                  title="Tổng đài (tuỳ chọn)"
                  hint="Số nội bộ & SIP — để trống nếu dùng mặc định hệ thống"
                  icon={<Phone className="h-4 w-4" />}
                >
                  <div className="grid gap-2 sm:grid-cols-2">
                    <label className="block text-sm font-medium text-slate-700">
                      Số nội bộ
                      <input
                        value={editOmicallUser}
                        onChange={(e) => setEditOmicallUser(e.target.value)}
                        className={fieldClass()}
                        placeholder="vd. 100"
                        autoComplete="off"
                      />
                    </label>
                    <label className="block text-sm font-medium text-slate-700">
                      Mật khẩu SIP
                      <input
                        type="password"
                        value={editOmicallPassword}
                        onChange={(e) => setEditOmicallPassword(e.target.value)}
                        className={fieldClass()}
                        autoComplete="new-password"
                      />
                    </label>
                    <label className="block text-sm font-medium text-slate-700">
                      Đầu số gọi ra
                      <input
                        value={editOmicallOutbound}
                        onChange={(e) => setEditOmicallOutbound(e.target.value)}
                        className={fieldClass()}
                        autoComplete="off"
                      />
                    </label>
                    <label className="block text-sm font-medium text-slate-700">
                      Agent ID
                      <input
                        value={editOmicallAgentId}
                        onChange={(e) => setEditOmicallAgentId(e.target.value)}
                        className={`${fieldClass()} font-mono`}
                        autoComplete="off"
                      />
                    </label>
                  </div>
                </SectionCard>
              ) : null}

              {editErr ? <p className="text-sm text-rose-600">{editErr}</p> : null}
              {editMsg ? <p className="text-sm text-emerald-700">{editMsg}</p> : null}
            </form>
        </ViewportModal>
      ) : null}
    </div>
  )
}
