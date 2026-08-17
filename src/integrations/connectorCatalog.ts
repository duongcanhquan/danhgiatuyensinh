/** Catalog đầu nối CRM — metadata cố định; cấu hình runtime nằm ở orgIntegrationHub. */

export type ConnectorMaturity = 'live' | 'ready' | 'planned'

export type ConnectorGroupId =
  | 'capture'
  | 'voice_chat'
  | 'automation'
  | 'ai'
  | 'notify'
  | 'payments'
  | 'academic'
  | 'storage'

export type ConnectorFieldKind = 'url' | 'text' | 'secret' | 'toggle' | 'select'

export type ConnectorFieldDef = {
  key: string
  label: string
  kind: ConnectorFieldKind
  placeholder?: string
  hint?: string
  options?: Array<{ value: string; label: string }>
}

export type ConnectorDef = {
  id: string
  name: string
  group: ConnectorGroupId
  maturity: ConnectorMaturity
  summary: string
  /** Deep-link Settings chuyên sâu (nếu có). */
  settingsHref?: string
  fields: ConnectorFieldDef[]
  /** Sự kiện gợi ý đăng ký generic webhook. */
  suggestedEvents?: string[]
}

export const CONNECTOR_GROUP_LABELS: Record<ConnectorGroupId, string> = {
  capture: 'Thu thập hồ sơ',
  voice_chat: 'Gọi & chat',
  automation: 'Tự động hóa',
  ai: 'AI & tri thức',
  notify: 'Thông báo nội bộ',
  payments: 'Thanh toán',
  academic: 'Học vụ / SIS',
  storage: 'Chứng từ & lưu trữ',
}

