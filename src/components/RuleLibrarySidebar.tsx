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
        'flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-md',
        fillHeight ? 'h-full min-h-0 max-h-none' : 'max-h-[min(640px,calc(100vh-220px))]',
      ].join(' ')}
    >
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.28em] text-amber-800">Thư viện quy tắc</p>
        <p className="mt-1 text-xs leading-relaxed text-slate-600">
          Kéo thả mẫu vào canvas. Mỗi khối có <span className="font-medium text-slate-800">Max weight</span> — tổng trên toàn profile
          nên = 100.
        </p>
      </div>
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto pr-1">
        {RULE_CATEGORIES.map((cat) => {
          const items = byCategory.get(cat) ?? []
          if (!items.length) return null
          return (
            <div key={cat}>
              <p
                className={`sticky top-0 z-[1] -mx-1 mb-2 rounded-r-lg border border-slate-200 px-2 py-1.5 text-xs font-semibold uppercase tracking-wider text-slate-800 shadow-sm ${CATEGORY_BAND[cat]}`}
              >
                {RULE_CATEGORY_LABELS[cat]}
              </p>
              <ul className="space-y-2">
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
                        'group flex w-full items-start gap-2 rounded-xl border px-3 py-2.5 text-left transition',
                        canEdit
                          ? 'cursor-grab border-slate-200 bg-slate-50/80 hover:border-amber-300 hover:bg-amber-50/90 active:cursor-grabbing'
                          : 'cursor-not-allowed border-slate-100 bg-slate-50/50 opacity-50',
                      ].join(' ')}
                    >
                      <GripVertical
                        className="mt-0.5 h-4 w-4 shrink-0 text-slate-500 group-hover:text-amber-700"
                        aria-hidden
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium text-slate-900">{t.title}</span>
                        <span className="mt-0.5 block text-xs leading-snug text-slate-600">{t.hint}</span>
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
