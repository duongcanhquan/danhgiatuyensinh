import { BookOpen, MessageSquareText, Sparkles, Wand2 } from 'lucide-react'
import type { Firestore } from 'firebase/firestore'
import type { ConsultingPlaybook } from '../types'
import { ConsultingPlaybookSection } from './ConsultingPlaybookSection'
import { KnowledgeBaseTab } from './KnowledgeBaseTab'
import { ScriptHubManager } from './ScriptHubManager'
import { AISettingsTab } from './AISettingsTab'

export type AdviseHubStep = 'facts' | 'plays' | 'snippets' | 'ai'

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
    label: '1. Tri thức',
    short: 'Tri thức',
    blurb: 'Nạp học phí, ngành, FAQ đã duyệt — AI và TVV chỉ lấy số liệu từ đây.',
    Icon: BookOpen,
    needAi: true,
  },
  {
    id: 'plays',
    label: '2. Mẫu tư vấn',
    short: 'Mẫu',
    blurb: 'Kịch bản theo hồ sơ (ngành, tỉnh, HOT/WARM): USP và xử lý phản đối.',
    Icon: Wand2,
    needPlaybooks: true,
  },
  {
    id: 'snippets',
    label: '3. Mảnh thoại',
    short: 'Thoại',
    blurb: 'Đoạn mở đầu → USP → phản đối → chốt; TVV bấm copy lúc gọi.',
    Icon: MessageSquareText,
    needPlaybooks: true,
  },
  {
    id: 'ai',
    label: '4. AI hỗ trợ',
    short: 'AI',
    blurb: 'Khóa Gemini Flash-Lite, lọc khi gọi AI, tác vụ phân tích hồ sơ.',
    Icon: Sparkles,
    needAi: true,
  },
]

function firstAllowedStep(canPlaybooks: boolean, canAiEngine: boolean): AdviseHubStep {
  if (canAiEngine) return 'facts'
  if (canPlaybooks) return 'plays'
  return 'ai'
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
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="shrink-0 space-y-2">
        <div
          className="flex flex-wrap gap-1 rounded-xl border border-slate-200/90 bg-white p-1 shadow-sm"
          role="tablist"
          aria-label="Các bước nạp tư vấn"
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
                    ? 'bg-sky-800 text-white shadow-sm'
                    : 'text-slate-700 hover:bg-sky-50',
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

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
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
        {active === 'ai' && canAiEngine ? <AISettingsTab db={db} /> : null}
      </div>
    </div>
  )
}

export function parseAdviseHubStep(raw: string | null | undefined): AdviseHubStep | null {
  const s = String(raw ?? '').trim().toLowerCase()
  if (s === 'facts' || s === 'knowledge' || s === 'tri-thuc' || s === '1') return 'facts'
  if (s === 'plays' || s === 'playbooks' || s === 'mau' || s === '2') return 'plays'
  if (s === 'snippets' || s === 'script' || s === 'script_hub' || s === '3') return 'snippets'
  if (s === 'ai' || s === 'llm' || s === '4') return 'ai'
  return null
}
