const cache = new Map<string, { at: number; data: unknown }>()

/** Cache in-memory theo key — giảm getDoc lặp cho cấu hình ít đổi. */
export async function getCached<T>(key: string, fetcher: () => Promise<T>, ttlMs = 5 * 60_000): Promise<T> {
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < ttlMs) return hit.data as T
  const data = await fetcher()
  cache.set(key, { at: Date.now(), data })
  return data
}

export function invalidateCached(key: string): void {
  cache.delete(key)
}
