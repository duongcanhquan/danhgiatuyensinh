import { describe, expect, it } from 'vitest'
import { prefersNativePhoneDial } from './preferNativePhoneDial'

function fakeWin(opts: {
  coarse?: boolean
  hoverNone?: boolean
  maxWidth900?: boolean
  uaMobile?: boolean
  ua?: string
}): Window {
  return {
    matchMedia: (q: string) => ({
      matches:
        (opts.coarse && q.includes('pointer: coarse')) ||
        (opts.hoverNone && q.includes('hover: none')) ||
        (opts.maxWidth900 && q.includes('max-width: 900px')) ||
        false,
      media: q,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }),
    navigator: {
      userAgentData: opts.uaMobile != null ? { mobile: opts.uaMobile } : undefined,
      userAgent: opts.ua ?? 'Mozilla/5.0',
    },
  } as unknown as Window
}

describe('prefersNativePhoneDial', () => {
  it('true for coarse pointer (touch)', () => {
    expect(prefersNativePhoneDial(fakeWin({ coarse: true }))).toBe(true)
  })

  it('true for mobile UA', () => {
    expect(prefersNativePhoneDial(fakeWin({ ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)' }))).toBe(
      true,
    )
  })

  it('false for typical desktop', () => {
    expect(
      prefersNativePhoneDial(
        fakeWin({ ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0' }),
      ),
    ).toBe(false)
  })
})
