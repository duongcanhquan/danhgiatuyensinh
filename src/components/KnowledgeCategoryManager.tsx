import { useState } from 'react'
import { Pencil, Plus, Trash2, X } from 'lucide-react'
import {
  isBuiltinKnowledgeCategory,
  normalizeKnowledgeCategoryId,
} from '../utils/knowledgeCategories'
import type { KnowledgeCategoryDef } from '../utils/knowledgeCategories'

const inputCls =
  'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-amber-300/60'

export function KnowledgeCategoryManager({
  categories,
  onAdd,
  onUpdate,
  onRemove,
  disabled,
}: {
  categories: KnowledgeCategoryDef[]
  onAdd: (label: string) => Promise<void>
  onUpdate: (id: string, label: string) => Promise<void>
  onRemove: (id: string) => Promise<void>
  disabled?: boolean
}) {
  const [newLabel, setNewLabel] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editLabel, setEditLabel] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const customIds = new Set(
    categories.filter((c) => !isBuiltinKnowledgeCategory(c.id)).map((c) => c.id),
  )

  const submitAdd = async () => {
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

  const startEdit = (c: KnowledgeCategoryDef) => {
    setEditingId(c.id)
    setEditLabel(c.label)
    setErr(null)
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEditLabel('')
  }

  const submitEdit = async () => {
    if (!editingId) return
    setBusy(true)
    setErr(null)
    try {
      await onUpdate(editingId, editLabel)
      cancelEdit()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Không lưu được')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-xl border border-amber-200/80 bg-gradient-to-br from-amber-50/50 to-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-slate-900">Danh mục tài liệu</p>
          <p className="mt-0.5 text-xs leading-relaxed text-slate-600">
            Thêm, đổi tên hoặc xóa danh mục tự tạo. Danh mục mặc định có thể đổi nhãn hiển thị; không xóa được.
          </p>
        </div>
        <span className="rounded-full bg-white px-2.5 py-0.5 text-xs font-semibold text-amber-900 ring-1 ring-amber-200">
          {categories.length} danh mục
        </span>
      </div>

      <div className="mt-3 overflow-x-auto rounded-lg border border-slate-200/90 bg-white">
        <table className="min-w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-600">
              <th className="px-3 py-2 font-medium">Tên hiển thị</th>
              <th className="px-3 py-2 font-medium">Mã (id)</th>
              <th className="px-3 py-2 font-medium">Loại</th>
              <th className="px-3 py-2 text-right font-medium">Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {categories.map((c) => {
              const isEditing = editingId === c.id
              const builtin = isBuiltinKnowledgeCategory(c.id)
              const deletable = customIds.has(c.id)

              return (
                <tr key={c.id} className="border-b border-slate-100 last:border-0">
                  <td className="px-3 py-2">
                    {isEditing ? (
                      <input
                        value={editLabel}
                        disabled={disabled || busy}
                        onChange={(e) => setEditLabel(e.target.value)}
                        className={inputCls}
                        autoFocus
                      />
                    ) : (
                      <span className="font-medium text-slate-900">{c.label}</span>
                    )}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-slate-500">{c.id}</td>
                  <td className="px-3 py-2 text-xs text-slate-600">
                    {builtin ? (
                      <span className="rounded bg-slate-100 px-1.5 py-0.5">Mặc định</span>
                    ) : (
                      <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-emerald-900">Tự thêm</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex justify-end gap-1">
                      {isEditing ? (
                        <>
                          <button
                            type="button"
                            disabled={disabled || busy || !editLabel.trim()}
                            onClick={() => void submitEdit()}
                            className="rounded-lg bg-amber-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
                          >
                            Lưu
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={cancelEdit}
                            className="rounded-lg border border-slate-200 p-1 text-slate-600 hover:bg-slate-50"
                            aria-label="Hủy sửa"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            disabled={disabled || busy}
                            onClick={() => startEdit(c)}
                            className="rounded-lg p-1.5 text-amber-800 hover:bg-amber-50 disabled:opacity-40"
                            title="Sửa tên danh mục"
                          >
                            <Pencil className="h-4 w-4" aria-hidden />
                          </button>
                          {deletable ? (
                            <button
                              type="button"
                              disabled={disabled || busy}
                              className="rounded-lg p-1.5 text-rose-600 hover:bg-rose-50 disabled:opacity-40"
                              title="Xóa danh mục"
                              onClick={() => {
                                if (
                                  !window.confirm(
                                    `Xóa danh mục «${c.label}»? Tài liệu cũ vẫn giữ mã ${c.id}.`,
                                  )
                                )
                                  return
                                void onRemove(c.id).catch((e) =>
                                  setErr(e instanceof Error ? e.message : 'Không xóa được'),
                                )
                              }}
                            >
                              <Trash2 className="h-4 w-4" aria-hidden />
                            </button>
                          ) : null}
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
        <label className="min-w-0 flex-1 text-xs font-medium text-slate-700">
          Thêm danh mục mới
          <input
            value={newLabel}
            disabled={disabled || busy}
            onChange={(e) => setNewLabel(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && newLabel.trim()) void submitAdd()
            }}
            placeholder="vd. Học bổng, Ký túc xá…"
            className={`${inputCls} mt-1`}
          />
          {newLabel.trim() ? (
            <span className="mt-1 block font-mono text-[11px] text-slate-500">
              Mã: {normalizeKnowledgeCategoryId(newLabel) || '—'}
            </span>
          ) : null}
        </label>
        <button
          type="button"
          disabled={disabled || busy || !newLabel.trim()}
          onClick={() => void submitAdd()}
          className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg border border-amber-700 bg-amber-700 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-800 disabled:opacity-50"
        >
          <Plus className="h-4 w-4 shrink-0" aria-hidden />
          Thêm danh mục
        </button>
      </div>
      {err ? <p className="mt-2 text-xs text-rose-700">{err}</p> : null}
    </div>
  )
}
