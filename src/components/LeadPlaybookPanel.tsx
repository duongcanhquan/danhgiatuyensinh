import { useMemo, useState } from 'react'
import { BookOpen, Copy, Search } from 'lucide-react'
import type { ConsultingPlaybook, Lead } from '../types'
import { leadSemanticFieldValue } from '../utils/leadSemanticFieldValue'
import {
  describePlaybookMatch,
  PLAYBOOK_MATCH_KIND_LABEL,
  playbooksMatchingLead,
  type PlaybookMatchKind,
  type PlaybookMatchResult,
} from '../utils/playbookMatch'
import { PLAYBOOK_FIELD_LABEL, PLAYBOOK_OPERATOR_LABEL } from '../utils/playbookFieldOptions'

type KindFilter = 'show_all' | PlaybookMatchKind
type ScopeFilter = 'matched' | 'library'

type PlaybookListEntry = {
  playbook: ConsultingPlaybook
  match: PlaybookMatchResult | null
}

function norm(s: string): string {
  return s.trim().toLowerCase()
}

function playbookSearchBlob(pb: ConsultingPlaybook): string {
  const cond = (pb.triggerConditions ?? [])
    .map((c) => {
      const field = PLAYBOOK_FIELD_LABEL[String(c.field)] ?? c.field
      const val = Array.isArray(c.value) ? c.value.join(' ') : String(c.value ?? '')
      return `${field} ${val}`
    })
    .join(' ')
  return [
    pb.title,
    pb.strategy,
    cond,
    (pb.keySellingPoints ?? []).join(' '),
    (pb.objectionHandling ?? []).join(' '),
    (pb.matchKeywords ?? []).join(' '),
  ]
    .join(' ')
    .toLowerCase()
}

function playbookCopyText(pb: ConsultingPlaybook, match: PlaybookMatchResult | null): string {
  const lines: string[] = [pb.title, '']
  if (match) lines.push(`Khớp hồ sơ: ${describePlaybookMatch(match)}`, '')
  if (pb.strategy?.trim()) lines.push('Chiến lược:', pb.strategy.trim(), '')
  if (pb.keySellingPoints?.length) {
    lines.push('Điểm bán / USP:')
    pb.keySellingPoints.forEach((x) => lines.push(`• ${x}`))
    lines.push('')
  }
  if (pb.objectionHandling?.length) {
    lines.push('Xử lý phản đối:')
    pb.objectionHandling.forEach((x, i) => lines.push(`${i + 1}. ${x}`))
    lines.push('')
  }
  if (pb.matchKeywords?.length) lines.push(`Từ khóa: ${pb.matchKeywords.join(', ')}`)
  return lines.join('\n').trim()
}

function formatTriggerSummary(pb: ConsultingPlaybook): string[] {
  const out: string[] = []
  if (pb.matchAllLeads) out.push('Áp dụng mọi hồ sơ')
  for (const c of pb.triggerConditions ?? []) {
    const field = PLAYBOOK_FIELD_LABEL[String(c.field)] ?? String(c.field)
    const op = PLAYBOOK_OPERATOR_LABEL[c.operator ?? 'EQUALS'] ?? c.operator
    const val = Array.isArray(c.value) ? c.value.join(', ') : String(c.value ?? '')
    out.push(`${field} ${op} «${val}»`)
  }
  if (pb.matchKeywords?.length) {
    out.push(`Từ khóa: ${pb.matchKeywords.join(', ')}`)
  }
  return out
}

function parseObjectionLine(raw: string): { objection: string; response: string } {
  const t = raw.trim()
  const arrows = ['->', '→', '=>', '|']
  for (const sep of arrows) {
    const i = t.indexOf(sep)
    if (i > 0) {
      return {
        objection: t.slice(0, i).trim(),
        response: t.slice(i + sep.length).trim(),
      }
    }
  }
  return { objection: t, response: '' }
}

function buildQuickTermsFromLead(lead: Lead): string[] {
  const terms = [
    lead.majorInterest?.trim(),
    lead.educationLevel?.trim(),
    lead.province?.trim(),
    lead.financialStatus?.trim(),
    lead.highSchool?.trim(),
    lead.studyIntention?.trim(),
    lead.priorityTag?.trim(),
    lead.source?.trim(),
  ].filter((x): x is string => Boolean(x))
  return [...new Set(terms)].slice(0, 8)
}

