export type BentoCellVariant = 'default' | 'hero' | 'ink' | 'accent' | 'muted'

export type BentoCellOptions = {
  colSpan?: 1 | 2 | 3 | 4
  rowSpan?: 1 | 2
}

const SPAN_OK = new Set([1, 2, 3, 4])

export function bentoGridClass(extra = ''): string {
  return ['bento-grid', extra].filter(Boolean).join(' ')
}

export function bentoCellClass(variant: BentoCellVariant = 'default', opts: BentoCellOptions = {}): string {
  const col = SPAN_OK.has(opts.colSpan ?? 1) ? (opts.colSpan ?? 1) : 1
  const row = opts.rowSpan === 2 ? 2 : 1
  const variantClass = variant === 'default' ? '' : `bento-cell--${variant}`
  return ['bento-cell', variantClass, `bento-span-${col}`, row === 2 ? 'bento-row-2' : '']
    .filter(Boolean)
    .join(' ')
}

export function bentoStatClass(extra = ''): string {
  return ['bento-stat', 'bento-cell', extra].filter(Boolean).join(' ')
}
