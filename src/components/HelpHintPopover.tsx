import { useEffect, useRef, useState, type ReactNode } from 'react'
import { CircleHelp, X } from 'lucide-react'

type HelpHintPopoverProps = {
  title: string
  hint: ReactNode
  ariaLabel?: string
  className?: string
  align?: 'left' | 'right'
}

/** Nút ? — mở hướng dẫn ngắn cho trường cấu hình. */
export function HelpHintPopover({
  title,
  hint,
  ariaLabel,
  className,
  align = 'right',
}: HelpHintPopoverProps) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

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
    <div ref={wrapRef} className={`relative inline-flex shrink-0 ${className ?? ''}`}>
      <button
        type="button"
        className="rounded-full border border-sky-300/80 bg-sky-50 p-0.5 text-sky-900 shadow-sm hover:bg-sky-100"
        aria-label={ariaLabel ?? `Hướng dẫn: ${title}`}
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation()
          setOpen((o) => !o)
        }}
      >
        <CircleHelp className="h-3.5 w-3.5" aria-hidden strokeWidth={2} />
      </button>
      {open ? (
        <div
          role="dialog"
          aria-label={title}
          className={[
            'absolute top-full z-[80] mt-1 w-[min(20rem,calc(100vw-2rem))] rounded-lg border border-sky-200 bg-white p-3 text-left text-xs leading-relaxed text-slate-800 shadow-lg',
            align === 'left' ? 'left-0' : 'right-0',
          ].join(' ')}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="mb-1.5 flex items-start justify-between gap-2">
            <p className="font-bold text-sky-950">{title}</p>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="shrink-0 rounded p-0.5 text-slate-500 hover:bg-slate-100"
              aria-label="Đóng"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="text-slate-700">{hint}</div>
        </div>
      ) : null}
    </div>
  )
}

