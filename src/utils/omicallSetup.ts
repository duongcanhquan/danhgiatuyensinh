/** Tiện ích cài đặt OMICall — URL webhook, mã bí mật, giá trị mặc định. */

import type { OmicallIntegrationConfig } from '../types'
import { DEFAULT_OMICALL_SDK_VERSION } from './omicallConfig'

export const DEFAULT_OMICALL_API_BASE_URL = 'https://public-v1.omicall.com'

export function buildOmicallWebhookUrl(projectId: string, webhookSecret: string): string {
  const pid = projectId.trim()
  const secret = encodeURIComponent(webhookSecret.trim())
  return `https://asia-southeast1-${pid}.cloudfunctions.net/omicallCallWebhook?secret=${secret}`
}

export function randomWebhookSecret(bytes = 18): string {
  const arr = new Uint8Array(bytes)
  crypto.getRandomValues(arr)
  return Array.from(arr, (b) => b.toString(16).padStart(2, '0')).join('')
}

/** Cấu hình khuyến nghị khi bấm «Cài đặt nhanh». */
export function buildQuickOmicallConfig(
  draft: OmicallIntegrationConfig,
  sipRealmFromApi?: string,
): OmicallIntegrationConfig {
  const realm = (sipRealmFromApi ?? draft.sipRealm).trim() || draft.sipRealm.trim()
  const secret = draft.webhookSecret?.trim() || randomWebhookSecret()
  return {
    ...draft,
    enabled: true,
    sipRealm: realm,
    apiBaseUrl: (draft.apiBaseUrl ?? DEFAULT_OMICALL_API_BASE_URL).trim() || DEFAULT_OMICALL_API_BASE_URL,
    webhookSecret: secret,
    sdkVersion: draft.sdkVersion?.trim() || DEFAULT_OMICALL_SDK_VERSION,
    callMode: 'browser',
    click2callEnabled: true,
    dialFormat: draft.dialFormat === 'local' ? 'local' : 'intl84',
    hideDialPad: true,
    autoLogCalls: true,
    historyApiVersion: 'v3',
    historySyncEnabled: true,
    historyLookbackMinutes: draft.historyLookbackMinutes ?? 180,
    historyMaxPages: draft.historyMaxPages ?? 20,
  }
}
