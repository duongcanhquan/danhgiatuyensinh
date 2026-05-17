import { useMemo, useState, type FormEvent } from 'react'
import { useAuth } from '../hooks/useAuth'
import { useCounselorDirectory } from '../hooks/useCounselorDirectory'
import { USER_ROLE_LABELS, type UserRole, type VietMyUserProfile } from '../types'
import { isSuperAdminRole } from '../auth/roleUtils'
import { VietMyAccentHeading } from '../components/VietMyAccentHeading'
import { counselorIdsInManagerScope, isUserInManagerTeamScope } from '../utils/teamScope'

/** Ba tầng trong form (Siêu QT thêm super_admin). */
const ROLES_BASE: UserRole[] = ['counselor', 'team_lead', 'admin']

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
  const [editTeamIds, setEditTeamIds] = useState<string[]>([])
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
        ...(role === 'team_lead' && createTeamIds.length ? { managedCounselorIds: createTeamIds } : {}),
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
    setEditTeamIds(u.managedCounselorIds ?? [])
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
        ...(!isSelf ? { role: editRole, isActive: editActive } : {}),
        ...(editRole === 'team_lead' || editing.role === 'team_lead'
          ? { managedCounselorIds: editTeamIds }
          : {}),
      })
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
          {role === 'team_lead' && canStaffAll ? teamMemberPicker(createTeamIds, setCreateTeamIds, 'create') : null}
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
                        {u.role === 'team_lead' && teamCount > 0 ? (
                          <span className="ml-2 font-normal text-slate-600">· {teamCount} TVV</span>
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
