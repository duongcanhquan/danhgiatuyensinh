import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { isBuiltinKnowledgeCategory } from '../utils/knowledgeCategories'
import type { KnowledgeCategoryDef } from '../utils/knowledgeCategories'

const inputCls =
  'mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-amber-300/60'

export function KnowledgeCategoryManager({
  categories,
  onAdd,
  onRemove,
  disabled,
}: {
  categories: KnowledgeCategoryDef[]
  onAdd: (label: string) => Promise<void>
  onRemove: (id: string) => Promise<void>
  disabled?: boolean
}) {
  const [newLabel, setNewLabel] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const customOnly = categories.filter((c) => !isBuiltinKnowledgeCategory(c.id))

  const submit = async () => {
    setBusy(true)
    setErr(null)
    try {
      await onAdd(newLabel)
      setNewLabel('')
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Không thêm được danh mục')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-lg border border-amber-200/70 bg-amber-50/40 p-3">
      <p className="text-xs font-semibold text-amber-950">Danh mục tài liệu</p>
      <p className="mt-0.5 text-[11px] text-slate-600">
        Thêm danh mục mới (VD: Học bổng, Ký túc xá). Danh mục mặc định không xóa được.
      </p>
      <div className="mt-2 flex flex-wrap gap-1">
        {categories.map((c) => (
          <span
            key={c.id}
            className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] text-slate-800"
          >
            {c.label}
            {!isBuiltinKnowledgeCategory(c.id) ? (
              <button
                type="button"
                disabled={disabled || busy}
                className="rounded p-0.5 text-rose-600 hover:bg-rose-50"
                aria-label={`Xóa danh mục ${c.label}`}
                onClick={() => {
                  if (!window.confirm(`Xóa danh mục «${c.label}»? Tài liệu cũ vẫn giữ mã ${c.id}.`)) return
                  void onRemove(c.id).catch((e) =>
                    setErr(e instanceof Error ? e.message : 'Không xóa được'),
                  )
                }}
              >
                <Trash2 className="h-3 w-3" aria-hidden />
              </button>
            ) : null}
          </span>
        ))}
      </div>
      {customOnly.length === 0 ? (
        <p className="mt-1 text-[11px] text-slate-500">Chưa có danh mục tự thêm.</p>
      ) : null}
      <div className="mt-2 flex gap-2">
        <input
          value={newLabel}
          disabled={disabled || busy}
          onChange={(e) => setNewLabel(e.target.value)}
          placeholder="Tên danh mục mới"
          className={inputCls}
        />
        <button
          type="button"
          disabled={disabled || busy || !newLabel.trim()}
          onClick={() => void submit()}
          className="mt-1 inline-flex shrink-0 items-center gap-1 rounded-lg border border-amber-700 bg-amber-700 px-3 py-2 text-xs font-semibold text-white hover:bg-amber-800 disabled:opacity-50"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden />
          Thêm
        </button>
      </div>
      {err ? <p className="mt-1 text-xs text-rose-700">{err}</p> : null}
    </div>
  )
}
