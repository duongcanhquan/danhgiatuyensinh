import { useState, type FormEvent } from 'react'
import { useAuth } from '../hooks/useAuth'
import { useCounselorDirectory } from '../hooks/useCounselorDirectory'
import { USER_ROLE_LABELS, type UserRole } from '../types'
import { VietMyAccentHeading } from '../components/VietMyAccentHeading'

const ROLES: UserRole[] = ['counselor', 'head_of_profession', 'head_of_department', 'admin']

export function StaffManagementView({ embedded = false }: { embedded?: boolean }) {
  const { can, createStaffAccount } = useAuth()
  const { users, loading } = useCounselorDirectory()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [role, setRole] = useState<UserRole>('counselor')
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

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

  return (
    <div className="space-y-8">
      {embedded ? null : (
        <header>
          <VietMyAccentHeading as="h1" tone="onLight" size="xl" className="block">
            Quản lý nhân sự
          </VietMyAccentHeading>
        </header>
      )}

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
              {ROLES.map((r) => (
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
          <ul className="mt-3 max-h-80 space-y-2 overflow-y-auto text-sm">
            {users.map((u) => (
              <li
                key={u.id}
                className="flex justify-between gap-2 rounded-lg border border-slate-200/70 bg-white/60 px-3 py-2"
              >
                <span className="text-slate-800">{u.displayName || u.email}</span>
                <span className="text-sm font-medium text-violet-700">{USER_ROLE_LABELS[u.role]}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}
