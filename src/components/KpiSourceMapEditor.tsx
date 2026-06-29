import { Plus, Trash2 } from 'lucide-react'
import type { KpiSourceBucket } from '../types'

type Row = { key: string; label: string; bucket: KpiSourceBucket }

function toRows(map: Record<string, KpiSourceBucket>): Row[] {
  return Object.entries(map).map(([label, bucket]) => ({ key: label, label, bucket }))
}

function fromRows(rows: Row[]): Record<string, KpiSourceBucket> {
  const out: Record<string, KpiSourceBucket> = {}
  for (const r of rows) {
    const label = r.label.trim()
    if (label) out[label] = r.bucket
  }
  return out
}

export function KpiSourceMapEditor({
  value,
  onChange,
  disabled,
}: {
  value: Record<string, KpiSourceBucket>
  onChange: (next: Record<string, KpiSourceBucket>) => void
  disabled?: boolean
}) {
  const rows = toRows(value)

  const patchRows = (next: Row[]) => onChange(fromRows(next))

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto rounded-xl border border-slate-200">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs font-semibold uppercase text-slate-600">
            <tr>
              <th className="px-3 py-2">Tên nguồn (source1)</th>
              <th className="px-3 py-2">Nhóm</th>
              <th className="w-10 px-2 py-2" aria-label="Xóa" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={row.key || `new-${i}`} className="border-t border-slate-100">
                <td className="px-3 py-2">
                  <input
                    type="text"
                    disabled={disabled}
                    value={row.label}
                    onChange={(e) => {
                      const next = [...rows]
                      next[i] = { ...row, label: e.target.value }
                      patchRows(next)
                    }}
                    placeholder="MOU, TikTok…"
                    className="w-full min-w-[8rem] rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
                  />
                </td>
                <td className="px-3 py-2">
                  <select
                    disabled={disabled}
                    value={row.bucket}
                    onChange={(e) => {
                      const next = [...rows]
                      next[i] = { ...row, bucket: e.target.value as KpiSourceBucket }
                      patchRows(next)
                    }}
                    className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
                  >
                    <option value="off">OFF</option>
                    <option value="mkt">MKT</option>
                  </select>
                </td>
                <td className="px-2 py-2">
                  <button
                    type="button"
                    disabled={disabled}
                    aria-label="Xóa dòng"
                    onClick={() => patchRows(rows.filter((_, j) => j !== i))}
                    className="cursor-pointer rounded-lg p-1.5 text-slate-500 transition hover:bg-rose-50 hover:text-rose-700 disabled:opacity-40"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </td>
              </tr>
            ))}
            {!rows.length ? (
              <tr>
                <td colSpan={3} className="px-3 py-4 text-center text-xs text-slate-500">
                  Chưa có dòng — thêm nguồn lead bên dưới.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      <button
        type="button"
        disabled={disabled}
        onClick={() => patchRows([...rows, { key: '', label: '', bucket: 'off' }])}
        className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
      >
        <Plus className="h-3.5 w-3.5" />
        Thêm nguồn
      </button>
    </div>
  )
}
