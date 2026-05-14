import { useCallback, useMemo, useState } from 'react'
import { deleteDoc, doc, setDoc, Timestamp } from 'firebase/firestore'
import type { Firestore } from 'firebase/firestore'
import type { RuleCategory, ScoringRuleBlock, ScoringRuleConditionRow, ScoringRuleTemplateDoc } from '../types'
import { FS_COLLECTIONS, RULE_CATEGORIES, RULE_CATEGORY_LABELS } from '../types'
import { useScoringRuleTemplates } from '../hooks/useScoringRuleTemplates'
import { buildScoringBlockFromTemplateDoc, getRuleLibraryTemplates, type RuleLibraryTemplate } from '../utils/ruleLibrary'
import { scoringRuleTemplateDocToFirestorePayload } from '../utils/scoringRuleTemplatesFirestore'
import { SCORING_CONDITION_UI_OPTIONS } from '../utils/scoringConditionOptions'
import { AI_LEAD_FIELD_OPTIONS } from './aiLeadFieldOptions'

type EditSession = {
  id: string
  order: number
  title: string
  hint: string
  block: ScoringRuleBlock
}

function emptyBlock(category: RuleCategory = 'demographics'): ScoringRuleBlock {
  return {
    id: crypto.randomUUID(),
    category,
    label: 'Khối quy tắc mới',
    targetField: 'province',
    maxWeight: 20,
    rows: [
      {
        id: crypto.randomUUID(),
        condition: 'CONTAINS',
        value: '',
        allocationKind: 'absolute',
        allocationValue: 0,
      },
    ],
  }
}

function sessionFromDoc(d: ScoringRuleTemplateDoc): EditSession {
  return {
    id: d.id,
    order: d.order,
    title: d.title,
    hint: d.hint,
    block: buildScoringBlockFromTemplateDoc(d),
  }
}

function toPersist(s: EditSession): ScoringRuleTemplateDoc {
  return {
    id: s.id,
    order: s.order,
    title: s.title.trim(),
    hint: s.hint.trim(),
    label: s.block.label.trim(),
    targetField: String(s.block.targetField).trim(),
    maxWeight: Math.max(0, Number(s.block.maxWeight) || 0),
    category: s.block.category,
    rows: s.block.rows.map(({ id, ...r }) => {
      void id
      return r
    }),
  }
}

