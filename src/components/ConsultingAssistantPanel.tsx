import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'motion/react'
import {
  BookOpen,
  Pencil,
  Shield,
  Sparkles,
  Star,
  Target,
  Waypoints,
} from 'lucide-react'
import type { Lead, ScriptCategory, ScriptSnippet } from '../types'
import { SCRIPT_CATEGORY_LABELS } from '../types'
import { assembleConsultingFlow } from '../utils/scriptEngine'
import { resolveMlWinDisplay } from '../utils/mlWinMock'
import { useAuth } from '../hooks/useAuth'
import { MlWinGauge } from './MlWinGauge'

export type ConsultingAssistantVariant = 'rail' | 'embedded'

function parseObjectionBlock(content: string): { concern: string; script: string } {
  const parts = content.split(/\n---\n/)
  if (parts.length >= 2) {
    return { concern: parts[0].trim(), script: parts.slice(1).join('\n---\n').trim() }
  }
  const lines = content.trim().split('\n')
  if (lines.length >= 2) {
    return { concern: lines[0].trim(), script: lines.slice(1).join('\n').trim() }
  }
  return { concern: 'Từ chối / lo ngại', script: content.trim() }
}

function StepIcon({ category }: { category: ScriptCategory }) {
  switch (category) {
    case 'GREETING':
      return <Sparkles className="h-4 w-4 text-amber-600" strokeWidth={1.75} />
    case 'USP':
      return <Star className="h-4 w-4 text-amber-600" strokeWidth={1.75} />
    case 'CAREER_VISION':
      return <Waypoints className="h-4 w-4 text-violet-600" strokeWidth={1.75} />
    case 'OBJECTION_HANDLING':
      return <Shield className="h-4 w-4 text-amber-700" strokeWidth={1.75} />
    case 'CLOSING':
      return <Target className="h-4 w-4 text-emerald-600" strokeWidth={1.75} />
    default:
      return <Sparkles className="h-4 w-4 text-slate-500" />
  }
}

function SnippetCard({
  snippet,
  category,
  canConfigureScripts,
}: {
  snippet: ScriptSnippet
  category: ScriptCategory
  canConfigureScripts: boolean
}) {
  const isUsp = category === 'USP'
  const isObjection = category === 'OBJECTION_HANDLING'
  const isClosing = category === 'CLOSING'
  const parsed = isObjection ? parseObjectionBlock(snippet.content) : null

  const shell = isUsp
    ? 'border-amber-200 bg-amber-50/90 shadow-[0_8px_24px_rgba(251,191,36,0.12)]'
    : isObjection
      ? 'border-rose-200 bg-rose-50/85 shadow-[0_8px_24px_rgba(244,63,94,0.08)]'
      : isClosing
        ? 'border-emerald-200 bg-emerald-50/90 shadow-[0_8px_24px_rgba(52,211,153,0.1)]'
        : 'border-slate-200/90 bg-white/85'

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className={`relative rounded-xl border px-3 py-2.5 shadow-sm backdrop-blur-md ${shell}`}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-semibold text-slate-900">{snippet.title}</p>
        {canConfigureScripts ? (
          <Link
            to={`/settings?editSnippet=${encodeURIComponent(snippet.id)}`}
            className="shrink-0 rounded-lg p-1 text-slate-500 transition hover:bg-amber-50 hover:text-amber-700"
            title="Sửa đoạn kịch bản trong Cấu hình dữ liệu"
          >
            <Pencil className="h-3.5 w-3.5" />
          </Link>
        ) : null}
      </div>
      {isObjection && parsed ? (
        <div className="mt-2 space-y-2 text-sm leading-relaxed">
          <p className="font-medium text-amber-900">{parsed.concern}</p>
          <p className="border-t border-slate-200/80 pt-2 text-slate-700">{parsed.script}</p>
        </div>
      ) : (
        <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-slate-700">{snippet.content}</p>
      )}
    </motion.div>
  )
}

