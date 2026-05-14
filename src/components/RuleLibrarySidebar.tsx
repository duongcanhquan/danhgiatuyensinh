import { useMemo } from 'react'
import { ChevronsLeft, GripVertical } from 'lucide-react'
import type { RuleCategory } from '../types'
import { RULE_CATEGORY_LABELS, RULE_CATEGORIES } from '../types'
import { getRuleLibraryTemplates, RULE_TEMPLATE_DRAG_MIME, type RuleLibraryTemplate } from '../utils/ruleLibrary'

const CATEGORY_BAND: Record<RuleCategory, string> = {
  demographics: 'border-l-4 border-l-amber-500 bg-amber-50/70',
  academic: 'border-l-4 border-l-sky-500 bg-sky-50/70',
  source_engagement: 'border-l-4 border-l-teal-500 bg-teal-50/60',
  psychographics: 'border-l-4 border-l-violet-500 bg-violet-50/60',
  behavior: 'border-l-4 border-l-emerald-600 bg-emerald-50/65',
  risk: 'border-l-4 border-l-rose-600 bg-rose-50/65',
  ai_insights: 'border-l-4 border-l-rose-500 bg-rose-50/60',
}

export function RuleLibrarySidebar({
  canEdit,
  fillHeight,
  showCollapseButton,
  onCollapseRequest,
}: {
  canEdit: boolean
  /** Khi true: sidebar kéo cao theo vùng làm việc (toàn màn / panel lớn). */
  fillHeight?: boolean
  /** Nút thu gọn — nhường chỗ cho canvas. */
  showCollapseButton?: boolean
  onCollapseRequest?: () => void
}) {
  const byCategory = useMemo(() => {
    const m = new Map<RuleCategory, RuleLibraryTemplate[]>()
    for (const c of RULE_CATEGORIES) m.set(c, [])
    for (const t of getRuleLibraryTemplates()) {
      m.get(t.category)!.push(t)
    }
    return m
  }, [])

  return (
    <aside
      className={[
        'flex min-h-0 w-full min-w-0 flex-col gap-2 rounded-xl border border-slate-200 bg-white p-2.5 shadow-sm',
        fillHeight
          ? 'h-full min-h-0 flex-1 max-h-none'
          : 'min-h-[min(52vh,360px)] max-h-[min(78vh,640px)] lg:min-h-[min(56vh,400px)] lg:max-h-[min(82vh,680px)]',
      ].join(' ')}
    >
      <div className="flex shrink-0 items-start justify-between gap-2 border-b border-slate-200/90 pb-2">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-bold uppercase tracking-wide text-amber-900">Thư viện quy tắc</p>
          <p className="mt-0.5 text-[10px] leading-snug text-slate-600">
            Kéo mẫu sang <span className="font-semibold text-slate-800">canvas bên phải</span>. Max weight cho % trên
            khối.
          </p>
        </div>
        {showCollapseButton && onCollapseRequest ? (
          <button
            type="button"
            onClick={onCollapseRequest}
            title="Thu gọn thư viện — mở rộng canvas"
            className="shrink-0 rounded-lg border border-slate-200 bg-white p-1.5 text-slate-600 shadow-sm transition hover:border-amber-300 hover:bg-amber-50 hover:text-amber-900"
          >
            <ChevronsLeft className="h-4 w-4" aria-hidden />
          </button>
        ) : null}
      </div>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-0.5 [scrollbar-width:thin]">
        {RULE_CATEGORIES.map((cat) => {
          const items = byCategory.get(cat) ?? []
          if (!items.length) return null
          return (
            <div key={cat}>
              <p
                className={`sticky top-0 z-[1] -mx-0.5 mb-1.5 rounded border border-slate-200 px-1.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-800 shadow-sm ${CATEGORY_BAND[cat]}`}
              >
                {RULE_CATEGORY_LABELS[cat]}
              </p>
              <ul className="space-y-1">
                {items.map((t) => (
                  <li key={t.key}>
                    <button
                      type="button"
                      draggable={canEdit}
                      onDragStart={(e) => {
                        if (!canEdit) return
                        e.dataTransfer.setData(RULE_TEMPLATE_DRAG_MIME, t.key)
                        e.dataTransfer.effectAllowed = 'copy'
                      }}
                      disabled={!canEdit}
                      className={[
                        'group flex w-full items-start gap-1.5 rounded-lg border px-2 py-1.5 text-left transition',
                        canEdit
                          ? 'cursor-grab border-slate-200 bg-slate-50/90 hover:border-amber-300 hover:bg-amber-50/90 active:cursor-grabbing'
                          : 'cursor-not-allowed border-slate-100 bg-slate-50/50 opacity-50',
                      ].join(' ')}
                    >
                      <GripVertical
                        className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-500 group-hover:text-amber-700"
                        aria-hidden
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block text-xs font-semibold leading-tight text-slate-900">{t.title}</span>
                        <span className="mt-0.5 line-clamp-2 text-[10px] leading-snug text-slate-600">{t.hint}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )
        })}
      </div>
    </aside>
  )
}
