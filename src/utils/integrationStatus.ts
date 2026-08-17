import type { OrgN8nWebhooks } from './n8nWebhooksConfig'

export type IntegrationHealth = 'ok' | 'warn' | 'off' | 'unknown'

export type IntegrationStatusItem = {
  id: 'omicall' | 'n8n' | 'portal' | 'llm'
  label: string
  health: IntegrationHealth
  detail: string
  settingsHref: string
}

export type IntegrationStatusInput = {
  omicallEnabled: boolean
  omicallConnected: boolean
  omicallLabel?: string
  n8nHooks: Pick<OrgN8nWebhooks, 'giayMoi' | 'ctsv' | 'daily' | 'monthly'> | null
  portalEnabled: boolean
  llmConfigured: boolean
}

function httpUrlCount(hooks: IntegrationStatusInput['n8nHooks']): number {
  if (!hooks) return 0
  return [hooks.giayMoi, hooks.ctsv, hooks.daily, hooks.monthly].filter((u) =>
    String(u ?? '')
      .trim()
      .startsWith('http'),
  ).length
}

/** Tổng hợp trạng thái đầu mối tích hợp — dùng strip quản trị. */
export function buildIntegrationStatusItems(input: IntegrationStatusInput): IntegrationStatusItem[] {
  const n8nReady = httpUrlCount(input.n8nHooks)
  const omicallHealth: IntegrationHealth = !input.omicallEnabled
    ? 'off'
    : input.omicallConnected
      ? 'ok'
      : 'warn'

  return [
    {
      id: 'omicall',
      label: 'Gọi điện',
      health: omicallHealth,
      detail: !input.omicallEnabled
        ? 'Chưa bật OMICall'
        : input.omicallConnected
          ? input.omicallLabel?.trim() || 'Đã kết nối'
          : input.omicallLabel?.trim() || 'Đã bật — chưa nối máy',
      settingsHref: '/settings?tab=connect&sub=omicall',
    },
    {
      id: 'n8n',
      label: 'Tự động hóa',
      health: n8nReady >= 2 ? 'ok' : n8nReady >= 1 ? 'warn' : 'off',
      detail:
        n8nReady >= 2
          ? `${n8nReady}/4 webhook trường`
          : n8nReady === 1
            ? '1 webhook — thiếu đầu mối'
            : 'Chưa cấu hình webhook trường',
      settingsHref: '/settings?tab=connect&sub=webhooks',
    },
    {
      id: 'portal',
      label: 'Cổng đăng ký',
      health: input.portalEnabled ? 'ok' : 'off',
      detail: input.portalEnabled ? 'Đang mở cho sinh viên' : 'Đang đóng',
      settingsHref: '/settings?tab=connect&sub=public_registration',
    },
    {
      id: 'llm',
      label: 'AI hỗ trợ',
      health: input.llmConfigured ? 'ok' : 'off',
      detail: input.llmConfigured ? 'Đã có khóa API' : 'Chưa cấu hình khóa',
      settingsHref: '/settings?tab=advise&sub=llm',
    },
  ]
}