export function ConsultingAssistantPanel({
  lead,
  snippets,
  loading,
  error,
  variant = 'rail',
}: {
  lead: Lead
  snippets: ScriptSnippet[]
  loading?: boolean
  error?: string | null
  variant?: ConsultingAssistantVariant
}) {
  const { can } = useAuth()
  const canConfigureScripts = can('config:playbooks')
  const flow = useMemo(() => assembleConsultingFlow(lead, snippets), [lead, snippets])
  const totalSteps = flow.length
  const ml = useMemo(() => resolveMlWinDisplay(lead), [lead])

  const isRail = variant === 'rail'
  const shell = isRail
    ? 'relative fixed inset-y-0 right-0 z-[52] hidden h-full w-full max-w-[min(24rem,100vw)] flex-col border-l border-slate-200/80 bg-white/55 text-slate-900 shadow-[-12px_0_40px_rgba(15,23,42,0.08)] backdrop-blur-2xl lg:flex'
    : 'relative flex w-full flex-col border-b border-slate-200/80 bg-white/50 p-4 text-slate-900 shadow-sm backdrop-blur-2xl'

  return (
    <aside className={shell} aria-label="Trợ lý tư vấn động">
      <div
        className={
          isRail
            ? 'pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_20%_0%,rgba(56,189,248,0.12),transparent_55%),radial-gradient(ellipse_at_100%_60%,rgba(167,139,250,0.1),transparent_50%)]'
            : 'pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_30%_0%,rgba(167,139,250,0.08),transparent_50%)]'
        }
      />

      <div className={`relative flex min-h-0 flex-1 flex-col ${isRail ? 'p-4' : ''}`}>
        <div className="flex shrink-0 flex-wrap items-center gap-3 border-b border-slate-200/80 pb-3">
          <span className="relative flex h-10 w-10 items-center justify-center rounded-2xl border border-amber-200/90 bg-white/90 shadow-md shadow-amber-500/10">
            <Sparkles className="h-5 w-5 text-amber-600" strokeWidth={1.6} />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-semibold uppercase tracking-wide text-slate-900">Trợ lý tư vấn động</h2>
            <p className="text-xs text-slate-600">Luồng kịch bản theo hồ sơ (Script Hub)</p>
          </div>
          <div
            className="flex items-center gap-2 rounded-2xl border border-violet-200/80 bg-gradient-to-br from-violet-50/90 to-amber-50/50 px-2.5 py-1.5 shadow-[0_0_20px_rgba(167,139,250,0.2)]"
            title={`Win probability: ${ml.mlWinProbability}%. ${ml.mlExplanation}`}
          >
            <MlWinGauge value={ml.mlWinProbability} />
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-wide text-violet-900">Win probability</p>
              <p className="truncate text-[11px] font-semibold text-slate-800">{ml.mlWinProbability}%</p>
              <p className="text-[9px] text-violet-800/80">Hover: ML reasoning</p>
            </div>
          </div>
        </div>

        {loading ? (
          <p className="mt-4 text-sm text-slate-600">Đang tải kịch bản…</p>
        ) : null}
        {error ? <p className="mt-2 text-sm text-rose-700">{error}</p> : null}

        <div className={`relative mt-3 min-h-0 flex-1 overflow-y-auto ${isRail ? 'pr-1' : ''}`}>
          {!loading && !totalSteps ? (
            <div className="rounded-2xl border border-slate-200/90 bg-white/80 p-4 text-center shadow-inner backdrop-blur-md">
              <BookOpen className="mx-auto h-8 w-8 text-amber-600" strokeWidth={1.25} />
              <p className="mt-3 text-sm leading-relaxed text-slate-700">
                Chưa có kịch bản đặc thù cho hồ sơ này, hãy tư vấn theo quy chuẩn chung.
              </p>
            </div>
          ) : null}

          {totalSteps ? (
            <div className="relative pl-7">
              <div
                className="absolute bottom-2 left-[13px] top-2 w-px bg-gradient-to-b from-amber-400/60 via-fuchsia-400/40 to-emerald-400/60 opacity-90"
                aria-hidden
              />
              <ol className="space-y-5">
                {flow.map((step, stepIndex) => (
                  <li key={step.category} className="relative">
                    <div className="absolute -left-1 top-1 flex h-6 w-6 items-center justify-center rounded-full border border-amber-300 bg-white shadow-md shadow-amber-500/15">
                      <span className="text-[10px] font-bold text-amber-800">{stepIndex + 1}</span>
                    </div>
                    <div className="flex items-center gap-2 pl-1">
                      <StepIcon category={step.category} />
                      <span className="text-xs font-semibold uppercase tracking-wider text-slate-600">
                        {SCRIPT_CATEGORY_LABELS[step.category]}
                      </span>
                    </div>
                    <div className="mt-2 space-y-2 pl-1">
                      {step.snippets.map((s) => (
                        <SnippetCard
                          key={s.id}
                          snippet={s}
                          category={step.category}
                          canConfigureScripts={canConfigureScripts}
                        />
                      ))}
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          ) : null}
        </div>
      </div>
    </aside>
  )
}
