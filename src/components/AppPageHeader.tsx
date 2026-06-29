import type { ReactNode } from 'react'

type AppPageHeaderProps = {
  title: string
  meta?: ReactNode
  actions?: ReactNode
  children?: ReactNode
  className?: string
}

/** Tiêu đề trang gọn — ưu tiên tab/action, bỏ khung kính dư thừa. */
export function AppPageHeader({ title, meta, actions, children, className = '' }: AppPageHeaderProps) {
  return (
    <header className={`app-page-header ${className}`.trim()}>
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-lg font-semibold tracking-tight text-slate-900 sm:text-xl">{title}</h1>
          {meta ? <div className="mt-0.5 truncate text-xs text-slate-500">{meta}</div> : null}
        </div>
        {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
      </div>
      {children ? <div className="mt-3 min-w-0">{children}</div> : null}
    </header>
  )
}
