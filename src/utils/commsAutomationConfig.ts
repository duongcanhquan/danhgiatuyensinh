import { doc, getDoc, setDoc, Timestamp, type Firestore } from 'firebase/firestore'
import { FS_COLLECTIONS } from '../types'
import { orgSettingsDocSegments } from '../tenancy/orgSettingsPaths'
import { DEFAULT_ORG_ID } from '../tenancy/orgConstants'
import { isOutboundEventId, type OutboundEventId } from '../integrations/outboundEvents'

export const COMMS_AUTOMATION_DOC_ID = 'commsAutomationConfig' as const

export type CommsChannelId = 'email' | 'sms' | 'zalo' | 'whatsapp'

export type CommsEmailProvider = 'resend' | 'sendgrid' | 'smtp' | 'n8n'
export type CommsSmsProvider = 'twilio' | 'esms' | 'vietguys' | 'custom'
export type CommsZaloMode = 'zns' | 'oa_message' | 'n8n'

/** Biến mẫu hỗ trợ trong subject/body. */
export const COMMS_TEMPLATE_VARS = [
  'fullName',
  'phone',
  'email',
  'parentPhone',
  'majorInterest',
  'province',
  'highSchool',
  'assigneeName',
  'schoolName',
  'leadId',
  'source',
  'pipelineStatus',
  'nextFollowUpDate',
] as const

export type CommsTemplateVar = (typeof COMMS_TEMPLATE_VARS)[number]

export type CommsTemplate = {
  id: string
  channel: CommsChannelId
  name: string
  /** Chỉ dùng cho email */
  subject: string
  body: string
  enabled: boolean
  /** marketing = tôn trọng opt-in; transactional = luôn gửi nếu có luật */
  intent: 'transactional' | 'marketing'
}

export type CommsAutomationTrigger = OutboundEventId | 'followup.due' | 'manual'

export type CommsAutomationRule = {
  id: string
  name: string
  enabled: boolean
  trigger: CommsAutomationTrigger
  channel: CommsChannelId
  templateId: string
  /** Trễ sau sự kiện (phút). 0 = gửi ngay. */
  delayMinutes: number
}

export type CommsEmailChannelConfig = {
  enabled: boolean
  provider: CommsEmailProvider
  apiKey: string
  fromEmail: string
  fromName: string
  replyTo: string
  smtpHost: string
  smtpPort: string
  smtpUser: string
  smtpSecure: boolean
  /** URL n8n/worker nhận payload send_comms */
  sendWebhookUrl: string
}

export type CommsSmsChannelConfig = {
  enabled: boolean
  provider: CommsSmsProvider
  apiKey: string
  apiSecret: string
  senderId: string
  sendWebhookUrl: string
}

export type CommsZaloChannelConfig = {
  enabled: boolean
  mode: CommsZaloMode
  oaId: string
  accessToken: string
  appId: string
  secretKey: string
  sendWebhookUrl: string
}

export type CommsWhatsappChannelConfig = {
  enabled: boolean
  phoneNumberId: string
  accessToken: string
  webhookVerifyToken: string
  businessAccountId: string
  sendWebhookUrl: string
}

export type CommsConsentConfig = {
  /** Marketing cần lead.commsOptIn === true */
  requireOptInBeforeMarketing: boolean
  /** Bỏ qua nếu lead.doNotContact */
  honorDoNotContact: boolean
  /** Cho phép gửi transactional mặc định */
  allowTransactionalByDefault: boolean
}

export type CommsQuietHoursConfig = {
  enabled: boolean
  /** 0–23 theo timezone */
  startHour: number
  endHour: number
  timezone: string
}

export type OrgCommsAutomationConfig = {
  schemaVersion: 1
  email: CommsEmailChannelConfig
  sms: CommsSmsChannelConfig
  zalo: CommsZaloChannelConfig
  whatsapp: CommsWhatsappChannelConfig
  templates: CommsTemplate[]
  rules: CommsAutomationRule[]
  consent: CommsConsentConfig
  quietHours: CommsQuietHoursConfig
  updatedAt?: string
  updatedBy?: string
}

export function emptyEmailChannel(): CommsEmailChannelConfig {
  return {
    enabled: false,
    provider: 'n8n',
    apiKey: '',
    fromEmail: '',
    fromName: '',
    replyTo: '',
    smtpHost: '',
    smtpPort: '587',
    smtpUser: '',
    smtpSecure: true,
    sendWebhookUrl: '',
  }
}

export function emptySmsChannel(): CommsSmsChannelConfig {
  return {
    enabled: false,
    provider: 'esms',
    apiKey: '',
    apiSecret: '',
    senderId: '',
    sendWebhookUrl: '',
  }
}

