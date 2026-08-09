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

/**
 * OMICall core.min.js chèn `@layer base { … :root{--omi-*} }` — xung đột Tailwind v4
 * (preflight/theme cũng ở `@layer base`) và làm layout app «hỏng» sau khi SDK init.
 * Bóc mọi khối `@layer base {…}` (khớp ngoặc), giữ font-face + biến --omi-*.
 */
export function unwrapOmicallBaseLayerCss(css: string): string {
  let out = String(css ?? '')
  if (!out) return out
  // Lặp vì SDK có thể chèn nhiều khối / khoảng trắng lẫn @font-face.
  for (let guard = 0; guard < 8; guard++) {
    const match = /@layer\s+base\s*\{/i.exec(out)
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

function styleLooksLikeOmicallTheme(css: string): boolean {
  const t = css.toLowerCase()
  return (
    (t.includes('@layer base') || t.includes('--omi-') || t.includes('omiroboto')) &&
    (t.includes('--omi-') || t.includes('omiroboto') || t.includes('@layer base'))
  )
}

function rewriteOmicallStyleEl(el: { textContent: string | null }): void {
  const css = el.textContent ?? ''
  if (!styleLooksLikeOmicallTheme(css)) return
  if (!/@layer\s+base/i.test(css)) return
  const next = unwrapOmicallBaseLayerCss(css)
  if (next !== css) el.textContent = next
}

/** Sửa các thẻ <style> OMICall đã (hoặc sắp) chèn vào document. */
export function sanitizeOmicallInjectedStyles(doc?: Document | null): void {
  if (!doc?.querySelectorAll) return
  const styles = doc.querySelectorAll('style')
  for (const el of Array.from(styles)) {
    rewriteOmicallStyleEl(el)
  }
}

let omicallStyleObserver: MutationObserver | null = null

/** Gọi sớm (kể cả trước khi tải SDK) — bắt style inject vào head/body. */
export function watchOmicallStyleInjection(doc?: Document | null): void {
  if (!doc?.documentElement || omicallStyleObserver || typeof MutationObserver === 'undefined') return
  try {
    omicallStyleObserver = new MutationObserver((mutations) => {
      for (const m of mutations) {
        for (const node of Array.from(m.addedNodes)) {
          if (node.nodeType !== 1) continue
          const el = node as HTMLElement
          if (el.tagName === 'STYLE') {
            rewriteOmicallStyleEl(el)
          } else if (typeof el.querySelectorAll === 'function') {
            for (const st of Array.from(el.querySelectorAll('style'))) {
              rewriteOmicallStyleEl(st)
            }
          }
        }
      }
      // SDK đôi khi ghi textContent sau khi gắn node.
      sanitizeOmicallInjectedStyles(doc)
    })
    omicallStyleObserver.observe(doc.documentElement, { childList: true, subtree: true })
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
  // init() inject theme async — quét lại sau vài frame.
  if (typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(() => {
      sanitizeOmicallInjectedStyles(doc)
      requestAnimationFrame(() => sanitizeOmicallInjectedStyles(doc))
    })
  }
  if (typeof setTimeout === 'function') {
    setTimeout(() => sanitizeOmicallInjectedStyles(doc), 0)
    setTimeout(() => sanitizeOmicallInjectedStyles(doc), 250)
    setTimeout(() => sanitizeOmicallInjectedStyles(doc), 1000)
  }

  const silent = createSilentOmiToastify()
  win.OMIToastify = silent
  win.Toastify = silent

  if (win.OMICallSDK) {
    win.OMICallSDK.showToast = () => {}
  }
}

export function getOmicallUi(): OmicallUiGlobal | null {
  return window.OMICallUI ?? null
}

let loadPromise: Promise<OmicallSdkGlobal> | null = null

export function getOmicallSdk(): OmicallSdkGlobal | null {
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
