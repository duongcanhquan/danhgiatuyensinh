import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown } from 'lucide-react'
import { useFloatingDropdownPosition } from '../hooks/useFloatingDropdownPosition'

function norm(s: string): string {
  return s.trim().toLowerCase()
}

function parseMaxHeightPx(listMaxClass: string): number {
  if (listMaxClass.includes('max-h-72')) return 288
  if (listMaxClass.includes('max-h-96')) return 384
  return 208
}

export function CatalogCombobox({
  value,
  options,
  disabled,
  placeholder,
  allowCreate = true,
  listMaxClass = 'max-h-52',
  onChange,
  onEnsureOption,
}: {
  value: string
  options: readonly string[]
  disabled?: boolean
  placeholder?: string
  allowCreate?: boolean
  /** Chiều cao danh sách gợi ý (vd. `max-h-72` trên tab Nguyện vọng). */
  listMaxClass?: string
  onChange: (v: string) => void
  onEnsureOption?: (label: string) => void | Promise<void>
}) {
  const listId = useId()
  const rootRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState(value)
  const [busy, setBusy] = useState(false)

  const maxHeightPx = parseMaxHeightPx(listMaxClass)
  const viewportCap = typeof window !== 'undefined' ? Math.min(480, window.innerHeight * 0.65) : 400
  const { style: listStyle } = useFloatingDropdownPosition(rootRef, open, {
    maxHeight: Math.max(maxHeightPx, viewportCap),
  })

  useEffect(() => {
    setQuery(value)
  }, [value])

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node
      if (!rootRef.current?.contains(t) && !listRef.current?.contains(t)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  const filtered = useMemo(() => {
    const q = norm(query)
    const base = [...options]
    if (!q) return base
    return base.filter((o) => norm(o).includes(q))
  }, [options, query])

  const exactMatch = useMemo(() => options.some((o) => norm(o) === norm(query)), [options, query])
  const trimmed = query.trim()
  const showCreate = allowCreate && Boolean(trimmed) && !exactMatch && onEnsureOption

  const commit = async (next: string) => {
    const t = next.trim()
    setBusy(true)
    try {
      if (t && !options.some((o) => norm(o) === norm(t)) && allowCreate && onEnsureOption) {
        await onEnsureOption(t)
      }
      onChange(t)
      setQuery(t)
      setOpen(false)
    } finally {
      setBusy(false)
    }
  }

  const listPanel =
    open && !disabled ? (
      <ul
        ref={listRef}
        style={listStyle}
        className="overflow-y-auto rounded-xl border border-slate-200 bg-white py-1 text-sm shadow-xl ring-1 ring-slate-900/10 [scrollbar-width:thin]"
        role="listbox"
      >
        {filtered.map((o) => (
          <li key={o}>
            <button
              type="button"
              role="option"
              aria-selected={norm(o) === norm(value)}
              className={[
                'block w-full px-3 py-2 text-left text-slate-800 hover:bg-emerald-50',
                norm(o) === norm(value) ? 'bg-sky-50 font-semibold text-sky-950' : '',
              ].join(' ')}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => void commit(o)}
            >
              {o}
            </button>
          </li>
        ))}
        {showCreate ? (
          <li className="border-t border-slate-100">
            <button
              type="button"
              className="block w-full px-3 py-2 text-left text-xs font-semibold text-emerald-800 hover:bg-emerald-50"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => void commit(trimmed)}
            >
              + Thêm «{trimmed}» vào danh mục
            </button>
          </li>
        ) : null}
        {!filtered.length && !showCreate ? (
          <li className="px-3 py-2 text-xs text-slate-500">Không có kết quả — gõ và Enter để lưu.</li>
        ) : null}
      </ul>
    ) : null

  return (
    <div ref={rootRef} className="relative min-w-0">
      <div className="flex min-w-0 items-stretch gap-0.5">
        <input
          className="w-full min-w-0 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm text-slate-900 outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-500/25 disabled:bg-slate-50 disabled:text-slate-500"
          value={query}
          disabled={disabled || busy}
          placeholder={placeholder ?? 'Gõ để tìm hoặc thêm mới…'}
          list={listId}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setQuery(e.target.value)
            setOpen(true)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              void commit(query)
            }
            if (e.key === 'Escape') setOpen(false)
          }}
          onBlur={() => {
            window.setTimeout(() => {
              if (!rootRef.current?.contains(document.activeElement) && !listRef.current?.contains(document.activeElement)) {
                void commit(query)
              }
            }, 120)
          }}
        />
        <button
          type="button"
          tabIndex={-1}
          disabled={disabled || busy}
          onClick={() => setOpen((o) => !o)}
          className="shrink-0 rounded-lg border border-slate-200 bg-slate-50 px-2 text-slate-600 hover:bg-slate-100 disabled:opacity-40"
          aria-label="Mở danh sách"
          aria-expanded={open}
        >
          <ChevronDown className={`h-4 w-4 transition ${open ? 'rotate-180' : ''}`} />
        </button>
      </div>
      <datalist id={listId}>
        {options.map((o) => (
          <option key={o} value={o} />
        ))}
      </datalist>
      {typeof document !== 'undefined' && listPanel ? createPortal(listPanel, document.body) : null}
    </div>
  )
}
