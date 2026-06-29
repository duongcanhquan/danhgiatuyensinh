import { useEffect, useMemo, useState } from 'react'
import { Copy, Search } from 'lucide-react'
import type { KnowledgeDocument, Lead } from '../types'
import { knowledgeCategoryLabel } from '../utils/knowledgeCategories'
import type { KnowledgeCategoryDef } from '../utils/knowledgeCategories'
import { isKnowledgeDocRelevantToLead, knowledgeDocDisplayScore } from '../utils/knowledgeRag'
import { knowledgeDocSearchScore } from '../utils/knowledgeCategories'

function norm(s: string): string {
  return s.trim().toLowerCase()
}

export function LeadKnowledgePanel({
  lead,
  documents,
  categories,
  showDraftHint,
  initialSelectedId,
  quickSearchTerms = [],
}: {
  lead: Lead
  documents: KnowledgeDocument[]
  categories: KnowledgeCategoryDef[]
  showDraftHint?: boolean
  initialSelectedId?: string | null
  quickSearchTerms?: string[]
}) {
  const [query, setQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [onlyRelevant, setOnlyRelevant] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [copyMsg, setCopyMsg] = useState<string | null>(null)

  useEffect(() => {
    if (initialSelectedId) setSelectedId(initialSelectedId)
  }, [initialSelectedId])

  const ranked = useMemo(() => {
    const qRaw = query.trim()
    const q = norm(qRaw)
    let list = documents.map((d) => ({ doc: d, score: knowledgeDocDisplayScore(lead, d) }))
    if (onlyRelevant) list = list.filter((x) => isKnowledgeDocRelevantToLead(lead, x.doc))
    if (typeFilter) list = list.filter((x) => x.doc.type === typeFilter)
    if (q) {
      list = list.filter((x) => {
        const blob = norm(`${x.doc.title} ${x.doc.content}`)
        return blob.includes(q)
      })
    }
    return list.sort((a, b) => {
      if (qRaw) {
        const kw = knowledgeDocSearchScore(b.doc, qRaw) - knowledgeDocSearchScore(a.doc, qRaw)
        if (kw !== 0) return kw
      }
      return b.score - a.score || a.doc.title.localeCompare(b.doc.title, 'vi')
    })
  }, [documents, lead, query, typeFilter, onlyRelevant])

  const selected = useMemo(() => {
    const id = selectedId ?? ranked[0]?.doc.id ?? null
    return ranked.find((x) => x.doc.id === id)?.doc ?? null
  }, [ranked, selectedId])

  const copyContent = async () => {
    if (!selected?.content) return
    try {
      await navigator.clipboard.writeText(`${selected.title}\n\n${selected.content}`)
      setCopyMsg('Đã sao chép')
      window.setTimeout(() => setCopyMsg(null), 2000)
    } catch {
      setCopyMsg('Không sao chép được')
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      {showDraftHint ? (
        <p className="shrink-0 rounded-lg border border-sky-200 bg-sky-50 px-2.5 py-1.5 text-xs text-sky-950">
          Gợi ý theo thông tin form (kể cả chưa lưu).
        </p>
      ) : null}
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 md:grid-cols-[minmax(260px,34%)_1fr]">
        <aside className="flex min-h-0 flex-col gap-2 rounded-xl border border-slate-200/80 bg-slate-50/60 p-2">
          <div className="shrink-0 space-y-2">
            <label className="relative block">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" aria-hidden />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Tìm theo tiêu đề, nội dung…"
                className="w-full rounded-lg border border-slate-200 bg-white py-1.5 pl-8 pr-2.5 text-sm"
              />
            </label>
            {quickSearchTerms.length ? (
              <div className="flex flex-wrap gap-1">
                {quickSearchTerms.map((term) => (
                  <button
                    key={term}
                    type="button"
                    onClick={() => setQuery(term)}
                    className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-900 hover:bg-amber-100"
                  >
                    {term}
                  </button>
                ))}
              </div>
            ) : null}
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
            <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-700">
              <input
                type="checkbox"
                checked={onlyRelevant}
                onChange={(e) => setOnlyRelevant(e.target.checked)}
                className="rounded border-slate-300"
              />
              Chỉ tài liệu liên quan hồ sơ
            </label>
            <p className="text-xs text-slate-600">
              <strong>{ranked.length}</strong> tài liệu — sắp theo mức liên quan (Tư vấn chung / FAQ luôn ưu tiên).
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
                    selected?.id === doc.id
                      ? 'border-amber-400 bg-amber-50 text-amber-950'
                      : 'border-transparent bg-white/80 text-slate-800 hover:border-slate-200',
                  ].join(' ')}
                >
                  <span className="font-medium leading-snug">{doc.title}</span>
                  <span className="mt-0.5 block text-[11px] text-amber-800">
                    {knowledgeCategoryLabel(doc.type, categories)}
                    {score >= 58 ? ' · Liên quan hồ sơ' : score >= 50 ? ' · Tư vấn chung' : null}
                  </span>
                </button>
              </li>
            ))}
            {!ranked.length ? (
              <li className="px-2 py-4 text-center text-xs text-slate-500">
                Không có tài liệu — thử bỏ lọc hoặc thêm từ khóa tìm kiếm.
              </li>
            ) : null}
          </ul>
        </aside>
        <main className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-amber-200/70 bg-white">
          {selected ? (
            <>
              <div className="flex shrink-0 flex-wrap items-start justify-between gap-2 border-b border-slate-100 px-3 py-2 sm:px-4">
                <div className="min-w-0">
                  <p className="text-base font-semibold text-slate-900">{selected.title}</p>
                  <p className="mt-0.5 text-xs font-medium uppercase tracking-wide text-amber-800">
                    {knowledgeCategoryLabel(selected.type, categories)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void copyContent()}
                  className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                >
                  <Copy className="h-3.5 w-3.5" aria-hidden />
                  {copyMsg ?? 'Sao chép nội dung'}
                </button>
              </div>
              <article className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3 text-sm leading-relaxed text-slate-800 sm:p-4 whitespace-pre-wrap">
                {selected.content}
              </article>
            </>
          ) : (
            <p className="p-4 text-sm text-slate-500">Chọn tài liệu bên trái để đọc và sao chép khi tư vấn.</p>
          )}
        </main>
      </div>
    </div>
  )
}
