import { registerOmicallWebhookOnServer } from './omicallRegisterWebhook'
import { syncOmicallInternalPhones } from './omicallSyncInternalPhones'
import { syncOmicallMyExtension } from './omicallSyncMyExtension'
import { buildOmicallWebhookUrl } from '../utils/omicallSetup'
import type { OmicallIntegrationConfig } from '../types'

const SESSION_ADMIN_BOOT = 'vietmy_omicall_admin_boot_v1'
const SESSION_MY_EXT = 'vietmy_omicall_my_ext_v1'

function throttleKey(key: string, ttlMs: number): boolean {
  try {
    const raw = sessionStorage.getItem(key)
    const last = raw ? Number(raw) : 0
    if (last && Date.now() - last < ttlMs) return false
    sessionStorage.setItem(key, String(Date.now()))
    return true
  } catch {
    return true
  }
}

export type OmicallAdminBootstrapResult = {
  webhook?: string
  phones?: string
  errors: string[]
}

/** Quản trị: tự đăng ký webhook + đồng bộ số nội bộ (không cần bấm từng nút). */
export async function runOmicallAdminBootstrap(opts: {
  config: OmicallIntegrationConfig
  projectId: string
  /** Bỏ qua throttle — dùng ngay sau «Cài đặt nhanh». */
  force?: boolean
}): Promise<OmicallAdminBootstrapResult> {
  const { config, projectId, force } = opts
  const errors: string[] = []
  const out: OmicallAdminBootstrapResult = { errors }

  const secret = config.webhookSecret?.trim()
  const apiKey = config.apiKey?.trim()
  if (!config.enabled || !apiKey || !secret || !projectId) return out
  if (!force && !throttleKey(SESSION_ADMIN_BOOT, 20 * 60_000)) return out

  const expectedUrl = buildOmicallWebhookUrl(projectId, secret)
  const registered = config.webhookRegisteredUrl?.trim()
  if (registered !== expectedUrl) {
    try {
      const r = await registerOmicallWebhookOnServer()
      out.webhook = r.message
    } catch (e) {
      errors.push(e instanceof Error ? e.message : 'Đăng ký webhook thất bại')
    }
  }

  try {
    const sync = await syncOmicallInternalPhones(false)
    out.phones = `Đồng bộ TVV: ${sync.updated} cập nhật / ${sync.matched} khớp.`
  } catch (e) {
    errors.push(e instanceof Error ? e.message : 'Đồng bộ số nội bộ thất bại')
  }

  return out
}

/** TVV: tự lấy số nội bộ theo email (một lần mỗi phiên). */
export async function runOmicallCounselorBootstrap(opts: {
  configEnabled: boolean
  hasSipUser: boolean
}): Promise<string | null> {
  if (!opts.configEnabled) return null
  if (opts.hasSipUser) return null
  if (!throttleKey(SESSION_MY_EXT, 8 * 60_000)) return null
  try {
    const r = await syncOmicallMyExtension()
    return r.updated ? r.message : null
  } catch {
    return null
  }
}
