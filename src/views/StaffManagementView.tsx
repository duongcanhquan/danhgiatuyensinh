import { useMemo, useState, type FormEvent } from 'react'
import { useAuth } from '../hooks/useAuth'
import { useCounselorDirectory } from '../hooks/useCounselorDirectory'
import { USER_ROLE_LABELS, type UserRole, type VietMyUserProfile } from '../types'
import { isSuperAdminRole, isAdminLikeRole } from '../auth/roleUtils'
import { syncOmicallInternalPhones } from '../services/omicallSyncInternalPhones'
import { isTeamLeadRole } from '../auth/roleUtils'
import {
  counselorIdsInManagerScope,
  isUserInManagerTeamScope,
  patchesForCounselorTeamAssignment,
  primaryTeamLeadForCounselor,
  teamLeadUsesExplicitRoster,
  teamLeadsForCounselor,
} from '../utils/teamScope'

/** Vai trò quản trị được tạo trong app; kế toán là cổng riêng, không nằm trong quyền admin. */
const ROLES_BASE: UserRole[] = ['counselor', 'ctv', 'team_lead', 'admin', 'accountant']

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
  const [editOmicallUser, setEditOmicallUser] = useState('')
  const [editOmicallPassword, setEditOmicallPassword] = useState('')
  const [editOmicallAgentId, setEditOmicallAgentId] = useState('')
  const [editOmicallOutbound, setEditOmicallOutbound] = useState('')
  const [editTeamIds, setEditTeamIds] = useState<string[]>([])
  const [omicallSyncBusy, setOmicallSyncBusy] = useState(false)
  const [bulkAiBusy, setBulkAiBusy] = useState(false)
  /** Trưởng nhóm phụ trách (khi sửa TVV — admin). */
  const [editTeamLeadId, setEditTeamLeadId] = useState('')
  const [editBusy, setEditBusy] = useState(false)
  const [editNewPassword, setEditNewPassword] = useState('')
  const [resetPwdBusy, setResetPwdBusy] = useState(false)
  const [editMsg, setEditMsg] = useState<string | null>(null)
  const [editErr, setEditErr] = useState<string | null>(null)

  const counselorPickList = useMemo(() => {
    if (teamScopeOnly && profile) {
      const team = new Set(counselorIdsInManagerScope(profile, users))
      return fieldStaff.filter((c) => team.has(c.id))
    }
    return fieldStaff
  }, [fieldStaff, teamScopeOnly, profile, users])

  const teamLeads = useMemo(
    () => users.filter((u) => isTeamLeadRole(u.role) && u.isActive !== false),
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
      const teamIds = new Set(counselorIdsInManagerScope(profile, users))
      list = users.filter((u) => teamIds.has(u.id))
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
    <p className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm leading-relaxed text-sky-950">
      <strong>Trưởng nhóm Sale:</strong> quản lý nhân viên sale và CTV trong nhóm; gán hồ sơ qua roster bên dưới.
    </p>
  ) : null

  const aiPermissionBanner = (
    <div className="rounded-xl border border-violet-200 bg-violet-50/90 px-4 py-3 text-sm leading-relaxed text-violet-950">
      <p className="font-semibold text-violet-900">Phân quyền AI — cấu hình toàn trường vs từng nhân sự</p>
      <p className="mt-1">
        <strong>Admin / Siêu quản trị cài một lần</strong> (Cài đặt → AI &amp; LLM): khóa API, tác vụ phân tích, bảng đánh giá gọi —{' '}
        <strong>cả team dùng chung</strong> trên Firestore.
      </p>
      <p className="mt-1">
        Riêng quyền <strong>«Cho phép dùng AI trên hồ sơ»</strong> bật từng TVV / Trưởng nhóm trong form{' '}
        <strong>Sửa</strong> bên dưới. Admin / Siêu quản trị dùng AI mặc định, không cần tick.
      </p>
      <p className="mt-1 text-xs text-violet-800">
        Danh sách hiện nhãn <span className="rounded bg-sky-100 px-1 font-semibold text-sky-900">LLM</span> hoặc{' '}
        <span className="rounded bg-amber-100 px-1 font-semibold text-amber-900">Chưa AI</span>. Sau khi bật, nhân viên thấy quyền ngay (F5 nếu cần).
      </p>
      <button
        type="button"
        disabled={bulkAiBusy}
        onClick={() => void enableAiForTeam()}
        className="mt-3 rounded-lg border border-violet-300 bg-violet-800 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-900 disabled:opacity-50"
      >
        {bulkAiBusy ? 'Đang bật…' : 'Bật AI cho tất cả TVV / Trưởng nhóm trong phạm vi'}
      </button>
    </div>
  )

  const omicallSyncBanner =
    canOmicallConfig && !teamScopeOnly ? (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-sky-200 bg-sky-50/80 px-4 py-3 text-sm text-sky-950">
        <p>
          <strong>OMICall:</strong> đồng bộ số nội bộ, SIP, agent ID và đầu số từ API Tổng đài vào hồ sơ TVV (match email).
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
                  `Đồng bộ OMICall: ${r.updated} TVV cập nhật / ${r.matched} khớp · ${r.totalExtensions} extension trên tổng đài.`,
                ),
              )
              .catch((e) => setErr(e instanceof Error ? e.message : 'Lỗi đồng bộ OMICall'))
              .finally(() => setOmicallSyncBusy(false))
          }}
          className="rounded-lg bg-sky-800 px-3 py-1.5 text-xs font-semibold text-white hover:bg-sky-900 disabled:opacity-50"
        >
          {omicallSyncBusy ? 'Đang đồng bộ…' : 'Đồng bộ số nội bộ → TVV'}
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
        role === 'counselor' && canOmicallConfig
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
        ...(role === 'team_lead' ? { managedCounselorIds: createTeamIds } : {}),
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

  const canManageUser = (u: VietMyUserProfile) => {
    if (canStaffAll) return true
    if (!profile || !teamScopeOnly) return false
    return isUserInManagerTeamScope(profile, u, users)
  }

  const enableAiForTeam = async () => {
    const targets = sortedUsers.filter((u) => {
      if (isSuperAdminRole(u.role) || isAdminLikeRole(u.role)) return false
      if (u.isActive === false) return false
      if (u.allowLlmAndAiTasks === true) return false
      return canManageUser(u)
    })
    if (!targets.length) {
      setMsg('Không có TVV / Trưởng nhóm nào trong phạm vi cần bật AI.')
      return
    }
    if (
      !window.confirm(
        `Bật «Cho phép dùng AI trên hồ sơ» cho ${targets.length} tài khoản trong phạm vi của bạn?`,
      )
    ) {
      return
    }
    setBulkAiBusy(true)
    setEditErr(null)
    setMsg(null)
    try {
      for (const u of targets) {
        await updateStaffProfile({ userId: u.id, allowLlmAndAiTasks: true })
      }
      setMsg(`Đã bật quyền AI cho ${targets.length} tài khoản. Cấu hình API/tác vụ toàn trường đã áp dụng tự động.`)
    } catch (e: unknown) {
      setEditErr(e instanceof Error ? e.message : 'Không bật hàng loạt được')
    } finally {
      setBulkAiBusy(false)
    }
  }

  const openEdit = (u: VietMyUserProfile) => {
    if (!canManageUser(u)) return
    setEditing(u)
    setEditDisplayName(u.displayName || '')
    setEditRole(u.role)
    setEditActive(u.isActive !== false)
    setEditAllowLlm(u.allowLlmAndAiTasks === true)
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
        ...(canOmicallConfig
          ? {
              omicallSipUser: editOmicallUser,
              omicallSipPassword: editOmicallPassword,
              omicallAgentId: editOmicallAgentId,
              omicallOutboundNumber: editOmicallOutbound,
            }
          : {}),
        ...(!isSelf ? { role: editRole, isActive: editActive } : {}),
        ...(editRole === 'team_lead' || editing.role === 'team_lead'
          ? { managedCounselorIds: editTeamIds }
          : {}),
      })
      if (
        canStaffAll &&
        (editRole === 'counselor' || (editing.role === 'counselor' && editRole !== 'team_lead'))
      ) {
        const patches = patchesForCounselorTeamAssignment(
          editing.id,
          editTeamLeadId || null,
          users,
        )
        for (const patch of patches) {
          await updateStaffProfile({
            userId: patch.userId,
            managedCounselorIds: patch.managedCounselorIds,
          })
        }
      }
      const pwd = editNewPassword.trim()
      if (pwd) {
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
    if (
      !window.confirm(
        `Xóa vĩnh viễn «${u.displayName || u.email}»?\n\nHồ sơ Firestore và tài khoản Auth sẽ bị gỡ — không hoàn tác.`,
      )
    ) {
      return
    }
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
      <legend className="px-1 text-sm font-medium text-slate-800">TVV trong nhóm</legend>
      {counselorPickList.length === 0 ? (
        <p className="text-xs text-slate-600">Chưa có TVV trong danh bạ.</p>
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
      {aiPermissionBanner}
      {omicallSyncBanner}

      {canStaffAll && !teamScopeOnly ? (
        <section className="app-surface-elevated p-4 sm:p-5">
          <h2 className="app-section-heading">Phân nhóm TVV ↔ Trưởng nhóm</h2>
          {teamLeads.length === 0 ? (
            <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
              Chưa có tài khoản <strong>Trưởng nhóm</strong>. Tạo user với vai trò Trưởng nhóm, rồi chọn TVV trong form hoặc
              nút «Chỉnh nhóm» bên dưới.
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
                        <p className="text-xs text-slate-500">{lead.email}</p>
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

      <div className="grid gap-8 lg:grid-cols-2">
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
                if (r !== 'team_lead') setCreateTeamIds([])
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
          {role === 'team_lead' && canStaffAll
            ? teamMemberPicker(createTeamIds, setCreateTeamIds, 'create')
            : null}
          {role === 'team_lead' && canStaffAll && createTeamIds.length === 0 ? (
            <p className="mt-2 text-xs text-amber-800">
              Nên chọn ít nhất một TVV — có thể chỉnh lại sau ở mục «Phân nhóm» phía trên.
            </p>
          ) : null}
          {role === 'counselor' && canOmicallConfig ? (
            <div className="mt-4 rounded-xl border border-sky-200/80 bg-sky-50/50 px-3 py-3 space-y-2">
              <p className="text-xs font-semibold text-sky-950">OMICall (tuỳ chọn)</p>
              <p className="text-xs leading-snug text-slate-600">
                Tạo số nội bộ trên OMICall cùng <strong>email</strong> này, rồi bấm «Đồng bộ số nội bộ → TVV» hoặc điền tay bên dưới.
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
            className="mt-4 w-full rounded-xl border border-emerald-300/60 bg-emerald-600 py-2.5 text-sm font-semibold text-white shadow-md hover:bg-emerald-700 disabled:opacity-50"
          >
            {busy ? 'Đang tạo…' : 'Tạo tài khoản'}
          </button>
        </form>

        <div className="app-surface-elevated p-4 sm:p-5">
          <h2 className="app-section-heading">Danh sách nhân sự</h2>
          {loading ? <p className="mt-3 text-sm text-slate-600">Đang tải…</p> : null}
          <ul className="mt-3 max-h-[28rem] space-y-2 overflow-y-auto text-sm">
            {sortedUsers.map((u) => {
              const isSelf = selfUid !== null && u.id === selfUid
              const inactive = u.isActive === false
              const targetSuper = isSuperAdminRole(u.role)
              const viewerSuper = profile?.role === 'super_admin'
              const canStaffEdit = !targetSuper || viewerSuper
              const llmOk = targetSuper || u.allowLlmAndAiTasks === true
              const teamCount = u.managedCounselorIds?.length ?? 0
              const members = u.role === 'team_lead' ? (teamLeadMembers.get(u.id) ?? []) : []
              const primaryLead =
                u.role === 'counselor' ? primaryTeamLeadForCounselor(u.id, users) : null
              const unassignedCounselor =
                u.role === 'counselor' && teamLeadsForCounselor(u.id, users).length === 0
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
                        {u.role === 'team_lead' ? (
                          <span className="ml-2 font-normal text-slate-600">
                            · {members.length > 0
                              ? members.map((m) => m.displayName || m.email).join(', ')
                              : teamCount > 0
                                ? `${teamCount} TVV`
                                : 'Chưa gán TVV'}
                          </span>
                        ) : null}
                        {primaryLead ? (
                          <span className="ml-2 block font-normal text-slate-600">
                            Trưởng nhóm: {primaryLead.displayName || primaryLead.email}
                          </span>
                        ) : null}
                        {unassignedCounselor ? (
                          <span className="ml-2 block font-normal text-amber-800">Chưa gán trưởng nhóm</span>
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
                                className="rounded-lg border border-emerald-300 bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-900 hover:bg-emerald-100"
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
            className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-xl"
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
                    if (r !== 'team_lead') setEditTeamIds([])
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
              {editRole === 'team_lead' && canStaffAll
                ? teamMemberPicker(editTeamIds, setEditTeamIds, 'edit')
                : null}
              {editRole === 'counselor' && canStaffAll ? (
                <label className="block text-sm font-medium text-slate-700">
                  Trưởng nhóm phụ trách
                  <select
                    value={editTeamLeadId}
                    onChange={(e) => setEditTeamLeadId(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  >
                    <option value="">— Chưa gán / gỡ khỏi nhóm —</option>
                    {teamLeads.map((lead) => (
                      <option key={lead.id} value={lead.id}>
                        {lead.displayName || lead.email}
                      </option>
                    ))}
                  </select>
                  <span className="mt-1 block text-xs text-slate-500">
                    Một TVV chỉ nên thuộc một trưởng nhóm. Lưu sẽ cập nhật danh sách TVV của trưởng nhóm tương ứng.
                  </span>
                </label>
              ) : null}
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
              <label className="flex items-center gap-2 text-sm text-slate-800">
                <input
                  type="checkbox"
                  checked={editActive}
                  onChange={(e) => setEditActive(e.target.checked)}
                  disabled={selfUid === editing.id}
                />
                Tài khoản đang hoạt động
              </label>
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
              {canOmicallConfig ? (
                <div className="rounded-lg border border-sky-200/80 bg-sky-50/50 px-3 py-2.5 space-y-2">
                  <p className="text-xs font-semibold text-sky-950">OMICall — số nội bộ (tuỳ chọn)</p>
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
                    Agent ID lấy từ lịch sử cuộc gọi API (`create_by.id`) — giúp map cuộc gọi đúng TVV khi SIP trùng.
                  </p>
                  <p className="text-xs text-slate-600">
                    Để trống SIP nếu TVV dùng số mặc định trong Cài đặt → Gọi điện (OMICall).
                  </p>
                </div>
              ) : null}
              {editErr ? <p className="text-sm text-rose-600">{editErr}</p> : null}
              {editMsg ? <p className="text-sm text-emerald-700">{editMsg}</p> : null}
              <div className="flex flex-wrap gap-2 pt-2">
                <button
                  type="submit"
                  disabled={editBusy || resetPwdBusy}
                  className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
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
