import type { ReactNode } from 'react'
import { bentoStatClass } from './bentoVariants'

type Props = {
  label: string
  value: ReactNode
  hint?: ReactNode
  className?: string
  /** ink / accent for emphasis tiles */
  tone?: 'default' | 'ink' | 'accent'
}

/** Metric tile — large value, quiet label, AA contrast. */
export function BentoStat({ label, value, hint, className = '', tone = 'default' }: Props) {
  const toneClass =
    tone === 'ink' ? 'bento-cell--ink' : tone === 'accent' ? 'bento-cell--accent' : ''
  return (
    <div data-bento="stat" className={[bentoStatClass(toneClass), className].filter(Boolean).join(' ')}>
      <p className="bento-stat__label">{label}</p>
      <p className="bento-stat__value">{value}</p>
      {hint ? <div className="bento-stat__hint">{hint}</div> : null}
    </div>
  )
}
