import type { ReactNode } from 'react'
import { BentoCell } from './BentoCell'
import type { BentoCellOptions, BentoCellVariant } from './bentoVariants'

type Props = {
  title: string
  subtitle?: ReactNode
  children: ReactNode
  className?: string
  bodyClassName?: string
  variant?: BentoCellVariant
  colSpan?: BentoCellOptions['colSpan']
  rowSpan?: BentoCellOptions['rowSpan']
  action?: ReactNode
}

/** Ô bento có tiêu đề — dùng cho biểu đồ / bảng / khối chức năng. */
export function BentoModule({
  title,
  subtitle,
  children,
  className = '',
  bodyClassName = '',
  variant = 'default',
  colSpan,
  rowSpan,
  action,
}: Props) {
  return (
    <BentoCell variant={variant} colSpan={colSpan} rowSpan={rowSpan} className={['bento-module', className].filter(Boolean).join(' ')}>
      <div className="bento-module__head">
        <div className="min-w-0 flex-1">
          <h3 className="bento-module__title">{title}</h3>
          {subtitle ? <p className="bento-module__sub">{subtitle}</p> : null}
        </div>
        {action ? <div className="bento-module__action shrink-0">{action}</div> : null}
      </div>
      <div className={['bento-module__body', bodyClassName].filter(Boolean).join(' ')}>{children}</div>
    </BentoCell>
  )
}
