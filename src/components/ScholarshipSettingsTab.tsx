import { useCallback, useMemo, useState, type FormEvent } from 'react'
import { deleteDoc, doc, type Firestore } from 'firebase/firestore'
import { Plus, Trash2 } from 'lucide-react'
import type {
  ScholarshipApplySlot,
  ScholarshipAudienceTag,
  ScholarshipCategoryId,
  ScholarshipRecord,
} from '../types'
import {
  FS_COLLECTIONS,
  SCHOLARSHIP_APPLY_SLOT_LABELS,
  SCHOLARSHIP_AUDIENCE_LABELS,
  SCHOLARSHIP_CATEGORY_LABELS,
} from '../types'
import { useScholarships } from '../hooks/useScholarships'
import {
  saveScholarshipRow,
  seedDefaultScholarships,
  syncDefaultScholarships,
  type ScholarshipSavePayload,
} from '../utils/leadProfileCatalogSeed'
import { formatScholarshipDate, formatVnd } from '../utils/leadProfileCatalogDefaults'
import {
  audienceSummary,
  resolvedApplySlots,
  scholarshipScheduleStatus,
  SCHOLARSHIP_SCHEDULE_STATUS_LABELS,
} from '../utils/scholarshipEligibility'

const INPUT =
  'w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-900 outline-none focus:border-violet-400 focus:ring-1 focus:ring-violet-400/30 disabled:bg-slate-50'

const AUDIENCE_OPTIONS = Object.keys(SCHOLARSHIP_AUDIENCE_LABELS) as ScholarshipAudienceTag[]
const SLOT_OPTIONS = Object.keys(SCHOLARSHIP_APPLY_SLOT_LABELS) as ScholarshipApplySlot[]
const CATEGORY_OPTIONS = Object.keys(SCHOLARSHIP_CATEGORY_LABELS) as ScholarshipCategoryId[]

type Draft = ScholarshipSavePayload & { id: string | null }

function emptyDraft(sortOrder: number): Draft {
  return {
    id: null,
    label: '',
    category: 'phcd',
    amountVnd: 0,
    sortOrder,
    isActive: true,
    validFrom: '',
    validTo: '',
    applySlots: ['slot1', 'slot2'],
    audienceTags: [],
    targetAudience: '',
    eligibilityNotes: '',
    adminNotes: '',
    applicationMethod: '',
    quantityLimit: undefined,
  }
}

function draftFromRow(row: ScholarshipRecord): Draft {
  return {
    id: row.id,
    label: row.label,
    category: row.category,
    amountVnd: row.amountVnd,
    sortOrder: row.sortOrder,
    isActive: row.isActive,
    validFrom: row.validFrom ?? '',
    validTo: row.validTo ?? '',
    applySlots: resolvedApplySlots(row),
    audienceTags: row.audienceTags ?? [],
    targetAudience: row.targetAudience ?? '',
    eligibilityNotes: row.eligibilityNotes ?? '',
    adminNotes: row.adminNotes ?? '',
    applicationMethod: row.applicationMethod ?? '',
    quantityLimit: row.quantityLimit,
  }
}

function payloadFromDraft(d: Draft): ScholarshipSavePayload {
  return {
    label: d.label,
    category: d.category,
    amountVnd: d.amountVnd,
    sortOrder: d.sortOrder,
    isActive: d.isActive,
    validFrom: d.validFrom?.trim() || undefined,
    validTo: d.validTo?.trim() || undefined,
    applySlots: d.applySlots?.length ? d.applySlots : ['slot1', 'slot2'],
    audienceTags: d.audienceTags?.length ? d.audienceTags : undefined,
    targetAudience: d.targetAudience?.trim() || undefined,
    eligibilityNotes: d.eligibilityNotes?.trim() || undefined,
    adminNotes: d.adminNotes?.trim() || undefined,
    applicationMethod: d.applicationMethod?.trim() || undefined,
    quantityLimit: d.quantityLimit != null && d.quantityLimit >= 0 ? d.quantityLimit : undefined,
  }
}

function statusBadgeClass(status: ReturnType<typeof scholarshipScheduleStatus>): string {
  switch (status) {
    case 'active':
      return 'bg-emerald-100 text-emerald-900'
    case 'scheduled':
      return 'bg-sky-100 text-sky-900'
    case 'expired':
      return 'bg-slate-200 text-slate-700'
    default:
      return 'bg-rose-100 text-rose-900'
  }
}

