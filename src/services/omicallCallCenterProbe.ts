import { getFunctions, httpsCallable } from 'firebase/functions'
import { getFirebaseApp, isFirebaseConfigured } from './firebase'

export type OmicallInternalPhoneProbeRow = {
  domain: string
  outboundProxy: string
  sipUser: string
  fullName: string
  agentId: string
  email: string
  publicNumber: string
  hasPassword: boolean
}

export type OmicallExtensionDetailProbe = {
  extension: string
  fullName: string
  email: string
  sipRealm: string
  sipUser: string
  sipWebSocketServer: string
  sipProxy: string
}

type ProbePayload =
  | { action: 'internal_phones'; keyword?: string; page?: number; size?: number }
  | { action: 'hotlines'; extension: string }
  | { action: 'extension_detail'; type?: 'sip_user' | 'user_email' | 'usr_uuid'; keyword: string }

type ProbeResult =
  | { ok: true; action: 'internal_phones'; items: OmicallInternalPhoneProbeRow[]; totalItems: number }
  | { ok: true; action: 'hotlines'; extension: string; hotlines: string[] }
  | { ok: true; action: 'extension_detail'; detail: OmicallExtensionDetailProbe | null }

function getProbeFn() {
  const app = getFirebaseApp()
  if (!app) throw new Error('Firebase app chưa khởi tạo.')
  return httpsCallable<ProbePayload, ProbeResult>(getFunctions(app, 'asia-southeast1'), 'omicallCallCenterProbe')
}

export async function probeOmicallInternalPhones(keyword?: string): Promise<{
  items: OmicallInternalPhoneProbeRow[]
  totalItems: number
}> {
  if (!isFirebaseConfigured()) throw new Error('Chưa cấu hình Firebase.')
  const res = await getProbeFn()({ action: 'internal_phones', keyword, page: 1, size: 50 })
  const data = res.data
  if (data.action !== 'internal_phones') throw new Error('Phản hồi API không đúng.')
  return { items: data.items, totalItems: data.totalItems }
}

export async function probeOmicallHotlines(extension: string): Promise<string[]> {
  if (!isFirebaseConfigured()) throw new Error('Chưa cấu hình Firebase.')
  const res = await getProbeFn()({ action: 'hotlines', extension })
  const data = res.data
  if (data.action !== 'hotlines') throw new Error('Phản hồi API không đúng.')
  return data.hotlines
}

export async function probeOmicallExtensionDetail(
  keyword: string,
  type: 'sip_user' | 'user_email' | 'usr_uuid' = 'sip_user',
): Promise<OmicallExtensionDetailProbe | null> {
  if (!isFirebaseConfigured()) throw new Error('Chưa cấu hình Firebase.')
  const res = await getProbeFn()({ action: 'extension_detail', type, keyword })
  const data = res.data
  if (data.action !== 'extension_detail') throw new Error('Phản hồi API không đúng.')
  return data.detail
}
