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
  /** Kết thúc cuộc gọi (tên method khác nhau theo phiên bản SDK). */
  hangup?: (callUid?: string) => void
  stopCall?: (callUid?: string) => void
  endCall?: (callUid?: string) => void
  rejectCall?: (callUid?: string) => void
  decline?: (callUid?: string) => void
  acceptCall?: () => void
  on: (event: string, cb: (data: unknown) => void) => void
  off: (event: string, cb: (data: unknown) => void) => void
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

/** Gọi method kết thúc cuộc gọi có sẵn trên SDK (ưu tiên `stopCall` theo tài liệu OMICall v2/v3). */
export function hangUpOmicallCall(sdk: OmicallSdkGlobal, callUid?: string): boolean {
  const candidates: HangupFn[] = []
  if (typeof sdk.stopCall === 'function') candidates.push(sdk.stopCall.bind(sdk))
  if (typeof sdk.hangup === 'function') candidates.push(sdk.hangup.bind(sdk))
  if (typeof sdk.endCall === 'function') candidates.push(sdk.endCall.bind(sdk))
  if (typeof sdk.rejectCall === 'function') candidates.push(sdk.rejectCall.bind(sdk))
  if (typeof sdk.decline === 'function') candidates.push(sdk.decline.bind(sdk))

  const extra = sdk as OmicallSdkGlobal & {
    hangUp?: HangupFn
    terminate?: HangupFn
    terminateCall?: HangupFn
  }
  if (typeof extra.hangUp === 'function') candidates.push(extra.hangUp.bind(extra))
  if (typeof extra.terminate === 'function') candidates.push(extra.terminate.bind(extra))
  if (typeof extra.terminateCall === 'function') candidates.push(extra.terminateCall.bind(extra))

  for (const fn of candidates) {
    if (tryInvokeHangup(fn, callUid)) return true
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
