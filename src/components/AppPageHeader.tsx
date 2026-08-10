import type { ReactNode } from 'react'

type AppPageHeaderProps = {
  title: string
  meta?: ReactNode
  actions?: ReactNode
  children?: ReactNode
  className?: string
  /** `onDark` — tiêu đề/mô tả sáng trên ô hero tối. */
  tone?: 'onLight' | 'onDark'
}

/** Tiêu đề trang gọn — ưu tiên tab/action, bỏ khung kính dư thừa. */
export function AppPageHeader({
  title,
  meta,
  actions,
  children,
  className = '',
  tone = 'onLight',
}: AppPageHeaderProps) {
  const onDark = tone === 'onDark'
  return (
    <header className={`app-page-header ${className}`.trim()} data-tone={tone}>
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h1
            className={[
              'truncate text-lg font-semibold tracking-tight sm:text-xl',
              onDark ? '!text-white' : 'text-slate-900',
            ].join(' ')}
          >
            {title}
          </h1>
          {meta ? (
            <div
              className={[
                'mt-0.5 truncate text-xs',
                onDark ? '!text-indigo-100/90' : 'text-slate-500',
              ].join(' ')}
            >
              {meta}
            </div>
          ) : null}
        </div>
        {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
      </div>
      {children ? <div className="mt-3 min-w-0">{children}</div> : null}
    </header>
  )
}
