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
        className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border border-sky-300/80 bg-sky-50 text-sky-900 shadow-sm transition duration-150 hover:bg-sky-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-sky-600"
        aria-label={ariaLabel ?? `Hướng dẫn: ${title}`}
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation()
          setOpen((o) => !o)
        }}
      >
        <CircleHelp className="h-4 w-4" aria-hidden strokeWidth={2} />
      </button>
      {open ? (
        <div
          role="dialog"
          aria-label={title}
          className={[
            'absolute top-full z-[80] mt-1.5 w-[min(20rem,calc(100vw-2rem))] rounded-xl border border-sky-200 bg-white p-3 text-left text-xs leading-relaxed text-slate-800 shadow-lg',
            align === 'left' ? 'left-0' : 'right-0',
          ].join(' ')}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="mb-1.5 flex items-start justify-between gap-2">
            <p className="font-bold text-sky-950">{title}</p>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-slate-400"
              aria-label="Đóng"
            >
              <X className="h-3.5 w-3.5" aria-hidden />
            </button>
          </div>
          <div className="text-slate-700">{hint}</div>
        </div>
      ) : null}
    </div>
  )
}
