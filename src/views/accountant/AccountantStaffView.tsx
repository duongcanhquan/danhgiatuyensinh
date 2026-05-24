import { useMemo, useState, type FormEvent } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { useCounselorDirectory } from '../../hooks/useCounselorDirectory'
import { canManageAccountantStaff } from '../../auth/accountantPortal'
import { USER_ROLE_LABELS } from '../../types'

export function AccountantStaffView() {
  const { can, createAccountantStaff, updateAccountantStaff, sendStaffPasswordResetEmail, profile, firebaseUser } =
    useAuth()
  const { users, loading } = useCounselorDirectory()
  const allowed = canManageAccountantStaff(can)

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const accountants = useMemo(
    () =>
      users
        .filter((u) => u.role === 'accountant')
        .sort((a, b) => (a.displayName || a.email).localeCompare(b.displayName || b.email, 'vi')),
    [users],
  )

  const selfUid = firebaseUser?.uid ?? profile?.id ?? null

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

  return (
    <div className="space-y-6">
      <header>
        <h2 className="text-xl font-extrabold text-emerald-900">Quản lý kế toán viên</h2>
        <p className="mt-1 text-sm text-slate-600">Thêm / sửa / vô hiệu hóa tài khoản truy cập cổng kế toán.</p>
      </header>

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
        {msg ? <p className="mt-2 text-sm text-emerald-800">{msg}</p> : null}
        {err ? <p className="mt-2 text-sm text-rose-700">{err}</p> : null}
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
            {accountants.map((u) => (
              <tr key={u.id} className="border-t border-slate-100">
                <td className="px-3 py-2 font-semibold">{u.displayName || '—'}</td>
                <td className="px-3 py-2">{u.email}</td>
                <td className="px-3 py-2">{USER_ROLE_LABELS.accountant}</td>
                <td className="px-3 py-2">{u.isActive === false ? 'Tắt' : 'Hoạt động'}</td>
                <td className="px-3 py-2 text-right">
                  <div className="flex flex-wrap justify-end gap-1">
                    {u.isActive !== false ? (
                      <button
                        type="button"
                        disabled={u.id === selfUid}
                        onClick={() =>
                          void updateAccountantStaff({ userId: u.id, isActive: false }).catch((e) =>
                            setErr(e instanceof Error ? e.message : 'Lỗi'),
                          )
                        }
                        className="rounded border border-rose-200 px-2 py-1 text-xs font-semibold text-rose-800 disabled:opacity-40"
                      >
                        Vô hiệu
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() =>
                          void updateAccountantStaff({ userId: u.id, isActive: true }).catch((e) =>
                            setErr(e instanceof Error ? e.message : 'Lỗi'),
                          )
                        }
                        className="rounded border border-emerald-200 px-2 py-1 text-xs font-semibold text-emerald-800"
                      >
                        Bật lại
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() =>
                        void sendStaffPasswordResetEmail(u.email).then(() =>
                          setMsg(`Đã gửi email đặt lại mật khẩu tới ${u.email}.`),
                        )
                      }
                      className="rounded border border-sky-200 px-2 py-1 text-xs font-semibold text-sky-800"
                    >
                      Reset mật khẩu
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {!loading && accountants.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                  Chưa có kế toán viên — chạy seed hoặc thêm ở form trên.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  )
}
