import { useEffect, useId, useMemo, useRef, useState } from 'react'

type SearchableMultiFilterProps = {
  label: string
  title?: string
  values: string[]
  onChange: (next: string[]) => void
  options: string[]
  placeholder?: string
  maxVisibleChips?: number
  /** `inline`: nhãn và chip cùng một dòng (bộ lọc admin gọn). */
  layout?: 'stacked' | 'inline'
}

/** Lọc nhiều giá trị: gõ tìm, bấm để thêm/bỏ; hiển thị chip gọn. */
export function SearchableMultiFilter({
  label,
  title,
  values,
  onChange,
  options,
  placeholder = 'Gõ để tìm…',
  maxVisibleChips = 4,
  layout = 'stacked',
}: SearchableMultiFilterProps) {
  const listId = useId()
  const wrapRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const base = options.filter((o) => !values.includes(o))
    if (!q) return base.slice(0, 60)
    return base.filter((o) => o.toLowerCase().includes(q)).slice(0, 60)
  }, [options, query, values])

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

  const toggle = (v: string) => {
    onChange(values.includes(v) ? values.filter((x) => x !== v) : [...values, v])
  }

  const visible = values.slice(0, maxVisibleChips)
  const extra = values.length - visible.length
  const inline = layout === 'inline'

  return (
    <div
      ref={wrapRef}
      className={['relative min-w-0', inline ? 'flex max-w-full items-center gap-1.5' : 'flex-1'].join(' ')}
    >
      <p
        className={[
          'shrink-0 font-semibold uppercase tracking-wider text-slate-500',
          inline ? 'text-[10px]' : 'text-xs',
        ].join(' ')}
        title={title ?? label}
      >
        {label}
      </p>
      <div className={['flex min-w-0 flex-wrap items-center gap-1', inline ? '' : 'mt-1'].join(' ')}>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-700 shadow-sm hover:border-amber-300 hover:bg-amber-50"
        >
          + Chọn
        </button>
        {visible.map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => toggle(v)}
            title={v}
            className="max-w-[8rem] truncate rounded-full border border-fuchsia-300 bg-fuchsia-50 px-2 py-0.5 text-xs text-fuchsia-900 hover:bg-fuchsia-100"
          >
            {v} ×
          </button>
        ))}
        {extra > 0 ? <span className="text-xs text-slate-500">+{extra}</span> : null}
        {values.length > 0 ? (
          <button
            type="button"
            onClick={() => onChange([])}
            className="text-xs text-slate-500 underline hover:text-rose-700"
          >
            Xóa
          </button>
        ) : null}
      </div>
      {open ? (
        <div className="absolute left-0 top-full z-50 mt-0.5 w-full min-w-[14rem] max-w-[20rem] overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg">
          <input
            type="search"
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={placeholder}
            className="w-full border-b border-slate-200 px-2 py-1.5 text-xs outline-none"
            aria-controls={listId}
          />
          <ul id={listId} className="max-h-40 overflow-y-auto py-0.5 text-xs">
            {filtered.map((o) => (
              <li key={o}>
                <button
                  type="button"
                  onClick={() => toggle(o)}
                  title={o}
                  className="w-full truncate px-2 py-1.5 text-left text-slate-800 hover:bg-amber-50"
                >
                  {o}
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
