import type { OmicallIntegrationConfig, VietMyUserProfile } from '../types'
import { formatPhoneForDial, normalizeHotlineNumber } from './phoneNormalize'

export const DEFAULT_OMICALL_SDK_VERSION = '3.0.41'

export function getDefaultOmicallConfig(): OmicallIntegrationConfig {
  const envVersion = String(import.meta.env.VITE_OMICALL_SDK_VERSION ?? '').trim()
  const envRealm = String(import.meta.env.VITE_OMICALL_SIP_REALM ?? '').trim()
  const envUser = String(import.meta.env.VITE_OMICALL_SIP_USER ?? '').trim()
  const envPass = String(import.meta.env.VITE_OMICALL_SIP_PASSWORD ?? '').trim()
  const envApiKey = String(import.meta.env.VITE_OMICALL_API_KEY ?? '').trim()
  const envApiBaseUrl = String(import.meta.env.VITE_OMICALL_API_BASE_URL ?? '').trim()
  const envWebhookSecret = String(import.meta.env.VITE_OMICALL_WEBHOOK_SECRET ?? '').trim()
  return {
    schemaVersion: 1,
    enabled: false,
    sdkVersion: envVersion || DEFAULT_OMICALL_SDK_VERSION,
    sipRealm: envRealm,
    ...(envUser ? { defaultSipUser: envUser } : {}),
    ...(envPass ? { defaultSipPassword: envPass } : {}),
    ...(envApiKey ? { apiKey: envApiKey } : {}),
    ...(envApiBaseUrl ? { apiBaseUrl: envApiBaseUrl } : {}),
    ...(envWebhookSecret ? { webhookSecret: envWebhookSecret } : {}),
    hideDialPad: true,
    autoLogCalls: true,
    dialFormat: 'intl84',
    callMode: 'browser',
    historyApiVersion: 'v3',
    historySyncEnabled: true,
    historyLookbackMinutes: 180,
    historyMaxPages: 20,
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
  const apiBaseUrl = String(raw.apiBaseUrl ?? '').trim() || undefined
  const webhookSecret = String(raw.webhookSecret ?? '').trim() || undefined
  return {
    schemaVersion: 1,
    enabled,
    sdkVersion,
    sipRealm,
    defaultSipUser,
    defaultSipPassword,
    apiKey,
    apiBaseUrl,
    webhookSecret,
    hideDialPad: raw.hideDialPad !== false,
    autoLogCalls: raw.autoLogCalls !== false,
    dialFormat: raw.dialFormat === 'local' ? 'local' : 'intl84',
    defaultOutboundNumber: String(raw.defaultOutboundNumber ?? '').trim() || undefined,
    callMode: raw.callMode === 'deskPhone' ? 'deskPhone' : 'browser',
    historyApiVersion: raw.historyApiVersion === 'v2' ? 'v2' : 'v3',
    historySyncEnabled: raw.historySyncEnabled !== false,
    historyLookbackMinutes:
      raw.historyLookbackMinutes !== undefined ? Math.max(15, Math.min(4320, Number(raw.historyLookbackMinutes))) : 180,
    historyMaxPages:
      raw.historyMaxPages !== undefined ? Math.max(1, Math.min(100, Number(raw.historyMaxPages))) : 20,
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

/** Đầu số gọi ra: TVV → cấu hình trường → public_number từ sync. */
export function resolveOmicallOutboundNumber(
  config: OmicallIntegrationConfig,
  profile: Pick<VietMyUserProfile, 'omicallOutboundNumber'> | null | undefined,
  hotlineFallback?: string | null,
): string | undefined {
  const fromProfile = normalizeHotlineNumber(profile?.omicallOutboundNumber ?? '')
  if (fromProfile) return fromProfile
  const fromConfig = normalizeHotlineNumber(config.defaultOutboundNumber ?? '')
  if (fromConfig) return fromConfig
  const fromApi = normalizeHotlineNumber(hotlineFallback ?? '')
  return fromApi || undefined
}

/** Chuẩn hoá SĐT VN — `intl84` đổi 0912345678 thành +84912345678. */
export function normalizePhoneForDial(
  raw: string,
  format: 'intl84' | 'local' = 'intl84',
): string | null {
  return formatPhoneForDial(raw, format)
}

export { normalizePhoneLocal, normalizePhoneIntl, phoneLookupVariants, phonesMatch, normalizeHotlineNumber } from './phoneNormalize'

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
