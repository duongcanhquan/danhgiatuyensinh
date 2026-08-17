import { useMemo, useState } from 'react'
import { ClipboardList, Loader2, Sparkles, Wand2 } from 'lucide-react'
import type { OmicallActiveCall } from '../contexts/OmicallProvider'
import { useCallSessionDraft } from '../contexts/CallSessionDraftProvider'
import { useAuth } from '../hooks/useAuth'
import { getFirestoreDb } from '../services/firebase'
import { saveCallSessionInteraction } from '../services/saveCallSessionInteraction'
import { resolveAIIntegrationConfig } from '../utils/aiEngine'
import { useCallSessionConfigOptional } from '../contexts/CallSessionConfigContext'
import { useInfoScoreRules } from '../contexts/InfoScoreRulesContext'
import { useLeadClassificationRules } from '../contexts/LeadClassificationRulesContext'
import { useLeadScoring } from '../hooks/useLeadScoring'
import { CALL_OUTCOME_QUICK_OPTIONS } from '../utils/callSessionCatalog'
import {
  buildPicksFromSelections,
  composeEvaluationCounselorNote,
  validateEvaluationSelections,
} from '../utils/callSessionEvaluation'
import { evaluateCallAiEligibility } from '../utils/callSessionAiEligibility'
import { appAlert } from '../utils/appNotify'
import {
  callFormVariantForWorkMode,
  filterDimensionsForCallForm,
  type CallFormVariant,
} from '../utils/callSessionFormVariant'
import { behaviorScoreFromSelections, formatBehaviorDelta } from '../utils/callSessionBehaviorScore'
import { CALL_DISPOSITIONS, isCallDispositionId } from '../utils/callWorkQueue'
import type { CallAiAssessment, Lead, LeadWorkMode } from '../types'
import { CallSessionEvaluationBoard } from './CallSessionEvaluationBoard'
import { ConsultingCallLiveStrip } from './ConsultingCallLiveStrip'

type Props = {
  call: OmicallActiveCall
  institutionalRagBlock?: string
  /** Ưu tiên hơn `workMode` nếu truyền. */
  callFormVariant?: CallFormVariant
  /** Chế độ xử lý hồ sơ — suy ra short/full khi chưa truyền variant. */
  workMode?: LeadWorkMode
  onSaved?: (result: { callAiAssessment?: CallAiAssessment }) => void
  onClose: () => void
}