export function emptyZaloChannel(): CommsZaloChannelConfig {
  return {
    enabled: false,
    mode: 'n8n',
    oaId: '',
    accessToken: '',
    appId: '',
    secretKey: '',
    sendWebhookUrl: '',
  }
}

export function emptyWhatsappChannel(): CommsWhatsappChannelConfig {
  return {
    enabled: false,
    phoneNumberId: '',
    accessToken: '',
    webhookVerifyToken: '',
    businessAccountId: '',
    sendWebhookUrl: '',
  }
}

/** Mẫu + luật mặc định (tắt) — Admin bật khi đã nối webhook. */
export function defaultCommsAutomationConfig(): OrgCommsAutomationConfig {
  const templates: CommsTemplate[] = [
    {
      id: 'tpl-email-welcome',
      channel: 'email',
      name: 'Chào mừng hồ sơ mới',
      subject: '{{schoolName}} — đã nhận hồ sơ của {{fullName}}',
      body: 'Xin chào {{fullName}},\n\nNhà trường đã nhận hồ sơ tư vấn của bạn. Tư vấn viên sẽ liên hệ sớm.\n\nTrân trọng,\n{{schoolName}}',
      enabled: true,
      intent: 'transactional',
    },
    {
      id: 'tpl-sms-welcome',
      channel: 'sms',
      name: 'SMS chào mừng',
      subject: '',
      body: '{{schoolName}}: Da nhan HS {{fullName}}. TVV se lien he. LH {{phone}} neu can.',
      enabled: true,
      intent: 'transactional',
    },
    {
      id: 'tpl-zalo-followup',
      channel: 'zalo',
      name: 'Zalo nhắc follow-up',
      subject: '',
      body: 'Chào {{fullName}}, {{assigneeName}} nhắc lịch tư vấn ngày {{nextFollowUpDate}}. {{schoolName}}',
      enabled: true,
      intent: 'transactional',
    },
    {
      id: 'tpl-wa-registration',
      channel: 'whatsapp',
      name: 'WA xác nhận đăng ký cổng',
      subject: '',
      body: 'Xin chào {{fullName}}, đăng ký tại {{schoolName}} đã được ghi nhận. Mã HS: {{leadId}}.',
      enabled: true,
      intent: 'transactional',
    },
    {
      id: 'tpl-email-marketing',
      channel: 'email',
      name: 'Email thông báo tuyển sinh (marketing)',
      subject: '{{schoolName}} — ưu đãi xét tuyển',
      body: 'Chào {{fullName}},\n\nMời bạn xem thông tin ngành {{majorInterest}} tại {{schoolName}}.\n\n(Bạn nhận vì đã đồng ý nhận thông tin.)',
      enabled: false,
      intent: 'marketing',
    },
  ]

  const rules: CommsAutomationRule[] = [
    {
      id: 'rule-lead-created-email',
      name: 'Email khi tạo hồ sơ',
      enabled: false,
      trigger: 'lead.created',
      channel: 'email',
      templateId: 'tpl-email-welcome',
      delayMinutes: 0,
    },
    {
      id: 'rule-lead-created-sms',
      name: 'SMS khi tạo hồ sơ',
      enabled: false,
      trigger: 'lead.created',
      channel: 'sms',
      templateId: 'tpl-sms-welcome',
      delayMinutes: 0,
    },
    {
      id: 'rule-registration-wa',
      name: 'WhatsApp khi đăng ký cổng',
      enabled: false,
      trigger: 'registration.public',
      channel: 'whatsapp',
      templateId: 'tpl-wa-registration',
      delayMinutes: 0,
    },
    {
      id: 'rule-followup-zalo',
      name: 'Zalo khi đến hạn follow-up',
      enabled: false,
      trigger: 'followup.due',
      channel: 'zalo',
      templateId: 'tpl-zalo-followup',
      delayMinutes: 0,
    },
    {
      id: 'rule-finance-email',
      name: 'Email khi kế toán duyệt/từ chối',
      enabled: false,
      trigger: 'finance.decision',
      channel: 'email',
      templateId: 'tpl-email-welcome',
      delayMinutes: 0,
    },
    {
      id: 'rule-document-email',
      name: 'Email khi yêu cầu giấy tờ',
      enabled: false,
      trigger: 'document.requested',
      channel: 'email',
      templateId: 'tpl-email-welcome',
      delayMinutes: 0,
    },
  ]

  return {
    schemaVersion: 1,
    email: emptyEmailChannel(),
    sms: emptySmsChannel(),
    zalo: emptyZaloChannel(),
    whatsapp: emptyWhatsappChannel(),
    templates,
    rules,
    consent: {
      requireOptInBeforeMarketing: true,
      honorDoNotContact: true,
      allowTransactionalByDefault: true,
    },
    quietHours: {
      enabled: false,
      startHour: 21,
      endHour: 8,
      timezone: 'Asia/Ho_Chi_Minh',
    },
  }
}

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {}
}

