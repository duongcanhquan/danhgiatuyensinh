import { useEffect, useState, type FormEvent } from 'react'
import { Link, Navigate, useLocation } from 'react-router-dom'
import { Eye, EyeOff, Lock, Wallet } from 'lucide-react'
import { AuthSessionBootScreen } from '../../components/AuthSessionBootScreen'
import { useAuth } from '../../hooks/useAuth'
import { canAccessAccountantPortal } from '../../auth/accountantPortal'
import { getFirebaseAuth, getFirebaseMissingKeys, isFirebaseConfigured } from '../../services/firebase'
import { mapFirebaseLoginError } from '../../utils/firebaseLoginErrors'
import { applyAccountantPwaMeta, clearAccountantPwaMeta } from '../../utils/accountantPwaMeta'

export function AccountantLoginView() {
  const { status, firebaseUser, profile, signInWithEmail, can, signOut } = useAuth()
  const location = useLocation()
  const rawFrom = (location.state as { from?: string } | null)?.from
  const from =
    rawFrom && rawFrom.startsWith('/ke-toan') && rawFrom !== '/ke-toan/login' ? rawFrom : '/ke-toan'

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    applyAccountantPwaMeta()
    return () => clearAccountantPwaMeta()
  }, [])

  const hasAuth = Boolean(isFirebaseConfigured() && getFirebaseAuth())

  if (!hasAuth) {
    const missing = getFirebaseMissingKeys()
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-indigo-50 px-4">
        <div className="max-w-md rounded-2xl border border-amber-200 bg-white p-6 shadow-lg">
          <h1 className="text-lg font-bold text-slate-900">Chưa cấu hình Firebase</h1>
          <p className="mt-2 text-sm text-slate-600">Cần đủ biến VITE_FIREBASE_* trên Vercel / .env.</p>
          {missing.length ? (
            <ul className="mt-2 list-inside list-disc text-xs font-mono text-amber-900">
              {missing.map((k) => (
                <li key={k}>{k}</li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>
    )
  }

  // Đã có quyền → vào thẳng cổng, không màn «Bạn đang đăng nhập / vào cổng».
  if (firebaseUser && status === 'authenticated' && profile && canAccessAccountantPortal(can, profile)) {
    return <Navigate to={from} replace />
  }

  // Đang xác thực / tải hồ sơ sau đăng nhập — chỉ màn chờ ngắn, không form + nút trung gian.
  if (firebaseUser && (status === 'unknown' || status === 'authenticating')) {
    return (
      <AuthSessionBootScreen
        statusLabel="Đang mở cổng kế toán"
        detail="Đăng nhập thành công."
      />
    )
  }

  const loggedInWithoutPortalAccess =
    Boolean(firebaseUser && status === 'authenticated' && profile && !canAccessAccountantPortal(can, profile))

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      await signInWithEmail(email.trim(), password)
    } catch (err: unknown) {
      setError(mapFirebaseLoginError(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-gradient-to-br from-indigo-950 via-indigo-900 to-slate-950 px-4 py-10">
      <div className="w-full max-w-md overflow-hidden rounded-3xl border border-indigo-400/25 bg-white shadow-2xl shadow-indigo-950/40">
        <div className="border-b border-indigo-100 bg-gradient-to-r from-indigo-700 to-indigo-600 px-6 py-5 text-white">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/15 ring-1 ring-white/25">
              <Wallet className="h-5 w-5" aria-hidden />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-indigo-100/90">VietMy Admissions</p>
              <h1 className="text-xl font-extrabold tracking-tight">Cổng kế toán</h1>
            </div>
          </div>
        </div>

        <div className="space-y-4 px-6 py-6">
          <form onSubmit={(e) => void submit(e)} className="space-y-4">
            <label className="block text-sm font-medium text-slate-700">
              Email kế toán
              <input
                type="email"
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="quan.duong@caodangvietmy.edu.vn"
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
              />
            </label>
            <label className="block text-sm font-medium text-slate-700">
              Mật khẩu
              <div className="relative mt-1">
                <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
                <input
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="w-full rounded-xl border border-slate-200 py-2.5 pl-10 pr-10 text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"
                  aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </label>
            {loggedInWithoutPortalAccess ? (
              <div className="space-y-2">
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950" role="alert">
                  Tài khoản này không có quyền cổng kế toán.{' '}
                  <Link to="/login" className="font-semibold underline">
                    Đăng nhập CRM
                  </Link>
                  .
                </div>
                <button
                  type="button"
                  onClick={() => void signOut()}
                  className="w-full rounded-xl border border-slate-200 bg-white py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Đăng xuất để đổi tài khoản
                </button>
              </div>
            ) : null}
            {error ? (
              <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800" role="alert">
                {error}
              </div>
            ) : null}
            {!loggedInWithoutPortalAccess ? (
              <button
                type="submit"
                disabled={busy}
                className="w-full rounded-xl bg-indigo-600 py-3 text-sm font-bold text-white shadow-lg shadow-indigo-900/20 hover:bg-indigo-700 disabled:opacity-50"
              >
                {busy ? 'Đang xác thực…' : 'Đăng nhập'}
              </button>
            ) : null}
            <p className="text-center text-xs leading-relaxed text-slate-500">
              Trên điện thoại: mở Safari/Chrome → Chia sẻ → <strong>Thêm vào Màn hình chính</strong> để dùng như app.
            </p>
          </form>
        </div>
      </div>
    </div>
  )
}
