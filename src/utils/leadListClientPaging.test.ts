import { describe, expect, it } from 'vitest'
import { sliceClientPagedRows } from './leadListClientPaging'

describe('sliceClientPagedRows', () => {
  const rows = Array.from({ length: 65 }, (_, i) => ({ id: `l${i}` }))

  it('pages by pageSize and clamps page', () => {
    const p1 = sliceClientPagedRows(rows, 1, 30)
    expect(p1.totalPages).toBe(3)
    expect(p1.pageRows).toHaveLength(30)
    expect(p1.pageRows[0]?.id).toBe('l0')

    const p3 = sliceClientPagedRows(rows, 3, 30)
    expect(p3.pageRows).toHaveLength(5)
    expect(p3.pageRows[0]?.id).toBe('l60')

    const overflow = sliceClientPagedRows(rows, 99, 30)
    expect(overflow.safePage).toBe(3)
    expect(overflow.pageRows).toHaveLength(5)
  })

  it('empty list is still one page', () => {
    const r = sliceClientPagedRows([], 1, 30)
    expect(r.totalPages).toBe(1)
    expect(r.pageRows).toEqual([])
  })
})
