import { useMemo, useState, type FormEvent } from 'react'
import { useAuth } from '../hooks/useAuth'
import { useCounselorDirectory } from '../hooks/useCounselorDirectory'
import { USER_ROLE_LABELS, type UserRole, type VietMyUserProfile } from '../types'
import { isSuperAdminRole } from '../auth/roleUtils'
import { VietMyAccentHeading } from '../components/VietMyAccentHeading'
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
const ROLES_BASE: UserRole[] = ['counselor', 'team_lead', 'admin', 'accountant']

export function StaffManagementView({
  embedded = false,
  teamScopeOnly = false,
}: {
  embedded?: boolean
  teamScopeOnly?: boolean
}) {
  const { can, createStaffAccount, updateStaffProfile, sendStaffPasswordResetEmail, profile, firebaseUser } = useAuth()
  const canStaffAll = can('config:users')
  const canStaffTeam = can('config:users:team')
  const canOmicallConfig = can('config:omicall')
  const assignableRoles = useMemo((): UserRole[] => {
    if (teamScopeOnly) return ['counselor']
    if (profile?.role === 'super_admin') return [...ROLES_BASE, 'super_admin']
    return [...ROLES_BASE]
  }, [profile?.role, teamScopeOnly])
  const { users, loading, error: directoryError, counselors } = useCounselorDirectory()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [role, setRole] = useState<UserRole>('counselor')
  const [createTeamIds, setCreateTeamIds] = useState<string[]>([])
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
  const [editTeamIds, setEditTeamIds] = useState<string[]>([])
  /** Trưởng nhóm phụ trách (khi sửa TVV — admin). */
  const [editTeamLeadId, setEditTeamLeadId] = useState('')
  const [editBusy, setEditBusy] = useState(false)
  const [resetPwdBusy, setResetPwdBusy] = useState(false)
  const [editMsg, setEditMsg] = useState<string | null>(null)
  const [editErr, setEditErr] = useState<string | null>(null)

  const counselorPickList = useMemo(() => {
    if (teamScopeOnly && profile) {
      const team = new Set(counselorIdsInManagerScope(profile, users))
      return counselors.filter((c) => team.has(c.id))
    }
    return counselors
  }, [counselors, teamScopeOnly, profile, users])

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
        counselors.filter((c) => ids.has(c.id)),
      )
    }
    return map
  }, [teamLeads, users, counselors])

  const unassignedCounselors = useMemo(() => {
    if (teamScopeOnly) return []
    return counselors.filter((c) => teamLeadsForCounselor(c.id, users).length === 0)
  }, [counselors, users, teamScopeOnly])

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

  if (!canStaffAll && !canStaffTeam) {
    return (
      <div className="rounded-2xl border border-amber-300/60 bg-amber-50/90 p-6 text-sm text-amber-900">
        Bạn không có quyền quản lý nhân sự.
      </div>
    )
  }

  const teamBanner = teamScopeOnly ? (
    <p className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm leading-relaxed text-sky-950">
      <strong>Trưởng nhóm:</strong> chỉ quản lý TVV trong nhóm; không tạo tài khoản Quản trị / Trưởng nhóm khác.
    </p>
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
      await createStaffAccount({
        email,
        password,
        displayName,
        role,
        ...(role === 'team_lead' ? { managedCounselorIds: createTeamIds } : {}),
      })
      setMsg(`Đã tạo tài khoản cho ${email}`)
      setEmail('')
      setPassword('')
      setDisplayName('')
      setRole('counselor')
      setCreateTeamIds([])
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

  const openEdit = (u: VietMyUserProfile) => {
    if (!canManageUser(u)) return
    setEditing(u)
    setEditDisplayName(u.displayName || '')
    setEditRole(u.role)
    setEditActive(u.isActive !== false)
    setEditAllowLlm(u.allowLlmAndAiTasks === true)
    setEditOmicallUser(u.omicallSipUser ?? '')
    setEditOmicallPassword(u.omicallSipPassword ?? '')
    setEditTeamIds(u.managedCounselorIds ?? [])
    const primaryLead = primaryTeamLeadForCounselor(u.id, users)
    setEditTeamLeadId(primaryLead?.id ?? '')
    setEditMsg(null)
    setEditErr(null)
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
          ? { omicallSipUser: editOmicallUser, omicallSipPassword: editOmicallPassword }
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
      setEditMsg('Đã lưu thay đổi.')
      setEditing(null)
    } catch (e: unknown) {
      setEditErr(e instanceof Error ? e.message : 'Không lưu được')
    } finally {
      setEditBusy(false)
    }
  }

  const toggleActive = async (u: VietMyUserProfile, next: boolean) => {
    if (!window.confirm(next ? `Kích hoạt lại tài khoản «${u.email}»?` : `Vô hiệu hóa «${u.email}» trong hệ thống?`)) return
    setErr(null)
    setMsg(null)
    try {
      await updateStaffProfile({ userId: u.id, isActive: next })
      setMsg(next ? `Đã kích hoạt ${u.email}` : `Đã vô hiệu hóa ${u.email}`)
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Không cập nhật được')
    }
  }

  const teamMemberPicker = (
    selected: string[],
    onChange: (ids: string[]) => void,
    idPrefix: string,
  ) => (
    <fieldset className="mt-3 rounded-xl border border-violet-200/80 bg-violet-50/40 px-3 py-3">
      <legend className="px-1 text-sm font-medium text-violet-950">TVV trong nhóm</legend>
      <p className="mb-2 text-xs text-violet-900/90">
        Chọn tư vấn viên mà trưởng nhóm này quản lý (phạm vi hồ sơ & đổi TVV).
      </p>
      {counselorPickList.length === 0 ? (
        <p className="text-xs text-slate-600">Chưa có TVV trong danh bạ.</p>
      ) : (
        <ul className="max-h-40 space-y-1.5 overflow-y-auto text-sm">
          {counselorPickList.map((c) => (
            <li key={c.id}>
              <label className="flex cursor-pointer items-center gap-2 rounded-lg px-1 py-0.5 hover:bg-white/70">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-slate-300 accent-violet-600"
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
          <VietMyAccentHeading as="h1" tone="onLight" size="xl" className="block">
            {teamScopeOnly ? 'Nhóm tư vấn' : 'Quản lý nhân sự'}
          </VietMyAccentHeading>
        </header>
      )}

      {teamBanner}

      {canStaffAll && !teamScopeOnly ? (
        <section className="app-glass-panel rounded-2xl p-6 shadow-lg">
          <h2 className="app-section-heading">Phân nhóm TVV ↔ Trưởng nhóm</h2>
          <p className="mt-1 text-sm leading-relaxed text-slate-600">
            Một trưởng nhóm quản lý <strong>nhiều</strong> tư vấn viên. Phạm vi hồ sơ, đổi TVV và profile chấm điểm nhóm
            theo đúng danh sách bạn chọn ở đây.
          </p>
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
                    className="rounded-xl border border-violet-200/70 bg-violet-50/30 px-4 py-3"
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
                        className="shrink-0 rounded-lg border border-violet-400 bg-white px-3 py-1.5 text-xs font-semibold text-violet-950 hover:bg-violet-50"
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
        <form onSubmit={(e) => void submit(e)} className="app-glass-panel rounded-2xl p-6 shadow-lg">
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

        <div className="app-glass-panel rounded-2xl p-6 shadow-lg">
          <h2 className="app-section-heading">Danh sách users</h2>
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
                      <p className="mt-0.5 text-xs font-medium text-violet-700">
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
                        ) : null}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-1">
                      {canStaffEdit && canManageUser(u) ? (
                        <>
                          <button
                            type="button"
                            onClick={() => openEdit(u)}
                            className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-800 hover:bg-slate-50"
                          >
                            Sửa
                          </button>
                          {!isSelf ? (
                            inactive ? (
                              <button
                                type="button"
                                onClick={() => void toggleActive(u, true)}
                                className="rounded-lg border border-emerald-300 bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-900 hover:bg-emerald-100"
                              >
                                Kích hoạt
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => void toggleActive(u, false)}
                                className="rounded-lg border border-rose-300 bg-rose-50 px-2 py-1 text-xs font-medium text-rose-900 hover:bg-rose-100"
                              >
                                Vô hiệu
                              </button>
                            )
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
              <div className="rounded-lg border border-violet-200/80 bg-violet-50/60 px-3 py-2.5">
                <p className="text-xs font-medium text-violet-950">Mật khẩu</p>
                <p className="mt-0.5 text-xs leading-snug text-violet-900/90">
                  Gửi link đặt lại tới email trên (Firebase).
                </p>
                <button
                  type="button"
                  disabled={resetPwdBusy || editBusy || !editing.email?.trim()}
                  onClick={sendPasswordResetForEditing}
                  className="mt-2 w-full rounded-lg border border-violet-400 bg-white px-3 py-2 text-xs font-semibold text-violet-950 shadow-sm hover:bg-violet-50 disabled:opacity-50"
                >
                  {resetPwdBusy ? 'Đang gửi…' : 'Gửi email đặt lại mật khẩu'}
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
                <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-violet-200/80 bg-violet-50/50 px-3 py-2.5 text-sm text-slate-800">
                  <input
                    type="checkbox"
                    className="mt-0.5 h-4 w-4 rounded border-slate-300 accent-violet-600"
                    checked={editAllowLlm}
                    onChange={(e) => setEditAllowLlm(e.target.checked)}
                  />
                  <span>
                    <span className="font-semibold text-violet-950">Cho phép dùng AI trên hồ sơ</span>
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
                  <p className="text-xs text-slate-600">
                    Để trống cả hai nếu TVV dùng số mặc định trong Cài đặt → Gọi điện (OMICall).
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
