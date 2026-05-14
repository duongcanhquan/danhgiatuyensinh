import { useCallback, useMemo, useState } from 'react'
import { deleteDoc, doc, setDoc, Timestamp } from 'firebase/firestore'
import type { Firestore } from 'firebase/firestore'
import type { RuleCategory, ScoringRuleBlock, ScoringRuleConditionRow, ScoringRuleTemplateDoc } from '../types'
import { FS_COLLECTIONS, RULE_CATEGORIES, RULE_CATEGORY_LABELS } from '../types'
import { useScoringRuleTemplates } from '../hooks/useScoringRuleTemplates'
import { inferRuleCategory } from '../utils/scoringEngine'
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
  /** Khi chỉnh mẫu có sẵn — lưu online sẽ ghi đè mẫu gốc trùng key. */
  replacesBuiltinKey?: string | null
}

function stableOverrideDocId(builtinKey: string): string {
  const slug = builtinKey.replace(/[^a-zA-Z0-9_-]/g, '_').replace(/_+/g, '_')
  const trimmed = slug.slice(0, 100)
  return `ovr__${trimmed || 'tpl'}`
}

function sessionFromBuiltinTemplate(t: RuleLibraryTemplate, order: number): EditSession {
  const blk = t.build()
  return {
    id: stableOverrideDocId(t.key),
    order,
    title: t.title,
    hint: t.hint,
    block: blk,
    replacesBuiltinKey: t.key,
  }
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
    replacesBuiltinKey: d.replacesBuiltinKey ?? null,
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
    replacesBuiltinKey: s.replacesBuiltinKey?.trim() || null,
  }
}

