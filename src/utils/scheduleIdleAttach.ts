/** Lên lịch gắn listener Firestore sau paint — giảm cạnh tranh lúc mở app. */
export function scheduleIdleAttach(
  run: () => void | (() => void),
  opts?: { timeoutMs?: number },
): () => void {
  const timeoutMs = opts?.timeoutMs ?? 1_200
  let cancelled = false
  let innerCleanup: void | (() => void)
  let idleId: number | undefined
  let timerId: ReturnType<typeof setTimeout> | undefined

  const start = () => {
    if (cancelled) return
    innerCleanup = run()
  }

  if (typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function') {
    idleId = window.requestIdleCallback(start, { timeout: timeoutMs })
  } else {
    timerId = setTimeout(start, Math.min(80, timeoutMs))
  }

  return () => {
    cancelled = true
    if (idleId !== undefined && typeof window.cancelIdleCallback === 'function') {
      window.cancelIdleCallback(idleId)
    }
    if (timerId !== undefined) clearTimeout(timerId)
    if (typeof innerCleanup === 'function') innerCleanup()
  }
}
