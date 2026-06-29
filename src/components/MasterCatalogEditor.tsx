import { useEffect, useState, type ReactNode } from 'react'
import { doc, setDoc, Timestamp, type Firestore } from 'firebase/firestore'
import { Plus, Trash2 } from 'lucide-react'
import type { MasterDataEntry } from '../types'
import { FS_COLLECTIONS } from '../types'
import { masterDataEntriesForFirestore } from '../utils/masterDataRegistry'

const INPUT =
  'w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-900 outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400/30 disabled:bg-slate-50'

export function MasterCatalogEditor({
  catalogId,
  title,
  description,
  entries,
  loading,
  db,
  canEdit,
  extraColumn,
}: {
  catalogId: string
  title: string
  description?: string
  entries: MasterDataEntry[]
  loading: boolean
  db: Firestore
  canEdit: boolean
  extraColumn?: {
    label: string
    render: (entry: MasterDataEntry, onPatch: (patch: Partial<MasterDataEntry>) => void, disabled: boolean) => ReactNode
  }
}) {
  const [localEntries, setLocalEntries] = useState(entries)
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!busy) setLocalEntries(entries)
  }, [entries, catalogId, busy])

  const persist = async (next: MasterDataEntry[]): Promise<boolean> => {
    if (!canEdit) return false
    setBusy(true)
    setError(null)
    try {
      await setDoc(
        doc(db, FS_COLLECTIONS.masterData, catalogId),
        {
          id: catalogId,
          entries: masterDataEntriesForFirestore(next),
          updatedAt: Timestamp.now(),
        },
        { merge: true },
      )
      return true
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không lưu được.')
      return false
    } finally {
      setBusy(false)
    }
  }

  const addItem = async () => {
    const label = input.trim()
    if (!label) return
    if (localEntries.some((e) => e.label.toLowerCase() === label.toLowerCase())) {
      setError('Mục này đã có trong danh sách.')
      return
    }
    const next = [...localEntries, { id: crypto.randomUUID(), label, isActive: true }]
    setLocalEntries(next)
    const ok = await persist(next)
    if (ok) setInput('')
    else setLocalEntries(entries)
  }

  const saveRow = async (row: MasterDataEntry) => {
    const label = row.label.trim()
    if (!label) {
      setError('Nhãn không được để trống.')
      return
    }
    const next = localEntries.map((e) => (e.id === row.id ? { ...row, label } : e))
    setLocalEntries(next)
    const ok = await persist(next)
    if (!ok) setLocalEntries(entries)
  }

  const removeRow = async (id: string) => {
    const next = localEntries.filter((e) => e.id !== id)
    setLocalEntries(next)
    const ok = await persist(next)
    if (!ok) setLocalEntries(entries)
  }

  const sorted = [...localEntries].sort((a, b) => a.label.localeCompare(b.label, 'vi'))

  return (
    <section className="space-y-3 rounded-xl border border-slate-200/90 bg-white/90 p-4 shadow-sm">
      <div>
        <h3 className="text-sm font-bold uppercase tracking-wide text-slate-900">{title}</h3>
        {description ? <p className="mt-1 text-sm text-slate-600">{description}</p> : null}
      </div>
      {error ? <p className="text-xs text-rose-700">{error}</p> : null}
      {loading ? <p className="text-xs text-slate-500">Đang tải…</p> : null}
      {!canEdit ? <p className="text-xs text-amber-900">Chỉ xem — cần quyền quản lý danh mục.</p> : null}
      {canEdit ? (
        <div className="flex flex-wrap items-end gap-2 rounded-lg border border-emerald-100 bg-emerald-50/50 p-3">
          <label className="min-w-[12rem] flex-1 text-xs font-semibold">
            Thêm mục mới
            <input className={`${INPUT} mt-0.5`} value={input} disabled={busy} onChange={(e) => setInput(e.target.value)} />
          </label>
          <button
            type="button"
            disabled={busy || !input.trim()}
            onClick={() => void addItem()}
            className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-40"
          >
            <Plus className="h-3.5 w-3.5" /> Thêm
          </button>
        </div>
      ) : null}
      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs font-bold uppercase text-slate-600">
            <tr>
              <th className="px-2 py-2">Nhãn</th>
              {extraColumn ? <th className="px-2 py-2">{extraColumn.label}</th> : null}
              <th className="px-2 py-2">Bật</th>
              {canEdit ? <th className="px-2 py-2" /> : null}
            </tr>
          </thead>
          <tbody>
            {sorted.map((row) => (
              <CatalogRow
                key={row.id}
                row={row}
                canEdit={canEdit}
                busy={busy}
                extraColumn={extraColumn}
                onSave={saveRow}
                onDelete={() => {
                  if (window.confirm(`Xóa «${row.label}»?`)) void removeRow(row.id)
                }}
              />
            ))}
          </tbody>
        </table>
        {!sorted.length && !loading ? (
          <p className="px-3 py-4 text-center text-xs text-slate-500">Chưa có mục nào.</p>
        ) : null}
      </div>
    </section>
  )
}

function CatalogRow({
  row,
  canEdit,
  busy,
  extraColumn,
  onSave,
  onDelete,
}: {
  row: MasterDataEntry
  canEdit: boolean
  busy: boolean
  extraColumn?: {
    label: string
    render: (entry: MasterDataEntry, onPatch: (patch: Partial<MasterDataEntry>) => void, disabled: boolean) => ReactNode
  }
  onSave: (row: MasterDataEntry) => void
  onDelete: () => void
}) {
  const [draft, setDraft] = useState(row)
  useEffect(() => setDraft(row), [row])

  const dirty =
    draft.label !== row.label ||
    draft.isActive !== row.isActive ||
    draft.departmentId !== row.departmentId

  return (
    <tr className="border-t border-slate-100">
      <td className="p-2">
        <input
          className={INPUT}
          value={draft.label}
          disabled={!canEdit || busy}
          onChange={(e) => setDraft((d) => ({ ...d, label: e.target.value }))}
        />
      </td>
      {extraColumn ? (
        <td className="p-2">{extraColumn.render(draft, (patch) => setDraft((d) => ({ ...d, ...patch })), !canEdit || busy)}</td>
      ) : null}
      <td className="p-2">
        <input
          type="checkbox"
          checked={draft.isActive !== false}
          disabled={!canEdit || busy}
          onChange={(e) => setDraft((d) => ({ ...d, isActive: e.target.checked }))}
        />
      </td>
      {canEdit ? (
        <td className="p-2">
          <div className="flex gap-1">
            <button
              type="button"
              disabled={busy || !dirty}
              onClick={() => onSave(draft)}
              className="rounded border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-xs font-semibold disabled:opacity-40"
            >
              Lưu
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={onDelete}
              className="rounded border border-rose-200 p-1 text-rose-700 hover:bg-rose-50"
              aria-label="Xóa"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </td>
      ) : null}
    </tr>
  )
}
