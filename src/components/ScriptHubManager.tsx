import { useCallback, useEffect, useMemo, useState } from 'react'
import { deleteDoc, doc, setDoc, Timestamp } from 'firebase/firestore'
import type { Firestore } from 'firebase/firestore'
import { useSearchParams } from 'react-router-dom'
import { Copy, Pencil, Plus, Trash2, X } from 'lucide-react'
import type {
  PlaybookConditionField,
  PlaybookOperator,
  RuleCondition,
  ScriptCategory,
  ScriptSnippet,
} from '../types'
import {
  FS_COLLECTIONS,
  SCRIPT_CATEGORIES,
  SCRIPT_CATEGORY_LABELS,
} from '../types'
import { useScriptSnippets } from '../hooks/useScriptSnippets'
import { useAuth } from '../hooks/useAuth'
import { useMasterData } from '../hooks/useMasterData'

const FIELD_OPTIONS: { value: PlaybookConditionField; label: string }[] = [
  { value: 'region', label: 'Vùng (region)' },
  { value: 'province', label: 'Tỉnh (province)' },
  { value: 'major', label: 'Ngành (major → majorInterest)' },
  { value: 'majorInterest', label: 'Ngành quan tâm' },
  { value: 'schoolType', label: 'Loại trường' },
  { value: 'financialStatus', label: 'Tài chính' },
  { value: 'academicLevel', label: 'Học lực / cấp' },
  { value: 'priorityTag', label: 'Nhãn (HOT/WARM/COLD)' },
  { value: 'pipelineStatus', label: 'Pipeline (funnel)' },
  { value: 'status', label: 'CRM / Kanban' },
]

const OPERATORS: { value: PlaybookOperator; label: string }[] = [
  { value: 'EQUALS', label: 'Bằng' },
  { value: 'CONTAINS', label: 'Chứa' },
  { value: 'IN', label: 'IN' },
  { value: 'NOT_IN', label: 'NOT IN' },
]

type ConditionRow = { id: string; field: PlaybookConditionField; operator: PlaybookOperator; valueText: string }

function norm(s: string): string {
  return s.trim().toLowerCase()
}

function newConditionRow(): ConditionRow {
  return {
    id: crypto.randomUUID(),
    field: 'majorInterest',
    operator: 'EQUALS',
    valueText: '',
  }
}

function rowsToConditions(rows: ConditionRow[]): RuleCondition[] {
  return rows.map((r) => {
    const op = r.operator
    let value: string | string[]
    if (op === 'IN' || op === 'NOT_IN') {
      value = r.valueText
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    } else {
      value = r.valueText.trim()
    }
    return { field: r.field, operator: op, value }
  })
}

function conditionsToRows(conditions: RuleCondition[]): ConditionRow[] {
  return conditions.map((c) => ({
    id: crypto.randomUUID(),
    field: (c.field as PlaybookConditionField) ?? 'region',
    operator: (c.operator ?? 'EQUALS') as PlaybookOperator,
    valueText: Array.isArray(c.value) ? c.value.join(', ') : String(c.value ?? ''),
  }))
}

