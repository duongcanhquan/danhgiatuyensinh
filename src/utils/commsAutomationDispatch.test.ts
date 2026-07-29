import { describe, expect, it, vi } from 'vitest'
import { defaultCommsAutomationConfig } from './commsAutomationConfig'
import { runCommsAutomationRules } from './commsAutomationDispatch'

describe('runCommsAutomationRules', () => {
  it('posts rendered payload to email webhook when rule enabled', async () => {
    const cfg = defaultCommsAutomationConfig()
    cfg.email.enabled = true
    cfg.email.sendWebhookUrl = 'https://hook.test/email'
    cfg.rules = cfg.rules.map((r) =>
      r.id === 'rule-lead-created-email' ? { ...r, enabled: true } : r,
    )
    const fetchImpl = vi.fn(async () => new Response(null, { status: 200 }))
    const result = await runCommsAutomationRules({
      orgId: 'vietmy',
      trigger: 'lead.created',
      lead: { id: 'L1', fullName: 'An', email: 'an@x.vn', schoolName: 'VM' },
      config: cfg,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })
    expect(result.ok).toBe(1)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    const init = fetchImpl.mock.calls[0]![1] as RequestInit
    const body = JSON.parse(String(init.body))
    expect(body.action).toBe('send_comms')
    expect(body.channel).toBe('email')
    expect(body.subject).toContain('An')
    expect(body.to.email).toBe('an@x.vn')
  })

  it('skips when channel enabled but no webhook', async () => {
    const cfg = defaultCommsAutomationConfig()
    cfg.email.enabled = true
    cfg.email.sendWebhookUrl = ''
    cfg.rules = [{ ...cfg.rules[0]!, enabled: true }]
    const result = await runCommsAutomationRules({
      orgId: 'vietmy',
      trigger: 'lead.created',
      lead: { email: 'a@b.c', fullName: 'A' },
      config: cfg,
      fetchImpl: vi.fn() as unknown as typeof fetch,
    })
    expect(result.attempted).toBe(0)
    expect(result.skipped).toBeGreaterThan(0)
  })
})
