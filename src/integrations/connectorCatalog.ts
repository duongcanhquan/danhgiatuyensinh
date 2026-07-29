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
    name: 'API nhận hồ sơ (đối tác)',
    group: 'capture',
    maturity: 'ready',
    summary: 'Đối tác / landing / form ngoài đẩy hồ sơ bằng API key theo trường.',
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
    maturity: 'planned',
    summary: 'Nhận lead từ form quảng cáo Facebook/Instagram (webhook Meta).',
    fields: [
      { key: 'verifyToken', label: 'Verify token', kind: 'secret' },
      { key: 'pageAccessToken', label: 'Page access token', kind: 'secret' },
    ],
  },
  {
    id: 'google_sheets',
    name: 'Google Sheets',
    group: 'capture',
    maturity: 'planned',
    summary: 'Đồng bộ dòng Sheet → hồ sơ (qua n8n hoặc adapter sau).',
    fields: [{ key: 'sheetWebhookUrl', label: 'URL nhận / đẩy Sheet', kind: 'url' }],
  },
  {
    id: 'omicall',
    name: 'OMICall (gọi điện)',
    group: 'voice_chat',
    maturity: 'live',
    summary: 'Tổng đài web, click-to-call, đồng bộ lịch sử gọi & KPI.',
    settingsHref: '/settings?tab=connect&sub=omicall',
    fields: [],
    suggestedEvents: ['call.completed'],
  },
  {
    id: 'zalo_oa',
    name: 'Zalo OA',
    group: 'voice_chat',
    maturity: 'ready',
    summary: 'Đầu nối Zalo Official Account — lưu token/webhook; gửi tin Phase 2.',
    fields: [
      { key: 'enabled', label: 'Bật Zalo OA', kind: 'toggle' },
      { key: 'oaId', label: 'OA ID', kind: 'text' },
      { key: 'accessToken', label: 'Access token', kind: 'secret' },
      { key: 'webhookUrl', label: 'URL nhận sự kiện Zalo (nếu dùng n8n)', kind: 'url' },
    ],
    suggestedEvents: ['lead.created', 'lead.assigned', 'finance.decision'],
  },
  {
    id: 'whatsapp_cloud',
    name: 'WhatsApp Cloud API',
    group: 'voice_chat',
    maturity: 'ready',
    summary: 'Meta WhatsApp Business — sẵn sàng cấu hình; gửi tin Phase 2.',
    fields: [
      { key: 'enabled', label: 'Bật WhatsApp', kind: 'toggle' },
      { key: 'phoneNumberId', label: 'Phone number ID', kind: 'text' },
      { key: 'accessToken', label: 'Access token', kind: 'secret' },
      { key: 'webhookVerifyToken', label: 'Verify token webhook', kind: 'secret' },
    ],
    suggestedEvents: ['lead.created', 'registration.public'],
  },
  {
    id: 'email_smtp',
    name: 'Email giao dịch',
    group: 'voice_chat',
    maturity: 'ready',
    summary: 'Resend / SendGrid / SMTP — nhắc follow-up, giấy báo (adapter Phase 2).',
    fields: [
      { key: 'enabled', label: 'Bật email', kind: 'toggle' },
      {
        key: 'provider',
        label: 'Nhà cung cấp',
        kind: 'select',
        options: [
          { value: 'resend', label: 'Resend' },
          { value: 'sendgrid', label: 'SendGrid' },
          { value: 'smtp', label: 'SMTP tùy chỉnh' },
        ],
      },
      { key: 'apiKey', label: 'API key / mật khẩu SMTP', kind: 'secret' },
      { key: 'fromEmail', label: 'Email gửi đi', kind: 'text', placeholder: 'tuyensinh@truong.edu.vn' },
      { key: 'fromName', label: 'Tên hiển thị', kind: 'text' },
    ],
    suggestedEvents: ['lead.created', 'finance.decision', 'document.requested'],
  },
  {
    id: 'sms_gateway',
    name: 'SMS',
    group: 'voice_chat',
    maturity: 'ready',
    summary: 'Twilio / eSMS / Vietguys — đầu nối sẵn; gửi SMS Phase 2.',
    fields: [
      { key: 'enabled', label: 'Bật SMS', kind: 'toggle' },
      {
        key: 'provider',
        label: 'Nhà cung cấp',
        kind: 'select',
        options: [
          { value: 'twilio', label: 'Twilio' },
          { value: 'esms', label: 'eSMS' },
          { value: 'vietguys', label: 'Vietguys' },
          { value: 'custom', label: 'Webhook tùy chỉnh' },
        ],
      },
      { key: 'apiKey', label: 'API key', kind: 'secret' },
      { key: 'senderId', label: 'Brandname / Sender', kind: 'text' },
      { key: 'webhookUrl', label: 'URL gửi SMS (nếu custom)', kind: 'url' },
    ],
  },
  {
    id: 'n8n',
    name: 'n8n (workflow)',
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
    id: 'generic_webhooks',
    name: 'Webhook tổng quát (Zapier / Make / …)',
    group: 'automation',
    maturity: 'ready',
    summary: 'Đăng ký nhiều URL theo từng sự kiện CRM — dễ nối Zapier, Make, hệ tự xây.',
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
    name: 'AI & LLM',
    group: 'ai',
    maturity: 'live',
    summary: 'Khóa API, tác vụ phân tích hồ sơ, tri thức tuyển sinh.',
    settingsHref: '/settings?tab=connect&sub=llm',
    fields: [],
  },
  {
    id: 'slack_alerts',
    name: 'Slack',
    group: 'notify',
    maturity: 'ready',
    summary: 'Incoming Webhook Slack — nhận cảnh báo KPI / duyệt cọc / lead HOT.',
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
    summary: 'Incoming webhook Teams — cùng kiểu cảnh báo nội bộ.',
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
    summary: 'Đang dùng qua workflow n8n CTSV (thông báo tài chính).',
    settingsHref: '/settings?tab=connect&sub=webhooks',
    fields: [],
  },
  {
    id: 'calendar_booking',
    name: 'Đặt lịch tư vấn',
    group: 'notify',
    maturity: 'planned',
    summary: 'Calendly / Google Calendar — hẹn TVV (Phase 2).',
    fields: [{ key: 'bookingWebhookUrl', label: 'URL webhook đặt lịch', kind: 'url' }],
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
    name: 'Lưu chứng từ (R2 / Drive)',
    group: 'storage',
    maturity: 'live',
    summary: 'Upload bill qua Cloudflare R2 hoặc Drive Apps Script (cấu hình máy chủ).',
    fields: [],
  },
] as const

export function getConnectorDef(id: string): ConnectorDef | undefined {
  return CONNECTOR_CATALOG.find((c) => c.id === id)
}

export function connectorsByGroup(): Array<{ group: ConnectorGroupId; label: string; items: ConnectorDef[] }> {
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
  return order.map((group) => ({
    group,
    label: CONNECTOR_GROUP_LABELS[group],
    items: CONNECTOR_CATALOG.filter((c) => c.group === group),
  }))
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
