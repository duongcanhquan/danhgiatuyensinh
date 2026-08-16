import { describe, expect, it } from 'vitest'
import {
  formatObjectionPair,
  parseObjectionLine,
  parseObjectionLinesToPairs,
  serializeObjectionPairs,
} from './playbookObjectionPairs'

describe('parseObjectionLine', () => {
  it('splits on ->', () => {
    expect(parseObjectionLine('Học phí đắt -> Có trả góp 3 đợt')).toEqual({
      objection: 'Học phí đắt',
      response: 'Có trả góp 3 đợt',
    })
  })

  it('splits on → and |', () => {
    expect(parseObjectionLine('Xa nhà → Có KTX')).toEqual({
      objection: 'Xa nhà',
      response: 'Có KTX',
    })
    expect(parseObjectionLine('So sánh trường X | Nhấn mạnh lab')).toEqual({
      objection: 'So sánh trường X',
      response: 'Nhấn mạnh lab',
    })
  })

  it('keeps whole line as objection when no arrow', () => {
    expect(parseObjectionLine('Chỉ có lo lắng chung')).toEqual({
      objection: 'Chỉ có lo lắng chung',
      response: '',
    })
  })
})

describe('serializeObjectionPairs', () => {
  it('round-trips lines', () => {
    const lines = ['A -> B', 'C → D']
    const pairs = parseObjectionLinesToPairs(lines)
    expect(serializeObjectionPairs(pairs)).toEqual(['A -> B', 'C -> D'])
  })

  it('formatObjectionPair skips empty', () => {
    expect(formatObjectionPair('', '')).toBe('')
    expect(formatObjectionPair('x', '')).toBe('x')
  })
})
