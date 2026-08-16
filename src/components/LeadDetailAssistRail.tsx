import { useEffect, useState, type ReactNode } from 'react'
import { BookOpen, Library, Sparkles, Wand2 } from 'lucide-react'
import type { ConsultingPlaybook, Lead, PriorityTag } from '../types'
import type { InfoScoreRuntime } from '../utils/infoScoreRules'
import { LeadConsultingHub, type ConsultingHubTab } from './LeadConsultingHub'

type RailMode = 'hub' | 'analyze'

/**
 * Cột phải hồ sơ — gợi ý gọi / mẫu / tri thức / phân tích AI trong cùng khung với Phân công & Lịch sử.
 */
export function LeadDetailAssistRail({
  lead,
  playbooks,
  canRunAssistant,
  infoScoreRuntime,
  priorityTag,
  calculatedScore,
  analyzePanel,
  initialHubTab = 'assist',
  onGoToProfile,
}: {
  lead: Lead
  playbooks: ConsultingPlaybook[]
  canRunAssistant?: boolean
  infoScoreRuntime?: InfoScoreRuntime | null
  priorityTag?: PriorityTag
  calculatedScore?: number
  /** Khối «Chạy phân tích AI» (tác vụ LLM) — truyền từ LeadDetailPanel. */
  analyzePanel?: ReactNode
  initialHubTab?: ConsultingHubTab
  onGoToProfile?: () => void
}) {
  const [mode, setMode] = useState<RailMode>('hub')
  const [hubTab, setHubTab] = useState<ConsultingHubTab>(initialHubTab)

  useEffect(() => {
    setHubTab(initialHubTab)
  }, [initialHubTab, lead.id])

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-emerald-200/80 bg-white shadow-sm">
      <div className="flex shrink-0 gap-1 border-b border-emerald-100 bg-gradient-to-r from-emerald-50/90 to-white p-1">
        <button
          type="button"
          onClick={() => setMode('hub')}
          className={[
            'inline-flex flex-1 items-center justify-center gap-1 rounded-lg px-2 py-1.5 text-[11px] font-bold transition',
            mode === 'hub'
              ? 'bg-emerald-600 text-white shadow-sm'
              : 'bg-white text-emerald-900 hover:bg-emerald-50',
          ].join(' ')}
        >
          <Wand2 className="h-3.5 w-3.5 shrink-0" aria-hidden />
          Gợi ý &amp; mẫu
        </button>
        <button
          type="button"
          onClick={() => setMode('analyze')}
          className={[
            'inline-flex flex-1 items-center justify-center gap-1 rounded-lg px-2 py-1.5 text-[11px] font-bold transition',
            mode === 'analyze'
              ? 'bg-violet-600 text-white shadow-sm'
              : 'bg-white text-violet-900 hover:bg-violet-50',
          ].join(' ')}
        >
          <Sparkles className="h-3.5 w-3.5 shrink-0" aria-hidden />
          Phân tích AI
        </button>
      </div>

      {mode === 'hub' ? (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-1.5 sm:p-2">
          <p className="mb-1.5 shrink-0 text-[10px] leading-snug text-slate-600">
            Gõ lời khách → bấm gợi ý. Chip / mẫu / tri thức nằm các tab bên dưới — hồ sơ vẫn xem được bên trái.
          </p>
          <LeadConsultingHub
            lead={lead}
            playbooks={playbooks}
            canRunAssistant={canRunAssistant}
            initialTab={hubTab}
            infoScoreRuntime={infoScoreRuntime}
            priorityTag={priorityTag}
            calculatedScore={calculatedScore}
            compact
            onGoToProfile={onGoToProfile}
            onGoToAi={() => setMode('analyze')}
            onTabChange={setHubTab}
          />
        </div>
      ) : (
        <div className="scroll-touch min-h-0 flex-1 overflow-y-auto overscroll-contain p-2 sm:p-3">
          <div className="mb-2 flex items-start gap-2 rounded-lg border border-violet-100 bg-violet-50/80 px-2.5 py-2">
            <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-violet-700" aria-hidden />
            <p className="text-[11px] leading-snug text-violet-950">
              Phân tích sâu hồ sơ (sau gọi / khi cần chiến lược). Trong lúc gọi ưu tiên tab «Gợi ý &amp; mẫu».
            </p>
          </div>
          {analyzePanel ?? (
            <p className="text-sm text-slate-500">Chưa bật quyền phân tích AI trên tài khoản này.</p>
          )}
          <div className="mt-3 flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => {
                setMode('hub')
                setHubTab('assist')
              }}
              className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-900"
            >
              <Wand2 className="h-3 w-3" /> Quay gợi ý gọi
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('hub')
                setHubTab('playbook')
              }}
              className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700"
            >
              <BookOpen className="h-3 w-3" /> Mẫu tư vấn
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('hub')
                setHubTab('knowledge')
              }}
              className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700"
            >
              <Library className="h-3 w-3" /> Tri thức
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
