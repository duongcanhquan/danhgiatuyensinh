import { useMemo, useState, type FormEvent } from 'react'
import { doc, Timestamp, writeBatch } from 'firebase/firestore'
import { useAuth } from '../hooks/useAuth'
import { useOrg } from '../hooks/useOrg'
import { useCounselorDirectory } from '../hooks/useCounselorDirectory'
import {
  FS_COLLECTIONS,
  USER_ROLE_LABELS,
  type Permission,
  type UserRole,
  type VietMyUserProfile,
} from '../types'
import { getFirestoreDb } from '../services/firebase'
import {
  canOwnFieldStaffTeam,
  isAdminLikeRole,
  isFieldStaffRole,
  isSuperAdminRole,
} from '../auth/roleUtils'
import { STAFF_ASSIGNABLE_PERMISSIONS } from '../utils/roleCapabilitiesConfig'
import { defaultPermissionsForRole } from '../auth/permissions'
import { syncOmicallInternalPhones } from '../services/omicallSyncInternalPhones'
import { confirmDangerousStaffAccountDelete } from '../utils/dangerousDeleteConfirm'
import { StaffExcelImportPanel } from '../components/StaffExcelImportPanel'
import {
  counselorIdsInManagerScope,
  explicitManagedCounselorIds,
  isUserInExplicitTeamRoster,
  patchesForCounselorTeamAssignment,
  primaryTeamLeadForCounselor,
  teamLeadUsesExplicitRoster,
  teamLeadsForCounselor,
} from '../utils/teamScope'

/** Vai trò quản trị được tạo trong app; kế toán là cổng riêng, không nằm trong quyền admin. */
const ROLES_BASE: UserRole[] = ['counselor', 'ctv', 'team_lead', 'admin', 'accountant', 'marketing']

