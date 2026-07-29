import type { ReactNode } from 'react'
import { bentoGridClass } from './bentoVariants'

type Props = {
  children: ReactNode
  className?: string
  /** denser gaps for toolbars */
  tight?: boolean
}

/** Modular bento board — children should be BentoCell / BentoStat. */
export function BentoGrid({ children, className = '', tight = false }: Props) {
  return (
    <div
      data-bento="grid"
      className={bentoGridClass([tight ? 'bento-grid--tight' : '', className].filter(Boolean).join(' '))}
    >
      {children}
    </div>
  )
}
