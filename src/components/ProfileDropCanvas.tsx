import { useCallback, useState, type DragEvent } from 'react'
import { motion } from 'motion/react'
import { ChevronRight, GripVertical, Trash2 } from 'lucide-react'
import type {
  ProfileScoringCondition,
  ScoringRuleAllocationKind,
  ScoringRuleBlock,
  ScoringRuleConditionRow,
} from '../types'
import { RULE_CATEGORY_LABELS } from '../types'
import { SCORING_CONDITION_UI_OPTIONS } from '../utils/scoringConditionOptions'
import { createBlockFromTemplateKey, RULE_TEMPLATE_DRAG_MIME, type RuleLibraryTemplate } from '../utils/ruleLibrary'

function conditionUsesNoValueRow(c: ProfileScoringCondition): boolean {
  return (
    c === 'IS_NOT_EMPTY' ||
    c === 'PHONE_VN_10_DIGITS' ||
    c === 'PHONE_VN_NOT_10_DIGITS' ||
    c === 'HAS_DIGIT'
  )
}

function conditionOptionLabel(c: ProfileScoringCondition): string {
  return SCORING_CONDITION_UI_OPTIONS.find((x) => x.value === c)?.label ?? c
}

function rowValuePreview(r: ScoringRuleConditionRow): string {
  if (conditionUsesNoValueRow(r.condition)) return '—'
  if (Array.isArray(r.value)) return r.value.map((s) => String(s).trim()).filter(Boolean).join(', ')
  return String(r.value ?? '').trim()
}

const ALLOCATION_OPTIONS: { value: ScoringRuleAllocationKind; label: string }[] = [
  { value: 'absolute', label: 'Điểm tuyệt đối' },
  { value: 'percent_of_max', label: '% trên max khối' },
]

const REORDER_MIME = 'text/x-vietmy-block-index'

function formatSignedPoints(n: number): string {
  if (!Number.isFinite(n)) return '0'
  if (n > 0) return `+${n}`
  return String(n)
}

/** Nền sáng trong thẻ rule (xanh / đỏ / trung tính). */
function signedPointsOnLight(n: number): string {
  if (!Number.isFinite(n)) return 'text-slate-700'
  if (n > 0) return 'font-semibold text-emerald-600'
  if (n < 0) return 'font-semibold text-rose-600'
  return 'text-slate-700'
}

function allocationPreviewPoints(block: ScoringRuleBlock, r: ScoringRuleConditionRow): number {
  const cap = Math.max(0, Number(block.maxWeight) || 0)
  const p = Number(r.allocationValue)
  if (!Number.isFinite(p)) return 0
  if (r.allocationKind === 'percent_of_max') return Math.round((cap * p) / 100)
  return p
}

/** Header canvas — một dòng để nhường chiều cao cho khối kéo thả. */
function CumulativeScoringCanvasHeader() {
  return (
    <header className="sticky top-0 z-30 mb-2 rounded-lg border border-slate-200/90 bg-white/95 px-2.5 py-2 shadow-sm backdrop-blur-sm">
      <p className="text-xs font-semibold leading-snug text-slate-700">
        Canvas bên phải ·{' '}
        <span className="text-slate-600">
          kéo mẫu từ thư viện; mỗi dòng: bấm thanh tóm tắt để thu gọn / mở chi tiết
        </span>{' '}
        · cộng dồn ± theo dòng khớp
      </p>
    </header>
  )
}

