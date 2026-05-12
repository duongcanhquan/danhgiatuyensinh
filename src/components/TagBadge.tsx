import type { PriorityTag } from '../types'

const styles: Record<PriorityTag, string> = {
  HOT: 'border-orange-300/80 bg-orange-50 text-orange-800 shadow-sm ring-1 ring-orange-200/60',
  WARM: 'border-amber-300/80 bg-amber-50 text-amber-900 shadow-sm ring-1 ring-amber-200/50',
  COLD: 'border-slate-300/80 bg-slate-100 text-slate-700 shadow-sm ring-1 ring-slate-200/60',
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