export function ScholarshipSettingsTab({ db, canEdit }: { db: Firestore; canEdit: boolean }) {
  const { items, loading, error } = useScholarships()
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | 'new' | null>(null)

  const sorted = useMemo(
    () =>
      [...items].sort(
        (a, b) =>
          a.category.localeCompare(b.category) ||
          a.sortOrder - b.sortOrder ||
          a.label.localeCompare(b.label, 'vi'),
      ),
    [items],
  )

  const nextSort = sorted.length ? Math.max(...sorted.map((s) => s.sortOrder)) + 10 : 10
  const [newDraft, setNewDraft] = useState(() => emptyDraft(nextSort))

  const run = useCallback(
    async (fn: () => Promise<void>) => {
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
    },
    [canEdit],
  )

  const onCreate = (e: FormEvent) => {
    e.preventDefault()
    void run(async () => {
      await saveScholarshipRow(db, null, payloadFromDraft(newDraft))
      setMsg('Đã thêm học bổng.')
      setNewDraft(emptyDraft(nextSort + 10))
      setEditingId(null)
    })
  }

  return (
    <section className="space-y-5 rounded-xl border border-violet-200/80 bg-white/90 p-4 shadow-sm md:p-5">
      <header className="space-y-1">
        <h3 className="text-sm font-bold uppercase tracking-wide text-violet-900">Cài đặt học bổng</h3>
        <p className="text-sm text-slate-600">
          Quản lý bảng học bổng theo <strong>Hệ</strong>, <strong>thời gian áp dụng</strong>,{' '}
          <strong>hình thức trừ học phí</strong>, <strong>đối tượng</strong> và <strong>số lượng suất</strong>. TVV chọn
          trên hồ sơ (Học bổng 1 / 2) — chỉ hiện mục đang trong hạn.
        </p>
      </header>

      {!canEdit ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
          Chỉ xem — cần quyền quản lý danh mục (admin).
        </p>
      ) : null}

      {loading ? <p className="text-sm text-slate-500">Đang tải danh mục…</p> : null}
      {error ? <p className="text-sm text-rose-700">{error}</p> : null}
      {msg ? <p className="text-sm text-emerald-800">{msg}</p> : null}

      {canEdit ? (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                const n = await syncDefaultScholarships(db)
                setMsg(`Đã đồng bộ ${n} học bổng theo bảng chuẩn (cập nhật / thay thế theo tên + hệ).`)
              })
            }
            className="rounded-lg border border-violet-300 bg-violet-50 px-3 py-1.5 text-xs font-semibold text-violet-900 hover:bg-violet-100 disabled:opacity-40"
          >
            Đồng bộ bảng chuẩn
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                const n = await seedDefaultScholarships(db)
                setMsg(`Đã thêm ${n} học bổng mặc định (bản ghi mới).`)
              })
            }
            className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold hover:bg-slate-100 disabled:opacity-40"
          >
            Thêm bản ghi mặc định
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => setEditingId(editingId === 'new' ? null : 'new')}
            className="inline-flex items-center gap-1 rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
          >
            <Plus className="h-3.5 w-3.5" /> Thêm học bổng
          </button>
        </div>
      ) : null}

      {canEdit && editingId === 'new' ? (
        <ScholarshipEditorCard
          title="Thêm học bổng mới"
          draft={newDraft}
          busy={busy}
          onChange={setNewDraft}
          onCancel={() => setEditingId(null)}
          onSubmit={onCreate}
          submitLabel="Thêm"
        />
      ) : null}

      <div className="space-y-3">
        {sorted.map((row) => {
          const status = scholarshipScheduleStatus(row)
          const open = editingId === row.id
          return (
            <article key={row.id} className="rounded-xl border border-slate-200 bg-white shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-2 border-b border-slate-100 px-3 py-3 sm:px-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h4 className="font-bold text-slate-900">{row.label}</h4>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${statusBadgeClass(status)}`}>
                      {SCHOLARSHIP_SCHEDULE_STATUS_LABELS[status]}
                    </span>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-700">
                      {SCHOLARSHIP_CATEGORY_LABELS[row.category]}
                    </span>
                  </div>
                  <p className="mt-1 text-sm font-semibold text-violet-900">{formatVnd(row.amountVnd)}</p>
                  <p className="mt-1 text-xs text-slate-600">
                    Thời gian: {formatScholarshipDate(row.validFrom)} → {formatScholarshipDate(row.validTo)}
                    {row.quantityLimit != null ? ` · Số lượng: ${row.quantityLimit} suất` : null}
                  </p>
                  {row.applicationMethod ? (
                    <p className="mt-0.5 text-xs text-slate-600">
                      <strong>Hình thức:</strong> {row.applicationMethod}
                    </p>
                  ) : null}
                  <p className="mt-0.5 text-xs text-slate-500">
                    <strong>Đối tượng:</strong> {audienceSummary(row)}
                    {row.targetAudience ? ` — ${row.targetAudience}` : ''}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    Ô hồ sơ: {resolvedApplySlots(row).map((s) => SCHOLARSHIP_APPLY_SLOT_LABELS[s]).join(', ')}
                  </p>
                </div>
                {canEdit ? (
                  <div className="flex gap-1">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => setEditingId(open ? null : row.id)}
                      className="rounded border border-violet-200 px-2 py-1 text-xs font-semibold text-violet-900 hover:bg-violet-50"
                    >
                      {open ? 'Đóng' : 'Sửa'}
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        if (!window.confirm(`Xóa «${row.label}»?`)) return
                        void run(async () => {
                          await deleteDoc(doc(db, FS_COLLECTIONS.scholarships, row.id))
                          setMsg('Đã xóa học bổng.')
                          if (editingId === row.id) setEditingId(null)
                        })
                      }}
                      className="rounded border border-rose-200 p-1 text-rose-700 hover:bg-rose-50"
                      aria-label="Xóa"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ) : null}
              </div>
              {open && canEdit ? (
                <div className="p-3 sm:p-4">
                  <ScholarshipEditorInline
                    row={row}
                    busy={busy}
                    onCancel={() => setEditingId(null)}
                    onSave={(payload) =>
                      run(async () => {
                        await saveScholarshipRow(db, row.id, payload)
                        setMsg('Đã lưu học bổng.')
                        setEditingId(null)
                      })
                    }
                  />
                </div>
              ) : null}
            </article>
          )
        })}
        {!loading && !sorted.length ? (
          <p className="rounded-lg border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-500">
            Chưa có học bổng — bấm «Đồng bộ bảng chuẩn» để nạp 16 mục theo file kế hoạch.
          </p>
        ) : null}
      </div>
    </section>
  )
}

