import { useState, type FormEvent } from 'react'
import { Link, Navigate, useLocation } from 'react-router-dom'
import { motion } from 'motion/react'
import { useAuth } from '../hooks/useAuth'
import { getFirebaseAuth, isFirebaseConfigured } from '../services/firebase'

const VIDEO_SRC =
  'https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260429_114316_1c7889ad-2885-410e-b493-98119fee0ddb.mp4'

function firebaseAuthErrorCode(err: unknown): string {
  if (err && typeof err === 'object' && 'code' in err && typeof (err as { code: unknown }).code === 'string') {
    return (err as { code: string }).code
  }
  return ''
}

/** Thông báo tiếng Việt theo mã lỗi Firebase Auth (đăng nhập email/password). */
function mapFirebaseLoginError(err: unknown): string {
  const code = firebaseAuthErrorCode(err)
  const byCode: Record<string, string> = {
    'auth/invalid-credential': 'Sai email hoặc mật khẩu.',
    'auth/wrong-password': 'Sai email hoặc mật khẩu.',
    'auth/invalid-login-credentials': 'Sai email hoặc mật khẩu.',
    'auth/user-not-found': 'Tài khoản không tồn tại.',
    'auth/too-many-requests': 'Thử quá nhiều lần. Đợi một lát rồi thử lại.',
    'auth/invalid-email': 'Email không đúng định dạng.',
    'auth/user-disabled': 'Tài khoản đã bị vô hiệu hóa. Liên hệ quản trị.',
    'auth/operation-not-allowed': 'Phương thức Email/Password chưa được bật trên Firebase.',
    'auth/configuration-not-found':
      'Cấu hình Authentication chưa sẵn sàng: bật Email/Password, bật API Identity Toolkit trên Google Cloud (cùng project), đối chiếu .env với app Web — rồi chạy lại dev server.',
    'auth/network-request-failed': 'Không kết nối được tới Firebase. Kiểm tra mạng, VPN hoặc chặn quảng cáo / firewall.',
    'auth/invalid-api-key': 'API key Firebase không hợp lệ. Kiểm tra VITE_FIREBASE_API_KEY trong .env rồi chạy lại dev server.',
    'auth/internal-error': 'Lỗi phía Firebase. Thử lại sau; kiểm tra dự án và billing nếu có.',
    'auth/missing-password': 'Vui lòng nhập mật khẩu.',
    'auth/missing-email': 'Vui lòng nhập email.',
  }
  if (code && byCode[code]) return byCode[code]
  if (code) {
    return `Đăng nhập không thành công (${code}).`
  }
  if (err instanceof Error && err.message) {
    return `Đăng nhập không thành công: ${err.message}`
  }
  return 'Đăng nhập không thành công.'
}

/**
 * Cổng đăng nhập thống nhất (admin / quản lý / nhân viên) — Firebase Email-Password.
 * Super admin: `VITE_SUPER_ADMIN_EMAIL` → role admin trong Firestore `users/{uid}`.
 */
export function LoginView() {
  const { status, firebaseUser, signInWithEmail } = useAuth()
  const location = useLocation()
  const rawFrom = (location.state as { from?: string } | null)?.from
  const from =
    rawFrom && rawFrom !== '/login' && rawFrom.startsWith('/') ? rawFrom : '/'

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const hasAuth = Boolean(isFirebaseConfigured() && getFirebaseAuth())
  if (!hasAuth) {
    return (
      <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-slate-100 px-6 text-slate-700">
        <div className="app-glass-panel max-w-md rounded-3xl p-8 text-center shadow-xl">
          <p className="text-sm">Chưa cấu hình Firebase Auth trong .env</p>
          <Link to="/" className="mt-4 inline-block text-sm font-medium text-emerald-700 underline-offset-4 hover:underline">
            Về trang chủ
          </Link>
        </div>
      </div>
    )
  }

  if (
    firebaseUser &&
    (status === 'authenticated' || status === 'authenticating')
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
      const msg = mapFirebaseLoginError(err)
      setError(msg)
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="relative flex min-h-[100dvh] w-full flex-col items-center overflow-x-hidden pb-[max(1.5rem,env(safe-area-inset-bottom,0px))] pt-[max(1rem,env(safe-area-inset-top,0px))] font-sans selection:bg-white/20 selection:text-white">
      <video
        className="fixed inset-0 z-[0] h-full w-full object-cover"
        src={VIDEO_SRC}
        autoPlay
        loop
        muted
        playsInline
        preload="metadata"
        aria-hidden
      />
      <div
        className="pointer-events-none fixed inset-0 z-[1] bg-gradient-to-b from-black/55 via-black/40 to-black/70"
        aria-hidden
      />

      <div className="relative z-10 flex min-h-[100dvh] w-full max-w-7xl flex-col items-center justify-start px-4 pb-8 pt-[max(0.5rem,env(safe-area-inset-top,0px))] md:px-8 md:pb-10 md:pt-6">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: 'easeOut' }}
          className="liquid-glass mx-auto w-full max-w-sm rounded-2xl p-6 text-white shadow-2xl shadow-black/40 md:p-8"
        >
          <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-amber-200/75 md:text-xs">
            VietMy Admissions
          </p>
          <h1 className="font-display mt-2 text-3xl font-semibold uppercase leading-tight tracking-wide text-white md:text-[2.1rem]">
            Đăng nhập
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-white/55">Hệ thống tuyển sinh &amp; đánh giá hồ sơ</p>

          <form onSubmit={(e) => void submit(e)} className="mt-6 space-y-4">
            <label className="block text-[11px] font-medium uppercase tracking-[0.14em] text-amber-100/45">
              Email
              <input
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="mt-2 w-full rounded-xl border border-white/18 bg-white/[0.07] px-3 py-3 text-[15px] text-white outline-none ring-0 placeholder:text-white/30 focus:border-amber-300/40 focus:ring-2 focus:ring-amber-400/25"
                placeholder="ten@caodangvietmy.edu.vn"
              />
            </label>
            <label className="block text-[11px] font-medium uppercase tracking-[0.14em] text-amber-100/45">
              Mật khẩu
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="mt-2 w-full rounded-xl border border-white/18 bg-white/[0.07] px-3 py-3 text-[15px] text-white outline-none focus:border-amber-300/40 focus:ring-2 focus:ring-amber-400/25"
              />
            </label>
            {error ? (
              <p className="whitespace-pre-line text-sm leading-relaxed text-rose-200">{error}</p>
            ) : null}
            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-xl bg-gradient-to-r from-amber-200 via-amber-100 to-amber-200 py-3 text-[15px] font-semibold text-slate-950 shadow-lg shadow-amber-950/25 ring-1 ring-amber-50/50 transition hover:brightness-105 disabled:opacity-50"
            >
              {busy ? 'Đang đăng nhập…' : 'Đăng nhập'}
            </button>
          </form>
        </motion.div>
      </div>
    </main>
  )
}
