import { useMemo, useState } from 'react'
import { BookOpen, Check, Copy, Loader2, MessageCircle, Sparkles, Wand2 } from 'lucide-react'
import type { ConsultingPlaybook, KnowledgeDocument, Lead, ScriptSnippet } from '../types'
import {
  buildConsultingChips,
  CONSULTING_CHIP_KIND_LABEL,
  filterConsultingChips,
  type ConsultingChip,
  type ConsultingChipKind,
} from '../utils/consultingQuickChips'
import { playbooksMatchingLead } from '../utils/playbookMatch'
import { searchKnowledgeByQuery } from '../utils/knowledgeRag'
import { suggestConsultingReply } from '../utils/consultingLiveSuggest'

const KIND_STYLE: Record<ConsultingChipKind, string> = {
  objection: 'border-rose-200 bg-rose-50 text-rose-950 hover:border-rose-400 hover:bg-rose-100',
  question: 'border-sky-200 bg-sky-50 text-sky-950 hover:border-sky-400 hover:bg-sky-100',
  usp: 'border-emerald-200 bg-emerald-50 text-emerald-950 hover:border-emerald-400 hover:bg-emerald-100',
  snippet: 'border-violet-200 bg-violet-50 text-violet-950 hover:border-violet-400 hover:bg-violet-100',
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

export function ConsultingLiveAssistPanel({
  lead,
  playbooks,
  snippets = [],
  knowledgeDocs = [],
  canUseLlm = false,
  compact = false,
}: {
  lead: Lead
  playbooks: ConsultingPlaybook[]
  snippets?: ScriptSnippet[]
  knowledgeDocs?: KnowledgeDocument[]
  canUseLlm?: boolean
  compact?: boolean
}) {
  const [query, setQuery] = useState('')
  const [utterance, setUtterance] = useState('')
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [kindFilter, setKindFilter] = useState<'all' | ConsultingChipKind>('all')
  const [busy, setBusy] = useState(false)
  const [reply, setReply] = useState<string | null>(null)
  const [replyBasis, setReplyBasis] = useState<string | null>(null)
  const [replySource, setReplySource] = useState<'chip' | 'knowledge' | 'llm' | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const allChips = useMemo(
    () => buildConsultingChips({ lead, playbooks, snippets }),
    [lead, playbooks, snippets],
  )

  const filtered = useMemo(() => {
    let list = filterConsultingChips(allChips, query)
    if (kindFilter !== 'all') list = list.filter((c) => c.kind === kindFilter)
    return list
  }, [allChips, query, kindFilter])

  const knowledgeHits = useMemo(
    () => searchKnowledgeByQuery(knowledgeDocs, utterance, { lead, limit: 4 }),
    [knowledgeDocs, utterance, lead],
  )

  const topPlay = playbooksMatchingLead(lead, playbooks)[0]?.playbook

  const onCopyChip = async (chip: ConsultingChip) => {
    const ok = await copyText(chip.copyText)
    if (ok) {
      setCopiedId(chip.id)
      window.setTimeout(() => setCopiedId((id) => (id === chip.id ? null : id)), 1600)
    }
  }

  const runSuggest = async (mode: 'smart' | 'llm') => {
    setBusy(true)
    setErr(null)
    setReply(null)
    setReplyBasis(null)
    setReplySource(null)
    try {
      const wantLlm = mode === 'llm' || canUseLlm
      const result = await suggestConsultingReply({
        utterance,
        lead,
        playbooks,
        knowledgeDocs,
        chips: allChips,
        // Có quyền AI: ưu tiên LLM soạn từ tri thức (không dừng ở chip im lặng).
        preferLlm: wantLlm,
        forceLlm: mode === 'llm',
      })
      setReply(result.reply)
      setReplyBasis(result.basis ?? null)
      setReplySource(result.source)
    } catch (e) {
      console.error(e)
      setErr(e instanceof Error ? e.message : 'Không soạn được câu trả lời.')
    } finally {
      setBusy(false)
    }
  }

  const kinds: ('all' | ConsultingChipKind)[] = ['all', 'objection', 'question', 'usp', 'snippet']

  return (
    <div className={['flex h-full min-h-0 flex-col overflow-y-auto overscroll-contain', compact ? 'gap-2 p-0' : 'gap-3 p-0.5'].join(' ')}>
      {!compact ? (
        <header className="rounded-xl border border-emerald-200/80 bg-gradient-to-br from-emerald-50 via-white to-sky-50 p-3 sm:p-4">
          <div className="flex items-start gap-2">
            <Wand2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700" aria-hidden />
            <div>
              <h3 className="text-base font-semibold tracking-tight text-slate-900">Gợi ý lúc gọi</h3>
              <p className="mt-1 text-sm leading-snug text-slate-600">
                Gõ lời khách → xem tri thức / chip khớp → bấm «Gợi ý câu đáp» để AI soạn câu nói (dựa dữ liệu đã nạp).
                {topPlay ? (
                  <>
                    {' '}
                    Đang theo mẫu <strong className="text-slate-800">{topPlay.title}</strong>.
                  </>
                ) : null}
              </p>
            </div>
          </div>
        </header>
      ) : topPlay ? (
        <p className="text-[10px] text-slate-600">
          Mẫu: <strong className="text-slate-800">{topPlay.title}</strong>
        </p>
      ) : null}

      <section className={['rounded-xl border border-slate-200/90 bg-white shadow-sm', compact ? 'p-2' : 'p-3'].join(' ')}>
        <label className="flex items-center gap-2 text-xs font-semibold text-slate-800 sm:text-sm">
          <MessageCircle className="h-4 w-4 text-sky-700" aria-hidden />
          Chat nhanh với AI
        </label>
        <div className={compact ? 'mt-1.5 space-y-1.5' : 'mt-2 space-y-2'}>
          {utterance.trim() ? (
            <div className="ml-4 rounded-lg rounded-br-sm bg-slate-100 px-2.5 py-1.5 text-xs text-slate-800">
              <span className="font-semibold text-slate-500">Khách: </span>
              {utterance.trim()}
            </div>
          ) : null}
          {reply ? (
            <div className="mr-2 rounded-lg rounded-bl-sm border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs text-slate-900">
              <div className="mb-1 flex items-center justify-between gap-2">
                <span className="text-[10px] font-bold uppercase text-emerald-800">
                  TVV nói
                  {replySource === 'llm' ? ' · AI' : replySource === 'knowledge' ? ' · Tri thức' : ' · Chip'}
                </span>
                <button
                  type="button"
                  onClick={() => void copyText(reply)}
                  className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-emerald-900"
                >
                  <Copy className="h-3 w-3" /> Copy
                </button>
              </div>
              {reply}
              {replyBasis ? <p className="mt-1 text-[10px] text-slate-500">Nguồn: {replyBasis}</p> : null}
            </div>
          ) : null}
        </div>
        <textarea
          value={utterance}
          onChange={(e) => {
            setUtterance(e.target.value)
            setReply(null)
            setErr(null)
          }}
          rows={compact ? 2 : 2}
          placeholder="vd. Học phí đắt quá / Em muốn hỏi KTX…"
          className="mt-2 w-full resize-y rounded-lg border border-slate-200 bg-slate-50/80 px-2.5 py-1.5 text-xs text-slate-900 outline-none focus:ring-2 focus:ring-emerald-300/50 sm:text-sm"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              if (!busy && utterance.trim().length >= 2) void runSuggest('smart')
            }
          }}
        />

        {knowledgeHits.length > 0 ? (
          <div className="mt-2 space-y-1">
            <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-sky-800">
              <BookOpen className="h-3 w-3" aria-hidden />
              Tri thức ({knowledgeHits.length})
            </p>
            <ul className="space-y-1">
              {knowledgeHits.slice(0, compact ? 2 : 4).map((h) => (
                <li
                  key={h.doc.id}
                  className="rounded-lg border border-sky-100 bg-sky-50/70 px-2 py-1.5 text-xs text-slate-800"
                >
                  <p className="font-semibold text-sky-950">{h.doc.title}</p>
                  <p className="mt-0.5 line-clamp-2 text-[11px] leading-relaxed text-slate-600">{h.snippet}</p>
                  <button
                    type="button"
                    className="mt-1 text-[11px] font-semibold text-sky-800 underline-offset-2 hover:underline"
                    onClick={() => void copyText(h.snippet || h.doc.content.slice(0, 400))}
                  >
                    Copy
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : utterance.trim().length >= 3 ? (
          <p className="mt-1.5 text-[11px] text-slate-500">Chưa khớp tri thức — thử từ khóa khác.</p>
        ) : null}

        <div className="mt-2 flex flex-wrap gap-1.5">
          <button
            type="button"
            disabled={busy || utterance.trim().length < 2}
            onClick={() => void runSuggest('smart')}
            className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg border border-emerald-300 bg-emerald-600 px-2.5 py-2 text-[11px] font-bold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50 sm:flex-none sm:text-xs"
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
            {canUseLlm ? 'Gợi ý (AI)' : 'Gợi ý'}
          </button>
          {canUseLlm ? (
            <button
              type="button"
              disabled={busy || utterance.trim().length < 2}
              onClick={() => void runSuggest('llm')}
              className="inline-flex items-center gap-1 rounded-lg border border-violet-200 bg-violet-50 px-2.5 py-2 text-[11px] font-semibold text-violet-950 hover:bg-violet-100 disabled:opacity-50"
            >
              <Wand2 className="h-3.5 w-3.5" />
              Soạn lại
            </button>
          ) : (
            <p className="self-center text-[10px] text-amber-800">Chưa bật quyền AI — vẫn dùng tri thức/chip.</p>
          )}
        </div>

        {err ? <p className="mt-1.5 text-xs text-rose-700">{err}</p> : null}
      </section>

      <section className={['rounded-xl border border-slate-200/90 bg-white shadow-sm', compact ? 'p-2' : 'p-3'].join(' ')}>
        <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-500">Nút bấm nhanh (chip)</p>
        <div className="flex flex-wrap items-center gap-1.5">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Lọc chip…"
            className="min-w-[6rem] flex-1 rounded-lg border border-slate-200 px-2 py-1 text-xs outline-none focus:ring-2 focus:ring-emerald-200"
          />
          <div className="flex flex-wrap gap-1">
            {kinds.map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setKindFilter(k)}
                className={[
                  'rounded-full border px-2 py-0.5 text-[10px] font-semibold',
                  kindFilter === k
                    ? 'border-emerald-400 bg-emerald-100 text-emerald-950'
                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50',
                ].join(' ')}
              >
                {k === 'all' ? 'Tất cả' : CONSULTING_CHIP_KIND_LABEL[k]}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {filtered.length === 0 ? (
            <p className="text-xs text-slate-500">Chưa có chip — nạp mẫu / mảnh thoại ở Cài đặt → Tư vấn.</p>
          ) : (
            filtered.slice(0, compact ? 24 : 80).map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => void onCopyChip(c)}
                title={c.copyText}
                className={`inline-flex max-w-full items-center gap-1 rounded-full border px-2.5 py-1 text-left text-[11px] font-semibold transition ${KIND_STYLE[c.kind]}`}
              >
                {copiedId === c.id ? <Check className="h-3 w-3 shrink-0" /> : <Copy className="h-3 w-3 shrink-0" />}
                <span className="truncate">{c.label}</span>
              </button>
            ))
          )}
        </div>
      </section>
    </div>
  )
}
