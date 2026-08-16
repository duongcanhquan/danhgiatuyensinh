import { Navigate, useNavigate } from 'react-router-dom'
import type { ReactNode } from 'react'
import { LogOut, UserRound } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { USER_ROLE_LABELS } from '../types'
import { getFirebaseAuth, isFirebaseConfigured } from '../services/firebase'

type Tone = 'onLight' | 'onDark' | 'indigo'

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
  indigo: {
    wrap: 'border-indigo-200/90 bg-indigo-50/95 text-indigo-950 shadow-sm backdrop-blur-sm',
    text: 'text-indigo-800',
    btn: 'border-indigo-300 bg-white text-indigo-900 hover:bg-indigo-50',
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

/** Màn cổng đăng nhập khi đã có phiên — giữ API cũ; ưu tiên Navigate thẳng vào hệ thống thay vì dùng gate này. */
export function LoggedInPortalGate({
  continueTo,
  children,
}: {
  continueTo: string
  portalTitle: string
  continueLabel: string
  tone?: 'onDark' | 'indigo'
  children?: ReactNode
}) {
  const { firebaseUser, status } = useAuth()

  if (firebaseUser && (status === 'authenticated' || status === 'authenticating')) {
    return <Navigate to={continueTo} replace />
  }

  return children ?? null
}
