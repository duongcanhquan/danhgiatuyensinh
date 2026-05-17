import { useEffect, useRef, useState } from 'react'
import { CircleHelp, X } from 'lucide-react'
import type { MlWinDisplay } from '../utils/mlWinMock'
import { buildMlWinHoverText } from '../utils/mlWinMock'

type InfoScoreHelpPopoverProps = {
  hint: string
  ml?: MlWinDisplay | null
  className?: string
}

/** Nút ? — bấm mở popover (chuột/touch); không chỉ dựa vào title. */
export function InfoScoreHelpPopover({ hint, ml, className }: InfoScoreHelpPopoverProps) {
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

  const detail = ml ? buildMlWinHoverText(ml) : null

  return (
    <div ref={wrapRef} className={`relative inline-flex ${className ?? ''}`}>
      <button
        type="button"
        className="rounded-full border border-violet-300/80 bg-violet-50 p-0.5 text-violet-900 shadow-sm hover:bg-violet-100"
        aria-label="Giải thích điểm thông tin"
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
          aria-label="Điểm thông tin"
          className="absolute right-0 top-full z-[60] mt-1 w-[min(18rem,calc(100vw-2rem))] rounded-lg border border-violet-200 bg-white p-2.5 text-left text-xs leading-snug text-slate-800 shadow-lg"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="mb-1 flex items-start justify-between gap-2">
            <p className="font-bold text-violet-900">Điểm thông tin</p>
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
            <pre className="mt-2 max-h-40 overflow-y-auto whitespace-pre-wrap rounded border border-slate-100 bg-slate-50/90 p-2 text-[11px] text-slate-700">
              {detail}
            </pre>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
