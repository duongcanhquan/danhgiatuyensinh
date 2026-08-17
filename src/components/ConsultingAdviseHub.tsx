import { BookOpen, MessageSquareText, Wand2 } from 'lucide-react'
import type { Firestore } from 'firebase/firestore'
import type { ConsultingPlaybook } from '../types'
import { ConsultingPlaybookSection } from './ConsultingPlaybookSection'
import { KnowledgeBaseTab } from './KnowledgeBaseTab'
import { ScriptHubManager } from './ScriptHubManager'

/** Chỉ các bước nạp nội dung — máy AI nằm tab riêng «Máy AI». */
export type AdviseHubStep = 'facts' | 'plays' | 'snippets'

const STEPS: {
  id: AdviseHubStep
  label: string
  short: string
  blurb: string
  Icon: typeof BookOpen
  needPlaybooks?: boolean
  needAi?: boolean
}[] = [
  {
    id: 'facts',
    label: 'Tri thức',
    short: 'Tri thức',
    blurb: 'Nạp học phí, ngành, FAQ đã duyệt — đây là nguồn sự thật cho TVV và AI.',
    Icon: BookOpen,
    needAi: true,
  },
  {
    id: 'plays',
    label: 'Mẫu tư vấn',
    short: 'Mẫu',
    blurb: 'Kịch bản theo hồ sơ (ngành, tỉnh, HOT/WARM): USP và xử lý phản đối.',
    Icon: Wand2,
    needPlaybooks: true,
  },
  {
    id: 'snippets',
    label: 'Mảnh thoại',
    short: 'Thoại',
    blurb: 'Đoạn mở đầu → USP → phản đối → chốt; TVV bấm copy lúc gọi.',
    Icon: MessageSquareText,
    needPlaybooks: true,
  },
]

function firstAllowedStep(canPlaybooks: boolean, canAiEngine: boolean): AdviseHubStep {
  if (canAiEngine) return 'facts'
  if (canPlaybooks) return 'plays'
  return 'facts'
}

export function ConsultingAdviseHub({
  db,
  playbooks,
  loading,
  error,
  canPlaybooks,
  canAiEngine,
  workspaceOpen,
  compactChrome,
  step,
  onStepChange,
}: {
  db: Firestore
  playbooks: ConsultingPlaybook[]
  loading: boolean
  error: string | null
  canPlaybooks: boolean
  canAiEngine: boolean
  workspaceOpen?: boolean
  compactChrome?: boolean
  step: AdviseHubStep
  onStepChange: (s: AdviseHubStep) => void
}) {
  const visible = STEPS.filter((s) => {
    if (s.needPlaybooks && !canPlaybooks) return false
    if (s.needAi && !canAiEngine) return false
    return true
  })

  const active = visible.some((s) => s.id === step)
    ? step
    : firstAllowedStep(canPlaybooks, canAiEngine)

  const meta = STEPS.find((s) => s.id === active)

  return (
    <div className="flex flex-col gap-3 pb-6">
      <div className="shrink-0 space-y-2">
        <div
          className="flex flex-wrap gap-1 rounded-xl border border-teal-200/80 bg-gradient-to-r from-teal-50/80 to-emerald-50/50 p-1 shadow-sm"
          role="tablist"
          aria-label="Nạp nội dung tư vấn"
        >
          {visible.map((s) => {
            const selected = active === s.id
            return (
              <button
                key={s.id}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => onStepChange(s.id)}
                className={[
                  'inline-flex min-w-0 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-lg px-2.5 py-2 text-sm font-semibold transition sm:flex-none sm:px-3',
                  selected
                    ? 'bg-teal-700 text-white shadow-sm'
                    : 'text-teal-950/80 hover:bg-white/80',
                ].join(' ')}
              >
                <s.Icon className="h-3.5 w-3.5 shrink-0 opacity-90" aria-hidden />
                <span className="truncate sm:hidden">{s.short}</span>
                <span className="hidden truncate sm:inline">{s.label}</span>
              </button>
            )
          })}
        </div>
        {meta ? (
          <p className="px-0.5 text-sm leading-snug text-slate-600">{meta.blurb}</p>
        ) : null}
      </div>

      <div className="flex flex-col">
        {active === 'facts' && canAiEngine ? (
          <KnowledgeBaseTab db={db} compactChrome={compactChrome} canEdit={canAiEngine} />
        ) : null}
        {active === 'plays' && canPlaybooks ? (
          <ConsultingPlaybookSection
            db={db}
            playbooks={playbooks}
            loading={loading}
            error={error}
            canPlaybooks={canPlaybooks}
            consultingWorkspaceOpen={Boolean(workspaceOpen)}
            compactChrome={compactChrome}
          />
        ) : null}
        {active === 'snippets' && canPlaybooks ? <ScriptHubManager db={db} /> : null}
      </div>
    </div>
  )
}

export function parseAdviseHubStep(raw: string | null | undefined): AdviseHubStep | null {
  const s = String(raw ?? '').trim().toLowerCase()
  if (s === 'facts' || s === 'knowledge' || s === 'tri-thuc' || s === '1') return 'facts'
  if (s === 'plays' || s === 'playbooks' || s === 'mau' || s === '2') return 'plays'
  if (s === 'snippets' || s === 'script' || s === 'script_hub' || s === '3') return 'snippets'
  // Legacy bước 4 AI → không còn trong hub nội dung
  if (s === 'ai' || s === 'llm' || s === '4') return null
  return null
}
