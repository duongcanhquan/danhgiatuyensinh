import type { LeadWorkMode } from '../types'
import { BentoGrid } from './bento'
import {
  LEAD_WORK_MODES,
  leadWorkModeHint,
  leadWorkModeLabel,
  type LeadWorkModeSummary,
} from '../utils/leadWorkMode'

type Filter = 'all' | LeadWorkMode

type Props = {
  active: Filter
  summary: LeadWorkModeSummary
  onSelect: (next: Filter) => void
  className?: string
  /** Số đếm chỉ trên trang/mẫu đang tải (chưa fullScope). */
  sampleOnly?: boolean
}

/**
 * Bento «Chế độ xử lý» — một việc / một ô, bấm để lọc (ui-ux-pro-max + bento VietMy).
 */
export function LeadWorkModeBentoBoard({
  active,
  summary,
  onSelect,
  className = '',
  sampleOnly = false,
}: Props) {
  return (
    <div className={['space-y-1.5', className].filter(Boolean).join(' ')}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
          Cách làm việc — lọc danh sách{sampleOnly ? ' (trang này)' : ''}
        </p>
        <p className="text-[11px] text-slate-500" aria-live="polite">
          {active === 'all'
            ? sampleOnly
              ? 'Chọn ô để thu hẹp hồ sơ cần xử lý'
              : 'Chọn chế độ để lọc gọn danh sách'
            : `Đang lọc: ${leadWorkModeLabel(active)}`}
        </p>
      </div>
      <BentoGrid tight className="w-full !gap-2 sm:!grid-cols-2 lg:!grid-cols-4">
        <button
          type="button"
          onClick={() => onSelect('all')}
          aria-pressed={active === 'all'}
          className={[
            'bento-stat bento-cell cursor-pointer !p-2 text-left transition-colors duration-200',
            active === 'all'
              ? 'bento-cell--ink ring-2 ring-[var(--color-primary)]/40'
              : 'hover:border-[var(--color-primary)]/40',
          ].join(' ')}
          title="Bỏ lọc chế độ — vẫn giữ hàng chờ gọi / note nếu đang bật"
        >
          <p className="bento-stat__label !text-[10px]">Tất cả</p>
          <p className="bento-stat__value !text-lg tabular-nums">
            {summary.total.toLocaleString('vi-VN')}
          </p>
          <p className="bento-stat__hint !text-[10px] !leading-snug">
            Chưa gán: {summary.unset.toLocaleString('vi-VN')}
          </p>
        </button>
        {LEAD_WORK_MODES.map((mode) => {
          const selected = active === mode
          const tone =
            mode === 'care_close' ? 'accent' : mode === 'score_queue' ? 'ink' : 'default'
          return (
            <button
              key={mode}
              type="button"
              onClick={() => onSelect(mode)}
              aria-pressed={selected}
              className={[
                'bento-stat bento-cell cursor-pointer !p-2 text-left transition-colors duration-200',
                selected && tone === 'ink' ? 'bento-cell--ink' : '',
                selected && tone === 'accent' ? 'bento-cell--accent' : '',
                selected
                  ? 'ring-2 ring-[var(--color-primary)]/50'
                  : 'hover:border-[var(--color-primary)]/35',
              ]
                .filter(Boolean)
                .join(' ')}
              title={leadWorkModeHint(mode)}
            >
              <p className="bento-stat__label !text-[10px]">{leadWorkModeLabel(mode)}</p>
              <p className="bento-stat__value !text-lg tabular-nums">
                {summary[mode].toLocaleString('vi-VN')}
              </p>
              <p className="bento-stat__hint !text-[10px] !leading-snug">{leadWorkModeHint(mode)}</p>
            </button>
          )
        })}
      </BentoGrid>
    </div>
  )
}
