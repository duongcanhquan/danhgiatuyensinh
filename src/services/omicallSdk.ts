/** Kiểu tối thiểu cho OMICall Web SDK (global `window.OMICallSDK`). */

import { formatCallDuration } from '../utils/omicallCallMap'

export type OmicallCallDuration = { value: number; text: string }

export type OmicallCallData = {
  uid: string
  uuid?: string
  state: 'connecting' | 'ringing' | 'accepted' | 'ended'
  direction: 'outbound' | 'inbound'
  remoteNumber: string
  displayNumber: string
  sipNumber?: { number: string }
  ringingDuration?: OmicallCallDuration
  callingDuration?: OmicallCallDuration
  userData?: string
  remoteContact?: { name: string }
  isHangup?: boolean
  rejectCode?: string
}

export type OmicallRegisterData = {
  status: 'connecting' | 'connected' | 'disconnect'
  name: string
}

/** Instance cuộc gọi OMICall v3 — dùng `end()` / `decline()` thay vì stopCall toàn cục. */
export type OmicallSdkCallInstance = {
  end?: () => void
  endCall?: () => void
  stop?: () => void
  stopCall?: () => void
  hangup?: () => void
  hangUp?: () => void
  decline?: () => void
  declineCall?: () => void
  reject?: () => void
  rejectCall?: () => void
  terminate?: () => void
}

export type OmicallSdkGlobal = {
  init: (cfg?: Record<string, unknown>) => Promise<boolean>
  register: (cfg: {
    sipRealm: string
    sipUser: string
    sipPassword: string
    isGuest?: boolean
  }) => Promise<{ status: boolean; message?: string; error?: string }>
  unregister: () => void
  makeCall: (remoteNumber: string, options?: Record<string, unknown> | null) => void
  /** Click-to-call — máy bàn / IP phone đổ chuông, không dùng micro trình duyệt. */
  remoteCall?: (remoteNumber: string, sipNumber?: string) => void
  /** v3 — lấy cuộc gọi đang active (WebRTC / SIP trên trình duyệt). */
  getActiveCall?: () => OmicallSdkCallInstance | null
  /** Kết thúc cuộc gọi (tên method khác nhau theo phiên bản SDK). */
  hangup?: (callUid?: string) => void
  stopCall?: (callUid?: string) => void
  endCall?: (callUid?: string) => void
  declineCall?: (callUid?: string) => void
  rejectCall?: (callUid?: string) => void
  decline?: (callUid?: string) => void
  acceptCall?: () => void
  on: (event: string, cb: (data: unknown) => void) => void
  off: (event: string, cb: (data: unknown) => void) => void
}

export type HangUpOmicallOptions = {
  callUid?: string
  /** Payload thô từ sự kiện SDK (`connecting` / `ringing` / `accepted` / `incall`). */
  rawCall?: unknown
}

function durationFromUnknown(value: unknown, text?: unknown): OmicallCallDuration | undefined {
  const n = Number(value ?? 0)
  if (!Number.isFinite(n) || n < 0) return undefined
  const sec = Math.floor(n)
  return { value: sec, text: String(text ?? '').trim() || formatCallDuration(sec) }
}

