export type TabStripItem<T extends string> = {
  id: T
  label: string
}

type TabStripProps<T extends string> = {
  tabs: TabStripItem<T>[]
  active: T
  onChange: (id: T) => void
  ariaLabel: string
  panelId?: string
  className?: string
  variant?: 'default' | 'segmented'
}

const TAB_BASE =
  'shrink-0 min-h-11 cursor-pointer rounded-xl border px-4 py-2 text-sm font-semibold transition duration-150 whitespace-nowrap focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary)]'

export function TabStrip<T extends string>({
  tabs,
  active,
  onChange,
  ariaLabel,
  panelId,
  className = '',
  variant = 'segmented',
}: TabStripProps<T>) {
  if (tabs.length <= 1) return null

  if (variant === 'segmented') {
    return (
      <div
        role="tablist"
        aria-label={ariaLabel}
        className={`app-tab-segmented scroll-touch ${className}`}
      >
        {tabs.map((tab) => {
          const on = active === tab.id
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              id={`tab-${tab.id}`}
              aria-selected={on}
              aria-controls={panelId}
              tabIndex={on ? 0 : -1}
              data-active={on ? 'true' : 'false'}
              onClick={() => onChange(tab.id)}
              className="app-tab-segmented-btn"
            >
              {tab.label}
            </button>
          )
        })}
      </div>
    )
  }

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={`scroll-touch flex gap-2 overflow-x-auto overscroll-x-contain pb-0.5 ${className}`}
    >
      {tabs.map((tab) => {
        const on = active === tab.id
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            id={`tab-${tab.id}`}
            aria-selected={on}
            aria-controls={panelId}
            tabIndex={on ? 0 : -1}
            onClick={() => onChange(tab.id)}
            className={
              on
                ? `${TAB_BASE} border-[var(--color-primary)] bg-[var(--color-primary)] text-white shadow-sm`
                : `${TAB_BASE} border-slate-200/90 bg-white/90 text-slate-700 hover:border-slate-300 hover:bg-white`
            }
          >
            {tab.label}
          </button>
        )
      })}
    </div>
  )
}
