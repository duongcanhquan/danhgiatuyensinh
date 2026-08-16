import { useMemo, useState } from 'react'
import { Copy, Loader2, Sparkles } from 'lucide-react'
import type { Lead } from '../types'
import { useConsultingPlaybooks } from '../hooks/useConsultingPlaybooks'
import { useKnowledgeDocuments } from '../hooks/useKnowledgeDocuments'
import { buildConsultingChips } from '../utils/consultingQuickChips'
import { suggestConsultingReply } from '../utils/consultingLiveSuggest'
import { searchKnowledgeByQuery } from '../utils/knowledgeRag'

/** Dải gọn trên panel OMICall — gõ lời khách → gợi ý câu đáp từ tri thức / AI. */
export function ConsultingCallLiveStrip({
  lead,
  canUseLlm,
}: {
  lead: Lead
  canUseLlm: boolean
}) {
  const { documents } = useKnowledgeDocuments({ enabled: true })
  const { playbooks } = useConsultingPlaybooks({ enabled: true })
  const [utterance, setUtterance] = useState('')
  const [busy, setBusy] = useState(false)
  const [reply, setReply] = useState<string | null>(null)
  const [basis, setBasis] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const hits = useMemo(
    () => searchKnowledgeByQuery(documents, utterance, { lead, limit: 2 }),
    [documents, utterance, lead],
  )

  const run = async () => {
    setBusy(true)
    setErr(null)
    setReply(null)
    setBasis(null)
    try {
      const chips = buildConsultingChips({ lead, playbooks, snippets: [] })
      const r = await suggestConsultingReply({
        utterance,
        lead,
        playbooks,
        knowledgeDocs: documents,
        chips,
        preferLlm: canUseLlm,
        forceLlm: false,
      })
      setReply(r.reply)
      setBasis(r.basis ?? r.source)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Không gợi ý được.')
    } finally {
      setBusy(false)
    }
  }

  const copyReply = async () => {
    if (!reply) return
    try {
      await navigator.clipboard.writeText(reply)
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="rounded-xl border border-emerald-200/80 bg-emerald-50/95 p-2.5 text-slate-900 shadow-sm">
      <p className="text-[11px] font-bold uppercase tracking-wide text-emerald-900">Gợi ý lúc gọi</p>
      <div className="mt-1.5 flex gap-1.5">
        <input
          value={utterance}
          onChange={(e) => {
            setUtterance(e.target.value)
            setReply(null)
            setErr(null)
          }}
          placeholder="Khách nói gì? vd. học phí…"
          className="min-w-0 flex-1 rounded-lg border border-emerald-200 bg-white px-2 py-1.5 text-xs outline-none focus:ring-2 focus:ring-emerald-300"
        />
        <button
          type="button"
          disabled={busy || utterance.trim().length < 2}
          onClick={() => void run()}
          className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-emerald-700 px-2.5 py-1.5 text-[11px] font-bold text-white hover:bg-emerald-800 disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
          Gợi ý
        </button>
      </div>
      {hits.length > 0 ? (
        <p className="mt-1 truncate text-[10px] text-sky-900">
          Tri thức: {hits.map((h) => h.doc.title).join(' · ')}
        </p>
      ) : null}
      {err ? <p className="mt-1 text-[11px] text-rose-700">{err}</p> : null}
      {reply ? (
        <div className="mt-1.5 rounded-lg border border-emerald-300/80 bg-white px-2 py-1.5">
          <div className="flex items-start justify-between gap-2">
            <p className="text-xs leading-snug text-slate-900">{reply}</p>
            <button
              type="button"
              onClick={() => void copyReply()}
              className="shrink-0 rounded border border-slate-200 p-1 text-slate-600 hover:bg-slate-50"
              aria-label="Copy câu gợi ý"
            >
              <Copy className="h-3.5 w-3.5" />
            </button>
          </div>
          {basis ? <p className="mt-0.5 text-[10px] text-slate-500">{basis}</p> : null}
        </div>
      ) : null}
    </div>
  )
}
