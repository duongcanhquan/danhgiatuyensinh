import { useMemo } from 'react'
import { GripVertical } from 'lucide-react'
import type { RuleCategory } from '../types'
import { RULE_CATEGORY_LABELS, RULE_CATEGORIES } from '../types'
import { getRuleLibraryTemplates, RULE_TEMPLATE_DRAG_MIME, type RuleLibraryTemplate } from '../utils/ruleLibrary'

const CATEGORY_BAND: Record<RuleCategory, string> = {
  demographics: 'border-l-4 border-l-amber-500 bg-amber-50/70',
  academic: 'border-l-4 border-l-sky-500 bg-sky-50/70',
  source_engagement: 'border-l-4 border-l-teal-500 bg-teal-50/60',
  psychographics: 'border-l-4 border-l-violet-500 bg-violet-50/60',
  ai_insights: 'border-l-4 border-l-rose-500 bg-rose-50/60',
}

export function RuleLibrarySidebar({
  canEdit,
  fillHeight,
}: {
  canEdit: boolean
  /** Khi true: sidebar kéo cao theo vùng làm việc (toàn màn / panel lớn). */
  fillHeight?: boolean
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
        'flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-2.5 shadow-sm',
        fillHeight ? 'h-full min-h-0 max-h-none' : 'max-h-[min(52vh,340px)] lg:max-h-[min(58vh,380px)]',
      ].join(' ')}
    >
      <div className="shrink-0">
        <p className="text-[10px] font-bold uppercase tracking-wider text-amber-800">Thư viện</p>
        <p className="mt-0.5 text-[10px] leading-snug text-slate-600">
          Kéo mẫu thả lên canvas. <span className="font-medium text-slate-800">Max weight</span> dùng cho % trên khối.
        </p>
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