export const CONNECTOR_CATALOG: readonly ConnectorDef[] = [
  {
    id: 'public_portal',
    name: 'Cổng đăng ký sinh viên',
    group: 'capture',
    maturity: 'live',
    summary: 'Form công khai /dang-ky — hồ sơ vào CRM, có thể gửi email qua n8n.',
    settingsHref: '/settings?tab=connect&sub=public_registration',
    fields: [],
  },
  {
    id: 'inbound_lead_api',
    name: 'Nhận hồ sơ từ đối tác',
    group: 'capture',
    maturity: 'ready',
    summary: 'Landing / form ngoài đẩy hồ sơ bằng API key theo trường.',
    fields: [
      { key: 'enabled', label: 'Bật nhận hồ sơ qua API', kind: 'toggle' },
      {
        key: 'defaultSource1',
        label: 'Nguồn mặc định (source1)',
        kind: 'text',
        placeholder: 'API đối tác',
        hint: 'Gắn vào danh mục Nguồn nếu dùng KPI OFF/MKT.',
      },
    ],
    suggestedEvents: ['lead.created'],
  },
  {
    id: 'meta_lead_ads',
    name: 'Meta Lead Ads',
    group: 'capture',
    maturity: 'ready',
    summary: 'Nhận lead từ form quảng cáo Facebook/Instagram (webhook Meta → n8n → CRM).',
    fields: [
      { key: 'enabled', label: 'Bật Meta Lead Ads', kind: 'toggle' },
      { key: 'verifyToken', label: 'Verify token', kind: 'secret' },
      { key: 'pageAccessToken', label: 'Page access token', kind: 'secret' },
      { key: 'appSecret', label: 'App secret', kind: 'secret' },
      { key: 'ingestWebhookUrl', label: 'URL n8n nhận webhook Meta', kind: 'url' },
      { key: 'defaultSource1', label: 'Nguồn mặc định', kind: 'text', placeholder: 'Meta Ads' },
    ],
    suggestedEvents: ['lead.created'],
  },
  {
    id: 'tiktok_lead_ads',
    name: 'TikTok Lead Ads',
    group: 'capture',
    maturity: 'ready',
    summary: 'Form quảng cáo TikTok → webhook → hồ sơ CRM.',
    fields: [
      { key: 'enabled', label: 'Bật TikTok Lead', kind: 'toggle' },
      { key: 'appId', label: 'App ID', kind: 'text' },
      { key: 'accessToken', label: 'Access token', kind: 'secret' },
      { key: 'ingestWebhookUrl', label: 'URL n8n nhận lead', kind: 'url' },
      { key: 'defaultSource1', label: 'Nguồn mặc định', kind: 'text', placeholder: 'TikTok Ads' },
    ],
    suggestedEvents: ['lead.created'],
  },
  {
    id: 'google_forms',
    name: 'Google Forms / Sheets',
    group: 'capture',
    maturity: 'ready',
    summary: 'Form / Sheet đẩy dòng mới vào CRM qua webhook n8n.',
    fields: [
      { key: 'enabled', label: 'Bật đồng bộ Form/Sheet', kind: 'toggle' },
      { key: 'sheetWebhookUrl', label: 'URL nhận / đẩy Sheet', kind: 'url' },
      { key: 'defaultSource1', label: 'Nguồn mặc định', kind: 'text', placeholder: 'Google Form' },
    ],
    suggestedEvents: ['lead.created'],
  },
  {
    id: 'google_sheets',
    name: 'Google Sheets (legacy)',
    group: 'capture',
    maturity: 'planned',
    summary: 'Giữ chỗ — dùng Google Forms / Sheets ở trên.',
    fields: [{ key: 'sheetWebhookUrl', label: 'URL nhận / đẩy Sheet', kind: 'url' }],
  },
  {
    id: 'omicall',
    name: 'Gọi điện',
    group: 'voice_chat',
    maturity: 'live',
    summary: 'Tổng đài web, gọi từ hồ sơ, đồng bộ lịch sử & KPI.',
    settingsHref: '/settings?tab=connect&sub=omicall',
    fields: [],
    suggestedEvents: ['call.completed'],
  },
  {
    id: 'zalo_oa',
    name: 'Zalo OA',
    group: 'voice_chat',
    maturity: 'ready',
    summary: 'Zalo Official Account / ZNS — mẫu và luật gửi tại Email & tin nhắn.',
    settingsHref: '/settings?tab=connect&sub=comms',
    fields: [],
    suggestedEvents: ['lead.created', 'lead.assigned', 'finance.decision', 'followup.due'],
  },
  {
    id: 'whatsapp_cloud',
    name: 'WhatsApp',
    group: 'voice_chat',
    maturity: 'ready',
    summary: 'WhatsApp Business — mẫu & luật gửi tại Email & tin nhắn.',
    settingsHref: '/settings?tab=connect&sub=comms',
    fields: [],
    suggestedEvents: ['lead.created', 'registration.public'],
  },
  {
    id: 'email_smtp',
    name: 'Email',
    group: 'voice_chat',
    maturity: 'ready',
    summary: 'Gửi email giao dịch — mẫu + luật tại Email & tin nhắn.',
    settingsHref: '/settings?tab=connect&sub=comms',
    fields: [],
    suggestedEvents: ['lead.created', 'finance.decision', 'document.requested', 'registration.public'],
  },
  {
    id: 'sms_gateway',
    name: 'SMS',
    group: 'voice_chat',
    maturity: 'ready',
    summary: 'Gửi SMS — mẫu & luật tại Email & tin nhắn.',
    settingsHref: '/settings?tab=connect&sub=comms',
    fields: [],
    suggestedEvents: ['lead.created', 'followup.due'],
  },
  {
    id: 'telegram_bot',
    name: 'Telegram',
    group: 'voice_chat',
    maturity: 'ready',
    summary: 'Bot nhận cảnh báo nội bộ / fan-out sự kiện.',
    fields: [
      { key: 'enabled', label: 'Bật Telegram', kind: 'toggle' },
      { key: 'botToken', label: 'Bot token', kind: 'secret' },
      { key: 'defaultChatId', label: 'Chat ID mặc định', kind: 'text' },
      { key: 'sendWebhookUrl', label: 'URL gửi (nếu dùng n8n)', kind: 'url' },
    ],
    suggestedEvents: ['lead.priority_changed', 'finance.decision', 'report.daily'],
  },
  {
    id: 'n8n',
    name: 'Tự động hóa (n8n)',
    group: 'automation',
    maturity: 'live',
    summary: 'Giấy mời, CTSV, báo cáo ngày/tháng — URL theo trường.',
    settingsHref: '/settings?tab=connect&sub=webhooks',
    fields: [],
    suggestedEvents: [
      'finance.submitted',
      'finance.decision',
      'document.requested',
      'report.daily',
      'report.monthly',
    ],
  },
  {
    id: 'invite_docs',
    name: 'Giấy mời & mẫu',
    group: 'automation',
    maturity: 'live',
    summary: 'Mẫu giấy mời, nội dung gửi — dùng cùng tự động hóa giấy mời.',
    settingsHref: '/settings?tab=connect&sub=invite_docs',
    fields: [],
  },
  {
    id: 'generic_webhooks',
    name: 'Webhook khác',
    group: 'automation',
    maturity: 'ready',
    summary: 'Đăng ký URL theo sự kiện — Zapier, Make, hoặc hệ tự xây.',
    fields: [],
    suggestedEvents: [
      'lead.created',
      'lead.updated',
      'lead.assigned',
      'lead.priority_changed',
      'call.completed',
      'finance.submitted',
      'finance.decision',
      'finance.full_ne',
      'document.requested',
      'report.daily',
      'report.monthly',
      'registration.public',
    ],
  },
  {
    id: 'llm',
    name: 'AI hỗ trợ',
    group: 'ai',
    maturity: 'live',
    summary: 'Khóa API, lọc khi gọi AI, tác vụ phân tích hồ sơ — tab Máy AI trong Tư vấn & AI.',
    settingsHref: '/settings?tab=advise&sub=llm',
    fields: [],
  },
  {
    id: 'slack_alerts',
    name: 'Slack',
    group: 'notify',
    maturity: 'ready',
    summary: 'Cảnh báo KPI / duyệt cọc / lead HOT vào Slack.',
    fields: [
      { key: 'enabled', label: 'Bật Slack', kind: 'toggle' },
      { key: 'incomingWebhookUrl', label: 'Incoming webhook URL', kind: 'url' },
    ],
    suggestedEvents: ['lead.priority_changed', 'finance.decision', 'report.daily'],
  },
  {
    id: 'teams_alerts',
    name: 'Microsoft Teams',
    group: 'notify',
    maturity: 'ready',
    summary: 'Cảnh báo nội bộ vào Teams.',
    fields: [
      { key: 'enabled', label: 'Bật Teams', kind: 'toggle' },
      { key: 'incomingWebhookUrl', label: 'Incoming webhook URL', kind: 'url' },
    ],
    suggestedEvents: ['finance.decision', 'report.daily', 'report.monthly'],
  },
  {
    id: 'google_chat',
    name: 'Google Chat',
    group: 'notify',
    maturity: 'live',
    summary: 'Dùng chung URL CTSV trong Tự động hóa (n8n).',
    settingsHref: '/settings?tab=connect&sub=webhooks',
    fields: [],
  },
  {
    id: 'calendar_booking',
    name: 'Đặt lịch tư vấn',
    group: 'notify',
    maturity: 'ready',
    summary: 'Calendly / Google Calendar — webhook khi có lịch hẹn mới.',
    fields: [
      { key: 'enabled', label: 'Bật đặt lịch', kind: 'toggle' },
      {
        key: 'provider',
        label: 'Nền tảng',
        kind: 'select',
        options: [
          { value: 'calendly', label: 'Calendly' },
          { value: 'google_calendar', label: 'Google Calendar' },
          { value: 'custom', label: 'Webhook tùy chỉnh' },
        ],
      },
      { key: 'bookingPageUrl', label: 'Link trang đặt lịch (public)', kind: 'url' },
      { key: 'bookingWebhookUrl', label: 'URL webhook khi có lịch mới', kind: 'url' },
      { key: 'defaultAssigneeHint', label: 'Gợi ý TVV mặc định', kind: 'text' },
    ],
    suggestedEvents: ['lead.updated', 'followup.due'],
  },
  {
    id: 'payment_vnpay',
    name: 'VNPay',
    group: 'payments',
    maturity: 'planned',
    summary: 'IPN thanh toán học phí / lệ phí → cập nhật đợt thu.',
    fields: [
      { key: 'tmnCode', label: 'Terminal code', kind: 'text' },
      { key: 'hashSecret', label: 'Hash secret', kind: 'secret' },
      { key: 'ipnUrl', label: 'IPN URL (public)', kind: 'url' },
    ],
  },
  {
    id: 'payment_momo',
    name: 'MoMo',
    group: 'payments',
    maturity: 'planned',
    summary: 'IPN MoMo → đợt thu trên hồ sơ.',
    fields: [
      { key: 'partnerCode', label: 'Partner code', kind: 'text' },
      { key: 'accessKey', label: 'Access key', kind: 'secret' },
      { key: 'secretKey', label: 'Secret key', kind: 'secret' },
    ],
  },
  {
    id: 'sis_siakad',
    name: 'SIAKAD / SIS',
    group: 'academic',
    maturity: 'planned',
    summary: 'Đẩy hồ sơ đã ghi danh sang hệ học vụ trường.',
    fields: [
      { key: 'baseUrl', label: 'Base URL API học vụ', kind: 'url' },
      { key: 'apiKey', label: 'API key', kind: 'secret' },
    ],
    suggestedEvents: ['finance.full_ne'],
  },
  {
    id: 'receipt_r2',
    name: 'Ngưỡng cọc & chứng từ',
    group: 'storage',
    maturity: 'live',
    summary:
      'Ngưỡng cọc / LPXT và nơi lưu bill. Bảng học phí: Cài đặt → Hồ sơ → Cài đặt thông tin → Học phí.',
    settingsHref: '/settings?tab=connect&sub=receipts',
    fields: [],
  },
] as const

export function getConnectorDef(id: string): ConnectorDef | undefined {
  return CONNECTOR_CATALOG.find((c) => c.id === id)
}

export function connectorsByGroup(opts?: {
  includePlanned?: boolean
}): Array<{ group: ConnectorGroupId; label: string; items: ConnectorDef[] }> {
  const order: ConnectorGroupId[] = [
    'capture',
    'voice_chat',
    'automation',
    'ai',
    'notify',
    'payments',
    'academic',
    'storage',
  ]
  const includePlanned = opts?.includePlanned === true
  return order
    .map((group) => ({
      group,
      label: CONNECTOR_GROUP_LABELS[group],
      items: CONNECTOR_CATALOG.filter((c) => {
        if (c.group !== group) return false
        if (c.id === 'google_sheets') return false
        if (!includePlanned && c.maturity === 'planned') return false
        return true
      }),
    }))
    .filter((g) => g.items.length > 0)
}

export function maturityLabel(m: ConnectorMaturity): string {
  switch (m) {
    case 'live':
      return 'Đang dùng'
    case 'ready':
      return 'Sẵn sàng nối'
    case 'planned':
      return 'Sắp có'
  }
}
