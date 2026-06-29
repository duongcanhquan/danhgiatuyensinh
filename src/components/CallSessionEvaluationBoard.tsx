import { useMemo } from 'react'
import type { CallEvalDimension } from '../types'
import { useCallSessionDraft } from '../contexts/CallSessionDraftProvider'
import {
  behaviorScoreFromSelections,
  formatBehaviorDelta,
  sumBehaviorPointsFromSelections,
} from '../utils/callSessionBehaviorScore'
import { isScoringDimension } from '../utils/callSessionBehaviorCatalog'

type Props = {
  dimensions: readonly CallEvalDimension[]
  disabled?: boolean
}

function groupBorderClass(group: CallEvalDimension['scoringGroup']): string {
  if (group === 'positive') return 'border-emerald-400/35 bg-emerald-950/25'
  if (group === 'negative') return 'border-rose-400/35 bg-rose-950/20'
  if (group === 'process') return 'border-sky-400/35 bg-sky-950/20'
  return 'border-white/12 bg-slate-950/40'
}

function optionButtonClass(on: boolean, points: number | undefined, group: CallEvalDimension['scoringGroup']): string {
  if (!on) {
    return 'border-white/15 bg-white/[0.06] text-violet-100 hover:border-white/30 hover:bg-white/10'
  }
  if (typeof points === 'number') {
    if (points > 0) return 'border-emerald-400/70 bg-emerald-500/25 text-emerald-50 shadow-[0_0_10px_rgba(52,211,153,0.15)]'
    if (points < 0) return 'border-rose-400/70 bg-rose-500/25 text-rose-50 shadow-[0_0_10px_rgba(251,113,133,0.15)]'
  }
  if (group === 'negative') return 'border-rose-400/60 bg-rose-500/20 text-rose-50'
  return 'border-amber-400/70 bg-amber-500/30 text-amber-50 shadow-[0_0_12px_rgba(251,191,36,0.2)]'
}

