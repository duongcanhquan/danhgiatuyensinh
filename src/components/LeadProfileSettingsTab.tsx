import { useCallback, useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { deleteDoc, doc } from 'firebase/firestore'
import type { Firestore } from 'firebase/firestore'
import { Plus, Trash2 } from 'lucide-react'
import type { LeadSourceRecord } from '../types'
import { FS_COLLECTIONS } from '../types'
import { useLeadSources } from '../hooks/useLeadSources'
import { saveLeadSourceRow, seedDefaultLeadSources } from '../utils/leadProfileCatalogSeed'

const INPUT =
  'w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-900 outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400/30 disabled:bg-slate-50'

export function LeadProfileSettingsTab({ db, canEdit }: { db: Firestore; canEdit: boolean }) {
  const { items: sources, loading: srcLoading, error: srcError } = useLeadSources()
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  const run = useCallback(async (fn: () => Promise<void>) => {
    if (!canEdit) return
    setBusy(true)
    setMsg(null)
    try {
      await fn()
    } catch (e) {
      console.error(e)
      setMsg(e instanceof Error ? e.message : 'Thao tác thất bại.')
    } finally {
      setBusy(false)
    }
  }, [canEdit])

  return (
    <section className="space-y-4 rounded-xl border border-slate-200/90 bg-white/90 p-4 shadow-sm">
      <div className="space-y-1">
        <h3 className="text-sm font-bold uppercase tracking-wide text-slate-900">Cài đặt hồ sơ — Nguồn</h3>
        <p className="text-sm text-slate-600">
          Danh mục <strong>Nguồn 1 / Nguồn 2</strong> trên form hồ sơ. Học bổng cấu hình tại{' '}
          <Link to="/settings?tab=scholarships" className="font-semibold text-violet-700 underline-offset-2 hover:underline">
            Cài đặt học bổng
          </Link>
          .
        </p>
      </div>
      {msg ? <p className="text-sm text-rose-800">{msg}</p> : null}
      <SourcesPanel
        canEdit={canEdit}
        busy={busy}
        loading={srcLoading}
        error={srcError}
        items={sources}
        onSeed={() =>
          run(async () => {
            const n = await seedDefaultLeadSources(db)
            setMsg(`Đã nạp ${n} nguồn mặc định.`)
          })
        }
        onSave={(row) =>
          run(async () => {
            await saveLeadSourceRow(db, row.id, row)
            setMsg('Đã lưu nguồn.')
          })
        }
        onDelete={(id) =>
          run(async () => {
            await deleteDoc(doc(db, FS_COLLECTIONS.leadSources, id))
            setMsg('Đã xóa nguồn.')
          })
        }
      />
    </section>
  )
}

function SourcesPanel({
  canEdit,
  busy,
  loading,
  error,
  items,
  onSeed,
  onSave,
  onDelete,
}: {
  canEdit: boolean
  busy: boolean
  loading: boolean
  error: string | null
  items: LeadSourceRecord[]
  onSeed: () => void
  onSave: (row: { id: string | null; label: string; sortOrder: number; isActive: boolean }) => void
  onDelete: (id: string) => void
}) {
  const [label, setLabel] = useState('')
  const sorted = useMemo(
    () => [...items].sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label, 'vi')),
    [items],
  )
  const nextSort = sorted.length ? Math.max(...sorted.map((s) => s.sortOrder)) + 10 : 10

  return (
    <div className="space-y-3">
      {loading ? <p className="text-xs text-slate-500">Đang tải…</p> : null}
      {error ? <p className="text-xs text-rose-700">{error}</p> : null}
      {!canEdit ? <p className="text-xs text-amber-900">Chỉ xem — cần quyền quản lý danh mục.</p> : null}
      {canEdit ? (
        <>
          <button
            type="button"
            disabled={busy}
            onClick={onSeed}
            className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold hover:bg-slate-100 disabled:opacity-40"
          >
            Nạp danh sách mặc định
          </button>
          <div className="flex flex-wrap items-end gap-2 rounded-lg border border-emerald-100 bg-emerald-50/50 p-3">
            <label className="min-w-[12rem] flex-1 text-xs font-semibold">
              Tên nguồn
              <input className={`${INPUT} mt-0.5`} value={label} disabled={busy} onChange={(e) => setLabel(e.target.value)} />
            </label>
            <button
              type="button"
              disabled={busy || !label.trim()}
              onClick={() => {
                onSave({ id: null, label, sortOrder: nextSort, isActive: true })
                setLabel('')
              }}
              className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-40"
            >
              <Plus className="h-3.5 w-3.5" /> Thêm
            </button>
          </div>
        </>
      ) : null}
      <CatalogTable
        rows={sorted}
        canEdit={canEdit}
        busy={busy}
        columns={['Nguồn', 'TT', 'Bật']}
        renderRow={(row) => (
          <SourceRow key={row.id} row={row} canEdit={canEdit} busy={busy} onSave={onSave} onDelete={onDelete} />
        )}
        emptyHint="Chưa có nguồn."
        loading={loading}
      />
    </div>
  )
}

