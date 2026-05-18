import type { OmicallIntegrationConfig, VietMyUserProfile } from '../types'

export const DEFAULT_OMICALL_SDK_VERSION = '3.0.41'

export function getDefaultOmicallConfig(): OmicallIntegrationConfig {
  const envVersion = String(import.meta.env.VITE_OMICALL_SDK_VERSION ?? '').trim()
  const envRealm = String(import.meta.env.VITE_OMICALL_SIP_REALM ?? '').trim()
  const envUser = String(import.meta.env.VITE_OMICALL_SIP_USER ?? '').trim()
  const envPass = String(import.meta.env.VITE_OMICALL_SIP_PASSWORD ?? '').trim()
  const envApiKey = String(import.meta.env.VITE_OMICALL_API_KEY ?? '').trim()
  return {
    schemaVersion: 1,
    enabled: false,
    sdkVersion: envVersion || DEFAULT_OMICALL_SDK_VERSION,
    sipRealm: envRealm,
    ...(envUser ? { defaultSipUser: envUser } : {}),
    ...(envPass ? { defaultSipPassword: envPass } : {}),
    ...(envApiKey ? { apiKey: envApiKey } : {}),
    hideDialPad: true,
    autoLogCalls: true,
    dialFormat: 'intl84',
    callMode: 'browser',
  }
}

export function parseOmicallConfigDoc(raw: Record<string, unknown> | null | undefined): OmicallIntegrationConfig | null {
  if (!raw || raw.schemaVersion !== 1) return null
  const sdkVersion = String(raw.sdkVersion ?? '').trim() || DEFAULT_OMICALL_SDK_VERSION
  const sipRealm = String(raw.sipRealm ?? '').trim()
  const enabled = raw.enabled === true
  if (enabled && !sipRealm) return null
  const defaultSipUser = String(raw.defaultSipUser ?? '').trim() || undefined
  const defaultSipPassword = String(raw.defaultSipPassword ?? '').trim() || undefined
  const apiKey = String(raw.apiKey ?? '').trim() || undefined
  return {
    schemaVersion: 1,
    enabled,
    sdkVersion,
    sipRealm,
    defaultSipUser,
    defaultSipPassword,
    apiKey,
    hideDialPad: raw.hideDialPad !== false,
    autoLogCalls: raw.autoLogCalls !== false,
    dialFormat: raw.dialFormat === 'local' ? 'local' : 'intl84',
    defaultOutboundNumber: String(raw.defaultOutboundNumber ?? '').trim() || undefined,
    callMode: raw.callMode === 'deskPhone' ? 'deskPhone' : 'browser',
  }
}

export function mergeOmicallConfig(remote: OmicallIntegrationConfig | null): OmicallIntegrationConfig {
  const base = getDefaultOmicallConfig()
  if (!remote) return base
  return {
    ...base,
    ...remote,
    sdkVersion: remote.sdkVersion || base.sdkVersion,
    sipRealm: remote.sipRealm || base.sipRealm,
  }
}

export function resolveOmicallSipCredentials(
  config: OmicallIntegrationConfig,
  profile: Pick<VietMyUserProfile, 'omicallSipUser' | 'omicallSipPassword'> | null | undefined,
): { sipRealm: string; sipUser: string; sipPassword: string } | null {
  const sipRealm = config.sipRealm.trim()
  const sipUser = (profile?.omicallSipUser ?? config.defaultSipUser ?? '').trim()
  const sipPassword = (profile?.omicallSipPassword ?? config.defaultSipPassword ?? '').trim()
  if (!sipRealm || !sipUser || !sipPassword) return null
  return { sipRealm, sipUser, sipPassword }
}

/** Chuẩn hoá SĐT VN — `intl84` đổi 0912345678 thành +84912345678. */
export function normalizePhoneForDial(
  raw: string,
  format: 'intl84' | 'local' = 'intl84',
): string | null {
  let d = raw.trim().replace(/[^\d+]/g, '')
  if (d.startsWith('+')) d = d.slice(1)
  d = d.replace(/\D/g, '')
  if (d.length < 9) return null
  if (d.startsWith('0')) d = `84${d.slice(1)}`
  else if (!d.startsWith('84') && d.length === 9) d = `84${d}`
  if (d.length < 11 || !d.startsWith('84')) return null
  if (format === 'local') return `0${d.slice(2)}`
  return `+${d}`
}

/** Xin quyền micro trước khi gọi — tránh UI «đang gọi» nhưng không có media. */
export async function ensureMicrophoneForCall(): Promise<void> {
  if (!navigator.mediaDevices?.getUserMedia) return
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
    stream.getTracks().forEach((t) => t.stop())
  } catch {
    throw new Error(
      'Trình duyệt chưa cho phép micro — bật quyền micro cho trang web rồi thử gọi lại.',
    )
  }
}

export const OMICALL_TARGET_LABELS: Record<
  import('../types').OmicallCallTarget,
  string
> = {
  student: 'học sinh',
  parent: 'người liên hệ',
  father: 'bố',
  mother: 'mẹ',
}

export function parseOmicallUserData(raw: string | undefined): import('../types').OmicallCallUserData | null {
  if (!raw?.trim()) return null
  try {
    const o = JSON.parse(raw) as Record<string, unknown>
    const leadId = String(o.leadId ?? '').trim()
    const target = o.target as import('../types').OmicallCallTarget
    const phone = String(o.phone ?? '').trim()
    if (!leadId || !phone) return null
    if (target !== 'student' && target !== 'parent' && target !== 'father' && target !== 'mother') return null
    return { leadId, target, phone }
  } catch {
    return null
  }
}