function ScholarshipEditorInline({
  row,
  busy,
  onCancel,
  onSave,
}: {
  row: ScholarshipRecord
  busy: boolean
  onCancel: () => void
  onSave: (payload: ScholarshipSavePayload) => void
}) {
  const [draft, setDraft] = useState(() => draftFromRow(row))
  return (
    <>
      <ScholarshipFormFields draft={draft} busy={busy} onChange={setDraft} />
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy || !draft.label.trim()}
          onClick={() => onSave(payloadFromDraft(draft))}
          className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-40"
        >
          Lưu
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={onCancel}
          className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700"
        >
          Hủy
        </button>
      </div>
    </>
  )
}

function ScholarshipEditorCard({
  title,
  draft,
  busy,
  onChange,
  onCancel,
  onSubmit,
  submitLabel,
}: {
  title: string
  draft: Draft
  busy: boolean
  onChange: (d: Draft) => void
  onCancel: () => void
  onSubmit: (e: FormEvent) => void
  submitLabel: string
}) {
  return (
    <form onSubmit={onSubmit} className="rounded-xl border border-violet-100 bg-violet-50/40 p-4">
      <h4 className="text-sm font-bold text-violet-900">{title}</h4>
      <ScholarshipFormFields draft={draft} busy={busy} onChange={onChange} />
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={busy || !draft.label.trim()}
          className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-40"
        >
          {submitLabel}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={onCancel}
          className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700"
        >
          Hủy
        </button>
      </div>
    </form>
  )
}