/** Chuẩn hoá payload SDK v2/v3 — `status: connected` → `state: accepted`, v.v. */
export function normalizeOmicallSdkPayload(raw: unknown): OmicallCallData | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const uid = String(r.uid ?? r.uuid ?? r.transactionId ?? r.transaction_id ?? '').trim()
  if (!uid) return null

  const stateRaw = String(r.state ?? r.status ?? '').toLowerCase()
  const state: OmicallCallData['state'] =
    stateRaw === 'connected' || stateRaw === 'accepted'
      ? 'accepted'
      : stateRaw === 'ringing' || stateRaw === 'ring'
        ? 'ringing'
        : stateRaw === 'ended' || stateRaw === 'disconnect' || stateRaw === 'disconnected'
          ? 'ended'
          : stateRaw === 'connecting'
            ? 'connecting'
            : 'connecting'

  const directionRaw = String(r.direction ?? '').toLowerCase()
  const direction: OmicallCallData['direction'] = directionRaw === 'inbound' ? 'inbound' : 'outbound'

  const phone = String(r.displayNumber ?? r.remoteNumber ?? r.phone ?? '').trim()
  const callingDuration =
    (r.callingDuration as OmicallCallDuration | undefined) ??
    durationFromUnknown(r.duration, r.durationTxt)
  const ringingDuration =
    (r.ringingDuration as OmicallCallDuration | undefined) ??
    (state !== 'accepted' ? durationFromUnknown(r.totalDuration, r.totalDurationTxt) : undefined)

  return {
    uid,
    uuid: r.uuid ? String(r.uuid) : undefined,
    state,
    direction,
    remoteNumber: String(r.remoteNumber ?? phone),
    displayNumber: phone || String(r.remoteNumber ?? ''),
    sipNumber:
      r.sipNumber && typeof r.sipNumber === 'object'
        ? { number: String((r.sipNumber as { number?: unknown }).number ?? r.sipNumber ?? '') }
        : r.sipNumber
          ? { number: String(r.sipNumber) }
          : undefined,
    ringingDuration,
    callingDuration,
    userData: r.userData != null ? String(r.userData) : undefined,
    remoteContact:
      r.remoteContact && typeof r.remoteContact === 'object'
        ? { name: String((r.remoteContact as { name?: unknown }).name ?? '') }
        : undefined,
    isHangup: r.isHangup === true,
    rejectCode: r.rejectCode != null ? String(r.rejectCode) : undefined,
  }
}

type HangupFn = ((callUid?: string) => void) | (() => void)

const CALL_INSTANCE_END_METHODS = [
  'end',
  'endCall',
  'stop',
  'stopCall',
  'hangup',
  'hangUp',
  'decline',
  'declineCall',
  'reject',
  'rejectCall',
  'terminate',
] as const

function tryInvokeHangup(fn: HangupFn, callUid?: string): boolean {
  try {
    if (callUid) {
      ;(fn as (uid: string) => void)(callUid)
    } else {
      ;(fn as () => void)()
    }
    return true
  } catch {
    try {
      ;(fn as () => void)()
      return true
    } catch {
      return false
    }
  }
}

/** v3 — gọi `call.end()` / `call.decline()` trên instance cuộc gọi (gửi SIP BYE đúng cách). */
export function tryEndOmicallCallInstance(raw: unknown): boolean {
  if (!raw || typeof raw !== 'object') return false
  const call = raw as OmicallSdkCallInstance & Record<string, unknown>
  for (const method of CALL_INSTANCE_END_METHODS) {
    const fn = call[method]
    if (typeof fn !== 'function') continue
    if (tryInvokeHangup(fn.bind(call))) return true
  }
  return false
}

function getActiveCallFromSdk(sdk: OmicallSdkGlobal): unknown {
  try {
    return sdk.getActiveCall?.() ?? null
  } catch {
    return null
  }
}

/**
 * Gọi method kết thúc cuộc gọi.
 * v3: ưu tiên instance từ sự kiện / getActiveCall().end() trước stopCall() toàn cục.
 */
export function hangUpOmicallCall(sdk: OmicallSdkGlobal, opts?: HangUpOmicallOptions | string): boolean {
  const callUid = typeof opts === 'string' ? opts : opts?.callUid
  const rawCall = typeof opts === 'string' ? undefined : opts?.rawCall

  if (tryEndOmicallCallInstance(rawCall)) return true

  const active = getActiveCallFromSdk(sdk)
  if (tryEndOmicallCallInstance(active)) return true

  const extra = sdk as OmicallSdkGlobal & {
    hangUp?: HangupFn
    terminate?: HangupFn
    terminateCall?: HangupFn
    closeCall?: HangupFn
  }

  const fns: HangupFn[] = []
  if (typeof sdk.endCall === 'function') fns.push(sdk.endCall.bind(sdk))
  if (typeof sdk.declineCall === 'function') fns.push(sdk.declineCall.bind(sdk))
  if (typeof sdk.hangup === 'function') fns.push(sdk.hangup.bind(sdk))
  if (typeof extra.hangUp === 'function') fns.push(extra.hangUp.bind(extra))
  if (typeof sdk.stopCall === 'function') fns.push(sdk.stopCall.bind(sdk))
  if (typeof extra.closeCall === 'function') fns.push(extra.closeCall.bind(extra))
  if (typeof extra.terminate === 'function') fns.push(extra.terminate.bind(extra))
  if (typeof extra.terminateCall === 'function') fns.push(extra.terminateCall.bind(extra))
  if (typeof sdk.rejectCall === 'function') fns.push(sdk.rejectCall.bind(sdk))
  if (typeof sdk.decline === 'function') fns.push(sdk.decline.bind(sdk))

  for (const fn of fns) {
    if (tryInvokeHangup(fn)) return true
  }

  if (callUid) {
    for (const fn of fns) {
      if (tryInvokeHangup(fn, callUid)) return true
    }
  }

  return false
}

