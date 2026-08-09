import type { HTMLAttributes, ReactNode } from 'react'
import { bentoCellClass, type BentoCellOptions, type BentoCellVariant } from './bentoVariants'

type Props = {
  children: ReactNode
  className?: string
  variant?: BentoCellVariant
  colSpan?: BentoCellOptions['colSpan']
  rowSpan?: BentoCellOptions['rowSpan']
  as?: 'div' | 'section' | 'article'
} & Omit<HTMLAttributes<HTMLElement>, 'children' | 'className'>

/** One bento tile — high-contrast surface for metrics or modules. */
export function BentoCell({
  children,
  className = '',
  variant = 'default',
  colSpan,
  rowSpan,
  as: Tag = 'div',
  ...rest
}: Props) {
  return (
    <Tag
      data-bento="cell"
      data-bento-variant={variant}
      className={[bentoCellClass(variant, { colSpan, rowSpan }), className].filter(Boolean).join(' ')}
      {...rest}
    >
      {children}
    </Tag>
  )
}