function SourceRow({
  row,
  canEdit,
  busy,
  onSave,
  onDelete,
}: {
  row: LeadSourceRecord
  canEdit: boolean
  busy: boolean
  onSave: (row: { id: string | null; label: string; sortOrder: number; isActive: boolean }) => void
  onDelete: (id: string) => void
}) {
  const [label, setLabel] = useState(row.label)
  const [sortOrder, setSortOrder] = useState(row.sortOrder)
  const [isActive, setIsActive] = useState(row.isActive)
  const dirty = label !== row.label || sortOrder !== row.sortOrder || isActive !== row.isActive

  return (
    <tr className="border-t border-slate-100">
      <td className="p-2">
        <input className={INPUT} value={label} disabled={!canEdit || busy} onChange={(e) => setLabel(e.target.value)} />
      </td>
      <td className="p-2">
        <input
          type="number"
          className={`${INPUT} w-20`}
          value={sortOrder}
          disabled={!canEdit || busy}
          onChange={(e) => setSortOrder(Number(e.target.value) || 0)}
        />
      </td>
      <td className="p-2">
        <input type="checkbox" checked={isActive} disabled={!canEdit || busy} onChange={(e) => setIsActive(e.target.checked)} />
      </td>
      {canEdit ? (
        <td className="p-2">
          <RowActions
            busy={busy}
            dirty={dirty && Boolean(label.trim())}
            onSave={() => onSave({ id: row.id, label, sortOrder, isActive })}
            onDelete={() => {
              if (window.confirm(`Xóa «${row.label}»?`)) onDelete(row.id)
            }}
          />
        </td>
      ) : null}
    </tr>
  )
}

function RowActions({
  busy,
  dirty,
  onSave,
  onDelete,
}: {
  busy: boolean
  dirty: boolean
  onSave: () => void
  onDelete: () => void
}) {
  return (
    <div className="flex gap-1">
      <button
        type="button"
        disabled={busy || !dirty}
        onClick={onSave}
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
  )
}

function CatalogTable<T extends { id: string }>({
  rows,
  canEdit,
  columns,
  renderRow,
  emptyHint,
  loading,
}: {
  rows: T[]
  canEdit: boolean
  busy: boolean
  columns: string[]
  renderRow: (row: T) => ReactNode
  emptyHint: string
  loading: boolean
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200">
      <table className="min-w-full text-sm">
        <thead className="bg-slate-50 text-left text-xs font-bold uppercase text-slate-600">
          <tr>
            {columns.map((c) => (
              <th key={c} className="px-2 py-2">
                {c}
              </th>
            ))}
            {canEdit ? <th className="px-2 py-2" /> : null}
          </tr>
        </thead>
        <tbody>{rows.map((r) => renderRow(r))}</tbody>
      </table>
      {!rows.length && !loading ? <p className="px-3 py-4 text-center text-xs text-slate-500">{emptyHint}</p> : null}
    </div>
  )
}
