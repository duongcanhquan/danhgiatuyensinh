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
    OMICallSDK?: OmicallSdkGlobal
    OMICallUI?: OmicallUiGlobal
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
  if (existing) return Promise.resolve(existing)
  if (loadPromise) return loadPromise

  loadPromise = new Promise((resolve, reject) => {
    const src = `https://cdn.omicrm.com/sdk/web/${encodeURIComponent(v)}/core.min.js`
    const prev = document.querySelector<HTMLScriptElement>('script[data-omicall-sdk]')
    if (prev) {
      prev.addEventListener('load', () => {
        const sdk = getOmicallSdk()
        if (sdk) resolve(sdk)
        else reject(new Error('OMICall SDK không khởi tạo sau khi tải script.'))
      })
      prev.addEventListener('error', () => reject(new Error('Không tải được script OMICall.')))
      return
    }
    const el = document.createElement('script')
    el.type = 'text/javascript'
    el.src = src
    el.async = true
    el.dataset.omicallSdk = '1'
    el.onload = () => {
      const sdk = getOmicallSdk()
      if (sdk) resolve(sdk)
      else reject(new Error('OMICall SDK không có trên window sau khi tải.'))
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