/** Quản lý gán số nội bộ / mật khẩu SIP cho nhân viên gọi điện và Trưởng nhóm. */
function canAssignOmicallSip(role: UserRole): boolean {
  return role === 'counselor' || role === 'ctv' || role === 'team_lead' || role === 'admin'
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
    if (profile?.role === 'super_admin') return [...ROLES_BASE, 'super_admin']
    return [...ROLES_BASE]
  }, [profile?.role, teamScopeOnly])
  const { users, loading, error: directoryError, fieldStaff } = useCounselorDirectory()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [role, setRole] = useState<UserRole>('counselor')
  const [createTeamIds, setCreateTeamIds] = useState<string[]>([])
  const [createOmicallUser, setCreateOmicallUser] = useState('')
  const [createOmicallPassword, setCreateOmicallPassword] = useState('')
  const [createOmicallOutbound, setCreateOmicallOutbound] = useState('')
  const [createOmicallAgentId, setCreateOmicallAgentId] = useState('')
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
  const [omicallSyncBusy, setOmicallSyncBusy] = useState(false)
  /** Trưởng nhóm phụ trách (khi sửa TVV — admin). */
  const [editTeamLeadId, setEditTeamLeadId] = useState('')
  const [editBusy, setEditBusy] = useState(false)
  const [editNewPassword, setEditNewPassword] = useState('')
  const [resetPwdBusy, setResetPwdBusy] = useState(false)
  const [editMsg, setEditMsg] = useState<string | null>(null)
  const [editErr, setEditErr] = useState<string | null>(null)

  const counselorPickList = useMemo(() => {
    if (teamScopeOnly && profile) {
      const team = new Set(explicitManagedCounselorIds(profile))
      return fieldStaff.filter((c) => team.has(c.id))
    }
    return fieldStaff
  }, [fieldStaff, teamScopeOnly, profile])

  /** Trưởng nhóm Sale (cầm roster TVV/CTV). */
  const teamLeads = useMemo(
    () => users.filter((u) => canOwnFieldStaffTeam(u.role) && u.isActive !== false),
    [users],
  )

  const teamLeadMembers = useMemo(() => {
    const map = new Map<string, VietMyUserProfile[]>()
    for (const lead of teamLeads) {
      const ids = new Set(counselorIdsInManagerScope(lead, users))
      map.set(
        lead.id,
        fieldStaff.filter((c) => ids.has(c.id)),
      )
    }
    return map
  }, [teamLeads, users, fieldStaff])

  const unassignedCounselors = useMemo(() => {
    if (teamScopeOnly) return []
    return fieldStaff.filter((c) => teamLeadsForCounselor(c.id, users).length === 0)
  }, [fieldStaff, users, teamScopeOnly])

  const sortedUsers = useMemo(() => {
    let list = users
    if (teamScopeOnly && profile) {
      const teamIds = new Set(explicitManagedCounselorIds(profile))
      list = users.filter((u) => teamIds.has(u.id) || u.id === profile.id)
    }
    return [...list].sort((a, b) => {
      const la = (a.displayName || a.email).toLocaleLowerCase('vi')
      const lb = (b.displayName || b.email).toLocaleLowerCase('vi')
      return la.localeCompare(lb, 'vi')
    })
  }, [users, teamScopeOnly, profile])

  const selfUid = firebaseUser?.uid ?? profile?.id ?? null

  if (!canAccessStaff) {
    return (
      <div className="rounded-2xl border border-amber-300/60 bg-amber-50/90 p-6 text-sm text-amber-900">
        Bạn không có quyền quản lý nhân sự. Liên hệ <strong>Quản lý</strong> hoặc <strong>Trưởng nhóm</strong>.
      </div>
    )
  }

  const teamBanner = teamScopeOnly ? (
    <div className="space-y-2">
      <p className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm leading-relaxed text-sky-950">
        <strong>Trưởng nhóm Sale:</strong> quản lý TVV / CTV đã gán trong nhóm; đặt mật khẩu do Quản lý trường.
      </p>
      {profile && !teamLeadUsesExplicitRoster(profile) ? (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          Chưa có danh sách sale rõ trên hồ sơ nhóm. Nhờ Quản lý trường gán TVV/CTV vào nhóm bạn — khi đó mới sửa /
          vô hiệu / xóa được trên màn này.
        </p>
      ) : null}
    </div>
  ) : canStaffAll ? (
    <p className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm leading-relaxed text-sky-950">
      <strong>Quản lý trường:</strong> xem, sửa, vô hiệu và đặt mật khẩu mọi nhân sự trong trường (TVV, CTV, Trưởng
      nhóm, Quản lý khác) — trừ Siêu quản trị. Nhiều Quản lý cùng làm được.
    </p>
  ) : null

  const canManageUser = (u: VietMyUserProfile) => {
    if (isSuperAdminRole(u.role) && !isSuperAdminRole(profile?.role)) return false
    if (canStaffAll) return true
    if (!profile || !teamScopeOnly) return false
    return isUserInExplicitTeamRoster(profile, u)
  }

  const omicallSyncBanner =
    canOmicallConfig && !teamScopeOnly ? (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-sky-200 bg-sky-50/80 px-4 py-3 text-sm text-sky-950">
        <p>
          <strong>OMICall:</strong> đồng bộ số nội bộ, SIP, agent ID và đầu số từ tổng đài vào hồ sơ nhân sự (khớp
          email) — TVV, CTV, Trưởng nhóm, Quản lý.
        </p>
        <button
          type="button"
          disabled={omicallSyncBusy}
          onClick={() => {
            setOmicallSyncBusy(true)
            setMsg(null)
            void syncOmicallInternalPhones(false)
              .then((r) =>
                setMsg(
                  `Đồng bộ OMICall: ${r.updated} hồ sơ cập nhật / ${r.matched} khớp · ${r.totalExtensions} số nội bộ trên tổng đài.`,
                ),
              )
              .catch((e) => setErr(e instanceof Error ? e.message : 'Lỗi đồng bộ OMICall'))
              .finally(() => setOmicallSyncBusy(false))
          }}
          className="rounded-lg bg-sky-800 px-3 py-1.5 text-xs font-semibold text-white hover:bg-sky-900 disabled:opacity-50"
        >
          {omicallSyncBusy ? 'Đang đồng bộ…' : 'Đồng bộ số nội bộ → hồ sơ'}
        </button>
      </div>
    ) : null

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
        ...(isFieldStaffRole(editRole) || isFieldStaffRole(editing.role)
          ? {
              showOnPublicRegistrationPortal: isFieldStaffRole(editRole) ? editShowOnPortal : false,
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
    <fieldset className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
      <legend className="px-1 text-sm font-medium text-slate-800">Sale / CTV trong nhóm</legend>
      {counselorPickList.length === 0 ? (
        <p className="text-xs text-slate-600">Chưa có sale / CTV trong danh bạ.</p>
      ) : (
        <ul className="max-h-40 space-y-1.5 overflow-y-auto text-sm">
          {counselorPickList.map((c) => (
            <li key={c.id}>
              <label className="flex cursor-pointer items-center gap-2 rounded-lg px-1 py-0.5 hover:bg-white/70">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-slate-300 accent-[var(--color-primary)]"
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

  return (
    <div className="space-y-8">
      {embedded ? null : (
        <header>
          <h1 className="text-xl font-semibold text-slate-900">
            {teamScopeOnly ? 'Nhóm tư vấn' : 'Quản lý nhân sự'}
          </h1>
        </header>
      )}

      {teamBanner}
      {omicallSyncBanner}

      {canStaffAll && !teamScopeOnly ? <StaffExcelImportPanel /> : null}

      {canStaffAll && !teamScopeOnly ? (
        <section className="app-surface-elevated p-4 sm:p-5">
          <h2 className="app-section-heading">Phân nhóm sale ↔ Trưởng nhóm</h2>
          {teamLeads.length === 0 ? (
            <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
              Chưa có tài khoản <strong>Trưởng nhóm Sale</strong> để cầm nhóm. Tạo / chọn vai trò đó, rồi gán sale ở
              «Chỉnh nhóm» hoặc form Sửa. Quản lý trường vẫn xem và sửa được mọi nhân sự trong trường (trừ Siêu quản
              trị).
            </p>
          ) : (
            <ul className="mt-4 space-y-3">
              {teamLeads.map((lead) => {
                const members = teamLeadMembers.get(lead.id) ?? []
                const explicit = teamLeadUsesExplicitRoster(lead)
                return (
                  <li
                    key={lead.id}
                    className="rounded-xl border border-[var(--color-primary)]/30 bg-[var(--color-primary-soft)]/40 px-4 py-3"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-900">{lead.displayName || lead.email}</p>
                        <p className="text-xs text-slate-500">
                          {USER_ROLE_LABELS[lead.role]} · {lead.email}
                        </p>
                        {!explicit ? (
                          <p className="mt-1 text-xs text-amber-800">
                            Đang dùng fallback khoa/phòng (legacy) — nên chọn TVV rõ trong «Chỉnh nhóm».
                          </p>
                        ) : null}
                      </div>
                      <button
                        type="button"
                        onClick={() => openEdit(lead)}
                        className="shrink-0 rounded-lg border border-[var(--color-primary)]/40 bg-white px-3 py-1.5 text-xs font-semibold text-[var(--color-primary)] hover:bg-[var(--color-primary-soft)]"
                      >
                        Chỉnh nhóm ({members.length} TVV)
                      </button>
                    </div>
                    {members.length > 0 ? (
                      <ul className="mt-2 flex flex-wrap gap-1.5">
                        {members.map((m) => (
                          <li
                            key={m.id}
                            className="rounded-lg border border-slate-200/80 bg-white px-2 py-0.5 text-xs font-medium text-slate-800"
                          >
                            {m.displayName || m.email}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mt-2 text-xs text-slate-600">Chưa gán TVV — bấm «Chỉnh nhóm» để tick danh sách.</p>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
          {unassignedCounselors.length > 0 ? (
            <div className="mt-4 rounded-xl border border-amber-300/80 bg-amber-50/90 px-4 py-3">
              <p className="text-sm font-semibold text-amber-950">
                TVV chưa thuộc nhóm nào ({unassignedCounselors.length})
              </p>
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {unassignedCounselors.map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => openEdit(c)}
                      className="rounded-lg border border-amber-400/80 bg-white px-2 py-0.5 text-xs font-medium text-amber-950 hover:bg-amber-100/80"
                    >
                      {c.displayName || c.email} — gán nhóm
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>
      ) : null}

      {directoryError ? (
        <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-900">
          Không đọc được danh sách users: {directoryError}. Kiểm tra Firestore Rules cho collection{' '}
          <code className="text-xs">users</code>.
        </p>
      ) : null}

      <div className={`grid gap-8 ${canStaffAll ? 'lg:grid-cols-2' : ''}`}>
        {canStaffAll ? (
        <form onSubmit={(e) => void submit(e)} className="app-surface-elevated p-4 sm:p-5">
          <h2 className="app-section-heading">Thêm nhân viên</h2>
          <label className="mt-4 block text-sm font-medium text-slate-700">
            Email đăng nhập
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-200/80 bg-white/80 px-3 py-2 text-sm text-slate-900"
            />
          </label>
          <label className="mt-3 block text-sm font-medium text-slate-700">
            Mật khẩu ban đầu
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-200/80 bg-white/80 px-3 py-2 text-sm text-slate-900"
            />
          </label>
          <label className="mt-3 block text-sm font-medium text-slate-700">
            Họ tên hiển thị
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-200/80 bg-white/80 px-3 py-2 text-sm text-slate-900"
            />
          </label>
          <label className="mt-3 block text-sm font-medium text-slate-700">
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
                }
              }}
              className="mt-1 w-full rounded-xl border border-slate-200/80 bg-white/80 px-3 py-2 text-sm text-slate-900"
            >
              {assignableRoles.map((r) => (
                <option key={r} value={r}>
                  {USER_ROLE_LABELS[r]}
                </option>
              ))}
            </select>
          </label>
          {canOwnFieldStaffTeam(role) && canStaffAll
            ? teamMemberPicker(createTeamIds, setCreateTeamIds, 'create')
            : null}
          {canOwnFieldStaffTeam(role) && canStaffAll && createTeamIds.length === 0 ? (
            <p className="mt-2 text-xs text-amber-800">
              Có thể chọn sẵn sale trong nhóm — hoặc chỉnh sau ở mục «Phân nhóm» phía trên.
            </p>
          ) : null}
          {canAssignOmicallSip(role) && canOmicallConfig ? (
            <div className="mt-4 rounded-xl border border-sky-200/80 bg-sky-50/50 px-3 py-3 space-y-2">
              <p className="text-xs font-semibold text-sky-950">OMICall (tuỳ chọn)</p>
              <p className="text-xs leading-snug text-slate-600">
                Quản lý gán số nội bộ và mật khẩu SIP cho nhân viên / Trưởng nhóm. Có thể tạo số trên OMICall cùng{' '}
                <strong>email</strong> này rồi đồng bộ, hoặc điền tay bên dưới.
              </p>
              <label className="block text-sm font-medium text-slate-700">
                Số nội bộ
                <input
                  value={createOmicallUser}
                  onChange={(e) => setCreateOmicallUser(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-200/80 bg-white/80 px-3 py-2 text-sm"
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
                  className="mt-1 w-full rounded-xl border border-slate-200/80 bg-white/80 px-3 py-2 text-sm"
                  autoComplete="new-password"
                />
              </label>
              <label className="block text-sm font-medium text-slate-700">
                Đầu số gọi ra
                <input
                  value={createOmicallOutbound}
                  onChange={(e) => setCreateOmicallOutbound(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-200/80 bg-white/80 px-3 py-2 text-sm"
                  autoComplete="off"
                />
              </label>
              <label className="block text-sm font-medium text-slate-700">
                Agent ID OMICall
                <input
                  value={createOmicallAgentId}
                  onChange={(e) => setCreateOmicallAgentId(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-200/80 bg-white/80 px-3 py-2 text-sm font-mono"
                  autoComplete="off"
                />
              </label>
            </div>
          ) : null}
          {err ? <p className="mt-3 text-sm text-rose-600">{err}</p> : null}
          {msg ? <p className="mt-3 text-sm text-emerald-700">{msg}</p> : null}
          <button
            type="submit"
            disabled={busy}
            className="mt-4 w-full rounded-xl border border-emerald-300/60 bg-indigo-600 py-2.5 text-sm font-semibold text-white shadow-md hover:bg-indigo-700 disabled:opacity-50"
          >
            {busy ? 'Đang tạo…' : 'Tạo tài khoản'}
          </button>
        </form>
        ) : null}

        <div className="app-surface-elevated p-4 sm:p-5">
          <h2 className="app-section-heading">
            {teamScopeOnly ? 'Nhân viên trong nhóm' : 'Danh sách nhân sự'}
          </h2>
          {loading ? <p className="mt-3 text-sm text-slate-600">Đang tải…</p> : null}
          {!loading && !directoryError && sortedUsers.length === 0 ? (
            <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
              Chưa thấy nhân sự trong trường đang chọn. Siêu quản trị: kiểm tra bộ chọn trường (VietMy). Tài khoản cũ
              thiếu mã trường sẽ hiện lại sau khi app cập nhật — hoặc chạy gắn orgId Phase 0.
            </p>
          ) : null}
          <ul className="mt-3 max-h-[min(75vh,56rem)] min-h-[28rem] space-y-2 overflow-y-auto text-sm">
            {sortedUsers.map((u) => {
              const isSelf = selfUid !== null && u.id === selfUid
              const inactive = u.isActive === false
              const targetSuper = isSuperAdminRole(u.role)
              const viewerSuper = profile?.role === 'super_admin'
              const canStaffEdit = !targetSuper || viewerSuper
              const llmOk = targetSuper || u.allowLlmAndAiTasks === true
              const teamCount = u.managedCounselorIds?.length ?? 0
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
                    'rounded-lg border border-slate-200/70 bg-white/60 px-3 py-2',
                    inactive ? 'opacity-70' : '',
                  ].join(' ')}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium text-slate-900">{u.displayName || u.email}</p>
                      <p className="truncate text-xs text-slate-500">{u.email}</p>
                      <p className="mt-0.5 text-xs font-medium text-[var(--color-primary)]">
                        {USER_ROLE_LABELS[u.role]}
                        {canOwnFieldStaffTeam(u.role) ? (
                          <span className="ml-2 font-normal text-slate-600">
                            · {members.length > 0
                              ? members.map((m) => m.displayName || m.email).join(', ')
                              : teamCount > 0
                                ? `${teamCount} sale`
                                : 'Chưa gán sale'}
                          </span>
                        ) : null}
                        {primaryLead ? (
                          <span className="ml-2 block font-normal text-slate-600">
                            Nhóm: {primaryLead.displayName || primaryLead.email}
                          </span>
                        ) : null}
                        {unassignedCounselor ? (
                          <span className="ml-2 block font-normal text-amber-800">Chưa gán nhóm</span>
                        ) : null}
                        {inactive ? (
                          <span className="ml-2 rounded bg-slate-200 px-1.5 py-0.5 text-slate-700">Đã vô hiệu</span>
                        ) : null}
                        {isSelf ? (
                          <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-amber-900">Bạn</span>
                        ) : null}
                        {llmOk ? (
                          <span className="ml-2 rounded bg-sky-100 px-1.5 py-0.5 font-semibold text-sky-900">LLM</span>
                        ) : !targetSuper && (u.role === 'counselor' || u.role === 'ctv' || u.role === 'team_lead') ? (
                          <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 font-semibold text-amber-900">Chưa AI</span>
                        ) : null}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-1">
                      {canStaffEdit && canManageUser(u) ? (
                        <>
                          <button
                            type="button"
                            onClick={() => openEdit(u)}
                            className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-800 hover:bg-slate-50"
                          >
                            Sửa
                          </button>
                          {!isSelf ? (
                            inactive ? (
                              <button
                                type="button"
                                onClick={() => void toggleActive(u, true)}
                                className="rounded-lg border border-emerald-300 bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-900 hover:bg-indigo-100"
                              >
                                Kích hoạt
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => void toggleActive(u, false)}
                                className="rounded-lg border border-amber-300 bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-950 hover:bg-amber-100"
                              >
                                Vô hiệu
                              </button>
                            )
                          ) : null}
                          {!isSelf ? (
                            <button
                              type="button"
                              onClick={() => void removeUser(u)}
                              className="rounded-lg border border-rose-300 bg-rose-50 px-2 py-1 text-xs font-semibold text-rose-900 hover:bg-rose-100"
                            >
                              Xóa
                            </button>
                          ) : null}
                        </>
                      ) : (
                        <span className="self-center rounded border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-600">
                          Siêu QT
                        </span>
                      )}
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        </div>
      </div>

      {editing ? (
        <div
          className="fixed inset-0 z-[100] flex items-end justify-center bg-black/40 p-4 sm:items-center"
          role="dialog"
          aria-modal
          aria-labelledby="staff-edit-title"
          onClick={() => setEditing(null)}
        >
          <div
            className="max-h-[min(92dvh,880px)] w-full max-w-md overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-xl sm:max-w-xl md:max-w-2xl md:p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="staff-edit-title" className="text-base font-semibold text-slate-900">
              Sửa nhân viên
            </h3>
            <p className="mt-1 text-xs text-slate-600">{editing.email}</p>
            <form onSubmit={(e) => void saveEdit(e)} className="mt-4 space-y-3">
              <label className="block text-sm font-medium text-slate-700">
                Họ tên hiển thị
                <input
                  value={editDisplayName}
                  onChange={(e) => setEditDisplayName(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
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
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm disabled:opacity-60"
                >
                  {assignableRoles.map((r) => (
                    <option key={r} value={r}>
                      {USER_ROLE_LABELS[r]}
                    </option>
                  ))}
                </select>
                {selfUid === editing.id ? (
                  <span className="mt-1 block text-xs text-amber-800">Không đổi vai trò trên chính bạn từ đây.</span>
                ) : null}
              </label>
              {canOwnFieldStaffTeam(editRole) && canStaffAll
                ? teamMemberPicker(editTeamIds, setEditTeamIds, 'edit')
                : null}
              {isFieldStaffRole(editRole) && canStaffAll ? (
                <label className="block text-sm font-medium text-slate-700">
                  Nhóm phụ trách (Trưởng nhóm)
                  <select
                    value={editTeamLeadId}
                    onChange={(e) => setEditTeamLeadId(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  >
                    <option value="">— Chưa gán / gỡ khỏi nhóm —</option>
                    {teamLeads.map((lead) => (
                      <option key={lead.id} value={lead.id}>
                        {lead.displayName || lead.email} — Trưởng nhóm
                      </option>
                    ))}
                  </select>
                  <span className="mt-1 block text-xs text-slate-500">
                    Sale / CTV thuộc một nhóm do Trưởng nhóm cầm. Quản lý trường quản mọi nhân sự trong trường, không
                    cần cầm nhóm riêng.
                  </span>
                </label>
              ) : null}
              {canStaffAll ? (
              <div className="rounded-lg border border-[var(--color-primary)]/30 bg-[var(--color-primary-soft)]/40 px-3 py-2.5 space-y-2">
                <p className="text-xs font-medium text-slate-800">Mật khẩu đăng nhập</p>
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
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm disabled:bg-slate-100"
                  />
                </label>
                {selfUid === editing.id ? (
                  <p className="text-xs text-amber-800">Không đổi mật khẩu chính bạn từ đây.</p>
                ) : (
                  <p className="text-xs leading-snug text-slate-600">
                    Lưu form sẽ áp dụng mật khẩu ngay — không cần email.
                  </p>
                )}
                <button
                  type="button"
                  disabled={resetPwdBusy || editBusy || !editing.email?.trim()}
                  onClick={sendPasswordResetForEditing}
                  className="w-full rounded-lg border border-[var(--color-primary)]/35 bg-white px-3 py-2 text-xs font-medium text-[var(--color-primary)] hover:bg-[var(--color-primary-soft)] disabled:opacity-50"
                >
                  {resetPwdBusy ? 'Đang gửi…' : 'Hoặc gửi email đặt lại (tuỳ chọn)'}
                </button>
              </div>
              ) : (
                <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                  Đặt / gửi mật khẩu do Quản lý trường thực hiện.
                </p>
              )}
              <label className="flex items-center gap-2 text-sm text-slate-800">
                <input
                  type="checkbox"
                  checked={editActive}
                  onChange={(e) => setEditActive(e.target.checked)}
                  disabled={selfUid === editing.id}
                />
                Tài khoản đang hoạt động
              </label>
              {isFieldStaffRole(editRole) ? (
                <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-emerald-200/80 bg-emerald-50/60 px-3 py-2.5 text-sm text-slate-800">
                  <input
                    type="checkbox"
                    className="mt-0.5 h-4 w-4 rounded border-slate-300 accent-emerald-600"
                    checked={editShowOnPortal}
                    onChange={(e) => setEditShowOnPortal(e.target.checked)}
                  />
                  <span>
                    <span className="font-semibold text-slate-800">Hiện trên cổng đăng ký</span>
                    <span className="mt-0.5 block text-xs text-slate-600">
                      Sinh viên chọn thầy/cô này khi điền form công khai — hồ sơ gán đúng người đó.
                    </span>
                  </span>
                </label>
              ) : null}
              {isSuperAdminRole(editing.role) ? (
                <p className="rounded-lg border border-sky-200/80 bg-sky-50/80 px-3 py-2 text-xs leading-relaxed text-sky-950">
                  <strong>Siêu quản trị</strong> luôn được dùng AI trên CRM.
                </p>
              ) : (
                <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-[var(--color-primary)]/30 bg-[var(--color-primary-soft)]/50 px-3 py-2.5 text-sm text-slate-800">
                  <input
                    type="checkbox"
                    className="mt-0.5 h-4 w-4 rounded border-slate-300 accent-violet-600"
                    checked={editAllowLlm}
                    onChange={(e) => setEditAllowLlm(e.target.checked)}
                  />
                  <span>
                    <span className="font-semibold text-slate-800">Cho phép dùng AI trên hồ sơ</span>
                  </span>
                </label>
              )}
              {canStaffAll &&
              !isAdminLikeRole(editRole) &&
              !isSuperAdminRole(editRole) &&
              editRole !== 'accountant' ? (
                <div className="rounded-lg border border-violet-200/80 bg-violet-50/40 px-3 py-2.5 space-y-2">
                  <p className="text-xs font-semibold text-violet-950">Phân quyền trong trường</p>
                  <p className="text-[11px] leading-snug text-slate-600">
                    Bật = giao thêm so với vai trò. Tắt «Thu hồi» = giữ quyền mặc định của vai trò.
                  </p>
                  <ul className="space-y-2">
                    {STAFF_ASSIGNABLE_PERMISSIONS.map((item) => {
                      const roleHas = defaultPermissionsForRole(editRole).includes(item.permission)
                      const grantedExtra = editExtraPerms.includes(item.permission)
                      const denied = editDeniedPerms.includes(item.permission)
                      const effectiveOn = denied ? false : roleHas || grantedExtra
                      return (
                        <li key={item.permission} className="rounded-md border border-white/80 bg-white/80 px-2 py-1.5">
                          <label className="flex cursor-pointer items-start gap-2 text-sm text-slate-800">
                            <input
                              type="checkbox"
                              className="mt-0.5"
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
                </div>
              ) : null}
              {canOmicallConfig && canAssignOmicallSip(editRole) ? (
                <div className="rounded-lg border border-sky-200/80 bg-sky-50/50 px-3 py-2.5 space-y-2">
                  <p className="text-xs font-semibold text-sky-950">OMICall — số nội bộ & mật khẩu SIP</p>
                  <p className="text-xs leading-snug text-slate-600">
                    Chỉ Quản lý gán cho nhân viên và Trưởng nhóm. Để trống nếu dùng số mặc định trong Cài đặt → Gọi
                    điện.
                  </p>
                  <label className="block text-sm font-medium text-slate-700">
                    Số nội bộ
                    <input
                      value={editOmicallUser}
                      onChange={(e) => setEditOmicallUser(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
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
                      className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                      autoComplete="new-password"
                    />
                  </label>
                  <label className="block text-sm font-medium text-slate-700">
                    Đầu số gọi ra (hotline)
                    <input
                      value={editOmicallOutbound}
                      onChange={(e) => setEditOmicallOutbound(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                      placeholder="Từ API hotline/list"
                      autoComplete="off"
                    />
                  </label>
                  <label className="block text-sm font-medium text-slate-700">
                    Agent ID OMICall
                    <input
                      value={editOmicallAgentId}
                      onChange={(e) => setEditOmicallAgentId(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-mono"
                      placeholder="create_by.id từ API lịch sử"
                      autoComplete="off"
                    />
                  </label>
                  <p className="text-xs text-slate-600">
                    Agent ID lấy từ lịch sử cuộc gọi API (`create_by.id`) — giúp map cuộc gọi đúng người khi SIP trùng.
                  </p>
                </div>
              ) : null}
              {editErr ? <p className="text-sm text-rose-600">{editErr}</p> : null}
              {editMsg ? <p className="text-sm text-emerald-700">{editMsg}</p> : null}
              <div className="flex flex-wrap gap-2 pt-2">
                <button
                  type="submit"
                  disabled={editBusy || resetPwdBusy}
                  className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                  {editBusy ? 'Đang lưu…' : 'Lưu'}
                </button>
                <button
                  type="button"
                  disabled={editBusy || resetPwdBusy}
                  onClick={() => setEditing(null)}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50"
                >
                  Hủy
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  )
}
