import { useEffect, useId, useMemo, useRef, useState } from 'react'

export type SearchableFilterOption = { v: string; t: string }

type SearchableFilterSelectProps = {
  label: string
  title?: string
  value: string
  onChange: (v: string) => void
  options: SearchableFilterOption[]
  allValue?: string
  allLabel?: string
  placeholder?: string
  compact?: boolean
  className?: string
}

/** Lọc đơn: gõ tìm trong danh sách có sẵn, chọn một mục. */
export function SearchableFilterSelect({
  label,
  title,
  value,
  onChange,
  options,
  allValue = 'ALL',
  allLabel = 'Tất cả',
  placeholder = 'Gõ để tìm…',
  compact,
  className,
}: SearchableFilterSelectProps) {
  const listId = useId()
  const wrapRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')

  const selectedLabel = useMemo(() => {
    if (value === allValue) return allLabel
    return options.find((o) => o.v === value)?.t ?? value
  }, [value, allValue, allLabel, options])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const base = options.filter((o) => o.v !== allValue)
    if (!q) return base.slice(0, 80)
    return base.filter((o) => o.t.toLowerCase().includes(q) || o.v.toLowerCase().includes(q)).slice(0, 80)
  }, [options, query, allValue])

  useEffect(() => {
    if (!open) setQuery('')
  }, [open])

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  const pick = (v: string) => {
    onChange(v)
    setOpen(false)
  }

  return (
    <div ref={wrapRef} className={className ?? (compact ? 'relative shrink-0' : 'relative min-w-[10rem]')}>
      <label
        title={title}
        className={
          compact
            ? 'flex flex-col text-xs font-bold uppercase tracking-wide text-slate-500'
            : 'flex flex-col text-xs font-medium text-slate-600'
        }
      >
        {label}
        <button
          type="button"
          title={title ?? selectedLabel}
          onClick={() => setOpen((o) => !o)}
          className={
            compact
              ? 'mt-0.5 flex max-w-[9.5rem] min-w-[4.5rem] items-center justify-between gap-1 truncate rounded-md border border-slate-200/95 bg-white px-1.5 py-1 text-left text-xs font-medium text-slate-900 outline-none transition focus:border-amber-400 focus:ring-1 focus:ring-amber-100'
              : 'mt-1 flex min-w-[10rem] items-center justify-between gap-1 rounded-xl border border-slate-200/95 bg-white px-2 py-2 text-left text-sm text-slate-900 outline-none transition focus:ring-2 focus:ring-amber-200'
          }
        >
          <span className="min-w-0 truncate">{selectedLabel}</span>
          <span className="shrink-0 text-slate-400" aria-hidden>
            ▾
          </span>
        </button>
      </label>
      {open ? (
        <div className="absolute left-0 top-full z-50 mt-0.5 min-w-[12rem] max-w-[18rem] overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg">
          <input
            type="search"
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={placeholder}
            className="w-full border-b border-slate-200 px-2 py-1.5 text-xs text-slate-900 outline-none"
            aria-controls={listId}
          />
          <ul id={listId} className="max-h-48 overflow-y-auto py-0.5 text-xs" role="listbox">
            <li>
              <button
                type="button"
                role="option"
                aria-selected={value === allValue}
                onClick={() => pick(allValue)}
                className={[
                  'w-full px-2 py-1.5 text-left transition hover:bg-amber-50',
                  value === allValue ? 'bg-amber-100/90 font-semibold text-amber-950' : 'text-slate-800',
                ].join(' ')}
              >
                {allLabel}
              </button>
            </li>
            {filtered.map((o) => (
              <li key={o.v}>
                <button
                  type="button"
                  role="option"
                  aria-selected={value === o.v}
                  onClick={() => pick(o.v)}
                  title={o.t}
                  className={[
                    'w-full truncate px-2 py-1.5 text-left transition hover:bg-amber-50',
                    value === o.v ? 'bg-amber-100/90 font-semibold text-amber-950' : 'text-slate-800',
                  ].join(' ')}
                >
                  {o.t}
                </button>
              </li>
            ))}
            {!filtered.length ? <li className="px-2 py-2 text-slate-500">Không có kết quả.</li> : null}
          </ul>
        </div>
      ) : null}
    </div>
  )
}
