import { DEFAULT_ORG_ID } from '../tenancy/orgConstants'

const SECRET_KEY_RE =
  /(apiKey|apiSecret|accessToken|secret|password|token|hashSecret|keyHash|botToken|webhookSecret|pageAccessToken|verifyToken)/i

/** Xóa secret / destination khi copy cấu hình sang trường mới. */
export function sanitizeCopiedOrgSettingsDoc(
  docId: string,
  data: Record<string, unknown>,
  toOrgId: string,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...data, orgId: toOrgId }

  const scrubObject = (obj: Record<string, unknown>): Record<string, unknown> => {
    const next: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(obj)) {
      if (SECRET_KEY_RE.test(k)) {
        next[k] = typeof v === 'boolean' ? false : ''
        continue
      }
      if (v && typeof v === 'object' && !Array.isArray(v)) {
        next[k] = scrubObject(v as Record<string, unknown>)
        continue
      }
      if (Array.isArray(v)) {
        next[k] = v.map((item) =>
          item && typeof item === 'object' && !Array.isArray(item)
            ? scrubObject(item as Record<string, unknown>)
            : item,
        )
        continue
      }
      next[k] = v
    }
    return next
  }

  if (docId === 'omicallIntegration' || docId === 'orgAiIntegration') {
    delete out.apiKey
    delete out.defaultSipPassword
    delete out.apiToken
    delete out.webhookSecret
    out.enabled = false
  }

  if (docId === 'publicRegistrationConfig') {
    out.enabled = false
    out.n8nWebhookUrl = ''
    out.portalPublicUrl = ''
    out.n8nEnabled = false
  }

  if (docId === 'n8nWebhooks') {
    out.giayMoi = ''
    out.ctsv = ''
    out.daily = ''
    out.monthly = ''
  }

  if (docId === 'receiptStorageConfig') {
    out.r2UploadUrl = ''
    out.r2UploadToken = ''
    out.r2PublicBaseUrl = ''
    out.driveWebhookUrl = ''
    out.driveWebhookToken = ''
    out.provider = 'auto'
  }

  if (docId === 'inviteDocumentsConfig') {
    out.driveRootFolderId = ''
  }

  if (docId === 'integrationHub') {
    const scrubbed = scrubObject(out)
    scrubbed.subscriptions = []
    scrubbed.inboundApiKeys = []
    const connectors = scrubbed.connectors
    if (connectors && typeof connectors === 'object' && !Array.isArray(connectors)) {
      const cleaned: Record<string, Record<string, string>> = {}
      for (const [cid, fields] of Object.entries(connectors as Record<string, unknown>)) {
        if (!fields || typeof fields !== 'object') continue
        const fr = scrubObject(fields as Record<string, unknown>)
        // Tắt mọi connector & xóa URL gửi
        fr.enabled = 'false'
        for (const [fk, fv] of Object.entries(fr)) {
          if (/url/i.test(fk) && typeof fv === 'string') fr[fk] = ''
        }
        cleaned[cid] = Object.fromEntries(
          Object.entries(fr).map(([k, v]) => [k, v == null ? '' : String(v)]),
        )
      }
      scrubbed.connectors = cleaned
    }
    return scrubbed
  }

  if (docId === 'commsAutomationConfig') {
    const scrubbed = scrubObject(out)
    const disableChannel = (ch: unknown) => {
      if (!ch || typeof ch !== 'object') return ch
      const c = { ...(ch as Record<string, unknown>) }
      c.enabled = false
      c.sendWebhookUrl = ''
      c.apiKey = ''
      c.apiSecret = ''
      c.accessToken = ''
      c.secretKey = ''
      c.webhookVerifyToken = ''
      return c
    }
    scrubbed.email = disableChannel(scrubbed.email)
    scrubbed.sms = disableChannel(scrubbed.sms)
    scrubbed.zalo = disableChannel(scrubbed.zalo)
    scrubbed.whatsapp = disableChannel(scrubbed.whatsapp)
    if (Array.isArray(scrubbed.rules)) {
      scrubbed.rules = scrubbed.rules.map((r) =>
        r && typeof r === 'object' ? { ...(r as object), enabled: false } : r,
      )
    }
    return scrubbed
  }

  // Không copy roleCapabilities từ trường mẫu — Admin trường mới chỉ có staff bắt buộc
  if (docId === 'roleCapabilities') {
    return {
      orgId: toOrgId,
      adminEnabledModuleIds: ['staff', 'data', 'scoring', 'integrations', 'ai', 'analytics', 'leads_school'],
    }
  }

  void DEFAULT_ORG_ID
  return scrubObject(out)
}
