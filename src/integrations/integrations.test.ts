import { describe, expect, it } from 'vitest'
import { CONNECTOR_CATALOG, connectorsByGroup, getConnectorDef, maturityLabel } from './connectorCatalog'
import { isOutboundEventId, OUTBOUND_EVENT_CATALOG } from './outboundEvents'
import {
  emptyOrgIntegrationHub,
  parseOrgIntegrationHub,
  subscriptionsForEvent,
  notifyWebhookUrlsForEvent,
} from './orgIntegrationHub'
import { dispatchOutboundEvent } from './dispatchOutbound'
import {
  generateInboundApiKey,
  hashInboundApiKey,
  inboundApiKeyPrefix,
  verifyInboundApiKey,
} from './inboundApiKey'

describe('connectorCatalog', () => {
  it('has unique ids and grouped sections', () => {
    const ids = CONNECTOR_CATALOG.map((c) => c.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids).toContain('generic_webhooks')
    expect(ids).toContain('inbound_lead_api')
    expect(ids).toContain('zalo_oa')
    expect(getConnectorDef('n8n')?.maturity).toBe('live')
    expect(maturityLabel('ready')).toBe('Sẵn sàng nối')
    expect(connectorsByGroup().length).toBeGreaterThanOrEqual(6)
  })
})

describe('outboundEvents', () => {
  it('validates known events', () => {
    expect(isOutboundEventId('lead.created')).toBe(true)
    expect(isOutboundEventId('nope')).toBe(false)
    expect(OUTBOUND_EVENT_CATALOG.some((e) => e.n8nSlot === 'ctsv')).toBe(true)
  })
})

describe('parseOrgIntegrationHub', () => {
  it('parses connectors and subscriptions', () => {
    const hub = parseOrgIntegrationHub({
      connectors: { slack_alerts: { enabled: true, incomingWebhookUrl: ' https://hooks.slack.com/x ' } },
      subscriptions: [
        { id: '1', event: 'lead.created', url: 'https://hook.example/lead', enabled: true },
        { id: 'bad', event: 'nope', url: 'https://x' },
      ],
      inboundApiKeys: [{ keyPrefix: 'vm_abc…1234', keyHash: 'deadbeef', createdAt: '2026-07-29' }],
    })
    expect(hub.connectors.slack_alerts.enabled).toBe('true')
    expect(hub.subscriptions).toHaveLength(1)
    expect(hub.inboundApiKeys).toHaveLength(1)
    expect(subscriptionsForEvent(hub, 'lead.created')).toHaveLength(1)
  })
})

describe('notifyWebhookUrlsForEvent', () => {
  it('returns slack url when enabled and event suggested', () => {
    const hub = emptyOrgIntegrationHub()
    hub.connectors.slack_alerts = {
      enabled: 'true',
      incomingWebhookUrl: 'https://hooks.slack.com/services/T/B/X',
    }
    expect(notifyWebhookUrlsForEvent(hub, 'finance.decision')).toContain(
      'https://hooks.slack.com/services/T/B/X',
    )
    expect(notifyWebhookUrlsForEvent(hub, 'call.completed')).toEqual([])
  })
})

describe('dispatchOutboundEvent', () => {
  it('posts to subscriptions', async () => {
    const calls: Array<{ url: string; body: string }> = []
    const hub = emptyOrgIntegrationHub()
    hub.subscriptions = [
      { id: '1', event: 'lead.created', url: 'https://example.com/a', enabled: true },
      { id: '2', event: 'lead.created', url: 'https://example.com/b', enabled: true, secret: 's' },
    ]
    const fetchImpl = (async (url: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(url), body: String(init?.body ?? '') })
      return new Response('ok', { status: 200 })
    }) as typeof fetch

    const result = await dispatchOutboundEvent({
      orgId: 'vietmy',
      event: 'lead.created',
      payload: { leadId: 'L1' },
      hub,
      fetchImpl,
    })
    expect(result.attempted).toBe(2)
    expect(result.ok).toBe(2)
    expect(calls).toHaveLength(2)
    expect(JSON.parse(calls[0].body).event).toBe('lead.created')
  })
})

describe('inboundApiKey', () => {
  it('hashes and verifies', async () => {
    const key = generateInboundApiKey()
    expect(key.startsWith('vm_')).toBe(true)
    const hash = await hashInboundApiKey(key)
    expect(await verifyInboundApiKey(key, [{ keyHash: hash }])).toBe(true)
    expect(await verifyInboundApiKey('wrong', [{ keyHash: hash }])).toBe(false)
    expect(inboundApiKeyPrefix(key).includes('…')).toBe(true)
  })
})
