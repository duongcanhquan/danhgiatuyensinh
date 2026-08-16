import { useState, type FormEvent } from 'react'
import { KeyRound, Loader2 } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'

function mapPasswordError(err: unknown): string {
  const code =
    err && typeof err === 'object' && 'code' in err && typeof (err as { code: unknown }).code === 'string'
      ? (err as { code: string }).code
      : ''
  if (code === 'auth/wrong-password' || code === 'auth/invalid-credential') return 'Mật khẩu hiện tại không đúng.'
  if (code === 'auth/weak-password') return 'Mật khẩu mới quá yếu (tối thiểu 6 ký tự).'
  if (code === 'auth/requires-recent-login') return 'Phiên đăng nhập cũ — đăng xuất rồi đăng nhập lại rồi đổi mật khẩu.'
  if (err instanceof Error && err.message) return err.message
  return 'Không đổi được mật khẩu.'
}

/** Đổi mật khẩu tài khoản đang đăng nhập — dùng sau lần đăng nhập đầu. */
export function ChangePasswordPanel({
  compact,
  tone = 'dark',
}: {
  compact?: boolean
  /** `light` — cổng kế toán / nền sáng. */
  tone?: 'dark' | 'light'
}) {
  const { changeOwnPassword, firebaseUser } = useAuth()
  const [open, setOpen] = useState(false)
  const [currentPassword, setCurrentPassword] = useState('')
  const [nextPassword, setNextPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)

  if (!firebaseUser) return null

  const light = tone === 'light'

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setOk(null)
    if (nextPassword !== confirm) {
      setError('Mật khẩu mới nhập lại chưa khớp.')
      return
    }
    setBusy(true)
    try {
      await changeOwnPassword(currentPassword, nextPassword)
      setOk('Đã đổi mật khẩu.')
      setCurrentPassword('')
      setNextPassword('')
      setConfirm('')
      setOpen(false)
    } catch (err) {
      setError(mapPasswordError(err))
    } finally {
      setBusy(false)
    }
  }

  if (!open) {
    return (
      <div className={compact ? 'mt-1' : 'mt-2 space-y-1'}>
        {ok ? (
          <p className={`px-1 text-[10px] ${light ? 'text-emerald-700' : 'text-indigo-200'}`}>{ok}</p>
        ) : null}
        <button
          type="button"
          onClick={() => {
            setOpen(true)
            setError(null)
            setOk(null)
          }}
          className={
            light
              ? compact
                ? 'inline-flex min-h-9 cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-indigo-200 bg-white px-3 py-1.5 text-xs font-semibold text-indigo-900 shadow-sm transition hover:bg-indigo-50'
                : 'inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-indigo-200 bg-white px-3 py-2 text-sm font-semibold text-indigo-900 shadow-sm transition hover:bg-indigo-50'
              : compact
                ? 'flex w-full min-h-7 cursor-pointer items-center justify-center gap-1 rounded-md border border-white/15 bg-white/5 px-1.5 py-1 text-[11px] font-medium text-slate-200 transition hover:bg-white/10 hover:text-white'
                : 'flex w-full min-h-9 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-white/15 bg-white/5 px-2.5 py-1.5 text-sm font-medium text-slate-200 transition hover:bg-white/10 hover:text-white'
          }
        >
          <KeyRound className={compact ? 'h-3 w-3' : 'h-3.5 w-3.5'} aria-hidden />
          Đổi mật khẩu
        </button>
      </div>
    )
  }

  return (
    <form
      onSubmit={(e) => void onSubmit(e)}
      className={
        light
          ? 'mt-2 space-y-2 rounded-xl border border-indigo-200 bg-white p-3 shadow-sm'
          : compact
            ? 'mt-1 space-y-1.5 rounded-lg border border-white/15 bg-white/5 p-2'
            : 'mt-2 space-y-2 rounded-xl border border-white/15 bg-white/5 p-3'
      }
    >
      <p className={`text-xs font-semibold ${light ? 'text-indigo-950' : 'text-slate-200'}`}>Đổi mật khẩu</p>
      <label className={`block text-[11px] ${light ? 'text-slate-700' : 'text-slate-300'}`}>
        Mật khẩu hiện tại
        <input
          type="password"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          autoComplete="current-password"
          required
          className={
            light
              ? 'mt-1 w-full rounded-lg border border-slate-200 px-2.5 py-2 text-sm text-slate-900'
              : 'mt-1 w-full rounded-md border border-white/20 bg-slate-900/60 px-2 py-1.5 text-sm text-white'
          }
        />
      </label>
      <label className={`block text-[11px] ${light ? 'text-slate-700' : 'text-slate-300'}`}>
        Mật khẩu mới
        <input
          type="password"
          value={nextPassword}
          onChange={(e) => setNextPassword(e.target.value)}
          autoComplete="new-password"
          minLength={6}
          required
          className={
            light
              ? 'mt-1 w-full rounded-lg border border-slate-200 px-2.5 py-2 text-sm text-slate-900'
              : 'mt-1 w-full rounded-md border border-white/20 bg-slate-900/60 px-2 py-1.5 text-sm text-white'
          }
        />
      </label>
      <label className={`block text-[11px] ${light ? 'text-slate-700' : 'text-slate-300'}`}>
        Nhập lại mật khẩu mới
        <input
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          autoComplete="new-password"
          minLength={6}
          required
          className={
            light
              ? 'mt-1 w-full rounded-lg border border-slate-200 px-2.5 py-2 text-sm text-slate-900'
              : 'mt-1 w-full rounded-md border border-white/20 bg-slate-900/60 px-2 py-1.5 text-sm text-white'
          }
        />
      </label>
      {error ? <p className={`text-xs ${light ? 'text-rose-700' : 'text-rose-300'}`}>{error}</p> : null}
      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={busy}
          className={
            light
              ? 'inline-flex min-h-9 items-center gap-1.5 rounded-xl bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50'
              : 'inline-flex min-h-8 items-center gap-1 rounded-md bg-indigo-500 px-2.5 py-1 text-xs font-semibold text-white disabled:opacity-50'
          }
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
          Lưu mật khẩu
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            setOpen(false)
            setError(null)
          }}
          className={
            light
              ? 'inline-flex min-h-9 items-center rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700'
              : 'inline-flex min-h-8 items-center rounded-md border border-white/20 px-2.5 py-1 text-xs text-slate-300'
          }
        >
          Hủy
        </button>
      </div>
    </form>
  )
}
