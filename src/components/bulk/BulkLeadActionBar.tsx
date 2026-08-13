import { AnimatePresence, motion } from 'motion/react'
import { UserPlus, Download, GitBranch, Sparkles, X, Tags, Layers, Trash2, Workflow } from 'lucide-react'
import type { PriorityTag } from '../../types'

type Props = {
  count: number
  onClear: () => void
  onReassign: () => void
  onBulkStatus: () => void
  onExport: () => void
  /** Gán nhãn HOT/WARM/COLD/LOSS hàng loạt */
  onBulkPriorityTag?: () => void
  /** Gán chế độ xử lý (Sàng data / Lọc gọi nhanh / Chăm & chốt) hàng loạt */
  onBulkWorkMode?: () => void
  /** Gán chương trình / đợt nhập hàng loạt */
  onBulkIntakeProgram?: () => void
  /** Admin: xóa hồ sơ đã chọn */
  onBulkDelete?: () => void
  showReassign: boolean
  /** Chỉ hiện khi lọc WARM + có quyền AI — stage-2 shortlist miner */
  showAiMiner?: boolean
  onAiMiner?: () => void
  aiMinerDisabled?: boolean
}

const BAR_BTN =
  'inline-flex min-h-8 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition sm:flex-initial'

export function BulkLeadActionBar({
  count,
  onClear,
  onReassign,
  onBulkStatus,
  onExport,
  onBulkPriorityTag,
  onBulkWorkMode,
  onBulkIntakeProgram,
  onBulkDelete,
  showReassign,
  showAiMiner,
  onAiMiner,
  aiMinerDisabled,
}: Props) {
  return (
    <AnimatePresence>
      {count > 0 ? (
        <motion.div
          initial={{ y: 120, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 120, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 320, damping: 28 }}
          className="app-bulk-float pointer-events-auto fixed left-1/2 z-[45] w-[min(96vw,960px)] -translate-x-1/2"
        >
          <div className="app-modal flex flex-wrap items-center justify-between gap-2 rounded-xl px-2.5 py-2 sm:px-3">
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <span className="truncate text-sm font-semibold text-slate-900">
                Đã chọn <span className="text-amber-600">{count}</span> hồ sơ
              </span>
              <button
                type="button"
                onClick={onClear}
                className="min-h-8 min-w-8 shrink-0 cursor-pointer rounded-md border border-slate-200/90 bg-white/50 p-1.5 text-slate-500 transition hover:border-rose-300 hover:bg-rose-50 hover:text-rose-700"
                title="Bỏ chọn tất cả"
              >
                <X className="h-3.5 w-3.5" strokeWidth={1.75} />
              </button>
            </div>
            <div className="flex w-full flex-wrap gap-1.5 sm:w-auto sm:justify-end">
              {showAiMiner && onAiMiner ? (
                <button
                  type="button"
                  disabled={Boolean(aiMinerDisabled)}
                  onClick={onAiMiner}
                  title={
                    aiMinerDisabled
                      ? 'Chọn ít nhất một lead WARM và cấu hình LLM trong Cài đặt'
                      : 'Chạy AI Lead Miner (shortlist) trên các lead WARM đã chọn'
                  }
                  className={`${BAR_BTN} border-amber-400/90 bg-gradient-to-r from-amber-400 via-yellow-300 to-amber-500 font-bold text-amber-950 shadow-[0_0_16px_rgba(251,191,36,0.4)] hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-45`}
                >
                  <Sparkles className="h-3.5 w-3.5 shrink-0" strokeWidth={2} aria-hidden />
                  <span className="sm:hidden">AI Shortlist</span>
                  <span className="hidden sm:inline">Chạy AI Phân tích (Shortlist)</span>
                </button>
              ) : null}
              {onBulkPriorityTag ? (
                <button
                  type="button"
                  onClick={onBulkPriorityTag}
                  className={`${BAR_BTN} border-sky-300 bg-sky-50 text-sky-950 hover:border-sky-400 hover:bg-sky-100`}
                >
                  <Tags className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} />
                  <span className="sm:hidden">Gán nhãn</span>
                  <span className="hidden sm:inline">Gán nhãn phân loại</span>
                </button>
              ) : null}
              {onBulkWorkMode ? (
                <button
                  type="button"
                  onClick={onBulkWorkMode}
                  className={`${BAR_BTN} border-teal-300 bg-teal-50 text-teal-950 hover:border-teal-400 hover:bg-teal-100`}
                >
                  <Workflow className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} />
                  <span className="sm:hidden">Chế độ</span>
                  <span className="hidden sm:inline">Gán chế độ xử lý</span>
                </button>
              ) : null}
              {onBulkIntakeProgram ? (
                <button
                  type="button"
                  onClick={onBulkIntakeProgram}
                  className={`${BAR_BTN} border-indigo-300 bg-indigo-50 text-indigo-950 hover:border-indigo-400 hover:bg-indigo-100`}
                >
                  <Layers className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} />
                  <span className="sm:hidden">Chương trình</span>
                  <span className="hidden sm:inline">Gán chương trình</span>
                </button>
              ) : null}
              {showReassign ? (
                <button
                  type="button"
                  onClick={onReassign}
                  className={`${BAR_BTN} border-violet-300 bg-violet-100/90 text-violet-900 hover:border-violet-400 hover:bg-violet-100`}
                >
                  <UserPlus className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} />
                  <span className="sm:hidden">Giao việc</span>
                  <span className="hidden sm:inline">Phân lead hàng loạt</span>
                </button>
              ) : null}
              <button
                type="button"
                onClick={onBulkStatus}
                className={`${BAR_BTN} border-amber-300 bg-amber-50 text-amber-900 hover:border-amber-400 hover:bg-amber-100`}
              >
                <GitBranch className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} />
                <span className="sm:hidden">Tình trạng</span>
                <span className="hidden sm:inline">Đổi tình trạng tư vấn</span>
              </button>
              <button
                type="button"
                onClick={onExport}
                className={`${BAR_BTN} border-emerald-300 bg-emerald-50 text-emerald-900 hover:border-emerald-400 hover:bg-indigo-100`}
              >
                <Download className="h-3.5 w-3.5" strokeWidth={1.75} />
                <span className="sm:hidden">Xuất</span>
                <span className="hidden sm:inline">Xuất đã chọn</span>
              </button>
              {onBulkDelete ? (
                <button
                  type="button"
                  onClick={onBulkDelete}
                  className={`${BAR_BTN} border-rose-400 bg-rose-600 text-white shadow-sm hover:bg-rose-700`}
                >
                  <Trash2 className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} />
                  <span className="sm:hidden">Xóa</span>
                  <span className="hidden sm:inline">Xóa đã chọn</span>
                </button>
              ) : null}
            </div>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}

export const BULK_PRIORITY_TAG_OPTIONS: { value: PriorityTag; label: string }[] = [
  { value: 'HOT', label: 'HOT' },
  { value: 'WARM', label: 'WARM' },
  { value: 'COLD', label: 'COLD' },
  { value: 'LOSS', label: 'LOSS' },
]
