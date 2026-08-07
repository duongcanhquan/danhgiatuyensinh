import { AnimatePresence, motion } from 'motion/react'
import { UserPlus, Download, GitBranch, Sparkles, X, Tags, Layers } from 'lucide-react'
import type { PriorityTag } from '../../types'

type Props = {
  count: number
  onClear: () => void
  onReassign: () => void
  onBulkStatus: () => void
  onExport: () => void
  /** Gán nhãn HOT/WARM/COLD/LOSS hàng loạt */
  onBulkPriorityTag?: () => void
  /** Gán chương trình / đợt nhập hàng loạt */
  onBulkIntakeProgram?: () => void
  showReassign: boolean
  /** Chỉ hiện khi lọc WARM + có quyền AI — stage-2 shortlist miner */
  showAiMiner?: boolean
  onAiMiner?: () => void
  aiMinerDisabled?: boolean
}

export function BulkLeadActionBar({
  count,
  onClear,
  onReassign,
  onBulkStatus,
  onExport,
  onBulkPriorityTag,
  onBulkIntakeProgram,
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
          <div className="app-modal flex flex-wrap items-center justify-between gap-3 rounded-2xl px-3 py-3 sm:px-4">
            <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
              <span className="truncate text-base font-semibold text-slate-900">
                Đã chọn <span className="text-amber-600">{count}</span> hồ sơ
              </span>
              <button
                type="button"
                onClick={onClear}
                className="min-h-11 min-w-11 shrink-0 rounded-lg border border-slate-200/90 bg-white/50 p-2 text-slate-500 transition hover:border-rose-300 hover:bg-rose-50 hover:text-rose-700"
                title="Bỏ chọn tất cả"
              >
                <X className="h-4 w-4" strokeWidth={1.75} />
              </button>
            </div>
            <div className="flex w-full flex-wrap gap-2 sm:w-auto sm:justify-end">
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
                  className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-amber-400/90 bg-gradient-to-r from-amber-400 via-yellow-300 to-amber-500 px-3 py-2.5 text-sm font-bold text-amber-950 shadow-[0_0_24px_rgba(251,191,36,0.55)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-45 sm:flex-initial sm:min-h-10"
                >
                  <Sparkles className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
                  <span className="sm:hidden">AI Shortlist</span>
                  <span className="hidden sm:inline">Chạy AI Phân tích (Shortlist)</span>
                </button>
              ) : null}
              {onBulkPriorityTag ? (
                <button
                  type="button"
                  onClick={onBulkPriorityTag}
                  className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-sky-300 bg-sky-50 px-3 py-2.5 text-sm font-semibold text-sky-950 transition hover:border-sky-400 hover:bg-sky-100 sm:flex-initial sm:min-h-10"
                >
                  <Tags className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} />
                  <span className="sm:hidden">Gán nhãn</span>
                  <span className="hidden sm:inline">Gán nhãn phân loại</span>
                </button>
              ) : null}
              {onBulkIntakeProgram ? (
                <button
                  type="button"
                  onClick={onBulkIntakeProgram}
                  className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-teal-300 bg-teal-50 px-3 py-2.5 text-sm font-semibold text-teal-950 transition hover:border-teal-400 hover:bg-teal-100 sm:flex-initial sm:min-h-10"
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
                  className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-violet-300 bg-violet-100/90 px-3 py-2.5 text-sm font-semibold text-violet-900 transition hover:border-violet-400 hover:bg-violet-100 sm:flex-initial sm:min-h-10"
                >
                  <UserPlus className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} />
                  <span className="sm:hidden">Giao việc</span>
                  <span className="hidden sm:inline">Giao việc hàng loạt</span>
                </button>
              ) : null}
              <button
                type="button"
                onClick={onBulkStatus}
                className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2.5 text-sm font-semibold text-amber-900 transition hover:border-amber-400 hover:bg-amber-100 sm:flex-initial sm:min-h-10"
              >
                <GitBranch className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} />
                <span className="sm:hidden">Tình trạng</span>
                <span className="hidden sm:inline">Đổi tình trạng tư vấn</span>
              </button>
              <button
                type="button"
                onClick={onExport}
                className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-2.5 text-sm font-semibold text-emerald-900 transition hover:border-emerald-400 hover:bg-emerald-100 sm:flex-initial sm:min-h-10"
              >
                <Download className="h-3.5 w-3.5" strokeWidth={1.75} />
                <span className="sm:hidden">Xuất</span>
                <span className="hidden sm:inline">Xuất đã chọn</span>
              </button>
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