function parseEmail(raw: unknown): CommsEmailChannelConfig {
  const d = emptyEmailChannel()
  const r = asRecord(raw)
  const provider = String(r.provider ?? d.provider)
  return {
    enabled: r.enabled === true || r.enabled === 'true',
    provider:
      provider === 'resend' || provider === 'sendgrid' || provider === 'smtp' || provider === 'n8n'
        ? provider
        : 'n8n',
    apiKey: String(r.apiKey ?? ''),
    fromEmail: String(r.fromEmail ?? '').trim(),
    fromName: String(r.fromName ?? '').trim(),
    replyTo: String(r.replyTo ?? '').trim(),
    smtpHost: String(r.smtpHost ?? '').trim(),
    smtpPort: String(r.smtpPort ?? d.smtpPort).trim() || '587',
    smtpUser: String(r.smtpUser ?? '').trim(),
    smtpSecure: r.smtpSecure !== false && r.smtpSecure !== 'false',
    sendWebhookUrl: String(r.sendWebhookUrl ?? '').trim(),
  }
}

function parseSms(raw: unknown): CommsSmsChannelConfig {
  const d = emptySmsChannel()
  const r = asRecord(raw)
  const provider = String(r.provider ?? d.provider)
  return {
    enabled: r.enabled === true || r.enabled === 'true',
    provider:
      provider === 'twilio' || provider === 'esms' || provider === 'vietguys' || provider === 'custom'
        ? provider
        : 'esms',
    apiKey: String(r.apiKey ?? ''),
    apiSecret: String(r.apiSecret ?? ''),
    senderId: String(r.senderId ?? '').trim(),
    sendWebhookUrl: String(r.sendWebhookUrl ?? '').trim(),
  }
}

function parseZalo(raw: unknown): CommsZaloChannelConfig {
  const d = emptyZaloChannel()
  const r = asRecord(raw)
  const mode = String(r.mode ?? d.mode)
  return {
    enabled: r.enabled === true || r.enabled === 'true',
    mode: mode === 'zns' || mode === 'oa_message' || mode === 'n8n' ? mode : 'n8n',
    oaId: String(r.oaId ?? '').trim(),
    accessToken: String(r.accessToken ?? ''),
    appId: String(r.appId ?? '').trim(),
    secretKey: String(r.secretKey ?? ''),
    sendWebhookUrl: String(r.sendWebhookUrl ?? '').trim(),
  }
}

function parseWhatsapp(raw: unknown): CommsWhatsappChannelConfig {
  const r = asRecord(raw)
  return {
    enabled: r.enabled === true || r.enabled === 'true',
    phoneNumberId: String(r.phoneNumberId ?? '').trim(),
    accessToken: String(r.accessToken ?? ''),
    webhookVerifyToken: String(r.webhookVerifyToken ?? ''),
    businessAccountId: String(r.businessAccountId ?? '').trim(),
    sendWebhookUrl: String(r.sendWebhookUrl ?? '').trim(),
  }
}

function isCommsChannel(v: string): v is CommsChannelId {
  return v === 'email' || v === 'sms' || v === 'zalo' || v === 'whatsapp'
}

function isCommsTrigger(v: string): v is CommsAutomationTrigger {
  return v === 'followup.due' || v === 'manual' || isOutboundEventId(v)
}

