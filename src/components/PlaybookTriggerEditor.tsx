import { Plus, Trash2 } from 'lucide-react'
import type { PlaybookTriggerCondition } from '../types'
import {
  formatMatchKeywords,
  newPlaybookConditionRow,
  parseMatchKeywords,
  playbookConditionsToRows,
  playbookRowsToConditions,
  type PlaybookConditionRow,
} from '../utils/playbookConditionRows'
import { PLAYBOOK_FIELD_OPTIONS, PLAYBOOK_OPERATOR_OPTIONS } from '../utils/playbookFieldOptions'

const inputCls =
  'mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-sky-300/60'
const labelCls = 'block text-sm font-medium text-slate-700'

export type PlaybookMatchConfig = {
  matchAllLeads: boolean
  triggerConditions: PlaybookTriggerCondition[]
  matchKeywords: string[]
}

export function playbookToMatchConfig(p: {
  matchAllLeads?: boolean
  triggerConditions?: PlaybookTriggerCondition[]
  matchKeywords?: string[]
}): PlaybookMatchConfig {
  return {
    matchAllLeads: Boolean(p.matchAllLeads),
    triggerConditions: p.triggerConditions ?? [],
    matchKeywords: p.matchKeywords ?? [],
  }
}

export function PlaybookTriggerEditor({
  value,
  onChange,
  disabled,
}: {
  value: PlaybookMatchConfig
  onChange: (next: PlaybookMatchConfig) => void
  disabled?: boolean
}) {
  const rows: PlaybookConditionRow[] =
    value.triggerConditions.length > 0
      ? playbookConditionsToRows(value.triggerConditions)
      : []

  const setRows = (nextRows: PlaybookConditionRow[]) => {
    onChange({
      ...value,
      triggerConditions: playbookRowsToConditions(nextRows),
    })
  }

  const displayRows = rows.length ? rows : []

  const addRow = () => {
    setRows([...displayRows, newPlaybookConditionRow()])
  }

  const updateRow = (id: string, patch: Partial<PlaybookConditionRow>) => {
    setRows(displayRows.map((r) => (r.id === id ? { ...r, ...patch } : r)))
  }

  const removeRow = (id: string) => {
    setRows(displayRows.filter((r) => r.id !== id))
  }

  const keywordsText = formatMatchKeywords(value.matchKeywords)

  return (
    <div className="space-y-4">
      <label className={`flex cursor-pointer items-start gap-2 ${labelCls}`}>
        <input
          type="checkbox"
          className="mt-1 h-4 w-4 rounded border-slate-300"
          checked={value.matchAllLeads}
          disabled={disabled}
          onChange={(e) => onChange({ ...value, matchAllLeads: e.target.checked })}
        />
        <span>
          Áp dụng mọi hồ sơ
          <span className="mt-0.5 block text-xs font-normal text-slate-500">
            Bật khi muốn TVV luôn thấy playbook này (ví dụ: kịch bản chung, quy trình chuẩn).
          </span>
        </span>
      </label>

      <div className="rounded-xl border border-slate-200/90 bg-slate-50/50 p-3 sm:p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-semibold text-slate-900">Điều kiện kích hoạt</p>
          <button
            type="button"
            disabled={disabled || value.matchAllLeads}
            onClick={addRow}
            className="inline-flex items-center gap-1 rounded-lg border border-sky-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-sky-800 hover:bg-sky-50 disabled:opacity-50"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden />
            Thêm điều kiện
          </button>
        </div>
        <p className="mt-1 text-xs text-slate-600">
          Tất cả dòng bên dưới phải đúng (AND). Để trống nếu chỉ dùng từ khóa hoặc «Áp dụng mọi hồ sơ».
        </p>
        {!displayRows.length ? (
          <p className="mt-3 text-xs text-slate-500">Chưa có điều kiện — bấm «Thêm điều kiện» hoặc dùng từ khóa bên dưới.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {displayRows.map((row, idx) => (
              <li
                key={row.id}
                className="grid gap-2 rounded-lg border border-slate-200/80 bg-white p-2.5 sm:grid-cols-[1fr_1fr_1.2fr_auto]"
              >
                <label className={labelCls}>
                  {idx === 0 ? 'Trường' : <span className="sr-only">Trường</span>}
                  <select
                    value={row.field}
                    disabled={disabled || value.matchAllLeads}
                    onChange={(e) => updateRow(row.id, { field: e.target.value as PlaybookConditionRow['field'] })}
                    className={inputCls}
                  >
                    {PLAYBOOK_FIELD_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={labelCls}>
                  {idx === 0 ? 'So sánh' : <span className="sr-only">So sánh</span>}
                  <select
                    value={row.operator}
                    disabled={disabled || value.matchAllLeads}
                    onChange={(e) =>
                      updateRow(row.id, { operator: e.target.value as PlaybookConditionRow['operator'] })
                    }
                    className={inputCls}
                  >
                    {PLAYBOOK_OPERATOR_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={`${labelCls} sm:col-span-1`}>
                  {idx === 0 ? 'Giá trị' : <span className="sr-only">Giá trị</span>}
                  <input
                    value={row.valueText}
                    disabled={disabled || value.matchAllLeads}
                    onChange={(e) => updateRow(row.id, { valueText: e.target.value })}
                    placeholder={
                      row.operator === 'IN' || row.operator === 'NOT_IN'
                        ? 'Hà Nội, Hồ Chí Minh, …'
                        : 'VD: HOT, Công nghệ thông tin'
                    }
                    className={inputCls}
                  />
                </label>
                <div className="flex items-end justify-end pb-0.5">
                  <button
                    type="button"
                    disabled={disabled || value.matchAllLeads}
                    onClick={() => removeRow(row.id)}
                    className="rounded-lg p-2 text-rose-600 hover:bg-rose-50 disabled:opacity-50"
                    aria-label="Xóa điều kiện"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <label className={labelCls}>
        Từ khóa liên quan
        <textarea
          value={keywordsText}
          disabled={disabled || value.matchAllLeads}
          onChange={(e) => onChange({ ...value, matchKeywords: parseMatchKeywords(e.target.value) })}
          rows={4}
          placeholder={'Mỗi dòng một từ khóa, ví dụ:\nCông nghệ thông tin\nhọc bổng\nHOT'}
          className={inputCls}
        />
        <span className="mt-1 block text-xs font-normal text-slate-500">
          Khớp nếu <strong>bất kỳ</strong> từ khóa xuất hiện trong hồ sơ (tỉnh, ngành, mô tả, ghi chú…). Có thể
          dùng riêng hoặc kết hợp với điều kiện phía trên.
        </span>
      </label>
    </div>
  )
}