export function RuleTemplateLibraryPanel({ db, canEdit }: { db: Firestore; canEdit: boolean }) {
  const { docs, loading, error } = useScoringRuleTemplates()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [session, setSession] = useState<EditSession | null>(null)
  const [builtinPreview, setBuiltinPreview] = useState<RuleLibraryTemplate | null>(null)
  const [localMsg, setLocalMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const builtinsByCategory = useMemo(() => {
    const m = new Map<RuleCategory, RuleLibraryTemplate[]>()
    for (const c of RULE_CATEGORIES) m.set(c, [])
    for (const t of getRuleLibraryTemplates()) {
      m.get(t.category)!.push(t)
    }
    return m
  }, [])

  const builtinBlockSnapshot = useMemo(
    () => (builtinPreview ? builtinPreview.build() : null),
    [builtinPreview],
  )

  const nextOrder = useMemo(() => {
    if (!docs.length) return 10
    return Math.max(...docs.map((d) => d.order)) + 10
  }, [docs])

  const startNew = useCallback(() => {
    const id = crypto.randomUUID()
    setSelectedId(id)
    setSession({
      id,
      order: nextOrder,
      title: 'Mẫu quy tắc mới',
      hint: 'Kéo sang tab Chấm điểm → profile, chỉnh và lưu theo từng profile.',
      block: emptyBlock(),
    })
    setLocalMsg(null)
    setBuiltinPreview(null)
  }, [nextOrder])

  const saveSession = useCallback(async () => {
    if (!canEdit || !session || !db) return
    const persist = toPersist(session)
    if (!persist.title) {
      setLocalMsg('Nhập tiêu đề mẫu.')
      return
    }
    if (!persist.label || !persist.targetField) {
      setLocalMsg('Nhãn khối và trường lead không được trống.')
      return
    }
    if (!persist.rows.length) {
      setLocalMsg('Thêm ít nhất một dòng điều kiện.')
      return
    }
    setBusy(true)
    setLocalMsg(null)
    try {
      const ref = doc(db, FS_COLLECTIONS.scoringRuleTemplates, persist.id)
      await setDoc(
        ref,
        {
          ...scoringRuleTemplateDocToFirestorePayload(persist),
          updatedAt: Timestamp.now(),
        },
        { merge: true },
      )
      setLocalMsg('Đã lưu mẫu.')
    } catch (e) {
      console.error(e)
      setLocalMsg('Lưu thất bại — kiểm tra Firestore Rules (collection scoringRuleTemplates).')
    } finally {
      setBusy(false)
    }
  }, [canEdit, db, session])

  const removeTemplate = useCallback(async () => {
    if (!canEdit || !session || !db) return
    if (!window.confirm(`Xóa mẫu «${session.title}» khỏi thư viện?`)) return
    setBusy(true)
    try {
      await deleteDoc(doc(db, FS_COLLECTIONS.scoringRuleTemplates, session.id))
      setSelectedId(null)
      setSession(null)
      setLocalMsg('Đã xóa.')
    } catch (e) {
      console.error(e)
      setLocalMsg('Xóa thất bại.')
    } finally {
      setBusy(false)
    }
  }, [canEdit, db, session])

  const patchBlock = useCallback((patch: Partial<ScoringRuleBlock>) => {
    setSession((s) => (s ? { ...s, block: { ...s.block, ...patch } } : s))
  }, [])

  const patchRow = useCallback((ri: number, patch: Partial<ScoringRuleConditionRow>) => {
    setSession((s) => {
      if (!s) return s
      const rows = s.block.rows.map((r, j) => (j === ri ? { ...r, ...patch } : r))
      return { ...s, block: { ...s.block, rows } }
    })
  }, [])

  const addRow = useCallback(() => {
    setSession((s) => {
      if (!s) return s
      const row: ScoringRuleConditionRow = {
        id: crypto.randomUUID(),
        condition: 'CONTAINS',
        value: '',
        allocationKind: 'absolute',
        allocationValue: 0,
      }
      return { ...s, block: { ...s.block, rows: [...s.block.rows, row] } }
    })
  }, [])

  const removeRow = useCallback((ri: number) => {
    setSession((s) => {
      if (!s) return s
      return { ...s, block: { ...s.block, rows: s.block.rows.filter((_, j) => j !== ri) } }
    })
  }, [])

  const fieldIds = useMemo(() => AI_LEAD_FIELD_OPTIONS.map((o) => o.id), [])
  const isSaved = session && docs.some((d) => d.id === session.id)

  return (
    <div className="space-y-4">
      <div
        className="rounded-xl border border-sky-200/90 bg-sky-50/80 px-3 py-2.5 text-xs leading-relaxed text-slate-800 shadow-sm"
        role="note"
      >
        <p className="font-semibold text-sky-950">Ba phần khác nhau — dễ nhầm</p>
        <ul className="mt-1.5 list-disc space-y-1 pl-4 marker:text-sky-700">
          <li>
            <strong>Danh mục</strong> (tab khác): danh sách giá trị chuẩn (tỉnh, nguồn, v.v.) để điền hồ sơ và để điều kiện{' '}
            <code className="rounded bg-white/90 px-1 font-mono text-[0.85em]">IN_LIST</code> so khớp —{' '}
            <em>không</em> phải chỗ kéo khối quy tắc.
          </li>
          <li>
            <strong>Quy tắc mẫu</strong> (tab này): liệt kê <em>mẫu Firestore</em> (thêm / sửa / xóa) và <em>mẫu có sẵn</em> (chỉ
            xem). Sau khi lưu mẫu Firestore, mẫu xuất hiện ở tab <strong>Chấm điểm</strong> → cột <strong>Thư viện quy tắc</strong>{' '}
            (trước mẫu có sẵn trong từng nhóm).
          </li>
          <li>
            <strong>Profile chấm điểm</strong>: kéo mẫu sang canvas bên phải, chỉnh điểm rồi <strong>Lưu profile</strong> — mỗi profile là một bản cấu hình riêng; sửa mẫu Firestore không tự đổi profile đã lưu trước đó.
          </li>
        </ul>
        <div className="mt-3 border-t border-slate-200 pt-2">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-700">Ví dụ — Danh mục ↔ chấm điểm</p>
          <p className="mt-1.5 text-xs leading-relaxed text-slate-700">
            Giả sử tab <strong>Danh mục</strong> có loại «Nguồn lead» với các mục: <em>Facebook</em>, <em>Zalo</em>,{' '}
            <em>Giới thiệu</em> (mỗi mục có thể thêm <em>từ đồng nghĩa</em>, ví dụ «fb» → Facebook). Trên hồ sơ, TVV chọn
            nguồn tương ứng. Trong profile chấm điểm, một dòng điều kiện{' '}
            <code className="rounded bg-white/90 px-1 font-mono text-[0.85em]">IN_LIST</code> liệt kê «Facebook, Zalo» sẽ
            cộng điểm khi giá trị trên hồ sơ <strong>khớp một trong các mục đó</strong> nhờ dữ liệu master. Nếu không dùng
            danh mục, <code className="rounded bg-white/90 px-1 font-mono text-[0.85em]">IN_LIST</code> chỉ so với đúng
            chuỗi / danh sách bạn gõ trong quy tắc — không có «kho chung» đồng bộ với form lead.
          </p>
        </div>
      </div>

      <div className="grid min-h-0 gap-4 lg:grid-cols-[minmax(240px,300px)_1fr]">
        <div className="flex min-h-0 max-h-[min(78vh,720px)] flex-col rounded-xl border border-slate-200 bg-white/90 p-3 shadow-sm">
          <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pr-0.5 [scrollbar-width:thin]">
            <section>
              <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2">
                <p className="text-xs font-bold uppercase tracking-wide text-amber-900">Mẫu tùy chỉnh (Firestore)</p>
                {canEdit ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={startNew}
                    className="rounded-lg border border-emerald-600 bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                  >
                    + Thêm mẫu
                  </button>
                ) : null}
              </div>
              <p className="mt-1.5 text-xs leading-snug text-slate-600">
                Thêm / sửa / xóa tại đây — mẫu động, không cần cập nhật app. Sau khi lưu, kéo từ tab <strong>Chấm điểm</strong>.
              </p>
              {loading ? <p className="mt-2 text-xs text-slate-500">Đang tải…</p> : null}
              {error ? <p className="mt-2 text-xs text-rose-700">{error}</p> : null}
              <ul className="mt-2 space-y-1 text-sm">
                {docs.map((d) => (
                  <li key={d.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedId(d.id)
                        setSession(sessionFromDoc(d))
                        setBuiltinPreview(null)
                        setLocalMsg(null)
                      }}
                      className={[
                        'w-full rounded-lg border px-2 py-2 text-left transition',
                        selectedId === d.id && !builtinPreview
                          ? 'border-amber-400 bg-amber-50/90 text-slate-900'
                          : 'border-transparent bg-slate-50/80 text-slate-800 hover:border-slate-200',
                      ].join(' ')}
                    >
                      <span className="block font-semibold leading-tight">{d.title}</span>
                      <span className="mt-0.5 block text-xs text-slate-600">
                        {RULE_CATEGORY_LABELS[d.category]} · {d.targetField}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
              {!loading && !docs.length ? (
                <p className="mt-2 text-xs text-slate-500">Chưa có mẫu Firestore — bấm «+ Thêm mẫu».</p>
              ) : null}
            </section>

            <section className="border-t border-slate-200 pt-2">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-800">Mẫu có sẵn (trong app)</p>
              <p className="mt-1 text-xs leading-snug text-slate-600">
                Cố định theo phiên bản app — <strong>không sửa/xóa tại đây</strong>. Bấm để xem trước; kéo từ tab{' '}
                <strong>Chấm điểm</strong> rồi chỉnh trên profile.
              </p>
              <div className="mt-2 max-h-[min(38vh,320px)] space-y-2 overflow-y-auto pr-0.5 [scrollbar-width:thin]">
                {RULE_CATEGORIES.map((cat) => {
                  const items = builtinsByCategory.get(cat) ?? []
                  if (!items.length) return null
                  return (
                    <div key={cat}>
                      <p className="mb-1 text-[0.65rem] font-semibold uppercase tracking-wide text-slate-500">
                        {RULE_CATEGORY_LABELS[cat]}
                      </p>
                      <ul className="space-y-0.5">
                        {items.map((t) => (
                          <li key={t.key}>
                            <button
                              type="button"
                              onClick={() => {
                                setBuiltinPreview(t)
                                setSession(null)
                                setSelectedId(null)
                                setLocalMsg(null)
                              }}
                              className={[
                                'w-full rounded-md border px-1.5 py-1.5 text-left text-xs transition',
                                builtinPreview?.key === t.key
                                  ? 'border-sky-400 bg-sky-50 text-slate-900'
                                  : 'border-transparent bg-white text-slate-800 hover:border-slate-200',
                              ].join(' ')}
                            >
                              <span className="font-medium leading-tight">{t.title}</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )
                })}
              </div>
            </section>
          </div>
        </div>

        <div className="min-h-0 rounded-xl border border-slate-200 bg-white/95 p-4 shadow-sm">
          {session ? (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-xs text-slate-600">
                Tiêu đề (trong thư viện kéo)
                <input
                  value={session.title}
                  disabled={!canEdit || busy}
                  onChange={(e) => setSession((s) => (s ? { ...s, title: e.target.value } : s))}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 text-sm"
                />
              </label>
              <label className="block text-xs text-slate-600">
                Thứ tự (số nhỏ lên trước)
                <input
                  type="number"
                  value={session.order}
                  disabled={!canEdit || busy}
                  onChange={(e) =>
                    setSession((s) => (s ? { ...s, order: Number(e.target.value) || 0 } : s))
                  }
                  className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 text-sm"
                />
              </label>
            </div>
            <label className="block text-xs text-slate-600">
              Gợi ý (mô tả ngắn dưới tiêu đề mẫu)
              <input
                value={session.hint}
                disabled={!canEdit || busy}
                onChange={(e) => setSession((s) => (s ? { ...s, hint: e.target.value } : s))}
                className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 text-sm"
              />
            </label>

            <div className="grid gap-3 border-t border-slate-100 pt-3 sm:grid-cols-2">
              <label className="block text-xs text-slate-600">
                Nhóm (canvas / analytics)
                <select
                  value={session.block.category}
                  disabled={!canEdit || busy}
                  onChange={(e) => patchBlock({ category: e.target.value as RuleCategory })}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 text-sm"
                >
                  {RULE_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {RULE_CATEGORY_LABELS[c]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-xs text-slate-600">
                Ngân sách max khối (gợi ý %)
                <input
                  type="number"
                  value={session.block.maxWeight}
                  disabled={!canEdit || busy}
                  onChange={(e) => patchBlock({ maxWeight: Math.max(0, Number(e.target.value) || 0) })}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 text-sm"
                />
              </label>
            </div>
            <label className="block text-xs text-slate-600">
              Nhãn khối (trên canvas profile)
              <input
                value={session.block.label}
                disabled={!canEdit || busy}
                onChange={(e) => patchBlock({ label: e.target.value })}
                className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 text-sm"
              />
            </label>
            <label className="block text-xs text-slate-600">
              Trường lead (targetField)
              <input
                value={String(session.block.targetField)}
                disabled={!canEdit || busy}
                onChange={(e) => patchBlock({ targetField: e.target.value })}
                list="rule-template-lead-fields"
                className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 font-mono text-sm"
              />
              <datalist id="rule-template-lead-fields">
                {fieldIds.map((id) => (
                  <option key={id} value={id} />
                ))}
              </datalist>
            </label>

            <div className="border-t border-slate-100 pt-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold text-slate-800">Dòng điều kiện</p>
                {canEdit ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={addRow}
                    className="rounded-md border border-sky-300 bg-sky-50 px-2 py-1 text-xs font-semibold text-sky-900 hover:bg-sky-100"
                  >
                    + Dòng
                  </button>
                ) : null}
              </div>
              <div className="mt-2 space-y-3">
                {session.block.rows.map((r, ri) => (
                  <div key={r.id} className="rounded-lg border border-slate-200/90 bg-slate-50/80 p-2">
                    <div className="flex flex-wrap items-end gap-2">
                      <label className="min-w-[140px] flex-1 text-xs text-slate-600">
                        Điều kiện
                        <select
                          value={r.condition}
                          disabled={!canEdit || busy}
                          onChange={(e) =>
                            patchRow(ri, {
                              condition: e.target.value as ScoringRuleConditionRow['condition'],
                            })
                          }
                          className="mt-0.5 w-full rounded border border-slate-200 bg-white px-1.5 py-1.5 text-xs"
                        >
                          {SCORING_CONDITION_UI_OPTIONS.map((o) => (
                            <option key={o.value} value={o.value}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="min-w-[120px] flex-1 text-xs text-slate-600">
                        Phân bổ
                        <select
                          value={r.allocationKind}
                          disabled={!canEdit || busy}
                          onChange={(e) =>
                            patchRow(ri, {
                              allocationKind: e.target.value as ScoringRuleConditionRow['allocationKind'],
                            })
                          }
                          className="mt-0.5 w-full rounded border border-slate-200 bg-white px-1.5 py-1.5 text-xs"
                        >
                          <option value="absolute">Điểm tuyệt đối</option>
                          <option value="percent_of_max">% trên max khối</option>
                        </select>
                      </label>
                      <label className="w-24 text-xs text-slate-600">
                        Điểm / %
                        <input
                          type="number"
                          step={1}
                          value={r.allocationValue}
                          disabled={!canEdit || busy}
                          onChange={(e) => patchRow(ri, { allocationValue: Number(e.target.value) })}
                          className="mt-0.5 w-full rounded border border-slate-200 bg-white px-1.5 py-1.5 text-xs"
                        />
                      </label>
                      {canEdit ? (
                        <button
                          type="button"
                          disabled={busy || session.block.rows.length < 2}
                          onClick={() => removeRow(ri)}
                          className="rounded border border-rose-200 bg-white px-2 py-1 text-xs font-medium text-rose-800 hover:bg-rose-50 disabled:opacity-40"
                        >
                          Xóa dòng
                        </button>
                      ) : null}
                    </div>
                    <label className="mt-2 block text-xs text-slate-600">
                      Giá trị (IN_LIST: nhãn cách phẩy → thành danh sách khi lưu profile)
                      <input
                        value={Array.isArray(r.value) ? r.value.join(', ') : String(r.value ?? '')}
                        disabled={
                          !canEdit ||
                          busy ||
                          r.condition === 'IS_NOT_EMPTY' ||
                          r.condition === 'PHONE_VN_10_DIGITS' ||
                          r.condition === 'PHONE_VN_NOT_10_DIGITS' ||
                          r.condition === 'HAS_DIGIT'
                        }
                        onChange={(e) => {
                          const v = e.target.value
                          patchRow(ri, {
                            value:
                              r.condition === 'IN_LIST'
                                ? v.split(',').map((x) => x.trim()).filter(Boolean)
                                : v,
                          })
                        }}
                        className="mt-0.5 w-full rounded border border-slate-200 bg-white px-2 py-1.5 text-xs"
                      />
                    </label>
                  </div>
                ))}
              </div>
            </div>

            {localMsg ? (
              <p className={`text-sm ${localMsg.startsWith('Đã') ? 'text-emerald-700' : 'text-rose-700'}`}>
                {localMsg}
              </p>
            ) : null}

            {canEdit ? (
              <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-3">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void saveSession()}
                  className="rounded-lg border border-emerald-600 bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  {busy ? 'Đang lưu…' : 'Lưu mẫu vào thư viện'}
                </button>
                <button
                  type="button"
                  disabled={busy || !isSaved}
                  onClick={() => void removeTemplate()}
                  className="rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-800 hover:bg-rose-100 disabled:opacity-40"
                  title="Chỉ xóa được sau khi mẫu đã lưu ít nhất một lần"
                >
                  Xóa mẫu
                </button>
              </div>
            ) : (
              <p className="text-xs text-slate-500">Chỉ xem — cần quyền chỉnh bộ chấm điểm.</p>
            )}
          </div>
          ) : builtinPreview && builtinBlockSnapshot ? (
            <div className="space-y-3">
              <p className="text-xs font-bold uppercase tracking-wide text-sky-900">Xem trước — mẫu có sẵn trong app</p>
              <p className="text-sm font-semibold text-slate-900">{builtinPreview.title}</p>
              <p className="text-xs text-slate-600">{builtinPreview.hint}</p>
              <div className="rounded-lg border border-slate-200 bg-slate-50/90 p-3 text-xs text-slate-800">
                <p>
                  <span className="font-semibold text-slate-700">Nhóm:</span> {RULE_CATEGORY_LABELS[builtinBlockSnapshot.category]}
                </p>
                <p className="mt-1">
                  <span className="font-semibold text-slate-700">Nhãn khối:</span> {builtinBlockSnapshot.label}
                </p>
                <p className="mt-1">
                  <span className="font-semibold text-slate-700">Trường lead:</span>{' '}
                  <code className="rounded bg-white px-1 font-mono">{String(builtinBlockSnapshot.targetField)}</code>
                </p>
                <p className="mt-1">
                  <span className="font-semibold text-slate-700">Max khối:</span> {builtinBlockSnapshot.maxWeight}
                </p>
                <p className="mt-2 font-semibold text-slate-800">Các dòng điều kiện (tóm tắt)</p>
                <ol className="mt-1 list-decimal space-y-1.5 pl-4 text-slate-700">
                  {builtinBlockSnapshot.rows.map((r) => (
                    <li key={r.id}>
                      <code className="rounded bg-white px-1 font-mono">{r.condition}</code>
                      {r.condition !== 'IS_NOT_EMPTY' &&
                      r.condition !== 'PHONE_VN_10_DIGITS' &&
                      r.condition !== 'PHONE_VN_NOT_10_DIGITS' &&
                      r.condition !== 'HAS_DIGIT' ? (
                        <span className="text-slate-600">
                          {' '}
                          →{' '}
                          {Array.isArray(r.value) ? r.value.join(', ') : String(r.value ?? '')}
                        </span>
                      ) : (
                        <span className="text-slate-500"> (không cần giá trị)</span>
                      )}
                      <span className="text-slate-600">
                        {' '}
                        · {r.allocationKind === 'percent_of_max' ? `${r.allocationValue}% max` : `${r.allocationValue} điểm`}
                      </span>
                    </li>
                  ))}
                </ol>
              </div>
              <p className="text-xs leading-relaxed text-slate-600">
                Sang tab <strong>Chấm điểm</strong> để <strong>kéo</strong> mẫu này vào canvas profile và chỉnh điểm. Mẫu gốc
                trong code không sửa tại đây — nếu cần biến thể lưu lâu dài, hãy tạo <strong>mẫu Firestore</strong> tương tự
                phía danh sách trên.
              </p>
            </div>
          ) : (
            <div className="space-y-2 text-sm text-slate-600">
              <p>
                Chọn một <strong>mẫu Firestore</strong> hoặc <strong>mẫu có sẵn</strong> ở cột trái, hoặc bấm «+ Thêm mẫu».
              </p>
              <p className="text-xs leading-relaxed text-slate-500">
                Luồng đúng như bạn mô tả: quản lý mẫu (thêm / bớt / sửa) ở đây với phần Firestore → sang tab{' '}
                <strong>Chấm điểm</strong> kéo từ «Thư viện quy tắc» → chỉnh trên canvas → <strong>Lưu profile</strong>.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
