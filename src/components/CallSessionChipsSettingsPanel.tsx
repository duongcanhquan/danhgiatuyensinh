import { useCallback, useState } from 'react'
import { Plus, RotateCcw, Trash2 } from 'lucide-react'
import type { CallEvalDimension, CallEvalOption, CallEvalScoringGroup } from '../types'
import { useCallSessionConfig } from '../contexts/CallSessionConfigContext'
import { getDefaultCallEvaluationConfig } from '../utils/callSessionEvaluation'
import { VietMyAccentHeading } from './VietMyAccentHeading'

export function CallSessionChipsSettingsPanel() {
  const { dimensions, configFromRemote, loading, error, saveDimensions, resetToBuiltin } =
    useCallSessionConfig()
  const [draft, setDraft] = useState<CallEvalDimension[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  const working = draft ?? dimensions

  const setWorking = useCallback((next: CallEvalDimension[]) => {
    setDraft(next)
    setMsg(null)
  }, [])

  const updateDimension = useCallback(
    (dimId: string, patch: Partial<CallEvalDimension>) => {
      setWorking(working.map((d) => (d.id === dimId ? { ...d, ...patch } : d)))
    },
    [working, setWorking],
  )

  const removeOption = useCallback(
    (dimId: string, optionId: string) => {
      setWorking(
        working.map((d) =>
          d.id === dimId ? { ...d, options: d.options.filter((o) => o.id !== optionId) } : d,
        ),
      )
    },
    [working, setWorking],
  )

  const addOption = useCallback(
    (dimId: string, label: string, points?: number) => {
      const t = label.trim()
      if (!t) return
      const id = `opt_${Date.now().toString(36)}`
      const dim = working.find((d) => d.id === dimId)
      const opt: CallEvalOption = { id, label: t.slice(0, 120) }
      if (dim?.scoringGroup && points !== undefined && Number.isFinite(points)) {
        opt.points = Math.round(points)
      }
      setWorking(
        working.map((d) => (d.id === dimId ? { ...d, options: [...d.options, opt] } : d)),
      )
    },
    [working, setWorking],
  )

  const onSave = useCallback(async () => {
    setBusy(true)
    setMsg(null)
    try {
      await saveDimensions(working)
      setDraft(null)
      setMsg('Đã lưu bảng đánh giá — TVV thấy ngay khi gọi.')
    } catch (e) {
      console.error(e)
      setMsg(e instanceof Error ? e.message : 'Không lưu được.')
    } finally {
      setBusy(false)
    }
  }, [saveDimensions, working])

  const onReset = useCallback(async () => {
    if (!window.confirm('Khôi phục bảng đánh giá mặc định (theo khung tâm lý / tư vấn)?')) return
    setBusy(true)
    try {
      await resetToBuiltin()
      setDraft(null)
      setMsg('Đã khôi phục mặc định.')
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Không khôi phục được.')
    } finally {
      setBusy(false)
    }
  }, [resetToBuiltin])

  const loadBuiltinToDraft = useCallback(() => {
    setDraft(getDefaultCallEvaluationConfig())
    setMsg('Đã nạp mặc định vào form — bấm Lưu để ghi lên hệ thống.')
  }, [])

  return (
    <div className="mx-auto max-w-3xl space-y-4 text-sm text-slate-300">
      <div>
        <VietMyAccentHeading as="h3" tone="onDark" size="sm" className="mb-1">
          Bảng đánh giá trực tiếp khi gọi
        </VietMyAccentHeading>
        <p className="text-xs leading-relaxed text-slate-400">
          Mỗi hàng là một chiều đánh giá. Phần <strong className="text-emerald-200">Hành vi TVV</strong> có điểm
          cộng/trừ — TVV tick khi gọi, điểm tự động cập nhật. Admin chỉnh nhãn và số điểm tại đây.
        </p>
      </div>

      {loading ? <p className="text-xs text-slate-500">Đang tải…</p> : null}
      {error ? <p className="text-xs text-rose-300">{error}</p> : null}
      {msg ? (
        <p className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-100">
          {msg}
        </p>
      ) : null}
      {!configFromRemote ? (
        <p className="text-xs text-amber-200/90">
          Chưa có bản lưu trên server — TVV đang dùng khung mặc định. Bấm «Lưu» lần đầu để cố định cho toàn trường.
        </p>
      ) : null}

      <div className="space-y-4">
        {working.map((dim) => (
          <DimensionEditor
            key={dim.id}
            dim={dim}
            disabled={busy}
            onPatch={(patch) => updateDimension(dim.id, patch)}
            onRemoveOption={(oid) => removeOption(dim.id, oid)}
            onAddOption={(label, points) => addOption(dim.id, label, points)}
            onUpdateOption={(oid, patch) => {
              setWorking(
                working.map((d) =>
                  d.id === dim.id
                    ? {
                        ...d,
                        options: d.options.map((o) => (o.id === oid ? { ...o, ...patch } : o)),
                      }
                    : d,
                ),
              )
            }}
          />
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => void onSave()}
          className="rounded-xl border border-rose-400/45 bg-rose-500/25 px-4 py-2 text-sm font-semibold text-rose-50 disabled:opacity-45"
        >
          Lưu bảng đánh giá
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={loadBuiltinToDraft}
          className="rounded-xl border border-white/15 px-4 py-2 text-sm text-slate-300 hover:bg-white/10"
        >
          Nạp mặc định vào form
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void onReset()}
          className="inline-flex items-center gap-1.5 rounded-xl border border-white/15 px-4 py-2 text-sm text-slate-300 hover:bg-white/10"
        >
          <RotateCcw className="h-3.5 w-3.5" aria-hidden />
          Khôi phục mặc định
        </button>
      </div>
    </div>
  )
}

function DimensionEditor({
  dim,
  disabled,
  onPatch,
  onRemoveOption,
  onAddOption,
  onUpdateOption,
}: {
  dim: CallEvalDimension
  disabled: boolean
  onPatch: (patch: Partial<CallEvalDimension>) => void
  onRemoveOption: (optionId: string) => void
  onAddOption: (label: string, points?: number) => void
  onUpdateOption: (optionId: string, patch: Partial<CallEvalOption>) => void
}) {
  const [newLabel, setNewLabel] = useState('')
  const [newPoints, setNewPoints] = useState('3')
  const scoring = Boolean(dim.scoringGroup)

  return (
    <div
      className={[
        'rounded-xl border p-3',
        dim.scoringGroup === 'positive'
          ? 'border-emerald-500/25 bg-emerald-950/10'
          : dim.scoringGroup === 'negative'
            ? 'border-rose-500/25 bg-rose-950/10'
            : dim.scoringGroup === 'process'
              ? 'border-sky-500/25 bg-sky-950/10'
              : 'border-white/10 bg-white/[0.03]',
      ].join(' ')}
    >
      <label className="block text-xs font-semibold text-violet-100">
        Tên chiều đánh giá
        <input
          value={dim.label}
          disabled={disabled}
          onChange={(e) => onPatch({ label: e.target.value })}
          className="mt-1 w-full rounded-lg border border-white/15 bg-slate-900/50 px-2 py-1.5 text-sm text-white"
        />
      </label>
      <label className="mt-2 block text-xs text-slate-400">
        Gợi ý cho TVV
        <input
          value={dim.hint ?? ''}
          disabled={disabled}
          onChange={(e) => onPatch({ hint: e.target.value })}
          className="mt-1 w-full rounded-lg border border-white/15 bg-slate-900/50 px-2 py-1.5 text-xs text-white"
        />
      </label>
      <div className="mt-2 flex flex-wrap gap-3 text-xs">
        <label className="flex items-center gap-1.5 text-slate-300">
          <input
            type="checkbox"
            checked={dim.required === true}
            disabled={disabled}
            onChange={(e) => onPatch({ required: e.target.checked })}
          />
          Bắt buộc khi lưu
        </label>
        <label className="flex items-center gap-1.5 text-slate-300">
          Chế độ
          <select
            value={dim.selectionMode}
            disabled={disabled}
            onChange={(e) => onPatch({ selectionMode: e.target.value === 'multi' ? 'multi' : 'single' })}
            className="rounded border border-white/15 bg-slate-900 px-1 py-0.5 text-white"
          >
            <option value="single">Chọn một</option>
            <option value="multi">Chọn nhiều</option>
          </select>
        </label>
        <label className="flex items-center gap-1.5 text-slate-300">
          Nhóm điểm
          <select
            value={dim.scoringGroup ?? ''}
            disabled={disabled}
            onChange={(e) => {
              const v = e.target.value
              onPatch({
                scoringGroup:
                  v === 'positive' || v === 'negative' || v === 'process'
                    ? (v as CallEvalScoringGroup)
                    : undefined,
              })
            }}
            className="rounded border border-white/15 bg-slate-900 px-1 py-0.5 text-white"
          >
            <option value="">Không có điểm (đánh giá khách)</option>
            <option value="positive">Tích cực (+)</option>
            <option value="negative">Tiêu cực (−)</option>
            <option value="process">Quy trình</option>
          </select>
        </label>
      </div>
      <ul className="mt-3 space-y-2">
        {dim.options.map((opt) => (
          <li
            key={opt.id}
            className="flex flex-wrap items-center gap-2 rounded-lg border border-white/12 bg-slate-900/60 px-2 py-1.5 text-xs"
          >
            <input
              value={opt.label}
              disabled={disabled}
              onChange={(e) => onUpdateOption(opt.id, { label: e.target.value })}
              className="min-w-[12rem] flex-1 rounded border border-white/10 bg-slate-950/50 px-2 py-1 text-white"
            />
            {scoring ? (
              <label className="flex items-center gap-1 text-slate-400">
                Điểm
                <input
                  type="number"
                  value={opt.points ?? 0}
                  disabled={disabled}
                  onChange={(e) => onUpdateOption(opt.id, { points: Math.round(Number(e.target.value) || 0) })}
                  className="w-16 rounded border border-white/10 bg-slate-950/50 px-1 py-1 text-center text-white"
                />
              </label>
            ) : null}
            <button
              type="button"
              disabled={disabled || dim.options.length <= 1}
              onClick={() => onRemoveOption(opt.id)}
              className="rounded p-0.5 text-slate-500 hover:text-rose-300"
              aria-label="Xóa"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </li>
        ))}
      </ul>
      <div className="mt-2 flex flex-wrap gap-2">
        <input
          value={newLabel}
          disabled={disabled}
          onChange={(e) => setNewLabel(e.target.value)}
          placeholder="Thêm lựa chọn…"
          className="min-w-0 flex-1 rounded-lg border border-white/15 bg-slate-900/50 px-2 py-1 text-xs text-white"
        />
        {scoring ? (
          <input
            type="number"
            value={newPoints}
            disabled={disabled}
            onChange={(e) => setNewPoints(e.target.value)}
            placeholder="Điểm"
            className="w-16 rounded-lg border border-white/15 bg-slate-900/50 px-2 py-1 text-xs text-white"
          />
        ) : null}
        <button
          type="button"
          disabled={disabled}
          onClick={() => {
            onAddOption(newLabel, scoring ? Math.round(Number(newPoints) || 0) : undefined)
            setNewLabel('')
            if (scoring) setNewPoints(dim.scoringGroup === 'negative' ? '-3' : '3')
          }}
          className="inline-flex items-center gap-1 rounded-lg border border-amber-400/40 bg-amber-500/15 px-2 py-1 text-xs font-semibold text-amber-50"
        >
          <Plus className="h-3 w-3" aria-hidden />
          Thêm
        </button>
      </div>
      <p className="mt-1 text-[10px] text-slate-500">Mã chiều: {dim.id}</p>
    </div>
  )
}
