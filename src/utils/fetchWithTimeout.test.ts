import { describe, expect, it } from 'vitest'
import { withTimeout } from './fetchWithTimeout'

describe('withTimeout', () => {
  it('resolves when promise finishes in time', async () => {
    await expect(withTimeout(Promise.resolve(42), 1000)).resolves.toBe(42)
  })

  it('rejects when promise is too slow', async () => {
    const slow = new Promise<number>(() => {
      /* never settles */
    })
    await expect(withTimeout(slow, 50, 'Quá lâu')).rejects.toThrow(/Quá lâu/)
  })
})
