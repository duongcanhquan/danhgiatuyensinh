import { useMemo, useState } from 'react'
import type { KnowledgeDocument, Lead } from '../types'
import { knowledgeCategoryLabel } from '../utils/knowledgeCategories'
import type { KnowledgeCategoryDef } from '../utils/knowledgeCategories'
import { leadSearchableText } from '../utils/playbookMatch'

function norm(s: string): string {
  return s.trim().toLowerCase()
}

function docRelevance(lead: Lead, doc: KnowledgeDocument): number {
  const hay = norm(leadSearchableText(lead))
  let score = 0
  if (doc.type === 'GENERAL') score += 50
  if (doc.type === 'FAQ') score += 20
  const blob = norm(`${doc.title} ${doc.content}`)
  if (!hay) return score
  for (const token of hay.split(/\s+/).filter((t) => t.length >= 3)) {
    if (blob.includes(token)) score += 8
  }
  return score
}

export function LeadKnowledgePanel({
  lead,
  documents,
  categories,
  showDraftHint,
}: {
  lead: Lead
  documents: KnowledgeDocument[]
  categories: KnowledgeCategoryDef[]
  showDraftHint?: boolean
}) {
  const [query, setQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const ranked = useMemo(() => {
    const q = norm(query)
    let list = documents.map((d) => ({ doc: d, score: docRelevance(lead, d) }))
    if (typeFilter) list = list.filter((x) => x.doc.type === typeFilter)
    if (q) {
      list = list.filter((x) => {
        const blob = norm(`${x.doc.title} ${x.doc.content}`)
        return blob.includes(q)
      })
    }
    return list.sort((a, b) => b.score - a.score || a.doc.title.localeCompare(b.doc.title, 'vi'))
  }, [documents, lead, query, typeFilter])

  const selected = useMemo(() => {
    const id = selectedId ?? ranked[0]?.doc.id ?? null
    return ranked.find((x) => x.doc.id === id)?.doc ?? null
  }, [ranked, selectedId])

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      {showDraftHint ? (
        <p className="shrink-0 rounded-lg border border-sky-200 bg-sky-50 px-2.5 py-1.5 text-xs text-sky-950">
          Gợi ý theo thông tin form (kể cả chưa lưu).
        </p>
      ) : null}
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 lg:grid-cols-[minmax(220px,32%)_1fr]">
        <aside className="flex min-h-0 flex-col gap-2 rounded-xl border border-slate-200/80 bg-slate-50/60 p-2">
          <div className="shrink-0 space-y-2">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Tìm tài liệu…"
              className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm"
            />
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm"
            >
              <option value="">Tất cả danh mục</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
            <p className="text-xs text-slate-600">
              <strong>{ranked.length}</strong> tài liệu — ưu tiên «Tư vấn chung» và nội dung liên quan hồ sơ.
            </p>
          </div>
          <ul className="min-h-0 flex-1 space-y-1 overflow-y-auto overscroll-contain pr-0.5">
            {ranked.map(({ doc, score }) => (
              <li key={doc.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(doc.id)}
                  className={[
                    'w-full rounded-lg border px-2.5 py-2 text-left text-sm transition',
                    (selected?.id === doc.id)
                      ? 'border-amber-400 bg-amber-50 text-amber-950'
                      : 'border-transparent bg-white/80 text-slate-800 hover:border-slate-200',
                  ].join(' ')}
                >
                  <span className="font-medium leading-snug">{doc.title}</span>
                  <span className="mt-0.5 block text-[11px] text-amber-800">
                    {knowledgeCategoryLabel(doc.type, categories)}
                    {score >= 50 ? ' · Ưu tiên' : null}
                  </span>
                </button>
              </li>
            ))}
            {!ranked.length ? (
              <li className="px-2 py-4 text-center text-xs text-slate-500">Không có tài liệu khớp.</li>
            ) : null}
          </ul>
        </aside>
        <main className="min-h-0 overflow-y-auto rounded-xl border border-amber-200/70 bg-white p-3 sm:p-4">
          {selected ? (
            <>
              <p className="text-base font-semibold text-slate-900">{selected.title}</p>
              <p className="mt-0.5 text-xs font-medium uppercase tracking-wide text-amber-800">
                {knowledgeCategoryLabel(selected.type, categories)}
              </p>
              <article className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-slate-800">
                {selected.content}
              </article>
            </>
          ) : (
            <p className="text-sm text-slate-500">Chọn tài liệu bên trái để đọc nội dung đầy đủ.</p>
          )}
        </main>
      </div>
    </div>
  )
}
