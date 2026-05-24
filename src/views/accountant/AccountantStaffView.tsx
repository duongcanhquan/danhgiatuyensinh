import { useMemo, useState, type FormEvent } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { useCounselorDirectory } from '../../hooks/useCounselorDirectory'
import { canManageAccountantStaff } from '../../auth/accountantPortal'
import { USER_ROLE_LABELS, type VietMyUserProfile } from '../../types'

export function AccountantStaffView() {
  const {
    can,
    createAccountantStaff,
    updateAccountantStaff,
    sendStaffPasswordResetEmail,
    disableStaffLogin,
    enableStaffLogin,
    deleteStaffAccount,
    profile,
    firebaseUser,
  } = useAuth()
  const { users, loading } = useCounselorDirectory()
  const allowed = canManageAccountantStaff(can)

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const [editing, setEditing] = useState<VietMyUserProfile | null>(null)
  const [editDisplayName, setEditDisplayName] = useState('')
  const [editBusy, setEditBusy] = useState(false)

  const accountants = useMemo(
    () =>
      users
        .filter((u) => u.role === 'accountant')
        .sort((a, b) => (a.displayName || a.email).localeCompare(b.displayName || b.email, 'vi')),
    [users],
  )

  const selfUid = firebaseUser?.uid ?? profile?.id ?? null
  const acctOpts = { accountantPortalOnly: true as const }

  if (!allowed) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-amber-950">
        Bạn không có quyền quản lý kế toán viên.
      </div>
    )
  }

  const onCreate = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setMsg(null)
    setErr(null)
    try {
      await createAccountantStaff({ email, password, displayName })
      setMsg(`Đã tạo tài khoản kế toán ${email.trim()}.`)
      setEmail('')
      setPassword('')
      setDisplayName('')
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : 'Không tạo được tài khoản.')
    } finally {
      setBusy(false)
    }
  }

  const openEdit = (u: VietMyUserProfile) => {
    setEditing(u)
    setEditDisplayName(u.displayName || '')
    setErr(null)
    setMsg(null)
  }

  const saveEdit = async (e: FormEvent) => {
    e.preventDefault()
    if (!editing) return
    setEditBusy(true)
    setErr(null)
    try {
      await updateAccountantStaff({ userId: editing.id, displayName: editDisplayName })
      setMsg('Đã lưu thông tin kế toán viên.')
      setEditing(null)
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : 'Không lưu được.')
    } finally {
      setEditBusy(false)
    }
  }

  const toggleActive = async (u: VietMyUserProfile, next: boolean) => {
    const label = next ? 'Kích hoạt' : 'Vô hiệu (khóa đăng nhập)'
    if (!window.confirm(`${label} «${u.email}»?`)) return
    setErr(null)
    setMsg(null)
    try {
      if (next) await enableStaffLogin(u.id, acctOpts)
      else await disableStaffLogin(u.id, acctOpts)
      setMsg(next ? `Đã kích hoạt ${u.email}` : `Đã vô hiệu ${u.email}`)
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : 'Lỗi cập nhật trạng thái.')
    }
  }

  const removeUser = async (u: VietMyUserProfile) => {
    if (
      !window.confirm(
        `Xóa vĩnh viễn kế toán viên «${u.displayName || u.email}»?\n\nKhông thể hoàn tác.`,
      )
    ) {
      return
    }
    setErr(null)
    setMsg(null)
    try {
      await deleteStaffAccount(u.id, acctOpts)
      if (editing?.id === u.id) setEditing(null)
      setMsg(`Đã xóa ${u.email}`)
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : 'Không xóa được.')
    }
  }

  return (
    <div className="space-y-6">
      <header>
        <h2 className="text-xl font-extrabold text-emerald-900">Quản lý kế toán viên</h2>
        <p className="mt-1 text-sm text-slate-600">Thêm / sửa / vô hiệu (khóa đăng nhập) / xóa tài khoản cổng kế toán.</p>
      </header>

      {msg ? <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">{msg}</p> : null}
      {err ? <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{err}</p> : null}

      <form onSubmit={(e) => void onCreate(e)} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="text-sm font-bold uppercase tracking-wide text-slate-700">Thêm kế toán viên</h3>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <input
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
            placeholder="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <input
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
            placeholder="Mật khẩu tạm"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
          />
          <input
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
            placeholder="Tên hiển thị"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
          />
          <button
            type="submit"
            disabled={busy}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
          >
            {busy ? 'Đang tạo…' : 'Thêm kế toán viên'}
          </button>
        </div>
      </form>

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs font-bold uppercase text-slate-600">
            <tr>
              <th className="px-3 py-2">Tên</th>
              <th className="px-3 py-2">Email</th>
              <th className="px-3 py-2">Vai trò</th>
              <th className="px-3 py-2">Trạng thái</th>
              <th className="px-3 py-2 text-right">Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {accountants.map((u) => {
              const inactive = u.isActive === false
              const isSelf = u.id === selfUid
              return (
                <tr key={u.id} className={`border-t border-slate-100 ${inactive ? 'bg-slate-50/80' : ''}`}>
                  <td className="px-3 py-2 font-semibold">{u.displayName || '—'}</td>
                  <td className="px-3 py-2">{u.email}</td>
                  <td className="px-3 py-2">{USER_ROLE_LABELS.accountant}</td>
                  <td className="px-3 py-2">
                    {inactive ? (
                      <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-semibold text-slate-700">
                        Vô hiệu
                      </span>
                    ) : (
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-900">
                        Hoạt động
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <div className="flex flex-wrap justify-end gap-1">
                      <button
                        type="button"
                        onClick={() => openEdit(u)}
                        className="rounded border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-800 hover:bg-slate-50"
                      >
                        Sửa
                      </button>
                      {!isSelf ? (
                        inactive ? (
                          <button
                            type="button"
                            onClick={() => void toggleActive(u, true)}
                            className="rounded border border-emerald-200 px-2 py-1 text-xs font-semibold text-emerald-800"
                          >
                            Kích hoạt
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => void toggleActive(u, false)}
                            className="rounded border border-amber-200 px-2 py-1 text-xs font-semibold text-amber-900"
                          >
                            Vô hiệu
                          </button>
                        )
                      ) : null}
                      {!isSelf ? (
                        <button
                          type="button"
                          onClick={() => void removeUser(u)}
                          className="rounded border border-rose-200 px-2 py-1 text-xs font-semibold text-rose-800"
                        >
                          Xóa
                        </button>
                      ) : null}
                      <button
                        type="button"
                        onClick={() =>
                          void sendStaffPasswordResetEmail(u.email).then(() =>
                            setMsg(`Đã gửi email đặt lại mật khẩu tới ${u.email}.`),
                          )
                        }
                        className="rounded border border-sky-200 px-2 py-1 text-xs font-semibold text-sky-800"
                      >
                        Reset MK
                      </button>
                    </div>
                  </td>
                </tr>
              )
            })}
            {!loading && accountants.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                  Chưa có kế toán viên — thêm ở form trên.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {editing ? (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal
          onClick={() => setEditing(null)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-semibold text-slate-900">Sửa kế toán viên</h3>
            <p className="mt-1 text-xs text-slate-600">{editing.email}</p>
            <form onSubmit={(e) => void saveEdit(e)} className="mt-4 space-y-3">
              <label className="block text-sm font-medium text-slate-700">
                Tên hiển thị
                <input
                  value={editDisplayName}
                  onChange={(e) => setEditDisplayName(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                />
              </label>
              <div className="flex gap-2 pt-2">
                <button
                  type="submit"
                  disabled={editBusy}
                  className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                >
                  {editBusy ? 'Đang lưu…' : 'Lưu'}
                </button>
                <button
                  type="button"
                  onClick={() => setEditing(null)}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-800"
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
