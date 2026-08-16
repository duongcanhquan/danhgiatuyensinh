import { useState } from 'react'
import { BookOpen } from 'lucide-react'
import { KpiPersonnelGuideBody, KpiSettingsGuideBody } from './kpiGuideContent'
import { ViewportModal } from './ViewportModal'

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

      <ViewportModal
        open={open}
        onClose={() => setOpen(false)}
        title={title}
        subtitle={subtitle}
        titleId="kpi-guide-title"
        size="lg"
        zIndexClass="z-[210]"
        bodyClassName="pt-1"
      >
        <div id="kpi-guide-dialog">
          {variant === 'personnel' ? (
            <KpiPersonnelGuideBody focus={reportTab} />
          ) : (
            <KpiSettingsGuideBody />
          )}
        </div>
      </ViewportModal>
    </>
  )
}