export function parseCommsAutomationConfig(
  data: Record<string, unknown> | undefined,
): OrgCommsAutomationConfig {
  const base = defaultCommsAutomationConfig()
  if (!data) return base

  const templates: CommsTemplate[] = []
  const rawTpl = Array.isArray(data.templates) ? data.templates : []
  for (const item of rawTpl) {
    const r = asRecord(item)
    const id = String(r.id ?? '').trim()
    const channel = String(r.channel ?? '')
    if (!id || !isCommsChannel(channel)) continue
    templates.push({
      id,
      channel,
      name: String(r.name ?? id).trim() || id,
      subject: String(r.subject ?? ''),
      body: String(r.body ?? ''),
      enabled: r.enabled !== false && r.enabled !== 'false',
      intent: r.intent === 'marketing' ? 'marketing' : 'transactional',
    })
  }

  const rules: CommsAutomationRule[] = []
  const rawRules = Array.isArray(data.rules) ? data.rules : []
  for (const item of rawRules) {
    const r = asRecord(item)
    const id = String(r.id ?? '').trim()
    const channel = String(r.channel ?? '')
    const trigger = String(r.trigger ?? '')
    if (!id || !isCommsChannel(channel) || !isCommsTrigger(trigger)) continue
    const delay = Number(r.delayMinutes)
    rules.push({
      id,
      name: String(r.name ?? id).trim() || id,
      enabled: r.enabled === true || r.enabled === 'true',
      trigger,
      channel,
      templateId: String(r.templateId ?? '').trim(),
      delayMinutes: Number.isFinite(delay) && delay >= 0 ? Math.min(7 * 24 * 60, Math.floor(delay)) : 0,
    })
  }

  const consentRaw = asRecord(data.consent)
  const quietRaw = asRecord(data.quietHours)
  const startHour = Number(quietRaw.startHour)
  const endHour = Number(quietRaw.endHour)

  return {
    schemaVersion: 1,
    email: parseEmail(data.email),
    sms: parseSms(data.sms),
    zalo: parseZalo(data.zalo),
    whatsapp: parseWhatsapp(data.whatsapp),
    templates: templates.length ? templates : base.templates,
    rules: rules.length ? rules : base.rules,
    consent: {
      requireOptInBeforeMarketing: consentRaw.requireOptInBeforeMarketing !== false,
      honorDoNotContact: consentRaw.honorDoNotContact !== false,
      allowTransactionalByDefault: consentRaw.allowTransactionalByDefault !== false,
    },
    quietHours: {
      enabled: quietRaw.enabled === true || quietRaw.enabled === 'true',
      startHour: Number.isFinite(startHour) ? Math.min(23, Math.max(0, Math.floor(startHour))) : 21,
      endHour: Number.isFinite(endHour) ? Math.min(23, Math.max(0, Math.floor(endHour))) : 8,
      timezone: String(quietRaw.timezone ?? 'Asia/Ho_Chi_Minh').trim() || 'Asia/Ho_Chi_Minh',
    },
    updatedAt: data.updatedAt != null ? String(data.updatedAt) : undefined,
    updatedBy: data.updatedBy != null ? String(data.updatedBy) : undefined,
  }
}

let commsCache: OrgCommsAutomationConfig | null = null
let commsCacheOrgId: string | null = null

export function setCommsAutomationConfigCache(orgId: string, cfg: OrgCommsAutomationConfig | null): void {
  commsCacheOrgId = orgId
  commsCache = cfg
}

export function getCommsAutomationConfigCache(): {
  orgId: string | null
  config: OrgCommsAutomationConfig | null
} {
  return { orgId: commsCacheOrgId, config: commsCache }
}

export async function loadCommsAutomationConfig(
  db: Firestore,
  orgId: string = DEFAULT_ORG_ID,
): Promise<OrgCommsAutomationConfig> {
  const id = orgId.trim() || DEFAULT_ORG_ID
  try {
    const snap = await getDoc(doc(db, ...orgSettingsDocSegments(id, COMMS_AUTOMATION_DOC_ID)))
    const parsed = parseCommsAutomationConfig(
      snap.exists() ? (snap.data() as Record<string, unknown>) : undefined,
    )
    setCommsAutomationConfigCache(id, parsed)
    return parsed
  } catch (e) {
    console.warn('[loadCommsAutomationConfig]', id, e)
    const d = defaultCommsAutomationConfig()
    setCommsAutomationConfigCache(id, d)
    return d
  }
}

export async function saveCommsAutomationConfig(
  db: Firestore,
  orgId: string,
  cfg: OrgCommsAutomationConfig,
  updatedBy: string,
): Promise<OrgCommsAutomationConfig> {
  const id = orgId.trim() || DEFAULT_ORG_ID
  const parsed = parseCommsAutomationConfig(cfg as unknown as Record<string, unknown>)
  const payload: OrgCommsAutomationConfig = {
    ...parsed,
    updatedAt: new Date().toISOString(),
    updatedBy,
  }
  await setDoc(
    doc(db, ...orgSettingsDocSegments(id, COMMS_AUTOMATION_DOC_ID)),
    { ...payload, orgId: id, updatedAtServer: Timestamp.now() },
    { merge: true },
  )
  await setDoc(doc(db, FS_COLLECTIONS.orgSettings, id), { orgId: id, updatedAt: Timestamp.now() }, { merge: true })
  setCommsAutomationConfigCache(id, payload)
  return payload
}

