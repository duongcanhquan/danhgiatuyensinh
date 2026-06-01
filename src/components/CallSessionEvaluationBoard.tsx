import type { CallEvalDimension } from '../types'
import { useCallSessionDraft } from '../contexts/CallSessionDraftProvider'

type Props = {
  dimensions: readonly CallEvalDimension[]
  disabled?: boolean
}

export function CallSessionEvaluationBoard({ dimensions, disabled }: Props) {
  const { toggleOption, isOptionSelected } = useCallSessionDraft()

  return (
    <div className="space-y-3" role="group" aria-label="Bảng đánh giá trực tiếp">
      {dimensions.map((dim) => (
        <div
          key={dim.id}
          className="rounded-xl border border-white/12 bg-slate-950/40 p-2.5"
        >
          <div className="mb-2 flex flex-wrap items-baseline justify-between gap-1">
            <p className="text-[11px] font-bold leading-snug text-violet-100">
              {dim.label}
              {dim.required ? <span className="ml-1 text-rose-300">*</span> : null}
            </p>
            <span className="text-[9px] font-medium uppercase tracking-wide text-violet-400/90">
              {dim.selectionMode === 'single' ? 'Chọn một' : 'Chọn nhiều'}
            </span>
          </div>
          {dim.hint ? (
            <p className="mb-2 text-[10px] leading-snug text-violet-300/75">{dim.hint}</p>
          ) : null}
          <div className="flex flex-wrap gap-1.5">
            {dim.options.map((opt) => {
              const on = isOptionSelected(dim.id, opt.id)
              return (
                <button
                  key={opt.id}
                  type="button"
                  disabled={disabled}
                  onClick={() => toggleOption(dim, opt.id)}
                  className={[
                    'min-h-[2rem] rounded-lg border px-2.5 py-1.5 text-left text-[11px] font-medium leading-snug transition',
                    on
                      ? 'border-amber-400/70 bg-amber-500/30 text-amber-50 shadow-[0_0_12px_rgba(251,191,36,0.2)]'
                      : 'border-white/15 bg-white/[0.06] text-violet-100 hover:border-white/30 hover:bg-white/10',
                  ].join(' ')}
                  aria-pressed={on}
                >
                  {opt.label}
                </button>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
