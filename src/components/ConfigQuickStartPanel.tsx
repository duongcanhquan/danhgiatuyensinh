import type { ReactNode } from 'react'

const stepTitle = 'text-sm font-semibold text-slate-900'
const stepBody = 'text-xs leading-relaxed text-slate-600'

/**
 * Hướng dẫn 3 bước thiết lập nhanh — dùng chung Playbook & Kho tri thức.
 */
export function ConfigQuickStartPanel({
  tone,
  title,
  intro,
  itemCount,
  steps,
  children,
}: {
  tone: 'sky' | 'amber'
  title: string
  intro: string
  itemCount: number
  steps: { label: string; detail: string }[]
  children?: ReactNode
}) {
  const border = tone === 'sky' ? 'border-sky-200/90 bg-sky-50/50' : 'border-amber-200/90 bg-amber-50/55'
  const badge = tone === 'sky' ? 'bg-sky-700 text-white' : 'bg-amber-700 text-white'

  return (
    <section className={`rounded-xl border ${border} p-4 md:p-5`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-semibold tracking-tight text-slate-900">{title}</h3>
          <p className="mt-1.5 text-sm leading-relaxed text-slate-700">{intro}</p>
        </div>
        <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${badge}`}>
          {itemCount > 0 ? `Đã có ${itemCount} mục` : 'Chưa có dữ liệu'}
        </span>
      </div>

      <ol className="mt-4 grid gap-2 sm:grid-cols-3">
        {steps.map((s, i) => (
          <li
            key={s.label}
            className="rounded-lg border border-white/80 bg-white/90 px-3 py-2.5 shadow-sm"
          >
            <p className={stepTitle}>
              <span className="mr-1.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-slate-800 text-[10px] font-bold text-white">
                {i + 1}
              </span>
              {s.label}
            </p>
            <p className={`mt-1 ${stepBody}`}>{s.detail}</p>
          </li>
        ))}
      </ol>

      {children ? <div className="mt-4 flex flex-col gap-3">{children}</div> : null}
    </section>
  )
}