export function CallSessionQuickPanel({
  call,
  institutionalRagBlock,
  callFormVariant: callFormVariantProp,
  workMode: workModeProp,
  onSaved,
  onClose,
}: Props) {
  const { profile, canRunLlmAnalysis } = useAuth()
  const { draft, setFreeNote, setCallOutcome, setDispositionId, resetDraft } = useCallSessionDraft()
  const { dimensions: configDimensions } = useCallSessionConfigOptional()
  const { runtime: infoScoreRuntime } = useInfoScoreRules()
  const { runtime: classificationRuntime } = useLeadClassificationRules()
  const { activeScoringProfile, schoolTvvSignalDefs, masterBuckets } = useLeadScoring([])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [lastAi, setLastAi] = useState<CallAiAssessment | null>(null)

  const aiReady = Boolean(resolveAIIntegrationConfig()?.apiKey?.trim())
  const showAiOption = canRunLlmAnalysis && aiReady
  const isWrapup = call.phase === 'wrapup' || call.state === 'ended'

  const workMode = workModeProp ?? call.workMode
  const formVariant = callFormVariantProp ?? callFormVariantForWorkMode(workMode)
  const dimensions = useMemo(
    () => filterDimensionsForCallForm(configDimensions, formVariant),
    [configDimensions, formVariant],
  )
  const isShortForm = formVariant === 'short'

  const behaviorPreview = useMemo(
    () => behaviorScoreFromSelections(dimensions, draft.selections),
    [dimensions, draft.selections],
  )

  const picksPreview = useMemo(
    () => buildPicksFromSelections(dimensions, draft.selections),
    [dimensions, draft.selections],
  )

  const aiEligibility = useMemo(() => {
    const note = composeEvaluationCounselorNote(picksPreview, draft.freeNote)
    return evaluateCallAiEligibility({
      counselorNote: note,
      evaluationPicks: picksPreview,
      freeNote: draft.freeNote,
    })
  }, [picksPreview, draft.freeNote])

  const onSave = async (withAi: boolean) => {
    if (!profile || !call.leadId) {
      setErr('Thiếu hồ sơ hoặc chưa đăng nhập.')
      return
    }
    const valid = validateEvaluationSelections(dimensions, draft.selections)
    if (!valid.ok) {
      setErr(valid.message)
      return
    }
    if (!draft.dispositionId) {
      setErr('Chọn một kết quả sau gọi (note) trước khi lưu.')
      return
    }
    const db = getFirestoreDb()
    if (!db) {
      setErr('Chưa kết nối Firestore.')
      return
    }
    setBusy(true)
    setErr(null)
    try {
      const cfg = withAi ? resolveAIIntegrationConfig() : null
      if (withAi && !cfg?.apiKey?.trim()) {
        setErr('Chưa có khóa AI — nhờ Siêu quản trị cấu hình Vercel hoặc Cài đặt → LLM.')
        return
      }
      if (withAi && !aiEligibility.ok) {
        setErr(aiEligibility.reason)
        return
      }
      const picks = buildPicksFromSelections(dimensions, draft.selections)
      const result = await saveCallSessionInteraction(db, profile, {
        leadId: call.leadId,
        callUid: call.uid,
        evaluationPicks: picks,
        freeNote: draft.freeNote,
        callOutcome: draft.callOutcome,
        dispositionId: draft.dispositionId,
        durationSeconds: call.durationSec > 0 ? call.durationSec : undefined,
        direction: call.direction,
        phone: call.phone,
        runAi: withAi && showAiOption && aiEligibility.ok,
        aiConfig: cfg,
        institutionalRagBlock,
        scoring: activeScoringProfile
          ? {
              profile: activeScoringProfile,
              masterBuckets,
              schoolDefs: schoolTvvSignalDefs,
              infoScoreRuntime,
              classificationRuntime: classificationRuntime.enabled ? classificationRuntime : null,
            }
          : undefined,
      })
      setLastAi(result.callAiAssessment ?? null)
      if (result.aiSkippedReason) {
        // Đã lưu đánh giá; AI bị bỏ qua — báo nhẹ, vẫn đóng panel.
        appAlert(result.aiSkippedReason, 'info')
      }
      onSaved?.({ callAiAssessment: result.callAiAssessment })
      resetDraft()
      onClose()
    } catch (e) {
      console.error(e)
      setErr(e instanceof Error ? e.message : 'Không lưu được đánh giá cuộc gọi.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-3 border-t border-white/10 pt-3">
      {call.leadId && !isWrapup ? (
        <ConsultingCallLiveStrip
          lead={
            {
              id: call.leadId,
              fullName: call.leadName || call.phone || 'Hồ sơ',
              phone: call.phone,
              educationLevel: 'Khác',
              priorityTag: 'WARM',
            } as Lead
          }
          canUseLlm={showAiOption}
        />
      ) : null}

      <div className="flex items-start gap-2">
        <ClipboardList className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" aria-hidden />
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-amber-200/90">
            {isWrapup ? 'Bảng đánh giá sau cuộc gọi' : 'Bảng đánh giá trực tiếp'}
          </p>
          <p className="mt-0.5 text-xs leading-snug text-violet-200/85">
            {isShortForm ? (
              <>
                Chọn <strong className="text-white">kết quả sau gọi</strong> là đủ để lưu. Bảng đánh giá bên dưới{' '}
                <strong className="text-white">không bắt buộc</strong> — dùng khi khách còn ngần ngại hoặc cần ghi
                thái độ / sẵn sàng / rào cản.
              </>
            ) : (
              <>
                Tick hành vi TVV để cộng/trừ điểm ngay. Phần dưới đánh giá khách/hồ sơ. Mục có{' '}
                <span className="text-rose-300">*</span> là bắt buộc.
              </>
            )}
          </p>
        </div>
      </div>

      <label className="block text-[10px] font-semibold uppercase tracking-wide text-violet-200">
        Kết quả cuộc gọi
        <select
          value={draft.callOutcome}
          disabled={busy}
          onChange={(e) => setCallOutcome(e.target.value as typeof draft.callOutcome)}
          className="mt-1 w-full rounded-lg border border-white/20 bg-slate-900/60 px-2 py-1.5 text-xs text-white outline-none focus:ring-2 focus:ring-amber-400/40"
        >
          {CALL_OUTCOME_QUICK_OPTIONS.map((o) => (
            <option key={o.value} value={o.value} className="bg-slate-900 text-white">
              {o.label}
            </option>
          ))}
        </select>
      </label>

      <label className="block text-[10px] font-semibold uppercase tracking-wide text-violet-200">
        Note sau gọi <span className="text-rose-300">*</span>
        <select
          value={draft.dispositionId ?? ''}
          disabled={busy}
          onChange={(e) => {
            const v = e.target.value
            setDispositionId(v && isCallDispositionId(v) ? v : null)
          }}
          className="mt-1 w-full rounded-lg border border-white/20 bg-slate-900/60 px-2 py-1.5 text-xs text-white outline-none focus:ring-2 focus:ring-amber-400/40"
        >
          <option value="" className="bg-slate-900 text-white">
            — Chọn một kết quả —
          </option>
          {CALL_DISPOSITIONS.map((d) => (
            <option key={d.id} value={d.id} className="bg-slate-900 text-white">
              {d.label}
            </option>
          ))}
        </select>
      </label>

      {dimensions.length > 0 ? (
        <div className="max-h-[min(42vh,360px)] overflow-y-auto overscroll-contain pr-0.5">
          <CallSessionEvaluationBoard dimensions={dimensions} disabled={busy} />
        </div>
      ) : (
        <p className="rounded-lg border border-white/10 bg-white/[0.04] px-2 py-1.5 text-[11px] text-violet-200/90">
          Form gọn — chỉ cần chọn kết quả sau gọi rồi lưu.
        </p>
      )}

      {picksPreview.length > 0 ? (
        <p className="rounded-lg border border-white/10 bg-white/[0.04] px-2 py-1.5 text-[10px] text-violet-200/90">
          Đã chọn {picksPreview.length} mục
          {behaviorPreview.behaviorPointsDelta !== 0
            ? ` · Hành vi: ${behaviorPreview.behaviorScore}/100 (${formatBehaviorDelta(behaviorPreview.behaviorPointsDelta)})`
            : ''}
        </p>
      ) : null}

      <label className="block text-[10px] font-semibold uppercase tracking-wide text-violet-200">
        Ghi chú thêm (tuỳ chọn)
        <textarea
          value={draft.freeNote}
          disabled={busy}
          onChange={(e) => setFreeNote(e.target.value)}
          rows={2}
          placeholder="Chi tiết không có trong các nút bấm…"
          className="mt-1 w-full resize-y rounded-lg border border-white/20 bg-slate-900/50 px-2 py-1.5 text-xs text-white placeholder:text-violet-300/50 outline-none focus:ring-2 focus:ring-amber-400/40"
        />
      </label>

      {showAiOption ? (
        <p className="flex flex-col gap-1 text-[11px] text-violet-100/95">
          <span className="inline-flex items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5 shrink-0 text-amber-300" aria-hidden />
            <strong className="text-white">Lưu &amp; AI</strong> chỉ chạy khi có đánh giá hoặc ghi chú đủ dài (tiết kiệm
            phí AI).
          </span>
          {!aiEligibility.ok ? (
            <span className="text-amber-200/90">{aiEligibility.reason}</span>
          ) : null}
        </p>
      ) : canRunLlmAnalysis && !aiReady ? (
        <p className="text-[11px] text-amber-200/90">Chưa cấu hình khóa AI — chỉ lưu đánh giá, không chạy phân tích.</p>
      ) : null}

      {err ? <p className="text-xs text-rose-300">{err}</p> : null}

      {lastAi ? (
        <div className="rounded-lg border border-emerald-400/30 bg-emerald-950/40 px-2 py-2 text-[11px] text-emerald-100">
          <p className="font-semibold text-emerald-50">Đã phân tích: {lastAi.mucDoSanSang}</p>
          <p className="mt-1 line-clamp-3">{lastAi.tomTatCuocGoi}</p>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => void onSave(false)}
          className="flex-1 rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-xs font-semibold text-white hover:bg-white/15 disabled:opacity-50"
        >
          {busy ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : 'Lưu đánh giá'}
        </button>
        {showAiOption ? (
          <button
            type="button"
            disabled={busy || !aiEligibility.ok}
            title={!aiEligibility.ok ? aiEligibility.reason : undefined}
            onClick={() => void onSave(true)}
            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-amber-400/50 bg-gradient-to-r from-violet-600 to-amber-600 px-3 py-2 text-xs font-bold text-white hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                <Wand2 className="h-3.5 w-3.5" aria-hidden />
                Lưu &amp; AI
              </>
            )}
          </button>
        ) : null}
      </div>
    </div>
  )
}
