/** fetch với timeout — tránh treo UI khi R2/Drive/n8n không trả lời. */
export async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  timeoutMs: number,
  timeoutLabel = 'Hết thời gian chờ mạng',
): Promise<Response> {
  const ms = Math.max(1_000, timeoutMs)
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), ms)
  try {
    return await fetch(input, {
      ...init,
      signal: ctrl.signal,
    })
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') {
      throw new Error(`${timeoutLabel} (${Math.round(ms / 1000)}s).`)
    }
    if (e instanceof Error && /abort/i.test(e.message)) {
      throw new Error(`${timeoutLabel} (${Math.round(ms / 1000)}s).`)
    }
    throw e
  } finally {
    clearTimeout(timer)
  }
}

export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  timeoutLabel = 'Hết thời gian chờ',
): Promise<T> {
  const ms = Math.max(1_000, timeoutMs)
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${timeoutLabel} (${Math.round(ms / 1000)}s).`)), ms)
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}