function LeadContextStrip({ lead }: { lead: Lead }) {
  const chips: { label: string; value: string }[] = [
    { label: 'Tỉnh', value: leadSemanticFieldValue(lead, 'province') },
    { label: 'Ngành', value: leadSemanticFieldValue(lead, 'majorInterest') },
    { label: 'Hệ ĐT', value: leadSemanticFieldValue(lead, 'educationLevel') },
    { label: 'Trường', value: leadSemanticFieldValue(lead, 'highSchool') },
    { label: 'Nhãn', value: leadSemanticFieldValue(lead, 'priorityTag') },
    { label: 'Tài chính', value: leadSemanticFieldValue(lead, 'financialStatus') },
    { label: 'Nguồn', value: leadSemanticFieldValue(lead, 'source') },
  ].filter((c) => c.value.trim())

  if (!chips.length) return null

  return (
    <div className="shrink-0 rounded-xl border border-sky-200/80 bg-sky-50/60 px-3 py-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-sky-900">Dữ kiện hồ sơ (tham chiếu khi tư vấn)</p>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {chips.map((c) => (
          <span
            key={c.label}
            className="inline-flex max-w-full items-center gap-1 rounded-full border border-sky-200/90 bg-white/90 px-2 py-0.5 text-xs text-slate-800"
            title={`${c.label}: ${c.value}`}
          >
            <span className="font-semibold text-sky-900">{c.label}:</span>
            <span className="truncate">{c.value}</span>
          </span>
        ))}
      </div>
    </div>
  )
}