export type OmicallUiGlobal = {
  toggleDial?: () => void
}

declare global {
  interface Window {
    OMICallSDK?: OmicallSdkGlobal & { showToast?: (...args: unknown[]) => void }
    OMICallUI?: OmicallUiGlobal
    OMIToastify?: unknown
    Toastify?: unknown
  }
}

export const OMICALL_TOAST_SUPPRESS_STYLE_ID = 'vm-omicall-toast-suppress'

/** CSS ẩn toast đỏ «Có lỗi xảy ra» của OMICall SDK (nền đăng ký SIP / mạng yếu). */
export const OMICALL_TOAST_SUPPRESS_CSS =
  '.omi-toastify{display:none!important;visibility:hidden!important;pointer-events:none!important;opacity:0!important}'

export type OmicallToastSuppressHost = {
  document?: Document
  window?: Window & typeof globalThis
}

function createSilentOmiToastify() {
  const api = {
    showToast() {
      return api
    },
    hideToast() {},
    removeElement() {},
  }
  const factory = () => api
  ;(factory as { lib?: { init: typeof factory } }).lib = { init: factory }
  return factory
}

/** Bóc khối `@layer <name> {…}` (khớp ngoặc). */
export function unwrapCssLayer(css: string, layerName: string): string {
  let out = String(css ?? '')
  if (!out) return out
  const safeName = layerName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  for (let guard = 0; guard < 8; guard++) {
    const re = new RegExp(`@layer\\s+${safeName}\\s*\\{`, 'i')
    const match = re.exec(out)
    if (!match || match.index === undefined) break
    const start = match.index
    const open = out.indexOf('{', start)
    if (open < 0) break
    let depth = 0
    let end = -1
    for (let i = open; i < out.length; i++) {
      const ch = out[i]
      if (ch === '{') depth++
      else if (ch === '}') {
        depth--
        if (depth === 0) {
          end = i
          break
        }
      }
    }
    if (end < 0) break
    out = `${out.slice(0, start)}${out.slice(open + 1, end)}${out.slice(end + 1)}`
  }
  return out.trim()
}

/**
 * OMICall chèn `@layer base { … }` — trên Chrome dễ phá Tailwind v4.
 * Không để CSS đó **unlayered** (unlayered > utilities trên Chrome): chuyển sang `@layer omicall`
 * (khai báo trước `@import tailwindcss` trong index.css).
 */
export function unwrapOmicallBaseLayerCss(css: string): string {
  return unwrapCssLayer(css, 'base')
}

/**
 * Gỡ rule global (html/body/#root) trong CSS OMICall — chúng hay hạ font-size/line-height
 * làm cả app «chữ sít / layout vỡ» trên Chrome khi SDK đăng ký SIP xong.
 */
export function stripOmicallGlobalTypographyResets(css: string): string {
  let out = String(css ?? '')
  if (!out) return out
  // Lặp vì /g không match lại `body` ngay sau khi vừa bỏ `html{…}`.
  for (let i = 0; i < 12; i++) {
    const next = out.replace(
      /(^|})\s*(?:html|body|#root)(?:\s*,\s*(?:html|body|#root))*\s*\{[^{}]*\}/gi,
      '$1',
    )
    if (next === out) break
    out = next
  }
  // * { font-size | line-height | letter-spacing … } — chỉ gỡ phần typography, giữ box-sizing.
  out = out.replace(/(?:^|})\s*\*\s*\{([^{}]*)\}/gi, (full, body: string) => {
    const kept = String(body)
      .split(';')
      .map((s) => s.trim())
      .filter(Boolean)
      .filter((decl) => !/^(?:font(?:-size|-family|-weight|-style)?|line-height|letter-spacing|color)\s*:/i.test(decl))
    const prefix = full.startsWith('}') ? '}' : ''
    if (!kept.length) return prefix
    return `${prefix}*{${kept.join(';')}}`
  })
  return out
}

