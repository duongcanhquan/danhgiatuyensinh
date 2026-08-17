import { useEffect, useRef, useState } from 'react'
import { CircleHelp, X } from 'lucide-react'
import type { MlWinDisplay } from '../utils/mlWinMock'
import { buildMlWinHoverText } from '../utils/mlWinMock'

type ColumnHelpTone = 'violet' | 'amber'

const TONE: Record<ColumnHelpTone, { btn: string; title: string; border: string }> = {
  violet: {
    btn: 'border-violet-300/80 bg-violet-50 text-violet-900 hover:bg-violet-100',
    title: 'text-violet-900',
    border: 'border-violet-200',
  },
  amber: {
    btn: 'border-amber-300/80 bg-amber-50 text-amber-950 hover:bg-amber-100',
    title: 'text-amber-950',
    border: 'border-amber-200',
  },
}

/** Nút ? — bấm mở popover (chuột/touch); không chỉ dựa vào title. */
export function ColumnHelpPopover({
  title,
  hint,
  detail,
  tone = 'violet',
  className,
}: {
  title: string
  hint: string
  detail?: string | null
  tone?: ColumnHelpTone
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const spec = TONE[tone]

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div ref={wrapRef} className={`relative inline-flex ${className ?? ''}`}>
      <button
        type="button"
        className={`rounded-full border p-0.5 shadow-sm ${spec.btn}`}
        aria-label={`Giải thích ${title}`}
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation()
          setOpen((o) => !o)
        }}
      >
        <CircleHelp className="h-3 w-3" aria-hidden strokeWidth={2} />
      </button>
      {open ? (
        <div
          role="dialog"
          aria-label={title}
          className={`absolute right-0 top-full z-[60] mt-1 w-[min(24rem,calc(100vw-2rem))] rounded-lg border bg-white p-2.5 text-left text-xs leading-snug text-slate-800 shadow-lg md:w-[min(28rem,calc(100vw-2rem))] ${spec.border}`}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="mb-1 flex items-start justify-between gap-2">
            <p className={`font-bold ${spec.title}`}>{title}</p>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="shrink-0 rounded p-0.5 text-slate-500 hover:bg-slate-100"
              aria-label="Đóng"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <p className="text-slate-700">{hint}</p>
          {detail ? (
            <pre className="mt-2 max-h-56 overflow-y-auto whitespace-pre-wrap rounded border border-slate-100 bg-slate-50/90 p-2 text-[11px] text-slate-700 md:max-h-72">
              {detail}
            </pre>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

type InfoScoreHelpPopoverProps = {
  hint: string
  ml?: MlWinDisplay | null
  className?: string
}

/** Nút ? độ đầy đủ — giữ API cũ. */
export function InfoScoreHelpPopover({ hint, ml, className }: InfoScoreHelpPopoverProps) {
  return (
    <ColumnHelpPopover
      title="Độ đầy đủ"
      hint={hint}
      detail={ml ? buildMlWinHoverText(ml) : null}
      tone="violet"
      className={className}
    />
  )
}
