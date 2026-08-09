/** Khóa session — tránh reload vòng vô hạn khi chunk thật sự hỏng. */
const RELOAD_FLAG = 'vm.chunkReloadOnce'

export function isChunkLoadError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error ?? '')
  const name = error instanceof Error ? error.name : ''
  return (
    /Failed to fetch dynamically imported module/i.test(msg) ||
    /error loading dynamically imported module/i.test(msg) ||
    /Importing a module script failed/i.test(msg) ||
    /Loading chunk [\w-]+ failed/i.test(msg) ||
    name === 'ChunkLoadError' ||
    (/TypeError/i.test(name) && /dynamically imported module/i.test(msg))
  )
}

/** Reload một lần sau deploy (chunk hash cũ). Trả true nếu đã kích hoạt reload. */
export function tryReloadOnceForStaleChunk(reason?: string): boolean {
  if (typeof window === 'undefined' || typeof sessionStorage === 'undefined') return false
  try {
    if (sessionStorage.getItem(RELOAD_FLAG) === '1') return false
    sessionStorage.setItem(RELOAD_FLAG, '1')
    console.warn('[chunkLoadRecovery] reload sau lỗi chunk', reason ?? '')
    window.location.reload()
    return true
  } catch {
    return false
  }
}

/** Xóa cờ sau khi app mount ổn định — cho phép recovery lần sau nếu deploy tiếp. */
export function clearChunkReloadFlag(): void {
  try {
    sessionStorage.removeItem(RELOAD_FLAG)
  } catch {
    /* ignore */
  }
}

/**
 * Vite 5+/8: sự kiện khi preload dynamic import thất bại (thường sau deploy).
 * Gắn sớm trong main.tsx.
 */
export function installViteChunkLoadRecovery(): void {
  if (typeof window === 'undefined') return
  window.addEventListener('vite:preloadError', ((event: Event) => {
    const e = event as Event & { payload?: unknown; preventDefault?: () => void }
    e.preventDefault?.()
    tryReloadOnceForStaleChunk('vite:preloadError')
  }) as EventListener)
}
