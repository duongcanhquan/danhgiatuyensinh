import { useEffect, useId, useRef, useState } from 'react'
import { AlertTriangle, Info } from 'lucide-react'
import { ViewportModal } from './ViewportModal'
import {
  phrasesMatch,
  registerAppConfirmHost,
  type AppConfirmOptions,
  type AppConfirmVariant,
} from '../utils/appConfirm'

const VARIANT_ICON: Record<AppConfirmVariant, typeof AlertTriangle> = {
  default: Info,
  warning: AlertTriangle,
  danger: AlertTriangle,
}

const VARIANT_HEADER: Record<AppConfirmVariant, string> = {
  default: 'bg-slate-50 text-slate-900',
  warning: 'bg-amber-50 text-amber-950',
  danger: 'bg-rose-50 text-rose-950',
}

const VARIANT_CONFIRM_BTN: Record<AppConfirmVariant, string> = {
  default: 'bg-indigo-600 text-white hover:bg-indigo-700',
  warning: 'bg-amber-600 text-white hover:bg-amber-700',
  danger: 'bg-rose-600 text-white hover:bg-rose-700',
}

/**
 * Host toàn app — gắn một lần trong App.
 * Các chỗ gọi `appConfirm()` / `confirmDangerous…` sẽ mở hộp thoại này.
 */
export function AppConfirmDialogHost() {
  const [open, setOpen] = useState(false)
  const [opts, setOpts] = useState<AppConfirmOptions | null>(null)
  const [typed, setTyped] = useState('')
  const resolveRef = useRef<((ok: boolean) => void) | null>(null)
  const titleId = useId()

  useEffect(() => {
    return registerAppConfirmHost((next) => {
      return new Promise<boolean>((resolve) => {
        resolveRef.current = resolve
        setOpts(next)
        setTyped('')
        setOpen(true)
      })
    })
  }, [])

  const finish = (ok: boolean) => {
    const resolve = resolveRef.current
    resolveRef.current = null
    setOpen(false)
    setOpts(null)
    setTyped('')
    resolve?.(ok)
  }

  if (!opts && !open) return null

  const variant = opts?.variant ?? 'default'
  const Icon = VARIANT_ICON[variant]
  const phrase = opts?.requirePhrase?.trim()
  const phraseOk = !phrase || phrasesMatch(typed, phrase)
  const confirmLabel = opts?.confirmLabel ?? (variant === 'danger' ? 'Xóa vĩnh viễn' : 'Đồng ý')
  const cancelLabel = opts?.cancelLabel ?? 'Hủy'

  return (
    <ViewportModal
      open={open && Boolean(opts)}
      onClose={() => finish(false)}
      titleId={titleId}
      size="md"
      zIndexClass="z-[300]"
      title={
        <span className="inline-flex items-center gap-2">
          <span
            className={[
              'inline-flex h-9 w-9 items-center justify-center rounded-xl',
              VARIANT_HEADER[variant],
            ].join(' ')}
          >
            <Icon className="h-5 w-5" aria-hidden />
          </span>
          <span>{opts?.title ?? 'Xác nhận'}</span>
        </span>
      }
      subtitle={variant === 'danger' ? 'Thao tác không hoàn tác được' : undefined}
      footer={
        <>
          <button
            type="button"
            className="inline-flex h-10 min-w-[5.5rem] items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            onClick={() => finish(false)}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            disabled={!phraseOk}
            className={[
              'inline-flex h-10 min-w-[7rem] flex-1 items-center justify-center rounded-xl px-4 text-sm font-semibold shadow-sm disabled:cursor-not-allowed disabled:opacity-40 sm:flex-none',
              VARIANT_CONFIRM_BTN[variant],
            ].join(' ')}
            onClick={() => finish(true)}
          >
            {confirmLabel}
          </button>
        </>
      }
    >
      <div className="space-y-3 text-sm text-slate-700">
        {opts?.description ? (
          <div className="leading-relaxed text-slate-800">{opts.description}</div>
        ) : null}
        {opts?.details?.length ? (
          <ul className="space-y-1.5 rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2.5 text-slate-800">
            {opts.details.map((line) => (
              <li key={line} className="flex gap-2">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-400" aria-hidden />
                <span>{line}</span>
              </li>
            ))}
          </ul>
        ) : null}
        {phrase ? (
          <div className="space-y-1.5 rounded-xl border border-rose-200 bg-rose-50/60 p-3">
            <p className="text-xs font-semibold text-rose-900">
              {opts?.phraseHint ?? (
                <>
                  Gõ <span className="font-mono tracking-wide">{phrase}</span> để xác nhận
                </>
              )}
            </p>
            <input
              type="text"
              autoFocus
              autoComplete="off"
              spellCheck={false}
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && phraseOk) finish(true)
              }}
              placeholder={phrase}
              className="h-10 w-full rounded-lg border border-rose-200 bg-white px-3 font-mono text-sm text-slate-900 outline-none ring-rose-300/40 focus:ring-2"
            />
          </div>
        ) : null}
      </div>
    </ViewportModal>
  )
}