export function RuleTemplateLibraryPanel({ db, canEdit }: { db: Firestore; canEdit: boolean }) {
  const { docs, loading, error } = useScoringRuleTemplates()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [session, setSession] = useState<EditSession | null>(null)
  const [localMsg, setLocalMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const pureCustomDocs = useMemo(() => docs.filter((d) => !d.replacesBuiltinKey), [docs])

  const builtinsByCategory = useMemo(() => {
    const m = new Map<RuleCategory, RuleLibraryTemplate[]>()
    for (const c of RULE_CATEGORIES) m.set(c, [])
    for (const t of getRuleLibraryTemplates()) {
      m.get(t.category)!.push(t)
    }
    return m
  }, [])

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
      hint: 'Sang tab Chấm điểm: kéo mẫu vào bộ điểm, chỉnh rồi lưu.',
      block: emptyBlock(),
      replacesBuiltinKey: null,
    })
    setLocalMsg(null)
  }, [nextOrder])

  const saveSession = useCallback(async () => {
    if (!canEdit || !session || !db) return
    const persist = toPersist(session)
    if (!persist.title) {
      setLocalMsg('Nhập tiêu đề mẫu.')
      return
    }
    if (!persist.label || !persist.targetField) {
      setLocalMsg('Tên khối và thông tin trên hồ sơ cần xem không được để trống.')
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
      setLocalMsg('Lưu không được — kiểm tra kết nối hoặc nhờ quản trị mở quyền lưu «mẫu quy tắc».')
    } finally {
      setBusy(false)
    }
  }, [canEdit, db, session])

  const removeTemplate = useCallback(async () => {
    if (!canEdit || !session || !db) return
    const persisted = docs.some((d) => d.id === session.id)
    if (!persisted) return
    const confirmMsg = session.replacesBuiltinKey?.trim()
      ? 'Xóa bản chỉnh mẫu có sẵn? Phần mềm sẽ dùng lại mẫu gốc.'
      : `Xóa mẫu «${session.title}» khỏi thư viện?`
    if (!window.confirm(confirmMsg)) return
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
  }, [canEdit, db, session, docs])

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
  const isPersisted = Boolean(session && docs.some((d) => d.id === session.id))

  return (
    <div className="space-y-4">
      <div className="grid min-h-0 gap-4 lg:grid-cols-[minmax(240px,300px)_1fr]">
        <div className="flex min-h-0 max-h-[min(78vh,720px)] flex-col rounded-xl border border-slate-200 bg-white/90 p-3 shadow-sm">
          <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pr-0.5 [scrollbar-width:thin]">
            <section>
              <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2">
                <p className="text-xs font-bold uppercase tracking-wide text-amber-900">Mẫu của trường (thêm, sửa, xóa)</p>
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
              {loading ? <p className="mt-2 text-xs text-slate-500">Đang tải…</p> : null}
              {error ? <p className="mt-2 text-xs text-rose-700">{error}</p> : null}
              <ul className="mt-2 space-y-1 text-sm">
                {pureCustomDocs.map((d) => (
                  <li key={d.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedId(d.id)
                        setSession(sessionFromDoc(d))
                        setLocalMsg(null)
                      }}
                      className={[
                        'w-full rounded-lg border px-2 py-2 text-left transition',
                        selectedId === d.id && session && !session.replacesBuiltinKey
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
              {!loading && !pureCustomDocs.length ? (
                <p className="mt-2 text-xs text-slate-500">Chưa có mẫu riêng — bấm «+ Thêm mẫu».</p>
              ) : null}
            </section>

            <section className="border-t border-slate-200 pt-2">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-800">Mẫu có sẵn (chỉnh được)</p>
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
                        {items.map((t) => {
                          const hasOverride = docs.some((d) => d.replacesBuiltinKey === t.key)
                          const selectedBuiltin = session?.replacesBuiltinKey === t.key
                          return (
                            <li key={t.key}>
                              <button
                                type="button"
                                onClick={() => {
                                  const ov = docs.find((d) => d.replacesBuiltinKey === t.key)
                                  if (ov) {
                                    setSelectedId(ov.id)
                                    setSession(sessionFromDoc(ov))
                                  } else {
                                    setSelectedId(null)
                                    setSession(sessionFromBuiltinTemplate(t, nextOrder))
                                  }
                                  setLocalMsg(null)
                                }}
                                className={[
                                  'w-full rounded-md border px-1.5 py-1.5 text-left text-xs transition',
                                  selectedBuiltin
                                    ? 'border-sky-400 bg-sky-50 text-slate-900'
                                    : 'border-transparent bg-white text-slate-800 hover:border-slate-200',
                                ].join(' ')}
                              >
                                <span className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                                  <span className="font-medium leading-tight">{t.title}</span>
                                  {hasOverride ? (
                                    <span className="rounded bg-emerald-100 px-1 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide text-emerald-900">
                                      Đã chỉnh
                                    </span>
                                  ) : null}
                                </span>
                              </button>
                            </li>
                          )
                        })}
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
            {session.replacesBuiltinKey ? (
              <p className="rounded-lg border border-sky-200 bg-sky-50/90 px-2.5 py-2 text-xs leading-snug text-sky-950">
                Bạn đang chỉnh <strong>mẫu có sẵn</strong> của phần mềm — <strong>Lưu mẫu</strong> để cả trường dùng bản này
                khi kéo thả. <strong>Xóa mẫu</strong> (sau khi đã lưu) để trả lại bản gốc. Chưa lưu thì bấm{' '}
                <strong>Huỷ nháp</strong>.
              </p>
            ) : null}
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-xs text-slate-600">
                Tên hiển thị khi kéo (ở tab Chấm điểm)
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
              Dòng chữ gợi ý nhỏ dưới tên mẫu
              <input
                value={session.hint}
                disabled={!canEdit || busy}
                onChange={(e) => setSession((s) => (s ? { ...s, hint: e.target.value } : s))}
                className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 text-sm"
              />
            </label>

            <div className="grid gap-3 border-t border-slate-100 pt-3 sm:grid-cols-2">
              <div className="text-xs text-slate-600">
                <p className="font-medium text-slate-700">Danh mục</p>
                <p className="mt-1 text-sm text-slate-900">{RULE_CATEGORY_LABELS[session.block.category]}</p>
              </div>
              <label className="block text-xs text-slate-600">
                Trần điểm tối đa của khối (gợi ý)
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
              Tên khối trên bảng chấm điểm
              <input
                value={session.block.label}
                disabled={!canEdit || busy}
                onChange={(e) => patchBlock({ label: e.target.value })}
                className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 text-sm"
              />
            </label>
            <label className="block text-xs text-slate-600">
              Thông tin trên hồ sơ cần soi (ví dụ: tỉnh, nguồn… — gõ đúng mã trong danh sách gợi ý)
              <input
                value={String(session.block.targetField)}
                disabled={!canEdit || busy}
                onChange={(e) => {
                  const tf = e.target.value
                  patchBlock({ targetField: tf, category: inferRuleCategory(tf) })
                }}
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
                      Giá trị so sánh (nếu chọn «thuộc nhóm đã liệt kê»: ghi các tên cách nhau bởi dấu phẩy)
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
                  {busy ? 'Đang lưu…' : 'Lưu mẫu'}
                </button>
                <button
                  type="button"
                  disabled={busy || !isPersisted}
                  onClick={() => void removeTemplate()}
                  className="rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-800 hover:bg-rose-100 disabled:opacity-40"
                  title={isPersisted ? 'Xóa khỏi thư viện (mẫu có sẵn: trả lại bản phần mềm)' : 'Chỉ xóa được sau khi đã lưu'}
                >
                  Xóa mẫu
                </button>
                {session.replacesBuiltinKey && !isPersisted ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      setSession(null)
                      setSelectedId(null)
                      setLocalMsg(null)
                    }}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50"
                  >
                    Huỷ nháp
                  </button>
                ) : null}
              </div>
            ) : (
              <p className="text-xs text-slate-500">Chỉ xem — cần quyền chỉnh bộ chấm điểm.</p>
            )}
          </div>
          ) : (
            <div className="space-y-2 text-sm text-slate-600">
              <p>
                Chọn một mẫu ở <strong>cột trái</strong>, hoặc bấm «+ Thêm mẫu» để tạo mẫu riêng cho trường.
              </p>
              <p className="text-xs leading-relaxed text-slate-500">
                Thứ tự làm việc: soạn mẫu ở đây (nếu cần) → sang tab <strong>Chấm điểm</strong> → kéo từ «Thư viện quy
                tắc» → chỉnh trên bảng → <strong>Lưu bộ chấm điểm</strong>.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
