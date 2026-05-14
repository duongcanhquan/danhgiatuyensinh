import { useMemo, useState, type FormEvent } from 'react'
import { useAuth } from '../hooks/useAuth'
import { useCounselorDirectory } from '../hooks/useCounselorDirectory'
import { USER_ROLE_LABELS, type UserRole, type VietMyUserProfile } from '../types'
import { isSuperAdminRole } from '../auth/roleUtils'
import { VietMyAccentHeading } from '../components/VietMyAccentHeading'

const ROLES_BASE: UserRole[] = ['counselor', 'head_of_profession', 'head_of_department', 'admin']

export function StaffManagementView({ embedded = false }: { embedded?: boolean }) {
  const { can, createStaffAccount, updateStaffProfile, sendStaffPasswordResetEmail, profile, firebaseUser } = useAuth()
  const assignableRoles = useMemo((): UserRole[] => {
    if (profile?.role === 'super_admin') return [...ROLES_BASE, 'super_admin']
    return [...ROLES_BASE]
  }, [profile?.role])
  const { users, loading, error: directoryError } = useCounselorDirectory()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [role, setRole] = useState<UserRole>('counselor')
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const [editing, setEditing] = useState<VietMyUserProfile | null>(null)
  const [editDisplayName, setEditDisplayName] = useState('')
  const [editRole, setEditRole] = useState<UserRole>('counselor')
  const [editActive, setEditActive] = useState(true)
  const [editAllowLlm, setEditAllowLlm] = useState(false)
  const [editBusy, setEditBusy] = useState(false)
  const [resetPwdBusy, setResetPwdBusy] = useState(false)
  const [editMsg, setEditMsg] = useState<string | null>(null)
  const [editErr, setEditErr] = useState<string | null>(null)

  const sortedUsers = useMemo(() => {
    return [...users].sort((a, b) => {
      const la = (a.displayName || a.email).toLocaleLowerCase('vi')
      const lb = (b.displayName || b.email).toLocaleLowerCase('vi')
      return la.localeCompare(lb, 'vi')
    })
  }, [users])

  const selfUid = firebaseUser?.uid ?? profile?.id ?? null

  if (!can('config:users')) {
    return (
      <div className="rounded-2xl border border-amber-300/60 bg-amber-50/90 p-6 text-sm text-amber-900">
        Chỉ quản trị (admin) mới quản lý nhân sự và tạo tài khoản đăng nhập.
      </div>
    )
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setMsg(null)
    setErr(null)
    setBusy(true)
    try {
      await createStaffAccount({ email, password, displayName, role })
      setMsg(`Đã tạo tài khoản cho ${email}`)
      setEmail('')
      setPassword('')
      setDisplayName('')
      setRole('counselor')
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
    setEditing(u)
    setEditDisplayName(u.displayName || '')
    setEditRole(u.role)
    setEditActive(u.isActive !== false)
    setEditAllowLlm(u.allowLlmAndAiTasks === true)
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

  return (
    <div className="space-y-8">
      {embedded ? null : (
        <header>
          <VietMyAccentHeading as="h1" tone="onLight" size="xl" className="block">
            Quản lý nhân sự
          </VietMyAccentHeading>
        </header>
      )}

      <p className="rounded-xl border border-sky-200/80 bg-sky-50/90 px-4 py-3 text-xs leading-relaxed text-slate-800">
        <strong>Sửa / vô hiệu:</strong> cập nhật <code className="rounded bg-white/90 px-1">users/&#123;uid&#125;</code> trên
        Firestore. <strong>Đổi mật khẩu:</strong> trong form «Sửa» dùng nút gửi email đặt lại (Firebase) — app{' '}
        <strong>không</strong> gán mật khẩu trực tiếp cho user khác từ trình duyệt (cần Admin SDK / Cloud Function).{' '}
        <strong>Xóa Auth:</strong> Firebase Console → Authentication hoặc Cloud Function.
        <span className="mt-2 block text-slate-700">
          <strong>LLM:</strong> chỉ <strong>Siêu quản trị</strong> lưu khóa API (Cài đặt → LLM). Bật «Cho phép dùng
          LLM và tác vụ AI» bên dưới để TVV / Admin được chạy phân tích trên CRM.
        </span>
      </p>

      {directoryError ? (
        <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-900">
          Không đọc được danh sách users: {directoryError}. Kiểm tra Firestore Rules cho collection{' '}
          <code className="text-xs">users</code> và đúng database (vd. <code className="text-xs">warmlist</code>).
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
              onChange={(e) => setRole(e.target.value as UserRole)}
              className="mt-1 w-full rounded-xl border border-slate-200/80 bg-white/80 px-3 py-2 text-sm text-slate-900"
            >
              {assignableRoles.map((r) => (
                <option key={r} value={r}>
                  {USER_ROLE_LABELS[r]}
                </option>
              ))}
            </select>
          </label>
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
                      {canStaffEdit ? (
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
                        <span className="self-center rounded border border-slate-200 bg-slate-50 px-2 py-1 text-[10px] text-slate-600">
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
                  onChange={(e) => setEditRole(e.target.value as UserRole)}
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
                  <span className="mt-1 block text-[11px] text-amber-800">Không đổi vai trò trên chính bạn từ đây.</span>
                ) : null}
              </label>
              <div className="rounded-lg border border-violet-200/80 bg-violet-50/60 px-3 py-2.5">
                <p className="text-[11px] font-medium text-violet-950">Mật khẩu</p>
                <p className="mt-0.5 text-[11px] leading-snug text-violet-900/90">
                  Gửi link đặt lại tới email trên (Firebase). Người dùng mở email và đặt mật khẩu mới.
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
                {selfUid === editing.id ? (
                  <span className="text-[11px] text-amber-800">(luôn bật với chính bạn)</span>
                ) : null}
              </label>
              {isSuperAdminRole(editing.role) ? (
                <p className="rounded-lg border border-sky-200/80 bg-sky-50/80 px-3 py-2 text-xs leading-relaxed text-sky-950">
                  <strong>Siêu quản trị</strong> luôn được chạy LLM và tác vụ AI trên CRM (không cần bật cờ dưới đây).
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
                    <span className="font-semibold text-violet-950">Cho phép dùng LLM và tác vụ AI</span>
                    <span className="mt-0.5 block text-xs font-normal leading-snug text-slate-600">
                      Khi bật, người này được chạy phân tích LLM trên hồ sơ, AI Lead Miner và Phòng thử AI (vẫn cần khóa
                      API đã lưu trên trình duyệt do Siêu quản trị cấu hình).
                    </span>
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
