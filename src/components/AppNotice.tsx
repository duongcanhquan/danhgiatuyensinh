import { AlertTriangle, CheckCircle2, CircleAlert, Info, X } from 'lucide-react'
import { appNoticeToneFromMessage, type AppNoticeTone } from '../utils/appNoticeTone'

const TONE: Record<
  AppNoticeTone,
  { wrap: string; icon: typeof Info; label: string }
> = {
  success: {
    wrap: 'border-emerald-200 bg-emerald-50 text-emerald-950',
    icon: CheckCircle2,
    label: 'Thành công',
  },
  error: {
    wrap: 'border-rose-200 bg-rose-50 text-rose-950',
    icon: CircleAlert,
    label: 'Lỗi',
  },
  warning: {
    wrap: 'border-amber-200 bg-amber-50 text-amber-950',
    icon: AlertTriangle,
    label: 'Cần chú ý',
  },
  info: {
    wrap: 'border-sky-200 bg-sky-50 text-sky-950',
    icon: Info,
    label: 'Thông tin',
  },
}

export function AppNotice({
  children,
  tone,
  compact,
  onDismiss,
  className = '',
  role = 'status',
}: {
  children: string
  tone?: AppNoticeTone
  compact?: boolean
  onDismiss?: () => void
  className?: string
  role?: 'status' | 'alert'
}) {
  const resolved = tone ?? appNoticeToneFromMessage(children)
  const spec = TONE[resolved]
  const Icon = spec.icon
  return (
    <div
      role={role}
      aria-live={resolved === 'error' ? 'assertive' : 'polite'}
      className={[
        'flex items-start gap-2 border shadow-sm',
        compact ? 'rounded-lg px-2.5 py-1.5' : 'rounded-xl px-3 py-2.5',
        spec.wrap,
        className,
      ].join(' ')}
    >
      <Icon
        className={compact ? 'mt-0.5 h-3.5 w-3.5 shrink-0' : 'mt-0.5 h-4 w-4 shrink-0'}
        aria-hidden
        strokeWidth={2}
      />
      <p
        className={[
          'min-w-0 flex-1 font-medium leading-snug',
          compact ? 'text-[11px]' : 'text-sm',
        ].join(' ')}
      >
        <span className="sr-only">{spec.label}: </span>
        {children}
      </p>
      {onDismiss ? (
        <button
          type="button"
          onClick={onDismiss}
          className="shrink-0 rounded-md p-0.5 opacity-70 transition hover:bg-white/70 hover:opacity-100"
          aria-label="Đóng thông báo"
        >
          <X className={compact ? 'h-3.5 w-3.5' : 'h-4 w-4'} aria-hidden />
        </button>
      ) : null}
    </div>
  )
}
