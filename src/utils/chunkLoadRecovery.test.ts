import { afterEach, describe, expect, it, vi } from 'vitest'
import { isChunkLoadError, tryReloadOnceForStaleChunk, clearChunkReloadFlag } from './chunkLoadRecovery'

describe('isChunkLoadError', () => {
  it('detects Vite dynamic import failure', () => {
    expect(
      isChunkLoadError(
        new Error(
          'Failed to fetch dynamically imported module: https://admission.vietmycollege.com/assets/SettingsView-abc.js',
        ),
      ),
    ).toBe(true)
  })

  it('ignores unrelated errors', () => {
    expect(isChunkLoadError(new Error('Permission denied'))).toBe(false)
  })
})

describe('tryReloadOnceForStaleChunk', () => {
  afterEach(() => {
    clearChunkReloadFlag()
    vi.unstubAllGlobals()
  })

  it('reloads only once per session', () => {
    const reload = vi.fn()
    vi.stubGlobal('window', { location: { reload } })
    const store = new Map<string, string>()
    vi.stubGlobal('sessionStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => {
        store.set(k, v)
      },
      removeItem: (k: string) => {
        store.delete(k)
      },
    })

    expect(tryReloadOnceForStaleChunk('t1')).toBe(true)
    expect(reload).toHaveBeenCalledTimes(1)
    expect(tryReloadOnceForStaleChunk('t2')).toBe(false)
    expect(reload).toHaveBeenCalledTimes(1)
  })
})
