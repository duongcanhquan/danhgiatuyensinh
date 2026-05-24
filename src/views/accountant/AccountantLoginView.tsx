import { useState, type FormEvent } from 'react'
import { Link, Navigate, useLocation } from 'react-router-dom'
import { Wallet } from 'lucide-react'
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
      await signInWithEmail(email, password)
    } catch (err: unknown) {
      setError(mapFirebaseLoginError(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-gradient-to-br from-emerald-100 via-white to-slate-100 px-4 py-10">
      <div className="w-full max-w-md rounded-3xl border border-emerald-200/80 bg-white p-8 shadow-xl">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-600 text-white">
            <Wallet className="h-6 w-6" aria-hidden />
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-emerald-700">VietMy</p>
            <h1 className="text-xl font-extrabold text-slate-900">Cổng kế toán</h1>
          </div>
        </div>
        <p className="mb-6 text-sm text-slate-600">
          Đăng nhập để duyệt thu, Full NE và gửi thông báo qua n8n → Google Chat.
        </p>
        <form onSubmit={(e) => void submit(e)} className="space-y-4">
          <label className="block text-sm font-medium text-slate-700">
            Email kế toán
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="quan.duong@caodangvietmy.edu.vn"
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-slate-900"
            />
          </label>
          <label className="block text-sm font-medium text-slate-700">
            Mật khẩu
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-slate-900"
            />
          </label>
          {error ? <p className="text-sm text-rose-700">{error}</p> : null}
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-xl bg-emerald-600 py-3 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {busy ? 'Đang đăng nhập…' : 'Đăng nhập cổng kế toán'}
          </button>
        </form>
        <p className="mt-6 text-center text-xs text-slate-500">
          TVV / quản trị?{' '}
          <Link to="/login" className="font-semibold text-emerald-800 underline">
            Đăng nhập CRM tuyển sinh
          </Link>
        </p>
      </div>
    </div>
  )
}
