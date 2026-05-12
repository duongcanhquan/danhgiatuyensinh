import { useCallback, type DragEvent } from 'react'
import { motion } from 'motion/react'
import { GripVertical, Trash2 } from 'lucide-react'
import type {
  ProfileScoringCondition,
  ScoringRuleAllocationKind,
  ScoringRuleBlock,
  ScoringRuleConditionRow,
} from '../types'
import { RULE_CATEGORY_LABELS } from '../types'
import { createBlockFromTemplateKey, RULE_TEMPLATE_DRAG_MIME } from '../utils/ruleLibrary'

const CONDITION_OPTIONS: { value: ProfileScoringCondition; label: string }[] = [
  { value: 'EQUALS', label: 'EQUALS' },
  { value: 'CONTAINS', label: 'CONTAINS' },
  { value: 'IS_NOT_EMPTY', label: 'IS_NOT_EMPTY' },
  { value: 'IN_LIST', label: 'IN_LIST' },
]

const ALLOCATION_OPTIONS: { value: ScoringRuleAllocationKind; label: string }[] = [
  { value: 'absolute', label: 'Điểm tuyệt đối' },
  { value: 'percent_of_max', label: '% trên max khối' },
]

const REORDER_MIME = 'text/x-vietmy-block-index'

/** Màu chữ theo dấu điểm (cộng dồn không giới hạn, có thể âm). */
function signedPointsClass(n: number): string {
  if (n > 0) return 'text-emerald-400'
  if (n < 0) return 'text-rose-400'
  return 'text-slate-300'
}

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