function DimensionBlock({
  dim,
  disabled,
  toggleOption,
  isOptionSelected,
}: {
  dim: CallEvalDimension
  disabled?: boolean
  toggleOption: (dimension: CallEvalDimension, optionId: string) => void
  isOptionSelected: (dimensionId: string, optionId: string) => boolean
}) {
  const scoring = isScoringDimension(dim)

  return (
    <div className={`rounded-xl border p-2.5 ${groupBorderClass(dim.scoringGroup)}`}>
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-1">
        <p className="text-[11px] font-bold leading-snug text-violet-100">
          {dim.label}
          {dim.required ? <span className="ml-1 text-rose-300">*</span> : null}
          {scoring && dim.scoringGroup === 'positive' ? (
            <span className="ml-2 rounded bg-emerald-500/20 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-emerald-200">
              Tích cực
            </span>
          ) : null}
          {scoring && dim.scoringGroup === 'negative' ? (
            <span className="ml-2 rounded bg-rose-500/20 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-rose-200">
              Tiêu cực
            </span>
          ) : null}
          {scoring && dim.scoringGroup === 'process' ? (
            <span className="ml-2 rounded bg-sky-500/20 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-sky-200">
              Quy trình
            </span>
          ) : null}
        </p>
        <span className="text-[9px] font-medium uppercase tracking-wide text-violet-400/90">
          {dim.selectionMode === 'single' ? 'Chọn một' : 'Chọn nhiều'}
        </span>
      </div>
      {dim.hint ? <p className="mb-2 text-[10px] leading-snug text-violet-300/75">{dim.hint}</p> : null}
      <div className="flex flex-wrap gap-1.5">
        {dim.options.map((opt) => {
          const on = isOptionSelected(dim.id, opt.id)
          const pts = typeof opt.points === 'number' ? opt.points : undefined
          return (
            <button
              key={opt.id}
              type="button"
              disabled={disabled}
              onClick={() => toggleOption(dim, opt.id)}
              className={[
                'inline-flex min-h-[2rem] max-w-full items-start gap-1.5 rounded-lg border px-2.5 py-1.5 text-left text-[11px] font-medium leading-snug transition',
                optionButtonClass(on, pts, dim.scoringGroup),
              ].join(' ')}
              aria-pressed={on}
            >
              <span className="min-w-0 flex-1">{opt.label}</span>
              {pts !== undefined ? (
                <span
                  className={[
                    'shrink-0 rounded px-1 py-0.5 text-[10px] font-bold tabular-nums',
                    pts > 0 ? 'bg-emerald-400/20 text-emerald-100' : pts < 0 ? 'bg-rose-400/20 text-rose-100' : 'bg-white/10',
                  ].join(' ')}
                >
                  {formatBehaviorDelta(pts)}
                </span>
              ) : null}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export function CallSessionEvaluationBoard({ dimensions, disabled }: Props) {
  const { draft, toggleOption, isOptionSelected } = useCallSessionDraft()

  const { scoringDims, profileDims } = useMemo(() => {
    const scoring: CallEvalDimension[] = []
    const profile: CallEvalDimension[] = []
    for (const d of dimensions) {
      if (isScoringDimension(d)) scoring.push(d)
      else profile.push(d)
    }
    return { scoringDims: scoring, profileDims: profile }
  }, [dimensions])

  const behaviorLive = useMemo(
    () => behaviorScoreFromSelections(dimensions, draft.selections),
    [dimensions, draft.selections],
  )
  const deltaLive = useMemo(
    () => sumBehaviorPointsFromSelections(dimensions, draft.selections),
    [dimensions, draft.selections],
  )
  const hasScoring = scoringDims.length > 0

  return (
    <div className="space-y-3" role="group" aria-label="Bảng đánh giá trực tiếp">
      {hasScoring ? (
        <>
          <div
            className="sticky top-0 z-10 rounded-xl border border-amber-400/40 bg-slate-950/95 px-3 py-2 backdrop-blur-sm"
            aria-live="polite"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-[10px] font-bold uppercase tracking-wide text-amber-200/90">Điểm hành vi cuộc gọi</p>
              <div className="flex items-baseline gap-2">
                <span className="text-lg font-bold tabular-nums text-white">{behaviorLive.behaviorScore}</span>
                <span className="text-[10px] text-violet-300/80">/ 100</span>
                {deltaLive !== 0 ? (
                  <span
                    className={[
                      'rounded px-1.5 py-0.5 text-[11px] font-bold tabular-nums',
                      deltaLive > 0 ? 'bg-emerald-500/20 text-emerald-200' : 'bg-rose-500/20 text-rose-200',
                    ].join(' ')}
                  >
                    {formatBehaviorDelta(deltaLive)} điểm
                  </span>
                ) : (
                  <span className="text-[10px] text-violet-400">Tick hành vi để cộng/trừ</span>
                )}
              </div>
            </div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/10">
              <div
                className={[
                  'h-full rounded-full transition-all duration-200',
                  behaviorLive.behaviorScore >= 70
                    ? 'bg-emerald-400'
                    : behaviorLive.behaviorScore >= 50
                      ? 'bg-amber-400'
                      : 'bg-rose-400',
                ].join(' ')}
                style={{ width: `${behaviorLive.behaviorScore}%` }}
              />
            </div>
          </div>

          <div className="space-y-3">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-200/80">Hành vi TVV (có điểm)</p>
            {scoringDims.map((dim) => (
              <DimensionBlock
                key={dim.id}
                dim={dim}
                disabled={disabled}
                toggleOption={toggleOption}
                isOptionSelected={isOptionSelected}
              />
            ))}
          </div>

          {profileDims.length > 0 ? (
            <p className="pt-1 text-[10px] font-semibold uppercase tracking-wide text-violet-300/70">
              Đánh giá khách / hồ sơ
            </p>
          ) : null}
        </>
      ) : null}

      {profileDims.map((dim) => (
        <DimensionBlock
          key={dim.id}
          dim={dim}
          disabled={disabled}
          toggleOption={toggleOption}
          isOptionSelected={isOptionSelected}
        />
      ))}
    </div>
  )
}