export function ScriptHubManager({ db }: { db: Firestore }) {
  const { can } = useAuth()
  const canEdit = can('config:playbooks')
  const { snippets, loading, error } = useScriptSnippets()
  const { byKind } = useMasterData()
  const [searchParams, setSearchParams] = useSearchParams()
  const editSnippetId = searchParams.get('editSnippet')

  const [filterCategory, setFilterCategory] = useState<ScriptCategory | ''>('')
  const [filterActive, setFilterActive] = useState<'all' | 'active' | 'inactive'>('all')
  const [filterMajor, setFilterMajor] = useState<string>('')

  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState<ScriptCategory>('GREETING')
  const [content, setContent] = useState('')
  const [isActive, setIsActive] = useState(true)
  const [conditionRows, setConditionRows] = useState<ConditionRow[]>([newConditionRow()])
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  const majorFilterOptions = useMemo(() => {
    const labels = (byKind.majors ?? [])
      .map((m) => m.label.trim())
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b, 'vi'))
    return [{ value: '', label: '— Tất cả —' }, ...labels.map((l) => ({ value: l, label: l }))]
  }, [byKind])

  const filteredSnippets = useMemo(() => {
    return snippets.filter((s) => {
      if (filterCategory && s.category !== filterCategory) return false
      if (filterActive === 'active' && !s.isActive) return false
      if (filterActive === 'inactive' && s.isActive) return false
      if (filterMajor.trim()) {
        const needle = norm(filterMajor)
        const hit = s.matchConditions.some((c) => {
          const f = String(c.field)
          if (f !== 'major' && f !== 'majorInterest') return false
          const val = c.value
          const parts = Array.isArray(val) ? val.map((x) => norm(String(x))) : [norm(String(val))]
          return parts.some((p) => p && (p.includes(needle) || needle.includes(p)))
        })
        if (!hit) return false
      }
      return true
    })
  }, [snippets, filterCategory, filterActive, filterMajor])

  const filtersActive = Boolean(
    filterCategory || filterActive !== 'all' || filterMajor.trim(),
  )

  const clearFilters = useCallback(() => {
    setFilterCategory('')
    setFilterActive('all')
    setFilterMajor('')
  }, [])

  const openCreate = useCallback(() => {
    setEditingId(null)
    setTitle('')
    setCategory('GREETING')
    setContent('')
    setIsActive(true)
    setConditionRows([newConditionRow()])
    setMsg(null)
    setModalOpen(true)
  }, [])

  const openEdit = useCallback((s: ScriptSnippet) => {
    setEditingId(s.id)
    setTitle(s.title)
    setCategory(s.category)
    setContent(s.content)
    setIsActive(s.isActive !== false)
    setConditionRows(
      s.matchConditions.length ? conditionsToRows(s.matchConditions) : [newConditionRow()],
    )
    setMsg(null)
    setModalOpen(true)
  }, [])

  useEffect(() => {
    if (!editSnippetId || loading) return
    const s = snippets.find((x) => x.id === editSnippetId)
    if (!s) return
    queueMicrotask(() => {
      openEdit(s)
      const next = new URLSearchParams(searchParams)
      next.delete('editSnippet')
      setSearchParams(next, { replace: true })
    })
  }, [editSnippetId, loading, snippets, openEdit, searchParams, setSearchParams])

  const closeModal = useCallback(() => {
    setModalOpen(false)
    setEditingId(null)
  }, [])

  const persist = useCallback(async () => {
    if (!canEdit || !db) return
    const t = title.trim()
    if (!t) {
      setMsg('Nhập tiêu đề snippet.')
      return
    }
    const conditions = rowsToConditions(conditionRows).filter((c) => {
      const v = c.value
      if (Array.isArray(v)) return v.length > 0
      return String(v).trim() !== ''
    })
    if (!conditions.length) {
      setMsg('Thêm ít nhất một điều kiện (giá trị không để trống).')
      return
    }
    const id = editingId ?? crypto.randomUUID()
    const now = Timestamp.now()
    const existing = snippets.find((x) => x.id === id)
    setBusy(true)
    setMsg(null)
    try {
      await setDoc(doc(db, FS_COLLECTIONS.scriptSnippets, id), {
        title: t,
        category,
        content: content.trim(),
        matchConditions: conditions,
        isActive,
        lastUpdated: now,
        createdAt: existing?.createdAt ?? existing?.lastUpdated ?? now,
        ...(existing?.seedTag ? { seedTag: existing.seedTag } : {}),
      })
      setMsg('Đã lưu.')
      closeModal()
    } catch (e) {
      console.error(e)
      setMsg('Không lưu được — kiểm tra Firestore Rules (scriptSnippets).')
    } finally {
      setBusy(false)
    }
  }, [
    canEdit,
    db,
    title,
    category,
    content,
    conditionRows,
    isActive,
    editingId,
    snippets,
    closeModal,
  ])

  const duplicateSnippet = useCallback(
    (s: ScriptSnippet) => {
      setEditingId(null)
      setTitle(`${s.title} (bản sao)`)
      setCategory(s.category)
      setContent(s.content)
      setIsActive(true)
      setConditionRows(
        s.matchConditions.length ? conditionsToRows(s.matchConditions) : [newConditionRow()],
      )
      setMsg(null)
      setModalOpen(true)
    },
    [],
  )

  const removeSnippet = useCallback(
    async (s: ScriptSnippet) => {
      if (!canEdit || !db) return
      if (!window.confirm(`Xóa snippet «${s.title}»?`)) return
      setBusy(true)
      try {
        await deleteDoc(doc(db, FS_COLLECTIONS.scriptSnippets, s.id))
        setMsg('Đã xóa.')
      } finally {
        setBusy(false)
      }
    },
    [canEdit, db],
  )

  const formatTs = (ts: ScriptSnippet['lastUpdated']) => {
    try {
      return ts?.toDate?.().toLocaleString?.('vi-VN') ?? '—'
    } catch {
      return '—'
    }
  }

  return (
    <section className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-slate-950 via-indigo-950 to-slate-900 p-6 text-slate-100 shadow-2xl shadow-slate-950/50 backdrop-blur-2xl md:p-8">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_0%_0%,rgba(168,85,247,0.12),transparent_50%),radial-gradient(ellipse_at_100%_80%,rgba(245,158,11,0.1),transparent_45%)]" />
      <div className="relative">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold uppercase tracking-wide text-white md:text-xl">
              Trung tâm kịch bản tư vấn
            </h2>
            <p className="mt-1 max-w-3xl text-sm text-slate-400">
              Các đoạn kịch bản ghép nối — hệ thống tự ráp luồng tư vấn theo từng hồ sơ (trợ lý trên màn chi tiết).
            </p>
            <p className="mt-2 max-w-3xl text-xs leading-relaxed text-slate-500">
              <strong className="text-slate-300">Lưu ý:</strong> lệnh seed chạy trên <strong>máy bạn (Terminal)</strong>,
              cần file service account —{' '}
              <code className="rounded bg-black/30 px-1 text-slate-300">GOOGLE_APPLICATION_CREDENTIALS=./secrets/…json</code>{' '}
              rồi <code className="rounded bg-black/30 px-1 text-slate-300">npm run seed:script-snippets</code>. Xóa
              bộ đã seed:{' '}
              <code className="rounded bg-black/30 px-1 text-slate-300">
                DELETE_SCRIPT_SNIPPET_SEED=1 npm run seed:script-snippets
              </code>
              . Sửa nội dung: chỉnh trong bảng hoặc file{' '}
              <code className="text-slate-400">scripts/data/vietmy-script-snippet-seed-entries.mjs</code> rồi chạy lại
              seed.
            </p>
          </div>
          {canEdit ? (
            <button
              type="button"
              onClick={openCreate}
              className="inline-flex items-center gap-2 rounded-xl border border-amber-400/40 bg-amber-500/20 px-4 py-2 text-sm font-semibold text-amber-50 hover:bg-amber-500/30"
            >
              <Plus className="h-4 w-4" />
              Snippet mới
            </button>
          ) : null}
        </div>

        {!canEdit ? (
          <p className="mt-4 text-sm text-amber-200">Bạn không có quyền chỉnh script hub.</p>
        ) : null}
        {error ? <p className="mt-2 text-sm text-rose-300">{error}</p> : null}
        {msg && !modalOpen ? <p className="mt-2 text-sm text-emerald-300">{msg}</p> : null}

        <div className="mt-6 flex flex-wrap items-end gap-3 rounded-xl border border-white/10 bg-white/[0.04] p-4 backdrop-blur-md">
          <label className="text-xs font-medium text-slate-400">
            Danh mục
            <select
              value={filterCategory}
              onChange={(e) => setFilterCategory((e.target.value || '') as ScriptCategory | '')}
              className="mt-1 block min-w-[10rem] rounded-lg border border-white/15 bg-slate-950/70 px-2 py-1.5 text-sm text-white"
            >
              <option value="">Tất cả</option>
              {SCRIPT_CATEGORIES.map((c) => (
                <option key={c} value={c} className="bg-slate-900">
                  {SCRIPT_CATEGORY_LABELS[c]}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-medium text-slate-400">
            Ngành mục tiêu (điều kiện)
            <select
              value={filterMajor}
              onChange={(e) => setFilterMajor(e.target.value)}
              className="mt-1 block min-w-[12rem] max-w-[16rem] rounded-lg border border-white/15 bg-slate-950/70 px-2 py-1.5 text-sm text-white"
            >
              {majorFilterOptions.map((o) => (
                <option key={o.value || '__all__'} value={o.value} className="bg-slate-900">
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-medium text-slate-400">
            Trạng thái
            <select
              value={filterActive}
              onChange={(e) => setFilterActive(e.target.value as 'all' | 'active' | 'inactive')}
              className="mt-1 block min-w-[8rem] rounded-lg border border-white/15 bg-slate-950/70 px-2 py-1.5 text-sm text-white"
            >
              <option value="all">Tất cả</option>
              <option value="active">Đang bật</option>
              <option value="inactive">Đang tắt</option>
            </select>
          </label>
          {filtersActive ? (
            <button
              type="button"
              onClick={clearFilters}
              className="rounded-lg border border-white/20 bg-white/5 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-white/10"
            >
              Xóa bộ lọc
            </button>
          ) : null}
          {loading ? <span className="text-xs text-slate-500">Đang tải…</span> : null}
        </div>
        {!loading ? (
          <p className="mt-2 text-xs text-slate-400">
            Trên Firestore hiện có{' '}
            <strong className="text-amber-100/95">{snippets.length}</strong> snippet
            {filtersActive && filteredSnippets.length !== snippets.length
              ? ` — sau lọc còn ${filteredSnippets.length}.`
              : '.'}
          </p>
        ) : null}

        <div className="mt-4 overflow-x-auto rounded-xl border border-white/10 bg-slate-950/40 backdrop-blur-md">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="border-b border-white/10 text-xs uppercase tracking-wider text-slate-500">
                <th className="px-3 py-2 font-medium">Tiêu đề</th>
                <th className="px-3 py-2 font-medium">Danh mục</th>
                <th className="px-3 py-2 font-medium">Điều kiện</th>
                <th className="px-3 py-2 font-medium">Bật</th>
                <th className="px-3 py-2 font-medium">Cập nhật</th>
                <th className="px-3 py-2 font-medium text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {filteredSnippets.map((s) => (
                <tr key={s.id} className="border-b border-white/5 hover:bg-white/[0.04]">
                  <td className="max-w-[220px] truncate px-3 py-2 font-medium text-white">
                    {s.title}
                    {s.seedTag ? (
                      <span
                        className="ml-1 align-middle rounded bg-violet-500/25 px-1 text-[10px] font-normal uppercase tracking-wide text-violet-200"
                        title={s.seedTag}
                      >
                        seed
                      </span>
                    ) : null}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-slate-300">
                    {SCRIPT_CATEGORY_LABELS[s.category]}
                  </td>
                  <td className="max-w-xs truncate px-3 py-2 text-xs text-slate-500">
                    {s.matchConditions.length
                      ? s.matchConditions
                          .map((c) => `${String(c.field)} ${c.operator ?? '='} ${Array.isArray(c.value) ? c.value.join('|') : c.value}`)
                          .join(' · ')
                      : '—'}
                  </td>
                  <td className="px-3 py-2 text-xs">{s.isActive ? 'Có' : 'Không'}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-xs text-slate-500">{formatTs(s.lastUpdated)}</td>
                  <td className="px-3 py-2 text-right">
                    {canEdit ? (
                      <div className="flex justify-end gap-1">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => openEdit(s)}
                          className="rounded-lg p-1.5 text-amber-200 hover:bg-white/10 disabled:opacity-40"
                          title="Sửa"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => duplicateSnippet(s)}
                          className="rounded-lg p-1.5 text-violet-200 hover:bg-white/10 disabled:opacity-40"
                          title="Nhân bản"
                        >
                          <Copy className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void removeSnippet(s)}
                          className="rounded-lg p-1.5 text-rose-300 hover:bg-rose-500/10 disabled:opacity-40"
                          title="Xóa"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    ) : null}
                  </td>
                </tr>
              ))}
              {!filteredSnippets.length && !loading ? (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-left text-sm text-slate-400">
                    {snippets.length === 0 ? (
                      <div className="mx-auto max-w-xl space-y-2 rounded-xl border border-amber-500/25 bg-amber-950/30 px-4 py-4 text-left">
                        <p className="font-medium text-amber-100">Chưa có snippet trên Firestore</p>
                        <p className="text-xs leading-relaxed text-slate-300">
                          Giao diện web <strong>không</strong> tự tải file từ GitHub. Bạn cần mở Terminal trong thư mục
                          project, cấu hình <code className="text-amber-200/90">GOOGLE_APPLICATION_CREDENTIALS</code>{' '}
                          trỏ tới JSON service account của <strong>cùng</strong> Firebase project với app, rồi chạy:{' '}
                          <code className="block mt-2 rounded bg-black/40 px-2 py-1.5 font-mono text-[11px] text-slate-100">
                            npm run seed:script-snippets
                          </code>
                        </p>
                        <p className="text-xs text-slate-500">
                          Hoặc bấm «Snippet mới» ở trên để tạo tay. Sau khi seed, tải lại trang — bộ đếm «Trên
                          Firestore» sẽ là 20.
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-2 text-center">
                        <p>Không có snippet khớp bộ lọc hiện tại.</p>
                        <p className="text-xs text-slate-500">
                          Thử chọn Danh mục «Tất cả» và Ngành «— Tất cả —», hoặc bấm «Xóa bộ lọc». (Đang có{' '}
                          {snippets.length} snippet trên server.)
                        </p>
                      </div>
                    )}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      {modalOpen ? (
        <div className="fixed inset-0 z-[120] flex items-end justify-center sm:items-center">
          <button
            type="button"
            aria-label="Đóng"
            className="absolute inset-0 bg-slate-950/70 backdrop-blur-md"
            onClick={closeModal}
          />
          <div className="relative z-[121] m-4 flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-amber-400/25 bg-gradient-to-br from-slate-950 via-indigo-950 to-slate-950 shadow-2xl shadow-amber-900/30 backdrop-blur-2xl">
            <div className="flex items-center justify-between border-b border-white/10 px-5 py-3">
              <h3 className="text-base font-semibold uppercase tracking-wide text-white">
                {editingId ? 'Sửa snippet' : 'Snippet mới'}
              </h3>
              <button
                type="button"
                onClick={closeModal}
                className="rounded-lg p-1 text-slate-400 hover:bg-white/10 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
              {msg ? <p className="text-sm text-amber-200">{msg}</p> : null}
              <label className="block text-xs font-medium text-slate-400">
                Tiêu đề
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-white/15 bg-slate-950/60 px-3 py-2 text-sm text-white outline-none focus:ring-2 focus:ring-amber-400/35"
                />
              </label>
              <label className="block text-xs font-medium text-slate-400">
                Danh mục luồng
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value as ScriptCategory)}
                  className="mt-1 w-full rounded-xl border border-white/15 bg-slate-950/60 px-3 py-2 text-sm text-white"
                >
                  {SCRIPT_CATEGORIES.map((c) => (
                    <option key={c} value={c} className="bg-slate-900">
                      {SCRIPT_CATEGORY_LABELS[c]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex items-center gap-2 text-xs text-slate-300">
                <input
                  type="checkbox"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                  className="rounded border-white/30 bg-slate-900"
                />
                Đang kích hoạt
              </label>
              <label className="block text-xs font-medium text-slate-400">
                Nội dung script
                <textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  rows={8}
                  className="mt-1 w-full rounded-xl border border-white/15 bg-slate-950/60 px-3 py-2 font-mono text-sm leading-relaxed text-slate-100 outline-none focus:ring-2 focus:ring-amber-400/35"
                  placeholder={
                    category === 'OBJECTION_HANDLING'
                      ? 'Dòng 1: lo ngại của PH\n---\nĐoạn sau: script trả lời mẫu'
                      : 'Nhập thoại / gợi ý tư vấn…'
                  }
                />
              </label>

              <div>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                    Điều kiện kích hoạt (AND)
                  </p>
                  <button
                    type="button"
                    onClick={() => setConditionRows((r) => [...r, newConditionRow()])}
                    className="text-xs font-medium text-amber-200 hover:underline"
                  >
                    + Điều kiện
                  </button>
                </div>
                <p className="mt-1 text-xs text-slate-600">IN / NOT IN: nhiều giá trị cách nhau bởi dấu phẩy.</p>
                <ul className="mt-2 space-y-2">
                  {conditionRows.map((row) => (
                    <li key={row.id} className="rounded-xl border border-white/10 bg-slate-950/50 p-3">
                      <div className="grid gap-2 sm:grid-cols-3">
                        <select
                          value={row.field}
                          onChange={(e) => {
                            const v = e.target.value as PlaybookConditionField
                            setConditionRows((xs) => xs.map((x) => (x.id === row.id ? { ...x, field: v } : x)))
                          }}
                          className="rounded-lg border border-white/15 bg-slate-900 px-2 py-1.5 text-xs text-white"
                        >
                          {FIELD_OPTIONS.map((f) => (
                            <option key={f.value} value={f.value} className="bg-slate-900">
                              {f.label}
                            </option>
                          ))}
                        </select>
                        <select
                          value={row.operator}
                          onChange={(e) => {
                            const v = e.target.value as PlaybookOperator
                            setConditionRows((xs) => xs.map((x) => (x.id === row.id ? { ...x, operator: v } : x)))
                          }}
                          className="rounded-lg border border-white/15 bg-slate-900 px-2 py-1.5 text-xs text-white"
                        >
                          {OPERATORS.map((o) => (
                            <option key={o.value} value={o.value} className="bg-slate-900">
                              {o.label}
                            </option>
                          ))}
                        </select>
                        <input
                          value={row.valueText}
                          onChange={(e) => {
                            const v = e.target.value
                            setConditionRows((xs) => xs.map((x) => (x.id === row.id ? { ...x, valueText: v } : x)))
                          }}
                          className="rounded-lg border border-white/15 bg-slate-900 px-2 py-1.5 text-xs text-white sm:col-span-1"
                          placeholder="Giá trị so khớp"
                        />
                      </div>
                      <div className="mt-2 flex justify-end">
                        <button
                          type="button"
                          disabled={conditionRows.length <= 1}
                          onClick={() => setConditionRows((xs) => xs.filter((x) => x.id !== row.id))}
                          className="text-xs text-rose-300 hover:text-rose-200 disabled:opacity-30"
                        >
                          Xóa dòng
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            <div className="flex gap-2 border-t border-white/10 px-5 py-3">
              <button
                type="button"
                onClick={closeModal}
                className="rounded-xl border border-white/15 px-4 py-2 text-sm text-slate-300 hover:bg-white/5"
              >
                Hủy
              </button>
              <button
                type="button"
                disabled={busy || !canEdit}
                onClick={() => void persist()}
                className="flex-1 rounded-xl border border-amber-400/40 bg-gradient-to-r from-violet-600/90 to-amber-600/85 py-2 text-sm font-semibold text-white hover:brightness-110 disabled:opacity-40"
              >
                {busy ? 'Đang lưu…' : 'Lưu vào Firestore'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  )
}