export function renderCommsTemplate(
  text: string,
  vars: Partial<Record<CommsTemplateVar | string, string | null | undefined>>,
): string {
  return text.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key: string) => {
    const v = vars[key]
    return v != null && String(v).trim() ? String(v) : ''
  })
}

export function channelSendWebhookUrl(
  cfg: OrgCommsAutomationConfig,
  channel: CommsChannelId,
): string {
  switch (channel) {
    case 'email':
      return cfg.email.sendWebhookUrl.trim()
    case 'sms':
      return cfg.sms.sendWebhookUrl.trim()
    case 'zalo':
      return cfg.zalo.sendWebhookUrl.trim()
    case 'whatsapp':
      return cfg.whatsapp.sendWebhookUrl.trim()
  }
}

export function channelEnabled(cfg: OrgCommsAutomationConfig, channel: CommsChannelId): boolean {
  switch (channel) {
    case 'email':
      return cfg.email.enabled
    case 'sms':
      return cfg.sms.enabled
    case 'zalo':
      return cfg.zalo.enabled
    case 'whatsapp':
      return cfg.whatsapp.enabled
  }
}

export function rulesForTrigger(
  cfg: OrgCommsAutomationConfig,
  trigger: CommsAutomationTrigger,
): CommsAutomationRule[] {
  return cfg.rules.filter((r) => r.enabled && r.trigger === trigger)
}

/**
 * Giờ im lặng: nếu start > end (vd 21→8) thì khoảng qua đêm.
 * `now` mặc định Date hiện tại; hour lấy theo local (timezone string chỉ lưu trữ — client dùng local clock).
 */
export function isWithinQuietHours(
  quiet: CommsQuietHoursConfig,
  now: Date = new Date(),
): boolean {
  if (!quiet.enabled) return false
  const hour = now.getHours()
  const { startHour, endHour } = quiet
  if (startHour === endHour) return true
  if (startHour < endHour) return hour >= startHour && hour < endHour
  return hour >= startHour || hour < endHour
}

export type CommsLeadContext = {
  id?: string
  fullName?: string
  phone?: string
  email?: string
  parentPhone?: string
  majorInterest?: string
  province?: string
  highSchool?: string
  assigneeName?: string
  schoolName?: string
  source?: string
  pipelineStatus?: string
  nextFollowUpDate?: string
  /** Lead đã đồng ý nhận marketing */
  commsOptIn?: boolean
  /** Không liên hệ */
  doNotContact?: boolean
}

export function buildTemplateVars(ctx: CommsLeadContext): Record<string, string> {
  return {
    fullName: ctx.fullName ?? '',
    phone: ctx.phone ?? '',
    email: ctx.email ?? '',
    parentPhone: ctx.parentPhone ?? '',
    majorInterest: ctx.majorInterest ?? '',
    province: ctx.province ?? '',
    highSchool: ctx.highSchool ?? '',
    assigneeName: ctx.assigneeName ?? '',
    schoolName: ctx.schoolName ?? '',
    leadId: ctx.id ?? '',
    source: ctx.source ?? '',
    pipelineStatus: ctx.pipelineStatus ?? '',
    nextFollowUpDate: ctx.nextFollowUpDate ?? '',
  }
}

export function shouldSendForTemplateIntent(
  consent: CommsConsentConfig,
  template: CommsTemplate,
  lead: CommsLeadContext,
): boolean {
  if (consent.honorDoNotContact && lead.doNotContact) return false
  if (template.intent === 'marketing') {
    if (consent.requireOptInBeforeMarketing && !lead.commsOptIn) return false
    return true
  }
  return consent.allowTransactionalByDefault
}

export const COMMS_CHANNEL_LABELS: Record<CommsChannelId, string> = {
  email: 'Email',
  sms: 'SMS',
  zalo: 'Zalo',
  whatsapp: 'WhatsApp',
}

export const COMMS_TRIGGER_OPTIONS: Array<{ value: CommsAutomationTrigger; label: string }> = [
  { value: 'lead.created', label: 'Tạo hồ sơ' },
  { value: 'lead.assigned', label: 'Đổi tư vấn viên' },
  { value: 'lead.priority_changed', label: 'Đổi nhãn ưu tiên' },
  { value: 'registration.public', label: 'Đăng ký cổng công khai' },
  { value: 'finance.decision', label: 'Kế toán duyệt / từ chối' },
  { value: 'finance.full_ne', label: 'Full NE' },
  { value: 'document.requested', label: 'Yêu cầu giấy tờ' },
  { value: 'call.completed', label: 'Kết thúc cuộc gọi' },
  { value: 'followup.due', label: 'Đến hạn follow-up' },
  { value: 'manual', label: 'Gửi tay (nút trên hồ sơ — sau)' },
]
