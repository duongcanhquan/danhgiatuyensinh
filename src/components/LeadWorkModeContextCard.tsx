import type { LeadWorkMode } from '../types'
import {
  leadWorkModeHint,
  leadWorkModeLabel,
  leadWorkModePrimaryFocus,
  LEAD_WORK_MODES,
  parseLeadWorkMode,
} from '../utils/leadWorkMode'

type Props = {
  workMode: LeadWorkMode | undefined
  canEdit: boolean
  disabled?: boolean
  onChange: (next: LeadWorkMode | undefined) => void
}

/** Khối ngữ cảnh chế độ trên chi tiết — 1 quyết định chính, copy đời thường. */
export function LeadWorkModeContextCard({ workMode, canEdit, disabled, onChange }: Props) {
  const focus = leadWorkModePrimaryFocus(workMode)
  const focusCopy =
    focus === 'scoring'
      ? 'Ưu tiên xem điểm / nhãn HOT–WARM rồi gọi theo thứ tự.'
      : focus === 'care_dossier'
        ? 'Ưu tiên cập nhật hồ sơ, giấy tờ, đóng tiền và hẹn follow-up.'
        : 'Ưu tiên gọi và chọn note sau gọi (Quan tâm cao / Không quan tâm…).'

  return (
    <div
      className="rounded-xl border border-slate-200/90 bg-white/95 p-2 shadow-sm ring-1 ring-slate-200/60 sm:p-2.5"
      data-work-focus={focus}
    >
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
        Chế độ xử lý
      </p>
      <label className="mt-1 block text-xs font-medium text-slate-800">
        <span className="sr-only">Chọn chế độ xử lý</span>
        <select
          value={workMode ?? ''}
          disabled={!canEdit || disabled}
          onChange={(e) => onChange(parseLeadWorkMode(e.target.value))}
          className="mt-0.5 w-full cursor-pointer rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-900 outline-none transition-colors duration-200 focus:ring-1 focus:ring-[var(--color-primary)]/40 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <option value="">Chưa chọn</option>
          {LEAD_WORK_MODES.map((m) => (
            <option key={m} value={m}>
              {leadWorkModeLabel(m)}
            </option>
          ))}
        </select>
      </label>
      <p className="mt-1.5 text-[11px] leading-snug text-slate-600" role="note">
        {workMode ? (
          <>
            <span className="font-semibold text-slate-800">{leadWorkModeLabel(workMode)}</span>
            {' — '}
            {leadWorkModeHint(workMode)}. {focusCopy}
          </>
        ) : (
          <>Chưa gán chế độ — hệ thống gợi ý thao tác gọi nhanh. Gán khi biết nguồn / chiến dịch.</>
        )}
      </p>
    </div>
  )
}
