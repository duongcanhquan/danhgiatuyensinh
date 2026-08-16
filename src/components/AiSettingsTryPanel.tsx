import { useState } from 'react'
import { Loader2, Sparkles, Wand2 } from 'lucide-react'
import type { ConsultingPlaybook, KnowledgeDocument, Lead } from '../types'
import { suggestConsultingReply } from '../utils/consultingLiveSuggest'
import { buildConsultingChips } from '../utils/consultingQuickChips'
import { resolveAIIntegrationConfig } from '../utils/aiEngine'
import { searchKnowledgeByQuery } from '../utils/knowledgeRag'

/** Thử nhanh gợi ý như TVV — dùng trong Cài đặt → Tư vấn → AI. */
export function AiSettingsTryPanel({
  sampleLead,
  playbooks = [],
  knowledgeDocs = [],
}: {
  sampleLead: Lead
  playbooks?: ConsultingPlaybook[]
  knowledgeDocs?: KnowledgeDocument[]
}) {
  const [utterance, setUtterance] = useState('Học phí đắt quá, nhà em đang cân nhắc.')
  const [busy, setBusy] = useState(false)
  const [out, setOut] = useState<string | null>(null)
  const [basis, setBasis] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const cfg = resolveAIIntegrationConfig()
  const hasKey = Boolean(cfg?.apiKey?.trim())
  const knowledgePreview = searchKnowledgeByQuery(knowledgeDocs, utterance, {
    lead: sampleLead,
    limit: 3,
  })

  const run = async (forceLlm: boolean) => {
    setBusy(true)
    setErr(null)
    setOut(null)
    setBasis(null)
    try {
      const chips = buildConsultingChips({ lead: sampleLead, playbooks, snippets: [] })
      const r = await suggestConsultingReply({
        utterance,
        lead: sampleLead,
        playbooks,
        knowledgeDocs,
        chips,
        preferLlm: forceLlm || hasKey,
        forceLlm,
      })
      setOut(r.reply)
      setBasis(r.basis ?? r.source)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Không thử được.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4 text-sm text-slate-800">
      <div className="rounded-xl border border-emerald-200 bg-emerald-50/80 px-3 py-3">
        <p className="font-semibold text-emerald-950">Thử như TVV đang gọi</p>
        <p className="mt-1 text-xs leading-relaxed text-emerald-900/80">
          Gõ lời khách → hệ thống tìm trong tri thức đã nạp, rồi gợi ý câu đáp. TVV thấy cùng luồng này trên hồ sơ → «Gợi
          ý tư vấn lúc gọi».
        </p>
      </div>

      <ul className="grid gap-2 sm:grid-cols-3">
        <li className="rounded-lg border border-slate-200 bg-white px-3 py-2">
          <p className="text-[11px] font-semibold uppercase text-slate-500">Khóa AI</p>
          <p className={`mt-0.5 font-semibold ${hasKey ? 'text-emerald-800' : 'text-amber-800'}`}>
            {hasKey ? 'Đã gắn' : 'Chưa gắn — mở tab API'}
          </p>
        </li>
        <li className="rounded-lg border border-slate-200 bg-white px-3 py-2">
          <p className="text-[11px] font-semibold uppercase text-slate-500">Tri thức</p>
          <p className="mt-0.5 font-semibold text-slate-900">{knowledgeDocs.length} tài liệu</p>
        </li>
        <li className="rounded-lg border border-slate-200 bg-white px-3 py-2">
          <p className="text-[11px] font-semibold uppercase text-slate-500">Mẫu tư vấn</p>
          <p className="mt-0.5 font-semibold text-slate-900">{playbooks.length} mẫu</p>
        </li>
      </ul>

      <label className="block font-semibold text-slate-900">
        Lời khách (thử)
        <textarea
          value={utterance}
          onChange={(e) => setUtterance(e.target.value)}
          rows={2}
          className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-200"
        />
      </label>

      {knowledgePreview.length > 0 ? (
        <div className="rounded-lg border border-sky-100 bg-sky-50/80 px-3 py-2">
          <p className="text-xs font-semibold text-sky-900">Khớp tri thức</p>
          <ul className="mt-1 list-inside list-disc text-xs text-slate-700">
            {knowledgePreview.map((h) => (
              <li key={h.doc.id}>{h.doc.title}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => void run(false)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-800 disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
          Gợi ý câu đáp
        </button>
        <button
          type="button"
          disabled={busy || !hasKey}
          onClick={() => void run(true)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-xs font-semibold text-violet-950 hover:bg-violet-100 disabled:opacity-50"
        >
          <Wand2 className="h-3.5 w-3.5" />
          Soạn bằng AI
        </button>
      </div>

      {err ? <p className="text-sm text-rose-700">{err}</p> : null}
      {out ? (
        <div className="rounded-xl border border-emerald-200 bg-white p-3 shadow-sm">
          <p className="text-xs font-semibold uppercase text-emerald-800">Kết quả</p>
          <p className="mt-1.5 leading-relaxed text-slate-900">{out}</p>
          {basis ? <p className="mt-1 text-xs text-slate-500">Nguồn: {basis}</p> : null}
        </div>
      ) : null}
    </div>
  )
}
