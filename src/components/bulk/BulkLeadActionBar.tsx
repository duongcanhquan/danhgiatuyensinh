import { AnimatePresence, motion } from 'motion/react'
import { UserPlus, Download, GitBranch, Sparkles, X } from 'lucide-react'

type Props = {
  count: number
  onClear: () => void
  onReassign: () => void
  onBulkStatus: () => void
  onExport: () => void
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
          className="pointer-events-auto fixed left-1/2 z-[45] w-[min(96vw,860px)] -translate-x-1/2 pb-[max(1rem,env(safe-area-inset-bottom,0px))] max-[480px]:bottom-2 bottom-6"
        >
          <div className="app-glass-panel flex flex-wrap items-center justify-between gap-3 rounded-2xl px-3 py-3 shadow-[0_16px_48px_rgba(15,23,42,0.1)] sm:px-4">
            <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
              <span className="truncate text-base font-semibold text-slate-900">
                Đã chọn <span className="text-amber-600">{count}</span> hồ sơ
              </span>
              <button
                type="button"
                onClick={onClear}
                className="min-h-10 min-w-10 shrink-0 rounded-lg border border-slate-200/90 bg-white/50 p-2 text-slate-500 transition hover:border-rose-300 hover:bg-rose-50 hover:text-rose-700"
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
                  className="inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded-xl border border-amber-400/90 bg-gradient-to-r from-amber-400 via-yellow-300 to-amber-500 px-3 py-2.5 text-sm font-bold text-amber-950 shadow-[0_0_24px_rgba(251,191,36,0.55)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-45 sm:flex-initial sm:min-h-0 sm:py-2"
                >
                  <Sparkles className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
                  ✨ Chạy AI Phân tích (Shortlist)
                </button>
              ) : null}
              {showReassign ? (
                <button
                  type="button"
                  onClick={onReassign}
                  className="inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded-xl border border-violet-300 bg-violet-100/90 px-3 py-2.5 text-sm font-semibold text-violet-900 transition hover:border-violet-400 hover:bg-violet-100 sm:flex-initial sm:min-h-0 sm:py-2"
                >
                  <UserPlus className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} />
                  Giao việc hàng loạt
                </button>
              ) : null}
              <button
                type="button"
                onClick={onBulkStatus}
                className="inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2.5 text-sm font-semibold text-amber-900 transition hover:border-amber-400 hover:bg-amber-100 sm:flex-initial sm:min-h-0 sm:py-2"
              >
                <GitBranch className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} />
                Đổi tình trạng tư vấn
              </button>
              <button
                type="button"
                onClick={onExport}
                className="inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-2.5 text-sm font-semibold text-emerald-900 transition hover:border-emerald-400 hover:bg-emerald-100 sm:flex-initial sm:min-h-0 sm:py-2"
              >
                <Download className="h-3.5 w-3.5" strokeWidth={1.75} />
                Xuất đã chọn
              </button>
            </div>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}
