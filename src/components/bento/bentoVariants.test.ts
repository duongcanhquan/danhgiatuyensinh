import { describe, expect, it } from 'vitest'
import { bentoCellClass, bentoGridClass, bentoStatClass } from './bentoVariants'

describe('bentoVariants', () => {
  it('grid class is stable for layout hooks', () => {
    expect(bentoGridClass()).toBe('bento-grid')
    expect(bentoGridClass('gap-tight')).toBe('bento-grid gap-tight')
  })

  it('cell variants map to contrast-safe surfaces', () => {
    expect(bentoCellClass('default')).toContain('bento-cell')
    expect(bentoCellClass('hero')).toContain('bento-cell--hero')
    expect(bentoCellClass('ink')).toContain('bento-cell--ink')
    expect(bentoCellClass('accent')).toContain('bento-cell--accent')
  })

  it('stat cell emphasizes readable metric typography hooks', () => {
    expect(bentoStatClass()).toContain('bento-stat')
    expect(bentoStatClass()).toContain('bento-cell')
  })

  it('span helpers clamp to allowed values', () => {
    expect(bentoCellClass('default', { colSpan: 2 })).toContain('bento-span-2')
    expect(bentoCellClass('default', { colSpan: 99 as 2 })).toContain('bento-span-1')
  })
})
