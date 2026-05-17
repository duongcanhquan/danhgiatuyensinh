import { useEffect, useMemo, useState } from 'react'
import { BookOpen, Bot, GraduationCap, Library } from 'lucide-react'
import type { ConsultingPlaybook, Lead } from '../types'
import { useKnowledgeDocuments } from '../hooks/useKnowledgeDocuments'
import { useKnowledgeCategories } from '../hooks/useKnowledgeCategories'
import { useScriptSnippets } from '../hooks/useScriptSnippets'
import { playbooksMatchingLead } from '../utils/playbookMatch'
import { LeadPlaybookPanel } from './LeadPlaybookPanel'
import { LeadKnowledgePanel } from './LeadKnowledgePanel'
import { ConsultingAssistantPanel } from './ConsultingAssistantPanel'

export type ConsultingHubTab = 'playbook' | 'knowledge' | 'scripts' | 'general'

const TAB_META: { id: ConsultingHubTab; label: string; icon: typeof BookOpen }[] = [
  { id: 'playbook', label: 'Playbook', icon: BookOpen },
  { id: 'knowledge', label: 'Tri thức', icon: Library },
  { id: 'scripts', label: 'Kịch bản', icon: Bot },
  { id: 'general', label: 'Tư vấn chung', icon: GraduationCap },
]

export function LeadConsultingHub({
  lead,
  playbooks,
  showDraftHint,
  initialTab = 'playbook',
  canRunAssistant,
}: {
  lead: Lead
  playbooks: ConsultingPlaybook[]
  showDraftHint?: boolean
  initialTab?: ConsultingHubTab
  canRunAssistant?: boolean
}) {
  const [tab, setTab] = useState<ConsultingHubTab>(initialTab)

  useEffect(() => {
    setTab(initialTab)
  }, [initialTab])
  const { documents } = useKnowledgeDocuments()
  const { categories } = useKnowledgeCategories()
  const { snippets, loading: scriptsLoading, error: scriptsError } = useScriptSnippets()

  const playbookMatches = useMemo(() => playbooksMatchingLead(lead, playbooks), [lead, playbooks])
  const generalPlaybooks = useMemo(
    () => playbookMatches.filter((m) => m.kind === 'all'),
    [playbookMatches],
  )
  const generalKnowledge = useMemo(
    () => documents.filter((d) => d.type === 'GENERAL' || d.type === 'FAQ'),
    [documents],
  )
  const generalScripts = useMemo(
    () => snippets.filter((s) => s.isActive !== false && (!s.matchConditions?.length)),
    [snippets],
  )

  const tabCounts: Record<ConsultingHubTab, number> = useMemo(
    () => ({
      playbook: playbookMatches.length,
      knowledge: documents.length,
      scripts: snippets.filter((s) => s.isActive !== false).length,
      general: generalPlaybooks.length + generalKnowledge.length + generalScripts.length,
    }),
    [playbookMatches.length, documents.length, snippets, generalPlaybooks.length, generalKnowledge.length, generalScripts.length],
  )

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <div className="shrink-0 flex flex-wrap gap-1 border-b border-slate-200/80 pb-2">
        {TAB_META.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={[
              'inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold sm:text-sm',
              tab === id
                ? 'bg-amber-600 text-white shadow-sm'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200',
            ].join(' ')}
          >
            <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
            {label}
            {tabCounts[id] > 0 ? (
              <span className="rounded-full bg-white/25 px-1.5 text-[10px] tabular-nums">{tabCounts[id]}</span>
            ) : null}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-hidden">
        {tab === 'playbook' ? (
          <LeadPlaybookPanel lead={lead} playbooks={playbooks} showDraftHint={showDraftHint} />
        ) : null}
        {tab === 'knowledge' ? (
          <LeadKnowledgePanel
            lead={lead}
            documents={documents}
            categories={categories}
            showDraftHint={showDraftHint}
          />
        ) : null}
        {tab === 'scripts' && canRunAssistant ? (
          <div className="h-full min-h-[min(60vh,520px)] overflow-y-auto rounded-xl border border-sky-200/80 bg-sky-50/30 p-2 sm:p-3">
            <ConsultingAssistantPanel
              variant="embedded"
              showHeader={false}
              lead={lead}
              snippets={snippets}
              loading={scriptsLoading}
              error={scriptsError}
            />
          </div>
        ) : tab === 'scripts' ? (
          <p className="text-sm text-slate-500">Không có quyền mở trợ lý kịch bản.</p>
        ) : null}
        {tab === 'general' ? (
          <div className="grid min-h-0 gap-3 overflow-y-auto sm:grid-cols-2">
            <section className="rounded-xl border border-violet-200/80 bg-violet-50/50 p-3">
              <h3 className="text-sm font-semibold text-violet-950">Playbook chung</h3>
              {generalPlaybooks.length ? (
                <ul className="mt-2 space-y-2 text-sm">
                  {generalPlaybooks.map((m) => (
                    <li key={m.playbook.id} className="rounded-lg border border-violet-200/60 bg-white/90 p-2">
                      <p className="font-medium text-slate-900">{m.playbook.title}</p>
                      <p className="mt-1 line-clamp-4 text-slate-700">{m.playbook.strategy}</p>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-xs text-slate-600">Chưa có playbook «Áp dụng mọi hồ sơ».</p>
              )}
            </section>
            <section className="rounded-xl border border-amber-200/80 bg-amber-50/50 p-3">
              <h3 className="text-sm font-semibold text-amber-950">Tài liệu tư vấn chung</h3>
              {generalKnowledge.length ? (
                <ul className="mt-2 max-h-[40vh] space-y-2 overflow-y-auto text-sm">
                  {generalKnowledge.map((d) => (
                    <li key={d.id} className="rounded-lg border border-amber-200/60 bg-white/90 p-2">
                      <p className="font-medium text-slate-900">{d.title}</p>
                      <p className="mt-1 line-clamp-3 text-slate-700">{d.content}</p>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-xs text-slate-600">Thêm tài liệu danh mục «Tư vấn chung» hoặc FAQ.</p>
              )}
            </section>
            {generalScripts.length ? (
              <section className="rounded-xl border border-sky-200/80 bg-sky-50/50 p-3 sm:col-span-2">
                <h3 className="text-sm font-semibold text-sky-950">Kịch bản không điều kiện</h3>
                <ul className="mt-2 grid gap-2 sm:grid-cols-2">
                  {generalScripts.map((s) => (
                    <li key={s.id} className="rounded-lg border border-sky-200/60 bg-white/90 p-2 text-sm">
                      <p className="font-medium text-slate-900">{s.title}</p>
                      <p className="mt-1 line-clamp-4 whitespace-pre-wrap text-slate-700">{s.content}</p>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  )
}
