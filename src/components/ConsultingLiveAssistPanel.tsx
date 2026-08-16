import { useMemo, useState } from 'react'
import { Check, Copy, Loader2, MessageCircle, Sparkles, Wand2 } from 'lucide-react'
import type { ConsultingPlaybook, KnowledgeDocument, Lead, ScriptSnippet } from '../types'
import {
  buildConsultingChips,
  CONSULTING_CHIP_KIND_LABEL,
  filterConsultingChips,
  matchUtteranceToChips,
  type ConsultingChip,
  type ConsultingChipKind,
} from '../utils/consultingQuickChips'
import { playbooksMatchingLead } from '../utils/playbookMatch'
import { buildLeadContextualRagBlock } from '../utils/knowledgeRag'
import { buildPlaybookContextBlock } from '../utils/counselingAiDefaults'
import { invokeLlmJsonText, resolveAIIntegrationConfig } from '../utils/aiEngine'

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
}: {
  lead: Lead
  playbooks: ConsultingPlaybook[]
  snippets?: ScriptSnippet[]
  knowledgeDocs?: KnowledgeDocument[]
  canUseLlm?: boolean
}) {
  const [query, setQuery] = useState('')
  const [utterance, setUtterance] = useState('')
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [kindFilter, setKindFilter] = useState<'all' | ConsultingChipKind>('all')
  const [llmBusy, setLlmBusy] = useState(false)
  const [llmReply, setLlmReply] = useState<string | null>(null)
  const [llmErr, setLlmErr] = useState<string | null>(null)

  const allChips = useMemo(
    () => buildConsultingChips({ lead, playbooks, snippets }),
    [lead, playbooks, snippets],
  )

  const filtered = useMemo(() => {
    let list = filterConsultingChips(allChips, query)
    if (kindFilter !== 'all') list = list.filter((c) => c.kind === kindFilter)
    return list
  }, [allChips, query, kindFilter])

  const utteranceHits = useMemo(
    () => matchUtteranceToChips(utterance, allChips, 6),
    [utterance, allChips],
  )

  const topPlay = playbooksMatchingLead(lead, playbooks)[0]?.playbook

  const onCopyChip = async (chip: ConsultingChip) => {
    const ok = await copyText(chip.copyText)
    if (ok) {
      setCopiedId(chip.id)
      window.setTimeout(() => setCopiedId((id) => (id === chip.id ? null : id)), 1600)
    }
  }

  const runLlmSuggest = async () => {
    const u = utterance.trim()
    if (!u) {
      setLlmErr('Gõ nhanh lời khách đang nói trước.')
      return
    }
    if (utteranceHits.length) {
      setLlmReply(utteranceHits[0]!.copyText)
      setLlmErr(null)
      return
    }
    const cfg = resolveAIIntegrationConfig()
    if (!cfg?.apiKey?.trim()) {
      setLlmErr('Chưa có khóa AI — vào Cài đặt → Tư vấn → AI hỗ trợ.')
      return
    }
    setLlmBusy(true)
    setLlmErr(null)
    setLlmReply(null)
    try {
      const matches = playbooksMatchingLead(lead, playbooks).map((m) => m.playbook)
      const rag = buildLeadContextualRagBlock(lead, knowledgeDocs, 6_000)
      const pbBlock = buildPlaybookContextBlock(matches, 3_000)
      const system = [
        'Bạn hỗ trợ TVV tuyển sinh VietMy. Chỉ dùng tri thức/playbook đã cho.',
        'Trả JSON: {"cauTraLoi":"string — 2–5 câu TVV có thể nói ngay","canCu":"string — nguồn ngắn"}',
        'Không bịa học phí/quy chế nếu không có trong tri thức.',
      ].join('\n')
      const user = [
        `## Lời khách vừa nói\n${u}`,
        `## Hồ sơ\n${lead.fullName} | ${lead.province ?? ''} | ${lead.educationLevel} | ${lead.majorInterest ?? ''} | ${lead.priorityTag}`,
        rag ? `## Tri thức\n${rag}` : '',
        pbBlock ? `## Playbook\n${pbBlock}` : '',
      ]
        .filter(Boolean)
        .join('\n\n')
      const raw = await invokeLlmJsonText(cfg, system, user)
      const parsed = JSON.parse(raw) as { cauTraLoi?: string }
      const text = String(parsed.cauTraLoi ?? '').trim()
      if (!text) throw new Error('AI không trả câu trả lời.')
      setLlmReply(text)
    } catch (e) {
      console.error(e)
      setLlmErr(e instanceof Error ? e.message : 'Không soạn được câu trả lời.')
    } finally {
      setLlmBusy(false)
    }
  }

  const kinds: ('all' | ConsultingChipKind)[] = ['all', 'objection', 'question', 'usp', 'snippet']

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-y-auto overscroll-contain p-0.5">
      <header className="rounded-xl border border-amber-200/80 bg-gradient-to-br from-amber-50 via-white to-sky-50 p-3 sm:p-4">
        <div className="flex items-start gap-2">
          <Wand2 className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" aria-hidden />
          <div>
            <h3 className="text-base font-semibold tracking-tight text-slate-900">Gợi ý lúc gọi</h3>
            <p className="mt-1 text-sm leading-snug text-slate-600">
              Bấm chip để copy câu đáp. Gõ lời khách bên dưới — ưu tiên khớp chip sẵn, không tốn AI.
              {topPlay ? (
                <>
                  {' '}
                  Đang theo mẫu <strong className="text-slate-800">{topPlay.title}</strong>.
                </>
              ) : (
                <> Chưa khớp mẫu — thêm điều kiện playbook hoặc xem tab Tri thức.</>
              )}
            </p>
          </div>
        </div>
      </header>

      <section className="rounded-xl border border-slate-200/90 bg-white p-3 shadow-sm">
        <label className="flex items-center gap-2 text-sm font-semibold text-slate-800">
          <MessageCircle className="h-4 w-4 text-sky-700" aria-hidden />
          Khách đang nói gì?
        </label>
        <textarea
          value={utterance}
          onChange={(e) => {
            setUtterance(e.target.value)
            setLlmReply(null)
            setLlmErr(null)
          }}
          rows={2}
          placeholder="vd. Học phí đắt quá / Em muốn hỏi KTX…"
          className="mt-2 w-full resize-y rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-amber-300/50"
        />
        {utteranceHits.length > 0 ? (
          <div className="mt-2 space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-emerald-800">
              Khớp sẵn ({utteranceHits.length}) — bấm để copy
            </p>
            <div className="flex flex-wrap gap-1.5">
              {utteranceHits.map((c) => (
                <button
                  key={`hit-${c.id}`}
                  type="button"
                  onClick={() => void onCopyChip(c)}
                  className={`inline-flex max-w-full items-center gap-1 rounded-full border px-3 py-1.5 text-left text-xs font-semibold transition ${KIND_STYLE[c.kind]}`}
                >
                  {copiedId === c.id ? <Check className="h-3.5 w-3.5 shrink-0" /> : <Copy className="h-3.5 w-3.5 shrink-0" />}
                  <span className="truncate">{c.label}</span>
                </button>
              ))}
            </div>
            <p className="rounded-lg border border-emerald-200/80 bg-emerald-50/80 px-2.5 py-2 text-sm text-emerald-950">
              {utteranceHits[0]!.copyText}
            </p>
          </div>
        ) : utterance.trim().length >= 3 ? (
          <p className="mt-2 text-xs text-slate-600">
            Chưa khớp chip — thử từ khóa ngắn hơn, hoặc dùng «Soạn giúp» (có AI).
          </p>
        ) : null}

        <div className="mt-2 flex flex-wrap gap-2">
          {canUseLlm ? (
            <button
              type="button"
              disabled={llmBusy || utterance.trim().length < 2}
              onClick={() => void runLlmSuggest()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/60 bg-gradient-to-r from-amber-600 to-sky-700 px-3 py-2 text-xs font-bold text-white shadow-sm hover:brightness-110 disabled:opacity-45"
            >
              {llmBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
              Soạn giúp {utteranceHits.length ? '(dùng chip)' : '(AI)'}
            </button>
          ) : null}
          {llmReply ? (
            <button
              type="button"
              onClick={() => void copyText(llmReply)}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50"
            >
              <Copy className="h-3.5 w-3.5" />
              Copy câu AI
            </button>
          ) : null}
        </div>
        {llmErr ? <p className="mt-2 text-xs text-rose-700">{llmErr}</p> : null}
        {llmReply ? (
          <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50/90 px-2.5 py-2 text-sm text-amber-950 whitespace-pre-wrap">
            {llmReply}
          </p>
        ) : null}
      </section>

      <section className="rounded-xl border border-slate-200/90 bg-white p-3 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Tìm chip: học phí, KTX, việc làm…"
            className="min-w-[12rem] flex-1 rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-sky-300/40"
          />
          <div className="flex flex-wrap gap-1">
            {kinds.map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setKindFilter(k)}
                className={[
                  'rounded-full px-2.5 py-1 text-[11px] font-semibold transition',
                  kindFilter === k
                    ? 'bg-slate-800 text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200',
                ].join(' ')}
              >
                {k === 'all' ? 'Tất cả' : CONSULTING_CHIP_KIND_LABEL[k]}
              </button>
            ))}
          </div>
        </div>

        {filtered.length === 0 ? (
          <p className="mt-4 rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-6 text-center text-sm text-slate-600">
            Chưa có chip — nạp phản đối dạng cặp trong Cài đặt → Tư vấn → Mẫu tư vấn.
          </p>
        ) : (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {filtered.map((c) => (
              <button
                key={c.id}
                type="button"
                title={c.sourceTitle ? `${CONSULTING_CHIP_KIND_LABEL[c.kind]} · ${c.sourceTitle}` : c.copyText}
                onClick={() => void onCopyChip(c)}
                className={`inline-flex max-w-full items-center gap-1 rounded-full border px-3 py-1.5 text-left text-xs font-semibold shadow-sm transition ${KIND_STYLE[c.kind]}`}
              >
                {copiedId === c.id ? (
                  <Check className="h-3.5 w-3.5 shrink-0 text-emerald-700" aria-hidden />
                ) : (
                  <Copy className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden />
                )}
                <span className="min-w-0 truncate">{c.label}</span>
              </button>
            ))}
          </div>
        )}
        <p className="mt-3 text-[11px] text-slate-500">
          {filtered.length}/{allChips.length} gợi ý · màu hồng = phản đối · xanh dương = câu hỏi · xanh lá = điểm bán
        </p>
      </section>
    </div>
  )
}