export function normalizeOmicallInjectedCss(css: string): string {
  let inner = unwrapCssLayer(String(css ?? ''), 'base')
  inner = unwrapCssLayer(inner, 'omicall')
  inner = stripOmicallGlobalTypographyResets(inner)
  if (!inner.trim()) return inner
  return `@layer omicall{${inner}}`
}

function styleLooksLikeOmicallTheme(css: string): boolean {
  const t = css.toLowerCase()
  return (
    t.includes('--omi-') ||
    t.includes('omiroboto') ||
    t.includes('@layer base') ||
    t.includes('omi-toastify') ||
    t.includes('omi-call') ||
    t.includes('omicall')
  )
}

function rewriteOmicallStyleEl(el: { textContent: string | null }): void {
  const css = el.textContent ?? ''
  if (!styleLooksLikeOmicallTheme(css)) return
  const next = normalizeOmicallInjectedCss(css)
  if (next !== css) el.textContent = next
}

export const OMICALL_LAYOUT_SHIELD_STYLE_ID = 'vm-omicall-layout-shield'

/**
 * Chèn cuối <head> — thắng CSS OMICall inject muộn (unlayered) khi đăng ký SIP.
 * Không dùng !important trên toàn bộ utility; chỉ khóa rem root + body shell.
 */
export const OMICALL_LAYOUT_SHIELD_CSS = [
  'html{font-size:100%!important}',
  'body{font-size:1rem;line-height:1.6;letter-spacing:0.01em}',
  '#root{font-size:inherit;line-height:inherit}',
].join('')

export function ensureOmicallLayoutShield(doc?: Document | null): void {
  if (!doc?.head) return
  let el = doc.getElementById(OMICALL_LAYOUT_SHIELD_STYLE_ID) as HTMLStyleElement | null
  if (!el) {
    el = doc.createElement('style')
    el.id = OMICALL_LAYOUT_SHIELD_STYLE_ID
    el.textContent = OMICALL_LAYOUT_SHIELD_CSS
    doc.head.appendChild(el)
    return
  }
  if (el.textContent !== OMICALL_LAYOUT_SHIELD_CSS) {
    el.textContent = OMICALL_LAYOUT_SHIELD_CSS
  }
  // Chỉ đưa xuống cuối khi chưa phải node cuối — tránh appendChild lặp → MutationObserver xoay vòng.
  if (doc.head.lastElementChild !== el) {
    doc.head.appendChild(el)
  }
}

let sanitizeReentrancy = 0

/** Sửa các thẻ <style> OMICall đã (hoặc sắp) chèn vào document. */
export function sanitizeOmicallInjectedStyles(doc?: Document | null): void {
  if (!doc?.querySelectorAll) return
  if (sanitizeReentrancy > 0) return
  sanitizeReentrancy++
  try {
    const styles = doc.querySelectorAll('style')
    for (const el of Array.from(styles)) {
      const id = (el as HTMLElement).id
      if (id === OMICALL_LAYOUT_SHIELD_STYLE_ID || id === OMICALL_TOAST_SUPPRESS_STYLE_ID) continue
      rewriteOmicallStyleEl(el)
    }
    ensureOmicallLayoutShield(doc)
  } finally {
    sanitizeReentrancy--
  }
}

let omicallStyleObserver: MutationObserver | null = null
let sanitizeBurstTimers: ReturnType<typeof setTimeout>[] = []
let sanitizeScheduled = false

function queueSanitizeOmicallStyles(doc: Document): void {
  if (sanitizeScheduled) return
  sanitizeScheduled = true
  queueMicrotask(() => {
    sanitizeScheduled = false
    sanitizeOmicallInjectedStyles(doc)
  })
}

