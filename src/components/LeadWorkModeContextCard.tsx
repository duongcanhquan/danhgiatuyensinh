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

const SELECT_ID = 'lead-work-mode-assign'

/**
 * Chi tiết hồ sơ: KHÔNG phải chỗ lọc danh sách.
 * Chỉ báo «hồ sơ này đang ở chế độ nào» + việc nên làm; đổi mode chỉ trong mục phụ.
 */
export function LeadWorkModeContextCard({ workMode, canEdit, disabled, onChange }: Props) {
  const focus = leadWorkModePrimaryFocus(workMode)
  const focusCopy =
    focus === 'scoring'
      ? 'Việc chính: xem điểm / HOT–WARM rồi gọi theo thứ tự.'
      : focus === 'care_dossier'
        ? 'Việc chính: tab Hồ sơ ứng viên (giấy tờ, đóng tiền) + hẹn follow-up.'
        : 'Việc chính: gọi và chọn note sau gọi (Quan tâm cao / Không…).'

  return (
    <div
      className="rounded-lg border border-slate-200/80 bg-slate-50/90 px-2 py-1.5 sm:px-2.5"
      data-work-focus={focus}
      role="status"
    >
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
        Việc trên hồ sơ này
      </p>
      <p className="mt-0.5 text-[11px] leading-snug text-slate-700">
        {workMode ? (
          <>
            <span className="font-semibold text-slate-900">{leadWorkModeLabel(workMode)}</span>
            {' — '}
            {leadWorkModeHint(workMode)}. {focusCopy}
          </>
        ) : (
          <>
            Chưa gán chế độ. Lọc danh sách ở <strong>ô chế độ phía trên</strong>; tại đây chỉ xử lý từng hồ sơ.
          </>
        )}
      </p>
      {canEdit ? (
        <details className="mt-1.5">
          <summary className="cursor-pointer list-none text-[10px] font-semibold text-slate-600 underline-offset-2 hover:underline marker:content-none [&::-webkit-details-marker]:hidden">
            Đổi chế độ của hồ sơ này…
          </summary>
          <label htmlFor={SELECT_ID} className="mt-1 block text-[10px] font-medium text-slate-600">
            Gán chế độ (không lọc bảng)
            <select
              id={SELECT_ID}
              value={workMode ?? ''}
              disabled={disabled}
              onChange={(e) => onChange(parseLeadWorkMode(e.target.value))}
              className="mt-0.5 w-full cursor-pointer rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-900 outline-none focus:ring-1 focus:ring-[var(--color-primary)]/40 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <option value="">Chưa chọn</option>
              {LEAD_WORK_MODES.map((m) => (
                <option key={m} value={m}>
                  {leadWorkModeLabel(m)}
                </option>
              ))}
            </select>
          </label>
        </details>
      ) : null}
    </div>
  )
}
