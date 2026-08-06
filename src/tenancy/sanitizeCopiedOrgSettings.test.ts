import { describe, expect, it } from 'vitest'
import { sanitizeCopiedOrgSettingsDoc } from './sanitizeCopiedOrgSettings'

describe('sanitizeCopiedOrgSettingsDoc', () => {
  it('clears n8n and registration destinations', () => {
    const n8n = sanitizeCopiedOrgSettingsDoc(
      'n8nWebhooks',
      { giayMoi: 'https://a', ctsv: 'https://b', daily: 'https://c', monthly: 'https://d' },
      'demo',
    )
    expect(n8n).toMatchObject({ orgId: 'demo', giayMoi: '', ctsv: '', daily: '', monthly: '' })

    const portal = sanitizeCopiedOrgSettingsDoc(
      'publicRegistrationConfig',
      { enabled: true, n8nWebhookUrl: 'https://x', n8nEnabled: true },
      'demo',
    )
    expect(portal.enabled).toBe(false)
    expect(portal.n8nWebhookUrl).toBe('')
  })

  it('strips hub secrets, subscriptions and disables connectors', () => {
    const hub = sanitizeCopiedOrgSettingsDoc(
      'integrationHub',
      {
        connectors: {
          slack_alerts: {
            enabled: 'true',
            incomingWebhookUrl: 'https://hooks.slack.com/x',
            accessToken: 'secret',
          },
        },
        subscriptions: [{ id: '1', event: 'lead.created', url: 'https://zapier.com', enabled: true }],
        inboundApiKeys: [{ keyPrefix: 'vm_', keyHash: 'abc' }],
      },
      'demo',
    )
    expect(hub.subscriptions).toEqual([])
    expect(hub.inboundApiKeys).toEqual([])
    const slack = (hub.connectors as Record<string, Record<string, string>>).slack_alerts
    expect(slack.enabled).toBe('false')
    expect(slack.incomingWebhookUrl).toBe('')
    expect(slack.accessToken).toBe('')
  })

  it('disables comms channels and rules', () => {
    const comms = sanitizeCopiedOrgSettingsDoc(
      'commsAutomationConfig',
      {
        email: { enabled: true, sendWebhookUrl: 'https://mail', apiKey: 'k' },
        rules: [{ id: 'r1', enabled: true }],
      },
      'demo',
    )
    expect((comms.email as { enabled: boolean }).enabled).toBe(false)
    expect((comms.email as { sendWebhookUrl: string }).sendWebhookUrl).toBe('')
    expect((comms.rules as Array<{ enabled: boolean }>)[0]!.enabled).toBe(false)
  })
})
