import { AlertTriangle, BookOpen, ClipboardCopy, Library, Sparkles, Target } from 'lucide-react'
import type { ConsultingPlaybook, KnowledgeDocument, Lead, PriorityTag } from '../types'
import type { InfoScoreRuntime } from '../utils/infoScoreRules'
import {
  buildLeadConsultingInsights,
  INFO_GAP_FORM_HINT,
} from '../utils/leadConsultingInsights'
import { TagBadge } from './TagBadge'
import { MlWinGauge } from './MlWinGauge'
import type { ConsultingHubTab } from './LeadConsultingHub'

export function LeadConsultingOverviewPanel({
  lead,
  playbooks,
  knowledgeDocs,
  infoScoreRuntime,
  priorityTag,
  calculatedScore,
  showDraftHint,
  onNavigateTab,
  onGoToProfile,
  onGoToAi,
}: {
  lead: Lead
  playbooks: ConsultingPlaybook[]
  knowledgeDocs: KnowledgeDocument[]
  infoScoreRuntime?: InfoScoreRuntime | null
  priorityTag?: PriorityTag
  calculatedScore?: number
  showDraftHint?: boolean
  onNavigateTab: (tab: ConsultingHubTab, opts?: { knowledgeDocId?: string }) => void
  onGoToProfile?: () => void
  onGoToAi?: () => void
}) {
  const insights = buildLeadConsultingInsights(lead, playbooks, knowledgeDocs, {
    infoScoreRuntime,
    priorityTag,
    calculatedScore,
  })

  const weakInfo = insights.infoPercent < 55
  const hasGaps = insights.infoGaps.length > 0

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overscroll-contain pr-0.5">
      {showDraftHint ? (
        <p className="shrink-0 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-950 sm:text-sm">
          Gợi ý theo thông tin form (kể cả chưa lưu). Lưu hồ sơ để đồng bộ hệ thống.
        </p>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-3">
        <section className="rounded-xl border border-violet-200/80 bg-gradient-to-br from-violet-50/90 to-white p-3 sm:p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-violet-900">Điểm thông tin</p>
          <div className="mt-2 flex items-center gap-3">
            <MlWinGauge value={insights.infoPercent} />
            <div>
              <p className="text-2xl font-bold tabular-nums text-violet-950">{insights.infoPercent}%</p>
              <p className="mt-0.5 text-xs leading-snug text-violet-800/90">
                {weakInfo ? 'Hồ sơ còn thiếu nhiều dữ liệu' : 'Mức đầy đủ ổn'}
              </p>
            </div>
          </div>
          <p className="mt-2 text-xs leading-relaxed text-slate-600">{insights.infoExplanation}</p>
          {insights.infoSource === 'firestore' ? (
            <p className="mt-1 text-[11px] text-slate-500">
              % đã lưu trên hồ sơ — danh sách thiếu bên dưới tính theo form hiện tại.
            </p>
          ) : null}
        </section>

        <section className="rounded-xl border border-emerald-200/80 bg-gradient-to-br from-emerald-50/80 to-white p-3 sm:p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-900">Chấm điểm lead</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {insights.priorityTag ? <TagBadge tag={insights.priorityTag} /> : null}
            <span className="text-2xl font-bold tabular-nums text-emerald-950">
              {insights.calculatedScore != null ? insights.calculatedScore : '—'}
            </span>
            <span className="text-xs text-emerald-800">điểm</span>
          </div>
          <p className="mt-2 text-xs leading-relaxed text-slate-600">
            Nhãn và điểm theo bộ chấm đang chọn — dùng khi lọc HOT/WARM và khớp playbook điều kiện nhãn.
          </p>
        </section>

        <section className="rounded-xl border border-amber-200/80 bg-gradient-to-br from-amber-50/80 to-white p-3 sm:p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-900">Gợi ý nhanh</p>
          <ul className="mt-2 space-y-1.5 text-sm text-slate-800">
            <li>
              <strong className="text-amber-950">{insights.playbookMatches.length}</strong> playbook khớp
            </li>
            <li>
              <strong className="text-amber-950">{insights.topKnowledge.filter((x) => x.score >= 58).length}</strong>{' '}
              tài liệu liên quan hồ sơ
            </li>
            {hasGaps ? (
              <li className="text-rose-800">
                Có thể cộng thêm ~<strong>{insights.potentialInfoGain}</strong> điểm thông tin nếu bổ sung trường thiếu
              </li>
            ) : (
              <li className="text-emerald-800">Các trường chính đã đủ — tập trung tư vấn & chốt</li>
            )}
          </ul>
        </section>
      </div>

      <section className="rounded-xl border border-rose-200/80 bg-rose-50/40 p-3 sm:p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-rose-700" aria-hidden />
            <div>
              <h3 className="text-sm font-semibold text-rose-950">Điểm yếu / thiếu thông tin</h3>
              <p className="mt-0.5 text-xs text-rose-900/80">
                Ưu tiên hỏi và ghi nhận các mục sau khi gọi điện hoặc chat — càng đầy càng chấm và gợi ý chính xác.
              </p>
            </div>
          </div>
          {onGoToProfile ? (
            <button
              type="button"
              onClick={onGoToProfile}
              className="shrink-0 rounded-lg border border-rose-300/80 bg-white px-2.5 py-1.5 text-xs font-semibold text-rose-900 hover:bg-rose-50"
            >
              Mở form hồ sơ
            </button>
          ) : null}
        </div>
        {hasGaps ? (
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {insights.infoGaps.map((g) => (
              <li
                key={g.id}
                className="rounded-lg border border-rose-200/60 bg-white/90 px-3 py-2 text-sm text-slate-800"
              >
                <span className="font-medium text-slate-900">{g.label}</span>
                <span className="ml-1.5 text-xs font-semibold text-rose-700">+{g.pointsIfMatch} điểm</span>
                {INFO_GAP_FORM_HINT[g.id] ? (
                  <p className="mt-0.5 text-[11px] text-slate-500">Trên form: {INFO_GAP_FORM_HINT[g.id]}</p>
                ) : null}
                {g.hint ? <p className="mt-0.5 text-[11px] text-slate-600">{g.hint}</p> : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-emerald-800">Không còn trường thiếu trong bộ điểm thông tin đang bật.</p>
        )}
      </section>

      <div className="grid gap-3 lg:grid-cols-2">
        <section className="rounded-xl border border-amber-200/70 bg-white p-3 sm:p-4">
          <div className="flex items-center justify-between gap-2">
            <h3 className="flex items-center gap-1.5 text-sm font-semibold text-amber-950">
              <BookOpen className="h-4 w-4" aria-hidden />
              Playbook phù hợp
            </h3>
            <button
              type="button"
              onClick={() => onNavigateTab('playbook')}
              className="text-xs font-semibold text-amber-800 hover:underline"
            >
              Xem tất cả
            </button>
          </div>
          {insights.playbookMatches.length ? (
            <ul className="mt-2 space-y-2">
              {insights.playbookMatches.slice(0, 3).map((m) => (
                <li key={m.playbook.id} className="rounded-lg border border-amber-100 bg-amber-50/50 px-2.5 py-2 text-sm">
                  <p className="font-medium text-slate-900">{m.playbook.title}</p>
                  <p className="mt-0.5 line-clamp-2 text-xs text-slate-600">{m.playbook.strategy}</p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-xs text-slate-600">
              Chưa khớp playbook — kiểm tra ngành, tỉnh, nhãn trên hồ sơ hoặc thêm từ khóa trong Cài đặt → Thông tin TV.
            </p>
          )}
        </section>

        <section className="rounded-xl border border-amber-200/70 bg-white p-3 sm:p-4">
          <div className="flex items-center justify-between gap-2">
            <h3 className="flex items-center gap-1.5 text-sm font-semibold text-amber-950">
              <Library className="h-4 w-4" aria-hidden />
              Tri thức nên đọc
            </h3>
            <button
              type="button"
              onClick={() => onNavigateTab('knowledge')}
              className="text-xs font-semibold text-amber-800 hover:underline"
            >
              Tra cứu đầy đủ
            </button>
          </div>
          {insights.topKnowledge.length ? (
            <ul className="mt-2 space-y-2">
              {insights.topKnowledge.slice(0, 4).map(({ doc, score }) => (
                <li key={doc.id}>
                  <button
                    type="button"
                    onClick={() => onNavigateTab('knowledge', { knowledgeDocId: doc.id })}
                    className="w-full rounded-lg border border-slate-200/80 bg-slate-50/80 px-2.5 py-2 text-left text-sm transition hover:border-amber-300 hover:bg-amber-50/60"
                  >
                    <span className="font-medium text-slate-900">{doc.title}</span>
                    <span className="mt-0.5 block text-[11px] text-amber-800">
                      {score >= 58 ? 'Liên quan hồ sơ' : score >= 50 ? 'Tư vấn chung' : 'Tra cứu thêm'}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-xs text-slate-600">Chưa có tài liệu — thêm tại Cài đặt → Tri thức tuyển sinh.</p>
          )}
        </section>
      </div>

      <section className="rounded-xl border border-slate-200/80 bg-slate-50/60 p-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">Hành động tiếp theo</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => onNavigateTab('playbook')}
            className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-500 px-3 py-2 text-xs font-semibold text-white shadow-sm hover:bg-amber-600"
          >
            <Target className="h-3.5 w-3.5" aria-hidden />
            Kịch bản tư vấn
          </button>
          <button
            type="button"
            onClick={() => onNavigateTab('knowledge')}
            className="inline-flex items-center gap-1.5 rounded-lg border border-amber-200 bg-white px-3 py-2 text-xs font-semibold text-amber-950 hover:bg-amber-50"
          >
            <Library className="h-3.5 w-3.5" aria-hidden />
            Tra cứu tri thức
          </button>
          <button
            type="button"
            onClick={() => onNavigateTab('scripts')}
            className="inline-flex items-center gap-1.5 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-semibold text-sky-900 hover:bg-sky-100"
          >
            <ClipboardCopy className="h-3.5 w-3.5" aria-hidden />
            Kịch bản Script Hub
          </button>
          {onGoToAi ? (
            <button
              type="button"
              onClick={onGoToAi}
              className="inline-flex items-center gap-1.5 rounded-lg border border-violet-300 bg-violet-600 px-3 py-2 text-xs font-semibold text-white shadow-sm hover:bg-violet-700"
            >
              <Sparkles className="h-3.5 w-3.5" aria-hidden />
              Tư vấn AI
            </button>
          ) : null}
        </div>
      </section>
    </div>
  )
}