function PlaybookDetail({
  entry,
  searchHighlight,
}: {
  entry: PlaybookListEntry
  searchHighlight: string
}) {
  const pb = entry.playbook
  const triggers = formatTriggerSummary(pb)
  const objections = pb.objectionHandling ?? []

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="flex shrink-0 flex-wrap items-start justify-between gap-2 border-b border-slate-100 px-3 py-2 sm:px-4">
        <div className="min-w-0 flex-1">
          <p className="text-base font-semibold text-slate-900 sm:text-lg">{pb.title}</p>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {entry.match ? (
              <span className="rounded-full border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-900">
                {PLAYBOOK_MATCH_KIND_LABEL[entry.match.kind]}
              </span>
            ) : (
              <span className="rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">
                Không khớp tự động — vẫn tra cứu được
              </span>
            )}
            <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-900">
              Ưu tiên {pb.priority}
            </span>
          </div>
          {entry.match ? (
            <p className="mt-1 text-xs text-slate-600">{describePlaybookMatch(entry.match)}</p>
          ) : null}
        </div>
      </div>

      <article className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain p-3 sm:p-4">
        {searchHighlight ? (
          <p className="rounded-lg border border-amber-200 bg-amber-50/80 px-2.5 py-1.5 text-xs text-amber-950">
            Đang lọc nội dung chứa: <strong>{searchHighlight}</strong>
          </p>
        ) : null}

        {triggers.length ? (
          <section>
            <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">Khi nào áp dụng</h3>
            <ul className="mt-1.5 list-inside list-disc text-sm text-slate-700">
              {triggers.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          </section>
        ) : null}

        {pb.strategy?.trim() ? (
          <section>
            <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">Chiến lược tư vấn</h3>
            <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-slate-800">{pb.strategy}</p>
          </section>
        ) : null}

        {pb.keySellingPoints?.length ? (
          <section>
            <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">Điểm bán / USP</h3>
            <ul className="mt-1.5 space-y-1.5">
              {pb.keySellingPoints.map((x) => (
                <li
                  key={x}
                  className="rounded-lg border border-amber-100 bg-amber-50/50 px-3 py-2 text-sm leading-relaxed text-slate-800"
                >
                  {x}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {objections.length ? (
          <section>
            <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">Phản đối & cách trả lời</h3>
            <ul className="mt-1.5 space-y-2">
              {objections.map((raw) => {
                const { objection, response } = parseObjectionLine(raw)
                return (
                  <li
                    key={raw}
                    className="rounded-lg border border-slate-200/90 bg-slate-50/80 px-3 py-2.5 text-sm leading-relaxed"
                  >
                    <p className="font-medium text-slate-900">{objection || raw}</p>
                    {response ? (
                      <p className="mt-1.5 border-l-2 border-amber-400 pl-2.5 text-slate-700">
                        <span className="text-xs font-semibold uppercase text-amber-800">Gợi ý trả lời: </span>
                        {response}
                      </p>
                    ) : null}
                  </li>
                )
              })}
            </ul>
          </section>
        ) : null}

        {!pb.strategy?.trim() && !pb.keySellingPoints?.length && !objections.length ? (
          <p className="text-sm text-slate-500">Playbook chưa có nội dung chi tiết — bổ sung trong Cài đặt → Playbook.</p>
        ) : null}
      </article>
    </div>
  )
}

export function LeadPlaybookPanel({
  lead,
  playbooks,
  showDraftHint,
  quickSearchTerms,
}: {
  lead: Lead
  playbooks: ConsultingPlaybook[]
  showDraftHint?: boolean
  quickSearchTerms?: string[]
}) {
  const matched = useMemo(() => playbooksMatchingLead(lead, playbooks), [lead, playbooks])
  const matchedById = useMemo(() => new Map(matched.map((m) => [m.playbook.id, m])), [matched])

  const [scope, setScope] = useState<ScopeFilter>('matched')
  const [kindFilter, setKindFilter] = useState<KindFilter>('show_all')
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [copyMsg, setCopyMsg] = useState<string | null>(null)

  const terms = useMemo(
    () => [...new Set([...(quickSearchTerms ?? []), ...buildQuickTermsFromLead(lead)])],
    [quickSearchTerms, lead],
  )

  const entries = useMemo((): PlaybookListEntry[] => {
    const active = playbooks.filter((p) => p.isActive)
    let list: PlaybookListEntry[]

    if (scope === 'matched') {
      list = matched.map((m) => ({ playbook: m.playbook, match: m }))
    } else {
      list = active
        .map((p) => ({ playbook: p, match: matchedById.get(p.id) ?? null }))
        .sort((a, b) => {
          const am = a.match ? 1 : 0
          const bm = b.match ? 1 : 0
          if (bm !== am) return bm - am
          return b.playbook.priority - a.playbook.priority
        })
    }

    if (kindFilter !== 'show_all') {
      list = list.filter((e) => e.match?.kind === kindFilter)
    }

    const q = norm(query)
    if (q) {
      list = list.filter((e) => playbookSearchBlob(e.playbook).includes(q))
    }

    return list
  }, [playbooks, matched, matchedById, scope, kindFilter, query])

  const selected = useMemo(() => {
    const id = selectedId ?? entries[0]?.playbook.id ?? null
    return entries.find((e) => e.playbook.id === id) ?? null
  }, [entries, selectedId])

  const counts = useMemo(() => {
    const c: Record<PlaybookMatchKind, number> = { all: 0, conditions: 0, keywords: 0 }
    for (const m of matched) c[m.kind]++
    return c
  }, [matched])

  const copyContent = async () => {
    if (!selected) return
    try {
      await navigator.clipboard.writeText(playbookCopyText(selected.playbook, selected.match))
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
          Gợi ý theo thông tin form (kể cả chưa lưu). Lưu hồ sơ để đồng bộ với hệ thống.
        </p>
      ) : null}

      <LeadContextStrip lead={lead} />

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 lg:grid-cols-[minmax(240px,34%)_1fr]">
        <aside className="flex min-h-0 flex-col gap-2 rounded-xl border border-amber-200/70 bg-amber-50/40 p-2">
          <div className="shrink-0 space-y-2">
            <label className="relative block">
              <Search
                className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400"
                aria-hidden
              />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Tìm chiến lược, USP, phản đối, từ khóa…"
                className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-8 pr-2.5 text-sm outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-100"
              />
            </label>

            {terms.length ? (
              <div>
                <p className="text-[11px] font-medium text-slate-600">Gợi ý tìm nhanh (từ hồ sơ)</p>
                <div className="mt-1 flex flex-wrap gap-1">
                  {terms.map((term) => (
                    <button
                      key={term}
                      type="button"
                      onClick={() => setQuery(term)}
                      className="rounded-full border border-amber-300/80 bg-white px-2 py-0.5 text-[11px] font-medium text-amber-950 hover:bg-amber-100"
                    >
                      {term}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => setScope('matched')}
                className={[
                  'rounded-lg px-2 py-1 text-xs font-semibold transition',
                  scope === 'matched'
                    ? 'bg-amber-600 text-white'
                    : 'border border-slate-200 bg-white text-slate-700 hover:bg-amber-50',
                ].join(' ')}
              >
                Khớp hồ sơ ({matched.length})
              </button>
              <button
                type="button"
                onClick={() => setScope('library')}
                className={[
                  'rounded-lg px-2 py-1 text-xs font-semibold transition',
                  scope === 'library'
                    ? 'bg-amber-600 text-white'
                    : 'border border-slate-200 bg-white text-slate-700 hover:bg-amber-50',
                ].join(' ')}
              >
                Cả thư viện
              </button>
            </div>

            <label className="block text-xs font-medium text-slate-700">
              Loại khớp
              <select
                value={kindFilter}
                onChange={(e) => setKindFilter(e.target.value as KindFilter)}
                disabled={scope === 'library' && !matched.length}
                className="mt-0.5 w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm disabled:opacity-50"
              >
                <option value="show_all">Tất cả loại khớp</option>
                <option value="conditions">
                  {PLAYBOOK_MATCH_KIND_LABEL.conditions} ({counts.conditions})
                </option>
                <option value="keywords">
                  {PLAYBOOK_MATCH_KIND_LABEL.keywords} ({counts.keywords})
                </option>
                <option value="all">{PLAYBOOK_MATCH_KIND_LABEL.all} ({counts.all})</option>
              </select>
            </label>

            <p className="text-xs leading-snug text-slate-600">
              <strong>{entries.length}</strong> playbook
              {scope === 'library' ? ' trong thư viện' : ' khớp dữ kiện sinh viên'} — chọn bên trái để đọc đầy đủ
              chiến lược, USP và cách trả lời phản đối.
            </p>
          </div>

          <ul className="min-h-0 flex-1 space-y-1 overflow-y-auto overscroll-contain pr-0.5">
            {entries.map((e) => {
              const pb = e.playbook
              const preview = pb.strategy?.trim() || pb.keySellingPoints?.[0] || ''
              return (
                <li key={pb.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(pb.id)}
                    className={[
                      'w-full rounded-lg border px-2.5 py-2 text-left text-sm transition',
                      selected?.playbook.id === pb.id
                        ? 'border-amber-400 bg-white text-amber-950 shadow-sm'
                        : 'border-transparent bg-white/70 text-slate-800 hover:border-amber-200',
                    ].join(' ')}
                  >
                    <span className="flex items-start gap-1.5">
                      <BookOpen className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-700" aria-hidden />
                      <span className="min-w-0 flex-1">
                        <span className="font-semibold leading-snug">{pb.title}</span>
                        {e.match ? (
                          <span className="mt-0.5 block text-[11px] font-medium text-emerald-800">
                            {PLAYBOOK_MATCH_KIND_LABEL[e.match.kind]}
                          </span>
                        ) : (
                          <span className="mt-0.5 block text-[11px] text-slate-500">Tra cứu thư viện</span>
                        )}
                        {preview ? (
                          <span className="mt-0.5 line-clamp-2 block text-[11px] leading-snug text-slate-600">
                            {preview}
                          </span>
                        ) : null}
                      </span>
                    </span>
                  </button>
                </li>
              )
            })}
            {!entries.length ? (
              <li className="px-2 py-6 text-center text-xs text-slate-500">
                {scope === 'matched' ? (
                  <>
                    Chưa có playbook khớp hồ sơ. Thử <strong>Cả thư viện</strong> và tìm theo ngành, tỉnh hoặc từ khóa.
                  </>
                ) : (
                  <>Không có kết quả — đổi từ khóa tìm kiếm.</>
                )}
              </li>
            ) : null}
          </ul>
        </aside>

        <main className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-amber-200/80 bg-white shadow-inner">
          {selected ? (
            <>
              <div className="flex shrink-0 justify-end border-b border-slate-100 px-3 py-2">
                <button
                  type="button"
                  onClick={() => void copyContent()}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                >
                  <Copy className="h-3.5 w-3.5" aria-hidden />
                  {copyMsg ?? 'Sao chép toàn bộ'}
                </button>
              </div>
              <PlaybookDetail entry={selected} searchHighlight={query.trim()} />
            </>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center text-sm text-slate-500">
              <BookOpen className="h-10 w-10 text-amber-300" strokeWidth={1.25} aria-hidden />
              <p>Chọn playbook bên trái hoặc dùng ô tìm kiếm để tra cứu nội dung tư vấn.</p>
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
