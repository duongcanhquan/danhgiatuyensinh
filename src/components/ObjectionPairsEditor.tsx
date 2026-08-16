import { Plus, Trash2 } from 'lucide-react'
import type { ObjectionPair } from '../utils/playbookObjectionPairs'
import { newEmptyObjectionPair } from '../utils/playbookObjectionPairs'

const inputCls =
  'w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-sky-300/60 disabled:bg-slate-50'

export function ObjectionPairsEditor({
  pairs,
  onChange,
  disabled,
}: {
  pairs: ObjectionPair[]
  onChange: (next: ObjectionPair[]) => void
  disabled?: boolean
}) {
  const update = (id: string, patch: Partial<ObjectionPair>) => {
    onChange(pairs.map((p) => (p.id === id ? { ...p, ...patch } : p)))
  }

  const remove = (id: string) => {
    onChange(pairs.filter((p) => p.id !== id))
  }

  const add = () => {
    onChange([...pairs, newEmptyObjectionPair()])
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium text-slate-700">Phản đối → câu đáp (chip cho TVV)</p>
        {!disabled ? (
          <button
            type="button"
            onClick={add}
            className="inline-flex items-center gap-1 rounded-lg border border-sky-300 bg-sky-50 px-2.5 py-1 text-xs font-semibold text-sky-950 hover:bg-sky-100"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden />
            Thêm cặp
          </button>
        ) : null}
      </div>
      <p className="text-xs leading-snug text-slate-500">
        Mỗi hàng = một nút bấm lúc gọi. Cột trái: khách nói gì; cột phải: TVV đáp thế nào.
      </p>
      {pairs.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50/80 px-3 py-4 text-center text-sm text-slate-600">
          Chưa có cặp phản đối — bấm «Thêm cặp» (vd. Học phí đắt → Có trả góp).
        </p>
      ) : (
        <ul className="space-y-2">
          {pairs.map((p, i) => (
            <li
              key={p.id}
              className="grid gap-2 rounded-xl border border-slate-200/90 bg-slate-50/50 p-2.5 sm:grid-cols-[1fr_1fr_auto]"
            >
              <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Khách nói
                <input
                  value={p.objection}
                  disabled={disabled}
                  onChange={(e) => update(p.id, { objection: e.target.value })}
                  placeholder={`vd. Học phí đắt #${i + 1}`}
                  className={`mt-1 ${inputCls}`}
                />
              </label>
              <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                TVV đáp
                <input
                  value={p.response}
                  disabled={disabled}
                  onChange={(e) => update(p.id, { response: e.target.value })}
                  placeholder="vd. Có trả góp 3 đợt, gửi bảng phí…"
                  className={`mt-1 ${inputCls}`}
                />
              </label>
              {!disabled ? (
                <button
                  type="button"
                  onClick={() => remove(p.id)}
                  className="inline-flex h-9 items-center justify-center self-end rounded-lg border border-rose-200 px-2 text-rose-700 hover:bg-rose-50"
                  aria-label={`Xóa cặp ${i + 1}`}
                >
                  <Trash2 className="h-4 w-4" aria-hidden />
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
