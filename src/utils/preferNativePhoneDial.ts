/** Phát hiện thiết bị cảm ứng / điện thoại — ưu tiên gọi bằng máy điện thoại (tel:). */

export function prefersNativePhoneDial(win: Window = window): boolean {
  try {
    if (typeof win.matchMedia === 'function') {
      if (win.matchMedia('(pointer: coarse)').matches) return true
      if (win.matchMedia('(hover: none)').matches && win.matchMedia('(max-width: 900px)').matches) {
        return true
      }
    }
  } catch {
    /* ignore */
  }
  const nav = win.navigator as Navigator & { userAgentData?: { mobile?: boolean } }
  if (nav.userAgentData?.mobile === true) return true
  const ua = String(nav.userAgent ?? '')
  return /Android|iPhone|iPad|iPod|Mobile/i.test(ua)
}