/** Header canvas: không còn thanh “ngân sách 100 điểm”. */
function CumulativeScoringCanvasHeader() {
  return (
    <header className="sticky top-0 z-30 mb-4 rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-4 shadow-[0_0_22px_rgba(56,189,248,0.12)] ring-1 ring-sky-400/25 backdrop-blur-xl">
      <p className="text-xs font-bold uppercase tracking-[0.26em] text-slate-300">Chấm điểm tích lũy</p>
      <p className="mt-2 text-sm leading-relaxed text-slate-200">
        Mỗi dòng điều kiện khớp được <span className="font-semibold text-sky-200">cộng hoặc trừ</span> điểm theo giá trị bạn nhập
        (vd. <span className={signedPointsClass(35)}>{formatSignedPoints(35)}</span>,{' '}
        <span className={signedPointsClass(-50)}>{formatSignedPoints(-50)}</span>) — <strong>không trần 100</strong>. Nhãn
        HOT/WARM/COLD/LOSS theo <strong>ngưỡng trong từng profile</strong> (mặc định 80 / 50 nếu không đặt).
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
  return (
    <motion.article
      layout
      onDragOver={onDragOver}
      onDrop={(e) => onDropOnCard(e, index)}
      className="rounded-2xl border border-slate-200 bg-gradient-to-br from-white to-slate-50 p-4 shadow-md"
    >
      <div className="flex flex-wrap items-start gap-3 border-b border-slate-200 pb-3">
        <button
          type="button"
          draggable={canEdit}
          onDragStart={(e) => onDragStartReorder(e, index)}
          className="mt-1 rounded-lg border border-slate-200 bg-white p-1.5 text-slate-500 hover:border-amber-300 hover:bg-amber-50 hover:text-amber-800 disabled:opacity-30"
          disabled={!canEdit}
          aria-label="Kéo để sắp xếp khối"
        >
          <GripVertical className="h-4 w-4" />
        </button>
        <div className="min-w-0 flex-1 space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-600">
            {RULE_CATEGORY_LABELS[block.category]} · Khối #{index + 1}
          </p>
          <input
            value={block.label}
            disabled={!canEdit}
            onChange={(e) => onPatch({ label: e.target.value })}
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900 outline-none focus:ring-2 focus:ring-amber-400/35 disabled:opacity-50"
            placeholder="Nhãn khối"
          />
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="block text-xs text-slate-600">
              Trường lead (targetField)
              <input
                value={String(block.targetField)}
                disabled={!canEdit}
                onChange={(e) => onPatch({ targetField: e.target.value })}
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-2 text-sm text-slate-900 disabled:opacity-50"
              />
            </label>
            <label className="block text-xs text-slate-600">
              Max weight (cơ sở cho % trên khối; ≥ 0)
              <input
                type="number"
                min={0}
                step={1}
                value={block.maxWeight}
                disabled={!canEdit}
                onChange={(e) => onPatch({ maxWeight: Math.max(0, Number(e.target.value) || 0) })}
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-2 text-sm text-slate-900 disabled:opacity-50"
              />
            </label>
          </div>
        </div>
        {canEdit ? (
          <button
            type="button"
            onClick={onRemove}
            className="rounded-lg border border-rose-200 bg-rose-50 p-2 text-rose-700 hover:bg-rose-100"
            aria-label="Xóa khối"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        ) : null}
      </div>

      <div className="mt-3 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-semibold text-slate-700">
            Điều kiện trong khối — <span className="font-bold text-violet-800">cộng dồn</span> mọi dòng khớp
          </p>
          {canEdit ? (
            <button
              type="button"
              onClick={onAddRow}
              className="rounded-lg border border-violet-300 bg-violet-50 px-3 py-1.5 text-xs font-semibold text-violet-900 hover:bg-violet-100"
            >
              + Thêm điều kiện
            </button>
          ) : null}
        </div>
        {block.rows.map((r, ri) => {
          const previewPts = allocationPreviewPoints(block, r)
          const allocNum = Number(r.allocationValue)
          const allocInputClass =
            'mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-2 text-sm tabular-nums disabled:opacity-50 ' +
            signedPointsOnLight(allocNum)
          return (
          <div
            key={r.id}
            className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm"
          >
            <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
              <label className="text-xs text-slate-600">
                Điều kiện
                <select
                  value={r.condition}
                  disabled={!canEdit}
                  onChange={(e) =>
                    onPatchRow(ri, { condition: e.target.value as ProfileScoringCondition })
                  }
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-2 text-sm text-slate-900 disabled:opacity-50"
                >
                  {CONDITION_OPTIONS.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs text-slate-600 md:col-span-2 lg:col-span-2">
                Giá trị
                <input
                  value={Array.isArray(r.value) ? r.value.join(', ') : String(r.value)}
                  disabled={!canEdit || r.condition === 'IS_NOT_EMPTY'}
                  onChange={(e) => {
                    const v = e.target.value
                    onPatchRow(ri, {
                      value: r.condition === 'IN_LIST' ? v.split(',').map((s) => s.trim()) : v,
                    })
                  }}
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-2 text-sm text-slate-900 disabled:opacity-40"
                />
              </label>
              <label className="text-xs text-slate-600">
                Cách phân bổ
                <select
                  value={r.allocationKind}
                  disabled={!canEdit}
                  onChange={(e) =>
                    onPatchRow(ri, { allocationKind: e.target.value as ScoringRuleAllocationKind })
                  }
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-2 text-sm text-slate-900 disabled:opacity-50"
                >
                  {ALLOCATION_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs text-slate-600">
                {r.allocationKind === 'percent_of_max'
                  ? 'Phần trăm trên Max weight (%, có thể âm)'
                  : 'Điểm nếu khớp (+ cộng / − trừ)'}
                <input
                  type="number"
                  step={1}
                  value={r.allocationValue}
                  disabled={!canEdit}
                  onChange={(e) => onPatchRow(ri, { allocationValue: Number(e.target.value) })}
                  className={allocInputClass}
                />
              </label>
              <div className="flex flex-col justify-end text-xs text-slate-600">
                {r.allocationKind === 'percent_of_max' ? (
                  <span>
                    ≈{' '}
                    <span className={signedPointsOnLight(previewPts)}>
                      {formatSignedPoints(previewPts)}
                    </span>{' '}
                    điểm nếu khớp (Max weight × % / 100)
                  </span>
                ) : (
                  <span>
                    Khi khớp:{' '}
                    <span className={signedPointsOnLight(previewPts)}>{formatSignedPoints(previewPts)}</span> điểm
                  </span>
                )}
                {canEdit && block.rows.length > 1 ? (
                  <button
                    type="button"
                    onClick={() => onRemoveRow(ri)}
                    className="mt-2 self-start text-xs text-rose-700 hover:underline"
                  >
                    Xóa điều kiện
                  </button>
                ) : null}
              </div>
            </div>
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
}: {
  blocks: ScoringRuleBlock[]
  onChange: (next: ScoringRuleBlock[]) => void
  canEdit: boolean
  /** Bố cục cao linh hoạt (toàn màn) — canvas kéo giãn theo chiều dọc. */
  workspaceLayout?: boolean
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
        const nb = createBlockFromTemplateKey(key)
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
    [blocks, onChange],
  )

  const onDropCanvas = useCallback(
    (e: DragEvent) => {
      e.preventDefault()
      const key = e.dataTransfer.getData(RULE_TEMPLATE_DRAG_MIME)
      if (!key) return
      const nb = createBlockFromTemplateKey(key)
      if (nb) onChange([...blocks, nb])
    },
    [blocks, onChange],
  )

  return (
    <div
      className={[
        'flex flex-col',
        workspaceLayout ? 'min-h-0 flex-1' : 'min-h-[420px]',
      ].join(' ')}
    >
      <CumulativeScoringCanvasHeader />

      <div
        onDragOver={onDragOverAllow}
        onDrop={onDropCanvas}
        className={[
          'relative space-y-3 overflow-y-auto rounded-2xl border border-dashed border-sky-300/80 bg-gradient-to-b from-sky-50/50 to-white p-4 pb-8',
          workspaceLayout ? 'min-h-0 flex-1' : 'flex-1',
        ].join(' ')}
      >
        {blocks.length === 0 ? (
          <div className="flex min-h-[200px] flex-col items-center justify-center gap-2 text-center">
            <p className="text-sm font-medium text-slate-800">Canvas trống</p>
            <p className="max-w-sm text-xs text-slate-600">
              Kéo mẫu từ thư viện bên trái và thả vào đây. Max weight chỉ là gợi ý cho % trên khối; engine cộng dồn
              mọi dòng khớp (điểm có thể âm).
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

