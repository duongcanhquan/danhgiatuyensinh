import type { PriorityTag } from '../types'

const styles: Record<PriorityTag, string> = {
  HOT: 'border-orange-400/90 bg-gradient-to-r from-orange-950/40 to-rose-950/30 text-orange-100 shadow-[0_0_20px_rgba(249,115,22,0.35)] ring-1 ring-orange-400/50 backdrop-blur-md',
  WARM: 'border-amber-400/90 bg-gradient-to-r from-amber-950/35 to-orange-950/25 text-amber-100 shadow-[0_0_18px_rgba(251,191,36,0.3)] ring-1 ring-amber-400/45 backdrop-blur-md',
  COLD: 'border-sky-400/80 bg-gradient-to-r from-slate-950/40 to-sky-950/30 text-sky-100 shadow-[0_0_16px_rgba(56,189,248,0.28)] ring-1 ring-sky-400/40 backdrop-blur-md',
  LOSS: 'border-rose-900/60 bg-slate-900/80 text-slate-300 shadow-inner ring-1 ring-rose-900/40 backdrop-blur-md',
}

export function TagBadge({ tag }: { tag: PriorityTag }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold tracking-wide backdrop-blur-sm ${styles[tag]}`}
    >
      {tag}
    </span>
  )
}
