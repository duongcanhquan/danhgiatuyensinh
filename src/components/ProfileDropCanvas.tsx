import { useCallback, useMemo, type DragEvent } from 'react'
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
import { sumBlockMaxWeights } from '../utils/scoring'

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

function budgetTone(assigned: number): 'under' | 'perfect' | 'over' {
  if (assigned > 100) return 'over'
  if (assigned === 100) return 'perfect'
  return 'under'
}

function PointBudgetHeader({ assigned }: { assigned: number }) {
  const tone = budgetTone(assigned)
  const fillWidthPct = assigned >= 100 ? 100 : Math.max(0, Math.min(100, assigned))

  const ring =
    tone === 'over'
      ? 'shadow-[0_0_32px_rgba(244,63,94,0.45)] ring-2 ring-rose-400/50'
      : tone === 'perfect'
        ? 'shadow-[0_0_28px_rgba(52,211,153,0.45)] ring-2 ring-emerald-400/45'
        : 'shadow-[0_0_20px_rgba(251,191,36,0.25)] ring-1 ring-amber-400/30'

  const fillClass =
    tone === 'over'
      ? 'bg-gradient-to-r from-rose-500 via-red-500 to-rose-600'
      : tone === 'perfect'
        ? 'bg-gradient-to-r from-emerald-400 via-teal-400 to-amber-400'
        : 'bg-gradient-to-r from-amber-400 via-yellow-300 to-amber-500'

  return (
    <header
      className={`sticky top-0 z-30 mb-4 rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm ${ring}`}
    >
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.26em] text-slate-600">
            Ngân sách 100 điểm
          </p>
          <p className="mt-1 text-lg font-semibold tabular-nums text-slate-900">
            {assigned}
            <span className="text-base font-medium text-slate-500"> / 100</span>
            <span className="ml-2 text-xs font-normal text-slate-600">tổng Max weight các khối</span>
          </p>
        </div>
        <p
          className={`text-xs font-medium ${
            tone === 'over'
              ? 'text-rose-700'
              : tone === 'perfect'
                ? 'text-emerald-700'
                : 'text-amber-800'
          }`}
        >
          {tone === 'over'
            ? 'Vượt ngân sách — không thể lưu profile'
            : tone === 'perfect'
              ? 'Hoàn hảo — phân bổ đủ 100 điểm'
              : 'Chưa đủ 100 — còn room cho khối mới'}
        </p>
      </div>
      <div className="mt-4 h-3 overflow-hidden rounded-full border border-slate-200 bg-slate-100 shadow-inner">
        <motion.div
          layout
          className={`h-full rounded-full ${fillClass}`}
          style={{ width: `${fillWidthPct}%` }}
          transition={{ type: 'spring', stiffness: 320, damping: 28 }}
        />
      </div>
      {assigned > 100 ? (
        <p className="mt-2 text-xs text-rose-700">
          Giảm Max weight ở một hoặc nhiều khối để tổng ≤ 100.
        </p>
      ) : null}
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
              Max weight (điểm dự trữ khối)
              <input
                type="number"
                min={0}
                max={100}
                value={block.maxWeight}
                disabled={!canEdit}
                onChange={(e) => onPatch({ maxWeight: Number(e.target.value) })}
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
          <p className="text-xs font-semibold text-slate-700">Điều kiện trong khối (first match wins)</p>
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
        {block.rows.map((r, ri) => (
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
                {r.allocationKind === 'percent_of_max' ? 'Phần trăm (0–100)' : 'Điểm nếu khớp'}
                <input
                  type="number"
                  value={r.allocationValue}
                  disabled={!canEdit}
                  onChange={(e) => onPatchRow(ri, { allocationValue: Number(e.target.value) })}
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-2 text-sm text-slate-900 disabled:opacity-50"
                />
              </label>
              <div className="flex flex-col justify-end text-xs text-slate-600">
                {r.allocationKind === 'percent_of_max' ? (
                  <span>
                    ≈{' '}
                    <span className="font-medium text-amber-800">
                      {Math.round((block.maxWeight * Math.min(100, Math.max(0, r.allocationValue))) / 100)}
                    </span>{' '}
                    điểm nếu khớp (trước cap khối)
                  </span>
                ) : (
                  <span>
                    Tối đa trong khối:{' '}
                    <span className="font-medium text-slate-800">{block.maxWeight}</span>
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
        ))}
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
  const assigned = useMemo(() => sumBlockMaxWeights(blocks), [blocks])

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
      <PointBudgetHeader assigned={assigned} />

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
              Kéo mẫu từ thư viện bên trái và thả vào đây. Mỗi khối có Max weight; tổng Max weight toàn profile
              phải ≤ 100 để có thể lưu.
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

