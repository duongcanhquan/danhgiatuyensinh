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
export function ChangePasswordPanel({ compact }: { compact?: boolean }) {
  const { changeOwnPassword, firebaseUser } = useAuth()
  const [open, setOpen] = useState(false)
  const [currentPassword, setCurrentPassword] = useState('')
  const [nextPassword, setNextPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)

  if (!firebaseUser) return null

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
      <div className={compact ? 'mt-2' : 'mt-2 space-y-1'}>
        {ok ? <p className="px-1 text-xs text-indigo-200">{ok}</p> : null}
        <button
          type="button"
          onClick={() => {
            setOpen(true)
            setError(null)
            setOk(null)
          }}
          className="flex w-full min-h-10 cursor-pointer items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/5 py-2 text-xs font-semibold text-slate-200 transition hover:bg-white/10 hover:text-white"
        >
          <KeyRound className="h-3.5 w-3.5" aria-hidden />
          Đổi mật khẩu
        </button>
      </div>
    )
  }

  return (
    <form onSubmit={(e) => void onSubmit(e)} className="mt-2 space-y-2 rounded-xl border border-white/15 bg-white/5 p-3">
      <p className="text-xs font-semibold text-white">Đổi mật khẩu</p>
      <label className="block text-[11px] text-slate-400">
        Mật khẩu hiện tại
        <input
          type="password"
          autoComplete="current-password"
          className="mt-1 w-full rounded-lg border border-white/20 bg-slate-950/40 px-2 py-1.5 text-sm text-white"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          required
        />
      </label>
      <label className="block text-[11px] text-slate-400">
        Mật khẩu mới
        <input
          type="password"
          autoComplete="new-password"
          className="mt-1 w-full rounded-lg border border-white/20 bg-slate-950/40 px-2 py-1.5 text-sm text-white"
          value={nextPassword}
          onChange={(e) => setNextPassword(e.target.value)}
          minLength={6}
          required
        />
      </label>
      <label className="block text-[11px] text-slate-400">
        Nhập lại mật khẩu mới
        <input
          type="password"
          autoComplete="new-password"
          className="mt-1 w-full rounded-lg border border-white/20 bg-slate-950/40 px-2 py-1.5 text-sm text-white"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          minLength={6}
          required
        />
      </label>
      {error ? <p className="text-xs text-rose-300">{error}</p> : null}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={busy}
          className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg bg-indigo-600 px-2 py-2 text-xs font-semibold text-white hover:bg-indigo-500 disabled:opacity-60"
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
          Lưu
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => setOpen(false)}
          className="rounded-lg border border-white/20 px-2 py-2 text-xs font-semibold text-slate-300 hover:bg-white/10"
        >
          Hủy
        </button>
      </div>
    </form>
  )
}
