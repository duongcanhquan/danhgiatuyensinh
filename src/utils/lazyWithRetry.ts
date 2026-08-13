import { lazy, type ComponentType, type LazyExoticComponent } from 'react'
import { isChunkLoadError, tryReloadOnceForStaleChunk } from './chunkLoadRecovery'

/**
 * `React.lazy` kèm retry ngắn — lỗi chunk sau deploy thì reload tab một lần.
 */
export function lazyWithRetry<T extends ComponentType<object>>(
  importer: () => Promise<{ default: T }>,
): LazyExoticComponent<T> {
  return lazy(async () => {
    try {
      return await importer()
    } catch (first) {
      if (!isChunkLoadError(first)) throw first
      await new Promise((r) => setTimeout(r, 400))
      try {
        return await importer()
      } catch (second) {
        if (isChunkLoadError(second) && tryReloadOnceForStaleChunk(String(second))) {
          return new Promise(() => {})
        }
        throw second
      }
    }
  }) as LazyExoticComponent<T>
}
