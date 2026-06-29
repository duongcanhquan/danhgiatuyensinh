import type { PriorityTag } from '../types'

const styles: Record<PriorityTag, string> = {
  HOT: 'border-orange-200 bg-orange-50 text-orange-800 ring-1 ring-orange-200/80',
  WARM: 'border-amber-200 bg-amber-50 text-amber-900 ring-1 ring-amber-200/80',
  COLD: 'border-sky-200 bg-sky-50 text-sky-800 ring-1 ring-sky-200/80',
  LOSS: 'border-slate-200 bg-slate-100 text-slate-600 ring-1 ring-slate-200/80',
}

export function TagBadge({ tag }: { tag: PriorityTag }) {
  return (
    <span
      className={`inline-flex min-h-6 items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold tracking-wide ${styles[tag]}`}
    >
      {tag}
    </span>
  )
}
