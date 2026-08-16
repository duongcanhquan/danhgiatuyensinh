const MANIFEST_ATTR = 'data-vietmy-accountant-pwa'
const THEME_COLOR = '#4f46e5'

function manifestHref(): string {
  const base = import.meta.env.BASE_URL || '/'
  const normalized = base.endsWith('/') ? base : `${base}/`
  return `${normalized}manifest-ke-toan.webmanifest`
}

function ensureMeta(name: string, content: string, attr = 'name') {
  let el = document.head.querySelector(`meta[${attr}="${name}"][${MANIFEST_ATTR}]`) as HTMLMetaElement | null
  if (!el) {
    el = document.createElement('meta')
    el.setAttribute(attr, name)
    el.setAttribute(MANIFEST_ATTR, '1')
    document.head.appendChild(el)
  }
  el.content = content
}

function ensureLink(rel: string, href: string, extra?: Record<string, string>) {
  let el = document.head.querySelector(`link[rel="${rel}"][${MANIFEST_ATTR}]`) as HTMLLinkElement | null
  if (!el) {
    el = document.createElement('link')
    el.rel = rel
    el.setAttribute(MANIFEST_ATTR, '1')
    document.head.appendChild(el)
  }
  el.href = href
  if (extra) {
    for (const [k, v] of Object.entries(extra)) el.setAttribute(k, v)
  }
}

/** Bật meta PWA khi vào cổng kế toán (cài được / mở standalone). */
export function applyAccountantPwaMeta() {
  if (typeof document === 'undefined') return
  ensureLink('manifest', manifestHref())
  ensureLink('apple-touch-icon', `${import.meta.env.BASE_URL || '/'}brand/logo-vietmy-xanh.png`)
  ensureMeta('theme-color', THEME_COLOR)
  ensureMeta('apple-mobile-web-app-capable', 'yes')
  ensureMeta('mobile-web-app-capable', 'yes')
  ensureMeta('apple-mobile-web-app-status-bar-style', 'black-translucent')
  ensureMeta('apple-mobile-web-app-title', 'Kế toán VM')
  document.title = 'VietMy Kế toán'
}

/** Gỡ meta PWA kế toán (khi rời cổng). */
export function clearAccountantPwaMeta() {
  if (typeof document === 'undefined') return
  document.head.querySelectorAll(`[${MANIFEST_ATTR}]`).forEach((n) => n.remove())
}
