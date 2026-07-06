import { Link, useNavigate } from 'react-router-dom'
import type { ReactNode } from 'react'
import { LogOut, UserRound } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { USER_ROLE_LABELS } from '../types'
import { getFirebaseAuth, isFirebaseConfigured } from '../services/firebase'

type Tone = 'onLight' | 'onDark' | 'emerald'

const toneStyles: Record<Tone, { wrap: string; text: string; btn: string }> = {
  onLight: {
    wrap: 'border-slate-200/90 bg-white/95 text-slate-800 shadow-sm backdrop-blur-sm',
    text: 'text-slate-600',
    btn: 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50',
  },
  onDark: {
    wrap: 'border-white/15 bg-slate-900/80 text-white shadow-lg backdrop-blur-md',
    text: 'text-slate-300',
    btn: 'border-white/20 bg-white/10 text-white hover:bg-white/15',
  },
  emerald: {
    wrap: 'border-emerald-200/90 bg-emerald-50/95 text-emerald-950 shadow-sm backdrop-blur-sm',
    text: 'text-emerald-800',
    btn: 'border-emerald-300 bg-white text-emerald-900 hover:bg-emerald-50',
  },
}

/** Thanh góc / đầu trang — đăng xuất khi đã có phiên (cổng công khai, form đăng ký). */
export function AuthSessionExitBar({
  tone = 'onLight',
  className = '',
}: {
  tone?: Tone
  className?: string
}) {
  const { firebaseUser, profile, signOut, status } = useAuth()
  const navigate = useNavigate()
  const styles = toneStyles[tone]
  const show = Boolean(isFirebaseConfigured() && getFirebaseAuth() && firebaseUser && status !== 'unknown')

  if (!show) return null

  const roleLabel = profile ? USER_ROLE_LABELS[profile.role] : 'Đang tải…'
  const name = profile?.displayName || profile?.email || firebaseUser?.email || 'Tài khoản'

  const onSignOut = async () => {
    await signOut()
    navigate('/login', { replace: true })
  }

  return (
    <div
      className={[
        'flex flex-wrap items-center justify-between gap-2 rounded-xl border px-3 py-2 text-xs sm:text-sm',
        styles.wrap,
        className,
      ].join(' ')}
      role="status"
    >
      <div className="flex min-w-0 items-center gap-2">
        <UserRound className="h-4 w-4 shrink-0 opacity-70" aria-hidden />
        <p className="min-w-0 truncate">
          <span className="font-semibold">{name}</span>
          <span className={['ml-1.5', styles.text].join(' ')}>· {roleLabel}</span>
        </p>
      </div>
      <button
        type="button"
        onClick={() => void onSignOut()}
        className={[
          'inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition',
          styles.btn,
        ].join(' ')}
      >
        <LogOut className="h-3.5 w-3.5" aria-hidden />
        Đăng xuất
      </button>
    </div>
  )
}

/** Màn cổng đăng nhập khi đã có phiên — chọn vào hệ thống hoặc đăng xuất để đổi tài khoản. */
export function LoggedInPortalGate({
  continueTo,
  portalTitle,
  continueLabel,
  tone = 'onDark',
  children,
}: {
  continueTo: string
  portalTitle: string
  continueLabel: string
  tone?: 'onDark' | 'emerald'
  children?: ReactNode
}) {
  const { firebaseUser, profile, signOut, status } = useAuth()
  const navigate = useNavigate()

  if (!firebaseUser || (status !== 'authenticated' && status !== 'authenticating')) {
    return children ?? null
  }

  const roleLabel = profile ? USER_ROLE_LABELS[profile.role] : '…'
  const name = profile?.displayName || profile?.email || firebaseUser.email || 'Tài khoản'
  const shell =
    tone === 'emerald'
      ? 'min-h-[100dvh] bg-gradient-to-br from-emerald-950 via-emerald-900 to-slate-950 px-4 py-10'
      : 'relative flex min-h-[100dvh] items-center justify-center overflow-hidden px-4 py-10'
  const card =
    tone === 'emerald'
      ? 'w-full max-w-md rounded-3xl border border-emerald-400/25 bg-white p-6 shadow-2xl'
      : 'liquid-glass w-full max-w-sm rounded-2xl border border-white/20 bg-slate-900/80 p-6 text-white shadow-2xl backdrop-blur-xl'

  return (
    <div className={shell}>
      <div className={card}>
        <p className={tone === 'emerald' ? 'text-xs font-bold uppercase tracking-wider text-emerald-700' : 'text-xs font-semibold uppercase tracking-[0.2em] text-blue-200/80'}>
          {portalTitle}
        </p>
        <h1 className={tone === 'emerald' ? 'mt-2 text-xl font-extrabold text-slate-900' : 'mt-2 text-xl font-bold text-white'}>
          Bạn đang đăng nhập
        </h1>
        <p className={tone === 'emerald' ? 'mt-2 text-sm text-slate-600' : 'mt-2 text-sm text-slate-300'}>
          <strong>{name}</strong> · {roleLabel}
        </p>
        <p className={tone === 'emerald' ? 'mt-1 text-xs text-slate-500' : 'mt-1 text-xs text-slate-400'}>
          Đăng xuất nếu cần đổi sang tài khoản khác trên máy này.
        </p>
        <div className="mt-5 flex flex-col gap-2 sm:flex-row">
          <Link
            to={continueTo}
            className={
              tone === 'emerald'
                ? 'inline-flex min-h-11 flex-1 items-center justify-center rounded-xl bg-emerald-600 px-4 py-2.5 text-center text-sm font-bold text-white hover:bg-emerald-700'
                : 'vm-btn vm-btn-primary min-h-11 flex-1 justify-center'
            }
          >
            {continueLabel}
          </Link>
          <button
            type="button"
            onClick={() => void signOut().then(() => navigate('/login', { replace: true }))}
            className={
              tone === 'emerald'
                ? 'inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50'
                : 'vm-btn vm-btn-secondary min-h-11 flex-1 justify-center border-white/20 bg-white/10 text-white hover:bg-white/15'
            }
          >
            <LogOut className="h-4 w-4" aria-hidden />
            Đăng xuất
          </button>
        </div>
      </div>
    </div>
  )
}
