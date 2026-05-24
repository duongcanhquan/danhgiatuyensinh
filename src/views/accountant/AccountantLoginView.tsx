import { useState, type FormEvent } from 'react'
import { Link, Navigate, useLocation } from 'react-router-dom'
import { Eye, EyeOff, Lock, ShieldCheck, Wallet } from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import { canAccessAccountantPortal } from '../../auth/accountantPortal'
import { getFirebaseAuth, getFirebaseMissingKeys, isFirebaseConfigured } from '../../services/firebase'
import { mapFirebaseLoginError } from '../../utils/firebaseLoginErrors'

export function AccountantLoginView() {
  const { status, firebaseUser, signInWithEmail, can } = useAuth()
  const location = useLocation()
  const rawFrom = (location.state as { from?: string } | null)?.from
  const from =
    rawFrom && rawFrom.startsWith('/ke-toan') && rawFrom !== '/ke-toan/login' ? rawFrom : '/ke-toan'

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const hasAuth = Boolean(isFirebaseConfigured() && getFirebaseAuth())

  if (!hasAuth) {
    const missing = getFirebaseMissingKeys()
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-emerald-50 px-4">
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

  if (
    firebaseUser &&
    (status === 'authenticated' || status === 'authenticating') &&
    canAccessAccountantPortal(can)
  ) {
    return <Navigate to={from} replace />
  }

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
    <div className="flex min-h-[100dvh] items-center justify-center bg-gradient-to-br from-emerald-950 via-emerald-900 to-slate-950 px-4 py-10">
      <div className="w-full max-w-md overflow-hidden rounded-3xl border border-emerald-400/25 bg-white shadow-2xl shadow-emerald-950/40">
        <div className="border-b border-emerald-100 bg-gradient-to-r from-emerald-700 to-emerald-600 px-6 py-5 text-white">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/15 ring-1 ring-white/25">
              <Wallet className="h-5 w-5" aria-hidden />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-emerald-100/90">VietMy Admissions</p>
              <h1 className="text-xl font-extrabold tracking-tight">Cổng kế toán</h1>
            </div>
          </div>
          <p className="mt-3 text-sm leading-relaxed text-emerald-50/90">
            Khu vực riêng — duyệt thu, Full NE, thông báo n8n → Google Chat.
          </p>
        </div>

        <div className="space-y-4 px-6 py-6">
          <div className="flex gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs leading-relaxed text-amber-950">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" aria-hidden />
            <p>
              Chỉ đăng nhập bằng <strong>tài khoản kế toán được cấp quyền</strong>. Không chia sẻ mật khẩu; đăng xuất
              khi rời máy.
            </p>
          </div>

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
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-slate-900 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200"
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
                  className="w-full rounded-xl border border-slate-200 py-2.5 pl-10 pr-10 text-slate-900 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200"
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
            {error ? (
              <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800" role="alert">
                {error}
              </div>
            ) : null}
            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-xl bg-emerald-600 py-3 text-sm font-bold text-white shadow-lg shadow-emerald-900/20 hover:bg-emerald-700 disabled:opacity-50"
            >
              {busy ? 'Đang xác thực…' : 'Đăng nhập an toàn'}
            </button>
          </form>

          <p className="text-center text-xs text-slate-500">
            TVV / quản trị?{' '}
            <Link to="/login" className="font-semibold text-emerald-800 underline">
              Quay lại đăng nhập CRM
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