/** Quét lại nhiều lần — theme OMICall thường gắn lúc init / sau register SIP. */
export function scheduleOmicallStyleSanitizeBurst(doc?: Document | null): void {
  const target = doc ?? (typeof document !== 'undefined' ? document : null)
  if (!target) return
  for (const t of sanitizeBurstTimers) clearTimeout(t)
  sanitizeBurstTimers = []
  const delays = [0, 50, 150, 400, 800, 1600, 3200, 5000]
  for (const ms of delays) {
    sanitizeBurstTimers.push(
      setTimeout(() => {
        sanitizeOmicallInjectedStyles(target)
      }, ms),
    )
  }
}

function isVmOmicallManagedStyle(el: Element): boolean {
  const id = (el as HTMLElement).id
  return id === OMICALL_LAYOUT_SHIELD_STYLE_ID || id === OMICALL_TOAST_SUPPRESS_STYLE_ID
}

/** Gọi sớm (kể cả trước khi tải SDK) — bắt style inject vào head/body. */
export function watchOmicallStyleInjection(doc?: Document | null): void {
  if (!doc?.documentElement || omicallStyleObserver || typeof MutationObserver === 'undefined') return
  try {
    omicallStyleObserver = new MutationObserver((mutations) => {
      let sawForeignStyle = false
      for (const m of mutations) {
        for (const node of Array.from(m.addedNodes)) {
          if (node.nodeType !== 1) continue
          const el = node as HTMLElement
          if (el.tagName === 'STYLE') {
            if (isVmOmicallManagedStyle(el)) continue
            rewriteOmicallStyleEl(el)
            sawForeignStyle = true
          } else if (typeof el.querySelectorAll === 'function') {
            for (const st of Array.from(el.querySelectorAll('style'))) {
              if (isVmOmicallManagedStyle(st)) continue
              rewriteOmicallStyleEl(st)
              sawForeignStyle = true
            }
          }
        }
      }
      // Không observe characterData toàn document (React text node → treo UI / kẹt «đang đăng nhập»).
      if (sawForeignStyle) queueSanitizeOmicallStyles(doc)
    })
    omicallStyleObserver.observe(doc.documentElement, {
      childList: true,
      subtree: true,
    })
  } catch {
    omicallStyleObserver = null
  }
}

/**
 * Chặn toast vendor OMICall — app đã có dải trạng thái tổng đài riêng.
 * Gọi sau khi tải SDK (và khi SDK đã có sẵn trên window).
 */
export function suppressOmicallVendorToasts(host?: OmicallToastSuppressHost): void {
  const doc = host?.document ?? (typeof document !== 'undefined' ? document : undefined)
  const win = host?.window ?? (typeof window !== 'undefined' ? window : undefined)
  if (!doc?.head || !win) return

  if (!doc.getElementById(OMICALL_TOAST_SUPPRESS_STYLE_ID)) {
    const style = doc.createElement('style')
    style.id = OMICALL_TOAST_SUPPRESS_STYLE_ID
    style.textContent = OMICALL_TOAST_SUPPRESS_CSS
    doc.head.appendChild(style)
  }

  watchOmicallStyleInjection(doc)
  sanitizeOmicallInjectedStyles(doc)
  scheduleOmicallStyleSanitizeBurst(doc)

  const silent = createSilentOmiToastify()
  win.OMIToastify = silent
  win.Toastify = silent

  if (win.OMICallSDK) {
    win.OMICallSDK.showToast = () => {}
  }
}

export function getOmicallUi(): OmicallUiGlobal | null {
  if (typeof window === 'undefined') return null
  return window.OMICallUI ?? null
}

/** Nhãn nút đóng dialog mặc định của SDK (VI/EN). */
export function isOmicallVendorCloseSaveLabel(text: string): boolean {
  const t = String(text ?? '')
    .replace(/\s+/g, ' ')
    .trim()
  if (!t) return false
  return /^đóng và lưu lại$/i.test(t) || /^close and save$/i.test(t)
}

