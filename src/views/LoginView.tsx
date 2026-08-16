import { useState, type FormEvent } from 'react'
import { Link, Navigate, useLocation } from 'react-router-dom'
import { motion } from 'motion/react'
import { Wallet } from 'lucide-react'
import { AuthSessionExitBar } from '../components/AuthSessionControls'
import { AuthSessionBootScreen, useAuthBootMinHold } from '../components/AuthSessionBootScreen'
import { VietMyAccentHeading } from '../components/VietMyAccentHeading'
import { useAuth } from '../hooks/useAuth'
import { getFirebaseAuth, getFirebaseMissingKeys, isFirebaseConfigured } from '../services/firebase'
import { defaultSuperAdminEmailFromEnv } from '../tenancy/superAdminBootstrap'

const BRAND_LOGO_SRC = `${import.meta.env.BASE_URL}brand/logo-vietmy-trang.png`

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
 * Email khớp `VITE_SUPER_ADMIN_EMAIL` → role `super_admin` (orgId null). Lần đầu có thể tự tạo Auth user.
 */
export function LoginView() {
  const { status, firebaseUser, profile, signInWithEmail, signOut } = useAuth()
  const location = useLocation()
  const rawFrom = (location.state as { from?: string } | null)?.from
  const from =
    rawFrom &&
    rawFrom !== '/login' &&
    rawFrom !== '/' &&
    rawFrom.startsWith('/')
      ? rawFrom
      : '/leads'

  const superEmailHint = defaultSuperAdminEmailFromEnv()
  const [email, setEmail] = useState(superEmailHint)
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const hasAuth = Boolean(isFirebaseConfigured() && getFirebaseAuth())
  if (!hasAuth) {
    const missing = getFirebaseMissingKeys()
    return (
      <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-slate-100 px-4 py-10 text-slate-800">
        <div className="app-surface-elevated w-full max-w-lg rounded-3xl p-6 text-left sm:p-8">
          <p className="text-xs font-semibold uppercase tracking-wider text-amber-800">Chưa cấu hình Firebase</p>
          <h1 className="mt-2 text-xl font-bold text-slate-900">Không thể đăng nhập</h1>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">
            App cần đủ 6 biến <code className="rounded bg-slate-200/90 px-1 text-xs">VITE_FIREBASE_*</code> trong file{' '}
            <strong className="text-slate-900">.env</strong> (sao chép từ{' '}
            <code className="rounded bg-slate-200/90 px-1 text-xs">.env.example</code>
            ), rồi <strong className="text-slate-900">tắt và chạy lại</strong> <code className="text-xs">npm run dev</code> — Vite chỉ
            đọc .env khi khởi động.
          </p>
          {missing.length ? (
            <div className="mt-4 rounded-xl border border-amber-200/90 bg-amber-50/90 px-3 py-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-amber-900">Thiếu hoặc rỗng:</p>
              <ul className="mt-2 list-inside list-disc font-mono text-xs text-amber-950">
                {missing.map((k) => (
                  <li key={k}>{k}</li>
                ))}
              </ul>
            </div>
          ) : null}
          <ol className="mt-4 list-inside list-decimal space-y-2 text-sm text-slate-600">
            <li>
              Firebase Console → Project settings → <strong>Your apps</strong> (Web) → copy config vào{' '}
              <code className="text-xs">.env</code>.
            </li>
            <li>
              Authentication → Sign-in method → bật <strong>Email/Password</strong>.
            </li>
            <li>
              Google Cloud (cùng project) → APIs → bật <strong>Identity Toolkit API</strong> (tránh lỗi{' '}
              <code className="text-xs">auth/configuration-not-found</code>).
            </li>
            <li>
              Tạo user email trong Authentication; Firestore document <code className="text-xs">users/{'{'}uid{'}'}</code> theo
              Rules của bạn (hoặc chạy <code className="text-xs">npm run seed:super-admin</code> như trong{' '}
              <code className="text-xs">.env.example</code>).
            </li>
          </ol>
          <p className="mt-4 text-xs text-slate-500">
            Deploy (Vercel / GitHub Actions): thêm cùng tên biến trong Environment secrets — không commit <code className="text-xs">.env</code>.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              to="/leads"
              className="inline-flex rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 shadow-sm hover:bg-slate-50"
            >
              Về trang chủ
            </Link>
          </div>
        </div>
      </div>
    )
  }

  const bootHold = useAuthBootMinHold(Boolean(firebaseUser) && status === 'authenticating', {
    skip: !firebaseUser,
    minMs: 0,
  })

  // Đang khôi phục phiên (grace / sync) — đừng hiện form đăng nhập rồi nhảy lại CRM.
  if (firebaseUser && (status === 'unknown' || status === 'authenticating')) {
    return (
      <AuthSessionBootScreen
        statusLabel="Đang đồng bộ hồ sơ nhân sự"
        detail="Đăng nhập Authentication thành công."
        actions={
          <button
            type="button"
            className="rounded-xl border border-white/20 bg-white/10 px-4 py-2 text-sm font-medium text-white/90 backdrop-blur transition hover:bg-white/15"
            onClick={() => void signOut()}
          >
            Đăng xuất để thử lại
          </button>
        }
      />
    )
  }

  // Chỉ vào CRM khi đã có hồ sơ — tránh kẹt vòng redirect khi sync thất bại.
  if (firebaseUser && status === 'authenticated' && profile) {
    if (bootHold) {
      return (
        <AuthSessionBootScreen
          statusLabel="Đang mở phiên làm việc"
          detail="Đăng nhập thành công."
        />
      )
    }
    return <Navigate to={from} replace />
  }

  if (firebaseUser && status === 'authenticated' && !profile) {
    return (
      <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-[var(--vm-canvas)] px-4 py-10">
        <div className="app-surface-elevated w-full max-w-md rounded-2xl p-6 text-center sm:p-8">
          <p className="text-sm font-semibold text-slate-900">Chưa vào được CRM</p>
          <p className="mt-2 text-sm text-slate-600">
            Đã đăng nhập nhưng chưa đọc/ghi được hồ sơ Firestore. Đăng xuất rồi thử lại, hoặc liên hệ quản trị.
          </p>
          <div className="mt-5 flex flex-col gap-2">
            <button type="button" className="vm-btn vm-btn-primary w-full" onClick={() => void signOut()}>
              Đăng xuất để thử lại
            </button>
            <button
              type="button"
              className="vm-btn vm-btn-secondary w-full"
              onClick={() => window.location.reload()}
            >
              Tải lại trang
            </button>
          </div>
        </div>
      </div>
    )
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
    <main className="relative flex min-h-[100dvh] w-full flex-col items-center overflow-x-hidden bg-[var(--vm-canvas)] pb-[max(1.5rem,env(safe-area-inset-bottom,0px))] pt-[max(1rem,env(safe-area-inset-top,0px))] font-sans">
      <video
        className="fixed inset-0 z-[0] h-full w-full object-cover opacity-30"
        src={VIDEO_SRC}
        autoPlay
        loop
        muted
        playsInline
        preload="metadata"
        aria-hidden
      />
      <div
        className="pointer-events-none fixed inset-0 z-[1] bg-[radial-gradient(ellipse_at_20%_0%,rgba(79,70,229,0.22),transparent_50%),linear-gradient(180deg,#0b1220f2_0%,#0b1220b8_42%,#f8fafc_100%)]"
        aria-hidden
      />

      <div className="relative z-10 flex min-h-[100dvh] w-full flex-col items-center justify-center px-4 py-8 md:px-8">
        <div className="mb-4 w-full max-w-4xl">
          <AuthSessionExitBar tone="onDark" />
        </div>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, ease: 'easeOut' }}
          className="bento-login-board"
        >
          <section className="bento-cell bento-cell--hero flex flex-col items-center justify-center !p-7 sm:!p-9">
            <h1 className="sr-only">Smart AI CRM — Cao đẳng Việt Mỹ - Hà Nội</h1>
            <img
              src={BRAND_LOGO_SRC}
              alt="Cao đẳng Việt Mỹ - Hà Nội"
              className="h-auto w-full max-w-[18rem] object-contain sm:max-w-[22rem]"
            />
            <VietMyAccentHeading
              as="p"
              tone="onDark"
              size="md"
              className="mt-7 text-center !tracking-[0.32em] sm:!text-base sm:!tracking-[0.38em]"
            >
              Smart AI CRM
            </VietMyAccentHeading>
          </section>

          <section className="bento-cell !bg-white !p-6 text-[var(--vm-text)] shadow-[var(--shadow-md)] sm:!p-8">
            <form onSubmit={(e) => void submit(e)} className="space-y-4">
              <label className="block text-xs font-semibold uppercase tracking-wide text-[var(--vm-text-muted)]">
                Email
                <input
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="vm-input mt-2"
                  placeholder={superEmailHint || 'ten@caodangvietmy.edu.vn'}
                />
              </label>
              <label className="block text-xs font-semibold uppercase tracking-wide text-[var(--vm-text-muted)]">
                Mật khẩu
                <input
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  className="vm-input mt-2"
                  placeholder="Tối thiểu 6 ký tự"
                />
              </label>
              {error ? (
                <p className="whitespace-pre-line rounded-xl border border-[color:var(--color-danger)]/30 bg-red-50 px-3 py-2 text-sm leading-relaxed text-red-700">
                  {error}
                </p>
              ) : null}
              <button type="submit" disabled={busy} className="vm-btn vm-btn-primary w-full py-3 text-base">
                {busy ? 'Đang đăng nhập…' : 'Đăng nhập CRM'}
              </button>
              <Link to="/ke-toan/login" className="vm-btn vm-btn-secondary w-full">
                <Wallet className="h-4 w-4" aria-hidden />
                Cổng kế toán — truy cập nhanh
              </Link>
            </form>
          </section>
        </motion.div>
      </div>
    </main>
  )
}
