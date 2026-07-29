import type { OutboundEventId } from './outboundEvents'
import {
  getOrgIntegrationHubCache,
  notifyWebhookUrlsForEvent,
  subscriptionsForEvent,
  type OrgIntegrationHubConfig,
} from './orgIntegrationHub'

export type OutboundDispatchResult = {
  event: OutboundEventId
  attempted: number
  ok: number
  failed: number
  errors: string[]
}

function buildEnvelope(
  orgId: string,
  event: OutboundEventId,
  payload: Record<string, unknown>,
): Record<string, unknown> {
  return {
    source: 'vietmy-crm',
    schemaVersion: 1,
    orgId,
    event,
    occurredAt: new Date().toISOString(),
    data: payload,
  }
}

async function postJson(url: string, body: Record<string, unknown>, secret?: string): Promise<void> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-VietMy-Event': String(body.event ?? ''),
  }
  if (secret?.trim()) headers['X-VietMy-Secret'] = secret.trim()
  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${url}`)
  }
}

/**
 * Fan-out sự kiện tới:
 * - subscription generic_webhooks
 * - Slack/Teams incomingWebhookUrl khi connector bật + event gợi ý khớp
 */
export async function dispatchOutboundEvent(input: {
  orgId: string
  event: OutboundEventId
  payload: Record<string, unknown>
  hub?: OrgIntegrationHubConfig | null
  fetchImpl?: typeof fetch
}): Promise<OutboundDispatchResult> {
  const hub = input.hub ?? getOrgIntegrationHubCache()?.config ?? null
  const result: OutboundDispatchResult = {
    event: input.event,
    attempted: 0,
    ok: 0,
    failed: 0,
    errors: [],
  }
  if (!hub) return result

  const envelope = buildEnvelope(input.orgId, input.event, input.payload)
  const targets = new Map<string, { url: string; secret?: string }>()

  for (const sub of subscriptionsForEvent(hub, input.event)) {
    targets.set(sub.url, { url: sub.url, secret: sub.secret })
  }
  for (const url of notifyWebhookUrlsForEvent(hub, input.event)) {
    if (!targets.has(url)) targets.set(url, { url })
  }

  const doFetch = input.fetchImpl ?? fetch
  for (const t of targets.values()) {
    result.attempted += 1
    try {
      // Allow tests to inject fetch; production uses global fetch via postJson path.
      if (input.fetchImpl) {
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
          'X-VietMy-Event': input.event,
        }
        if (t.secret?.trim()) headers['X-VietMy-Secret'] = t.secret.trim()
        const res = await doFetch(t.url, {
          method: 'POST',
          headers,
          body: JSON.stringify(envelope),
        })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
      } else {
        await postJson(t.url, envelope, t.secret)
      }
      result.ok += 1
    } catch (e) {
      result.failed += 1
      result.errors.push(e instanceof Error ? e.message : String(e))
    }
  }
  return result
}