type OmicallCallSaveFn = (
  info: { note?: string; tags?: string[] },
  onSave: () => void,
  onFinish: () => boolean,
) => void

/**
 * Đóng dialog «Thông tin cuộc gọi» / «Đóng và lưu lại» của SDK —
 * CRM dùng panel riêng; dialog vendor hay kẹt trên mobile và chặn thao tác.
 */
export function dismissOmicallVendorCallUi(opts?: {
  rawCall?: unknown
  sdk?: OmicallSdkGlobal | null
  doc?: Document | null
}): boolean {
  let closed = false
  const sdk = opts?.sdk ?? getOmicallSdk()
  const raw = opts?.rawCall ?? (sdk ? getActiveCallFromSdk(sdk) : null)

  if (raw && typeof raw === 'object') {
    const call = raw as {
      save?: OmicallCallSaveFn
      minimize?: (fn?: unknown) => void
    }
    try {
      if (typeof call.save === 'function') {
        call.save({ note: '' }, () => {}, () => true)
        closed = true
      }
    } catch {
      /* ignore */
    }
    try {
      if (typeof call.minimize === 'function') call.minimize()
    } catch {
      /* ignore */
    }
  }

  const doc = opts?.doc ?? (typeof document !== 'undefined' ? document : null)
  if (doc?.querySelectorAll) {
    for (const el of Array.from(doc.querySelectorAll('button, [role="button"]'))) {
      if (!isOmicallVendorCloseSaveLabel(el.textContent ?? '')) continue
      try {
        ;(el as HTMLElement).click()
        closed = true
      } catch {
        /* ignore */
      }
    }
  }

  return closed
}

/** Gọi dismiss vài lần — SDK render dialog sau event `ended`. */
export function scheduleDismissOmicallVendorCallUi(opts?: {
  rawCall?: unknown
  sdk?: OmicallSdkGlobal | null
}): void {
  const run = () => {
    dismissOmicallVendorCallUi(opts)
  }
  run()
  if (typeof window === 'undefined') return
  window.setTimeout(run, 200)
  window.setTimeout(run, 600)
  window.setTimeout(run, 1500)
  window.setTimeout(run, 3000)
}

let loadPromise: Promise<OmicallSdkGlobal> | null = null

export function getOmicallSdk(): OmicallSdkGlobal | null {
  if (typeof window === 'undefined') return null
  return window.OMICallSDK ?? null
}

export function loadOmicallSdk(version: string): Promise<OmicallSdkGlobal> {
  const v = version.trim() || '3.0.41'
  const existing = getOmicallSdk()
  if (existing) {
    suppressOmicallVendorToasts()
    return Promise.resolve(existing)
  }
  if (loadPromise) return loadPromise

  loadPromise = new Promise((resolve, reject) => {
    const src = `https://cdn.omicrm.com/sdk/web/${encodeURIComponent(v)}/core.min.js`
    // Docs: attribute `omi-call-sdk`; giữ thêm data-* để tìm script đã inject.
    const prev = document.querySelector<HTMLScriptElement>(
      'script[omi-call-sdk], script[data-omicall-sdk]',
    )
    if (prev) {
      prev.addEventListener('load', () => {
        const sdk = getOmicallSdk()
        if (sdk) {
          suppressOmicallVendorToasts()
          resolve(sdk)
        } else reject(new Error('OMICall SDK không khởi tạo sau khi tải script.'))
      })
      prev.addEventListener('error', () => reject(new Error('Không tải được script OMICall.')))
      return
    }
    const el = document.createElement('script')
    el.type = 'text/javascript'
    el.src = src
    el.async = true
    el.setAttribute('omi-call-sdk', '')
    el.dataset.omicallSdk = '1'
    el.onload = () => {
      const sdk = getOmicallSdk()
      if (sdk) {
        suppressOmicallVendorToasts()
        resolve(sdk)
      } else reject(new Error('OMICall SDK không có trên window sau khi tải.'))
    }
    el.onerror = () => {
      loadPromise = null
      reject(new Error('Không tải được script OMICall từ CDN.'))
    }
    document.body.appendChild(el)
  })

  return loadPromise
}

export function resetOmicallSdkLoader(): void {
  loadPromise = null
}
