import { describe, expect, it } from 'vitest'
import { buildIntegrationStatusItems } from './integrationStatus'

describe('buildIntegrationStatusItems', () => {
  it('marks n8n off when no org webhooks', () => {
    const items = buildIntegrationStatusItems({
      omicallEnabled: false,
      omicallConnected: false,
      n8nHooks: { giayMoi: '', ctsv: '', daily: '', monthly: '' },
      portalEnabled: false,
      llmConfigured: false,
    })
    expect(items.find((i) => i.id === 'n8n')?.health).toBe('off')
    expect(items.find((i) => i.id === 'omicall')?.health).toBe('off')
    expect(items.find((i) => i.id === 'portal')?.settingsHref).toContain('public_registration')
  })

  it('marks n8n ok when ≥2 http webhooks', () => {
    const items = buildIntegrationStatusItems({
      omicallEnabled: true,
      omicallConnected: true,
      omicallLabel: 'Sẵn sàng',
      n8nHooks: {
        giayMoi: 'https://a/giay',
        ctsv: 'https://a/ctsv',
        daily: '',
        monthly: '',
      },
      portalEnabled: true,
      llmConfigured: true,
    })
    expect(items.find((i) => i.id === 'n8n')?.health).toBe('ok')
    expect(items.find((i) => i.id === 'omicall')?.health).toBe('ok')
    expect(items.find((i) => i.id === 'llm')?.health).toBe('ok')
    expect(items.find((i) => i.id === 'llm')?.settingsHref).toContain('sub=llm')
    expect(items.find((i) => i.id === 'llm')?.label).toBe('AI hỗ trợ')
  })
})