function ScholarshipFormFields({
  draft,
  busy,
  onChange,
}: {
  draft: Draft
  busy: boolean
  onChange: (d: Draft) => void
}) {
  const patch = <K extends keyof Draft>(key: K, value: Draft[K]) => onChange({ ...draft, [key]: value })

  const toggleSlot = (slot: ScholarshipApplySlot) => {
    const cur = draft.applySlots ?? []
    const next = cur.includes(slot) ? cur.filter((s) => s !== slot) : [...cur, slot]
    patch('applySlots', next.length ? next : ['slot1'])
  }

  const toggleAudience = (tag: ScholarshipAudienceTag) => {
    const cur = draft.audienceTags ?? []
    patch('audienceTags', cur.includes(tag) ? cur.filter((t) => t !== tag) : [...cur, tag])
  }

  return (
    <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <label className="text-xs font-semibold sm:col-span-2 lg:col-span-3">
        Tên học bổng
        <input className={`${INPUT} mt-0.5`} value={draft.label} disabled={busy} onChange={(e) => patch('label', e.target.value)} required />
      </label>
      <label className="text-xs font-semibold">
        Hệ đào tạo
        <select
          className={`${INPUT} mt-0.5`}
          value={draft.category}
          disabled={busy}
          onChange={(e) => patch('category', e.target.value as ScholarshipCategoryId)}
        >
          {CATEGORY_OPTIONS.map((k) => (
            <option key={k} value={k}>
              {SCHOLARSHIP_CATEGORY_LABELS[k]}
            </option>
          ))}
        </select>
      </label>
      <label className="text-xs font-semibold">
        Mức học bổng (VNĐ)
        <input
          type="number"
          className={`${INPUT} mt-0.5`}
          value={draft.amountVnd || ''}
          disabled={busy}
          min={0}
          onChange={(e) => patch('amountVnd', Number(e.target.value) || 0)}
        />
      </label>
      <label className="text-xs font-semibold">
        Số lượng suất
        <input
          type="number"
          className={`${INPUT} mt-0.5`}
          value={draft.quantityLimit ?? ''}
          disabled={busy}
          min={0}
          placeholder="VD: 250"
          onChange={(e) => patch('quantityLimit', e.target.value === '' ? undefined : Number(e.target.value) || 0)}
        />
      </label>
      <label className="text-xs font-semibold">
        Thứ tự hiển thị
        <input
          type="number"
          className={`${INPUT} mt-0.5`}
          value={draft.sortOrder}
          disabled={busy}
          onChange={(e) => patch('sortOrder', Number(e.target.value) || 0)}
        />
      </label>
      <label className="text-xs font-semibold">
        Bắt đầu áp dụng
        <input
          type="date"
          className={`${INPUT} mt-0.5`}
          value={draft.validFrom ?? ''}
          disabled={busy}
          onChange={(e) => patch('validFrom', e.target.value)}
        />
      </label>
      <label className="text-xs font-semibold">
        Kết thúc áp dụng
        <input
          type="date"
          className={`${INPUT} mt-0.5`}
          value={draft.validTo ?? ''}
          disabled={busy}
          onChange={(e) => patch('validTo', e.target.value)}
        />
      </label>
      <label className="text-xs font-semibold sm:col-span-2 lg:col-span-3">
        Hình thức áp dụng (trừ học phí)
        <input
          className={`${INPUT} mt-0.5`}
          value={draft.applicationMethod ?? ''}
          disabled={busy}
          placeholder="VD: Cộng dồn 5 kỳ: 3-3-3-3-3 triệu"
          onChange={(e) => patch('applicationMethod', e.target.value)}
        />
      </label>
      <div className="text-xs font-semibold sm:col-span-2 lg:col-span-3">
        <span>Hiển thị trên hồ sơ (ô nào)</span>
        <div className="mt-1 flex flex-wrap gap-3">
          {SLOT_OPTIONS.map((slot) => (
            <label key={slot} className="inline-flex items-center gap-1.5 font-normal text-slate-800">
              <input
                type="checkbox"
                checked={(draft.applySlots ?? []).includes(slot)}
                disabled={busy}
                onChange={() => toggleSlot(slot)}
              />
              {SCHOLARSHIP_APPLY_SLOT_LABELS[slot]}
            </label>
          ))}
        </div>
      </div>
      <div className="text-xs font-semibold sm:col-span-2 lg:col-span-3">
        <span>Đối tượng (tag nhanh)</span>
        <div className="mt-1 grid gap-1 sm:grid-cols-2 lg:grid-cols-4">
          {AUDIENCE_OPTIONS.map((tag) => (
            <label key={tag} className="inline-flex items-center gap-1.5 font-normal text-slate-800">
              <input
                type="checkbox"
                checked={(draft.audienceTags ?? []).includes(tag)}
                disabled={busy}
                onChange={() => toggleAudience(tag)}
              />
              {SCHOLARSHIP_AUDIENCE_LABELS[tag]}
            </label>
          ))}
        </div>
      </div>
      <label className="text-xs font-semibold sm:col-span-2 lg:col-span-3">
        Đối tượng áp dụng (chi tiết — TVV đọc)
        <textarea
          className={`${INPUT} mt-0.5 min-h-[5rem]`}
          value={draft.targetAudience ?? ''}
          disabled={busy}
          placeholder="Điều kiện điểm, ngành, cơ sở, MOU…"
          onChange={(e) => patch('targetAudience', e.target.value)}
        />
      </label>
      <label className="text-xs font-semibold sm:col-span-2 lg:col-span-3">
        Ghi chú thêm / điều kiện kết hợp
        <textarea
          className={`${INPUT} mt-0.5 min-h-[3rem]`}
          value={draft.eligibilityNotes ?? ''}
          disabled={busy}
          onChange={(e) => patch('eligibilityNotes', e.target.value)}
        />
      </label>
      <label className="text-xs font-semibold sm:col-span-2 lg:col-span-3">
        Ghi chú nội bộ admin
        <textarea
          className={`${INPUT} mt-0.5 min-h-[2.5rem]`}
          value={draft.adminNotes ?? ''}
          disabled={busy}
          onChange={(e) => patch('adminNotes', e.target.value)}
        />
      </label>
      <label className="inline-flex items-center gap-2 text-sm font-semibold text-slate-800 sm:col-span-2 lg:col-span-3">
        <input type="checkbox" checked={draft.isActive} disabled={busy} onChange={(e) => patch('isActive', e.target.checked)} />
        Bật (hiển thị cho TVV khi trong hạn)
      </label>
    </div>
  )
}
