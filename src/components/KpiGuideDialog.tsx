import { useEffect, useState } from 'react'
import { BookOpen, X } from 'lucide-react'
import { KpiPersonnelGuideBody, KpiSettingsGuideBody } from './kpiGuideContent'

type KpiGuideDialogProps = {
  variant: 'personnel' | 'settings'
  /** Chỉ dùng với variant personnel — làm nổi bật tab đang mở */
  reportTab?: 'period' | 'monthly'
  /** Nút nhỏ (icon) hay nút có chữ */
  compact?: boolean
  className?: string
}

export function KpiGuideDialog({ variant, reportTab, compact, className }: KpiGuideDialogProps) {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  const title = variant === 'personnel' ? 'Hướng dẫn KPI & nhân sự' : 'Hướng dẫn cài đặt KPI Sale'
  const subtitle =
    variant === 'personnel'
      ? reportTab === 'monthly'
        ? 'Đang xem: Đánh giá tháng'
        : reportTab === 'period'
          ? 'Đang xem: Báo cáo kỳ'
          : 'Báo cáo kỳ và đánh giá tháng'
      : 'Cách chỉnh ngưỡng và công thức cho đúng'

  return (
    <>
      <button
        type="button"
        className={
          compact
            ? `inline-flex min-h-10 min-w-10 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-sky-200/90 bg-sky-50 p-2 text-sky-900 shadow-sm transition duration-200 hover:bg-sky-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600 motion-reduce:transition-none ${className ?? ''}`
            : `inline-flex min-h-10 shrink-0 cursor-pointer items-center gap-1.5 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-semibold text-sky-950 shadow-sm transition duration-200 hover:bg-sky-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600 motion-reduce:transition-none ${className ?? ''}`
        }
        aria-label={title}
        aria-expanded={open}
        aria-controls="kpi-guide-dialog"
        onClick={() => setOpen(true)}
      >
        <BookOpen className="h-3.5 w-3.5 shrink-0" aria-hidden />
        {compact ? null : 'Hướng dẫn'}
      </button>

      {open ? (
        <div className="fixed inset-0 z-[210] flex items-end justify-center sm:items-center sm:p-4">
          <button
            type="button"
            className="absolute inset-0 cursor-pointer bg-slate-900/50 backdrop-blur-[2px] motion-reduce:backdrop-blur-none"
            aria-label="Đóng hướng dẫn"
            onClick={() => setOpen(false)}
          />
          <div
            id="kpi-guide-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="kpi-guide-title"
            className="relative z-10 mt-auto w-full max-h-[min(88dvh,640px)] overflow-y-auto overscroll-contain rounded-t-2xl border border-slate-200/90 bg-white px-4 pb-5 pt-4 shadow-2xl transition duration-200 sm:mt-0 sm:max-w-lg sm:rounded-2xl md:max-w-xl"
          >
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3">
              <div className="min-w-0">
                <h2 id="kpi-guide-title" className="text-lg font-bold text-slate-900">
                  {title}
                </h2>
                <p className="mt-0.5 text-sm text-slate-600">{subtitle}</p>
              </div>
              <button
                type="button"
                className="flex min-h-10 min-w-10 shrink-0 cursor-pointer items-center justify-center rounded-lg text-slate-500 transition duration-150 hover:bg-slate-100 hover:text-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-400"
                onClick={() => setOpen(false)}
                aria-label="Đóng"
              >
                <X className="h-5 w-5" aria-hidden />
              </button>
            </div>
            <div className="pt-4">
              {variant === 'personnel' ? (
                <KpiPersonnelGuideBody focus={reportTab} />
              ) : (
                <KpiSettingsGuideBody />
              )}
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}