function RuleConfigurationCard({
  block,
  index,
  canEdit,
  onPatch,
  onRemove,
  onAddRow,
  onPatchRow,
  onRemoveRow,
  onDragStartReorder,
  onDragOver,
  onDropOnCard,
}: {
  block: ScoringRuleBlock
  index: number
  canEdit: boolean
  onPatch: (patch: Partial<ScoringRuleBlock>) => void
  onRemove: () => void
  onAddRow: () => void
  onPatchRow: (rowIndex: number, patch: Partial<ScoringRuleConditionRow>) => void
  onRemoveRow: (rowIndex: number) => void
  onDragStartReorder: (e: DragEvent, index: number) => void
  onDragOver: (e: DragEvent) => void
  onDropOnCard: (e: DragEvent, index: number) => void
}) {
  const [rowExpanded, setRowExpanded] = useState<Record<string, boolean>>({})

  const isRowOpen = (rowId: string) => {
    const v = rowExpanded[rowId]
    if (v !== undefined) return v
    return block.rows.length <= 2
  }

  const toggleRow = (rowId: string) => {
    setRowExpanded((prev) => {
      const cur = prev[rowId] !== undefined ? prev[rowId]! : block.rows.length <= 2
      return { ...prev, [rowId]: !cur }
    })
  }

  return (
    <motion.article
      layout
      onDragOver={onDragOver}
      onDrop={(e) => onDropOnCard(e, index)}
      className="rounded-xl border border-slate-200 bg-gradient-to-br from-white to-slate-50 p-2.5 shadow-sm"
    >
      <div className="flex flex-wrap items-start gap-2 border-b border-slate-200 pb-2">
        <button
          type="button"
          draggable={canEdit}
          onDragStart={(e) => onDragStartReorder(e, index)}
          className="mt-0.5 shrink-0 rounded-md border border-slate-200 bg-white p-1 text-slate-500 hover:border-amber-300 hover:bg-amber-50 hover:text-amber-800 disabled:opacity-30"
          disabled={!canEdit}
          aria-label="Kéo để sắp xếp khối"
        >
          <GripVertical className="h-3.5 w-3.5" />
        </button>
        <div className="min-w-0 flex-1 space-y-1.5">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">
            {RULE_CATEGORY_LABELS[block.category]} · #{index + 1}
          </p>
          <input
            value={block.label}
            disabled={!canEdit}
            onChange={(e) => onPatch({ label: e.target.value })}
            className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-semibold text-slate-900 outline-none focus:ring-1 focus:ring-amber-400/40 disabled:opacity-50"
            placeholder="Nhãn khối"
          />
        </div>
        {canEdit ? (
          <button
            type="button"
            onClick={onRemove}
            className="shrink-0 rounded-md border border-rose-200 bg-rose-50 p-1.5 text-rose-700 hover:bg-rose-100"
            aria-label="Xóa khối"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        ) : null}
      </div>

      <div className="mt-2 space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-1.5">
          <p className="text-xs font-semibold text-slate-700">
            Điều kiện <span className="font-bold text-violet-800">cộng dồn</span>
          </p>
          {canEdit ? (
            <button
              type="button"
              onClick={onAddRow}
              className="rounded-md border border-violet-300 bg-violet-50 px-2 py-1 text-xs font-semibold text-violet-900 hover:bg-violet-100"
            >
              + Dòng
            </button>
          ) : null}
        </div>
        {block.rows.map((r, ri) => {
          const previewPts = allocationPreviewPoints(block, r)
          const allocNum = Number(r.allocationValue)
          const allocInputClass =
            'mt-0.5 w-full rounded-md border border-amber-200/80 bg-white px-2 py-1.5 text-xs tabular-nums disabled:opacity-50 ' +
            signedPointsOnLight(allocNum)
          const open = isRowOpen(r.id)
          const valShort = rowValuePreview(r)
          const valShown = valShort.length > 56 ? `${valShort.slice(0, 54)}…` : valShort
          return (
          <div
            key={r.id}
            className="rounded-lg border border-slate-200/90 bg-white p-2 shadow-sm ring-1 ring-slate-100/80"
          >
            <div className="mb-1.5 flex flex-wrap items-center gap-1.5 border-b border-slate-100 pb-1.5">
              <button
                type="button"
                onClick={() => toggleRow(r.id)}
                aria-expanded={open}
                aria-label={open ? `Thu gọn dòng ${ri + 1}` : `Mở chi tiết dòng ${ri + 1}`}
                className="flex min-w-0 flex-1 items-center gap-1 rounded-md py-0.5 pl-0.5 pr-1 text-left hover:bg-slate-50"
              >
                <ChevronRight
                  className={`h-3.5 w-3.5 shrink-0 text-slate-500 transition-transform ${open ? 'rotate-90' : ''}`}
                  aria-hidden
                />
                <span className="shrink-0 text-xs font-bold text-slate-600">Dòng {ri + 1}</span>
                <span className="min-w-0 truncate text-xs text-slate-600">
                  <span className="font-medium text-slate-800">{conditionOptionLabel(r.condition)}</span>
                  <span className="text-slate-400"> · </span>
                  <span className="font-mono text-slate-500" title={valShort || undefined}>
                    {valShown || '—'}
                  </span>
                  <span className="text-slate-400"> · </span>
                  <span className={`tabular-nums ${signedPointsOnLight(previewPts)}`}>
                    {formatSignedPoints(previewPts)} điểm
                  </span>
                </span>
              </button>
              <span className="text-xs text-slate-400">{open ? 'Thu gọn' : 'Chi tiết'}</span>
              {canEdit && block.rows.length > 1 ? (
                <button
                  type="button"
                  onClick={() => onRemoveRow(ri)}
                  className="shrink-0 rounded border border-rose-200 bg-white px-1.5 py-0.5 text-xs font-medium text-rose-700 hover:bg-rose-50"
                >
                  Xóa dòng
                </button>
              ) : null}
            </div>
            {open ? (
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2 md:items-stretch">
              <div className="flex min-h-0 flex-col gap-1.5 rounded-lg border border-sky-200/90 bg-sky-50/50 p-2">
                <p className="text-xs font-bold uppercase tracking-wide text-sky-900">1 · Điều kiện &amp; giá trị</p>
                <label className="text-xs text-slate-600">
                  Điều kiện
                  <select
                    value={r.condition}
                    disabled={!canEdit}
                    onChange={(e) =>
                      onPatchRow(ri, { condition: e.target.value as ProfileScoringCondition })
                    }
                    className="mt-0.5 w-full rounded-md border border-sky-200/80 bg-white px-1.5 py-1.5 text-xs text-slate-900 disabled:opacity-50"
                  >
                    {SCORING_CONDITION_UI_OPTIONS.map((c) => (
                      <option key={c.value} value={c.value}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-xs text-slate-600">
                  Giá trị
                  <input
                    value={Array.isArray(r.value) ? r.value.join(', ') : String(r.value)}
                    disabled={!canEdit || conditionUsesNoValueRow(r.condition)}
                    onChange={(e) => {
                      const v = e.target.value
                      onPatchRow(ri, {
                        value:
                          r.condition === 'IN_LIST'
                            ? v
                                .split(',')
                                .map((s) => s)
                                .filter((s) => s.trim().length > 0)
                            : v,
                      })
                    }}
                    className="mt-0.5 w-full rounded-md border border-sky-200/80 bg-white px-2 py-1.5 text-xs text-slate-900 disabled:opacity-40"
                  />
                </label>
                {r.condition === 'CONTAINS' ? (
                  <p className="text-xs leading-snug text-slate-600">
                    Nhiều từ khóa <strong>cách nhau bởi dấu phẩy</strong> — khớp nếu trường lead chứa{' '}
                    <strong>bất kỳ</strong> từ nào. So khớp <strong>không phân biệt hoa thường và dấu</strong> (ví dụ{' '}
                    <span className="font-mono text-slate-700">ha noi</span> khớp «Hà Nội»).
                  </p>
                ) : null}
                {r.condition === 'CONTAINS_ABBR_NORM' ? (
                  <p className="text-xs leading-snug text-slate-600">
                    Như <strong>CONTAINS</strong> (bỏ dấu, nhiều từ phẩy), thêm: khớp khi từ khóa xuất hiện{' '}
                    <strong>sát nhau không khoảng trắng</strong> trong chuỗi lead (vd. <span className="font-mono">tphcm</span>){' '}
                    hoặc khớp <strong>viết tắt chữ đầu các từ</strong> (vd. «Công nghệ thông tin» ↔{' '}
                    <span className="font-mono">cntt</span>).
                  </p>
                ) : null}
                {r.condition === 'CONTAINS_ALL_NORM' ? (
                  <p className="text-xs leading-snug text-slate-600">
                    Từ khóa <strong>phẩy</strong> — lead phải chứa <strong>tất cả</strong> các đoạn (sau bỏ dấu / gom khoảng
                    trắng). Hữu ích khi cần nhiều từ cùng lúc (vd. <span className="font-mono">dai hoc, ha noi</span>).
                  </p>
                ) : null}
                {r.condition === 'NOT_CONTAINS_NORM' ? (
                  <p className="text-xs leading-snug text-slate-600">
                    <strong>Loại trừ:</strong> nếu trường chứa <strong>bất kỳ</strong> từ khóa nào (phẩy, không dấu) thì
                    dòng không khớp. Trống danh sách = luôn khớp.
                  </p>
                ) : null}
                {r.condition === 'HAS_DIGIT' ? (
                  <p className="text-xs leading-snug text-slate-600">
                    Khớp khi chuỗi gốc có <strong>ít nhất một chữ số</strong> (mã, năm, SĐT lẫn trong text…). Không cần
                    nhập giá trị.
                  </p>
                ) : null}
                {r.condition === 'PHONE_VN_10_DIGITS' || r.condition === 'PHONE_VN_NOT_10_DIGITS' ? (
                  <p className="text-xs leading-snug text-slate-600">
                    Lấy <strong>chỉ chữ số</strong> từ trường lead; nếu bắt đầu bằng <span className="font-mono">84</span>{' '}
                    và đủ dài thì quy về dạng <span className="font-mono">0xxxxxxxxx</span>. Khớp{' '}
                    <strong>đúng 10 số</strong> hoặc <strong>không đúng / trống</strong> — dùng cho{' '}
                    <code className="text-xs">phone</code> / <code className="text-xs">parentPhone</code>.
                  </p>
                ) : null}
              </div>
              <div className="flex min-h-0 flex-col gap-1.5 rounded-lg border border-amber-200/90 bg-amber-50/40 p-2">
                <p className="text-xs font-bold uppercase tracking-wide text-amber-950">2 · Điểm &amp; phân bổ</p>
                <label className="text-xs text-slate-600">
                  Phân bổ
                  <select
                    value={r.allocationKind}
                    disabled={!canEdit}
                    onChange={(e) => {
                      const kind = e.target.value as ScoringRuleAllocationKind
                      onPatchRow(ri, { allocationKind: kind })
                      if (kind === 'percent_of_max' && Math.max(0, Number(block.maxWeight) || 0) === 0) {
                        onPatch({ maxWeight: 100 })
                      }
                    }}
                    className="mt-0.5 w-full rounded-md border border-amber-200/80 bg-white px-1.5 py-1.5 text-xs text-slate-900 disabled:opacity-50"
                  >
                    {ALLOCATION_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-xs text-slate-600">
                  {r.allocationKind === 'percent_of_max' ? '% hoặc ±' : 'Điểm ±'}
                  <input
                    type="number"
                    step={1}
                    value={r.allocationValue}
                    disabled={!canEdit}
                    onChange={(e) => onPatchRow(ri, { allocationValue: Number(e.target.value) })}
                    className={allocInputClass}
                  />
                </label>
                <div className="mt-auto flex flex-col gap-1 text-xs text-slate-600">
                  {r.allocationKind === 'percent_of_max' ? (
                    <span className="leading-tight">
                      ≈{' '}
                      <span className={signedPointsOnLight(previewPts)}>{formatSignedPoints(previewPts)}</span> điểm
                    </span>
                  ) : (
                    <span className="leading-tight">
                      <span className={signedPointsOnLight(previewPts)}>{formatSignedPoints(previewPts)}</span> điểm
                    </span>
                  )}
                </div>
              </div>
            </div>
            ) : null}
          </div>
          )
        })}
        {!block.rows.length ? (
          <p className="text-xs text-slate-500">Chưa có điều kiện — thêm ít nhất một dòng.</p>
        ) : null}
      </div>
    </motion.article>
  )
}

export function ProfileDropCanvas({
  blocks,
  onChange,
  canEdit,
  workspaceLayout,
  ruleTemplateExtras,
}: {
  blocks: ScoringRuleBlock[]
  onChange: (next: ScoringRuleBlock[]) => void
  canEdit: boolean
  /** Bố cục cao linh hoạt (toàn màn) — canvas kéo giãn theo chiều dọc. */
  workspaceLayout?: boolean
  /** Mẫu quy tắc tùy chỉnh từ Firestore — ghép với thư viện có sẵn khi kéo thả. */
  ruleTemplateExtras?: readonly RuleLibraryTemplate[]
}) {
  const patchBlock = useCallback(
    (i: number, patch: Partial<ScoringRuleBlock>) => {
      onChange(blocks.map((b, j) => (j === i ? { ...b, ...patch } : b)))
    },
    [blocks, onChange],
  )

  const removeBlock = useCallback(
    (i: number) => {
      onChange(blocks.filter((_, j) => j !== i))
    },
    [blocks, onChange],
  )

  const addRow = useCallback(
    (i: number) => {
      const b = blocks[i]
      const row: ScoringRuleConditionRow = {
        id: crypto.randomUUID(),
        condition: 'EQUALS',
        value: '',
        allocationKind: 'absolute',
        allocationValue: 0,
      }
      patchBlock(i, { rows: [...b.rows, row] })
    },
    [blocks, patchBlock],
  )

  const patchRow = useCallback(
    (bi: number, ri: number, patch: Partial<ScoringRuleConditionRow>) => {
      const b = blocks[bi]
      const rows = b.rows.map((r, j) => (j === ri ? { ...r, ...patch } : r))
      patchBlock(bi, { rows })
    },
    [blocks, patchBlock],
  )

  const removeRow = useCallback(
    (bi: number, ri: number) => {
      const b = blocks[bi]
      patchBlock(bi, { rows: b.rows.filter((_, j) => j !== ri) })
    },
    [blocks, patchBlock],
  )

  const onDragStartReorder = useCallback((e: DragEvent, index: number) => {
    e.dataTransfer.setData(REORDER_MIME, String(index))
    e.dataTransfer.effectAllowed = 'move'
  }, [])

  const onDragOverAllow = useCallback((e: DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = e.dataTransfer.types.includes(RULE_TEMPLATE_DRAG_MIME) ? 'copy' : 'move'
  }, [])

  const onDropOnCard = useCallback(
    (e: DragEvent, toIndex: number) => {
      e.preventDefault()
      const key = e.dataTransfer.getData(RULE_TEMPLATE_DRAG_MIME)
      if (key) {
        const nb = createBlockFromTemplateKey(key, ruleTemplateExtras)
        if (nb) {
          const next = [...blocks]
          next.splice(toIndex, 0, nb)
          onChange(next)
        }
        return
      }
      const fromStr = e.dataTransfer.getData(REORDER_MIME)
      if (fromStr) {
        const from = Number(fromStr)
        if (!Number.isNaN(from) && from !== toIndex) {
          const next = [...blocks]
          const [m] = next.splice(from, 1)
          next.splice(toIndex, 0, m)
          onChange(next)
        }
      }
    },
    [blocks, onChange, ruleTemplateExtras],
  )

  const onDropCanvas = useCallback(
    (e: DragEvent) => {
      e.preventDefault()
      const key = e.dataTransfer.getData(RULE_TEMPLATE_DRAG_MIME)
      if (!key) return
      const nb = createBlockFromTemplateKey(key, ruleTemplateExtras)
      if (nb) onChange([...blocks, nb])
    },
    [blocks, onChange, ruleTemplateExtras],
  )

  return (
    <div
      className={[
        'flex flex-col',
        workspaceLayout ? 'min-h-0 flex-1' : 'min-h-[320px]',
      ].join(' ')}
    >
      <CumulativeScoringCanvasHeader />

      <div
        onDragOver={onDragOverAllow}
        onDrop={onDropCanvas}
        className={[
          'relative space-y-2 overflow-y-auto rounded-xl border-2 border-dashed border-sky-400/80 bg-gradient-to-b from-sky-50/60 to-white p-3 pb-6 shadow-inner ring-1 ring-sky-200/50',
          workspaceLayout ? 'min-h-0 flex-1' : 'flex-1',
        ].join(' ')}
      >
        {blocks.length === 0 ? (
          <div className="flex min-h-[120px] flex-col items-center justify-center gap-1.5 text-center">
            <p className="text-xs font-medium text-slate-800">Canvas trống</p>
            <p className="max-w-md text-xs leading-snug text-slate-600">
              Kéo mẫu từ <strong>thư viện bên trái</strong> thả vào vùng viền nét đứt này. Sắp xếp khối: kéo ⋮⋮ ở đầu mỗi
              thẻ.
            </p>
          </div>
        ) : null}

        {blocks.map((block, i) => (
          <RuleConfigurationCard
            key={block.id}
            block={block}
            index={i}
            canEdit={canEdit}
            onPatch={(patch) => patchBlock(i, patch)}
            onRemove={() => removeBlock(i)}
            onAddRow={() => addRow(i)}
            onPatchRow={(ri, patch) => patchRow(i, ri, patch)}
            onRemoveRow={(ri) => removeRow(i, ri)}
            onDragStartReorder={onDragStartReorder}
            onDragOver={onDragOverAllow}
            onDropOnCard={onDropOnCard}
          />
        ))}
      </div>
    </div>
  )
}

