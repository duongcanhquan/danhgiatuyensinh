import { describe, expect, it } from 'vitest'
import {
  buildTemplateVars,
  defaultCommsAutomationConfig,
  isWithinQuietHours,
  parseCommsAutomationConfig,
  renderCommsTemplate,
  rulesForTrigger,
  shouldSendForTemplateIntent,
} from './commsAutomationConfig'

describe('commsAutomationConfig', () => {
  it('defaults include disabled sample rules and channel off', () => {
    const d = defaultCommsAutomationConfig()
    expect(d.email.enabled).toBe(false)
    expect(d.templates.length).toBeGreaterThan(0)
    expect(d.rules.every((r) => r.enabled === false)).toBe(true)
  })

  it('parses saved channels and keeps custom templates', () => {
    const parsed = parseCommsAutomationConfig({
      email: {
        enabled: true,
        provider: 'smtp',
        fromEmail: 'a@b.c',
        smtpHost: 'smtp.example.com',
        sendWebhookUrl: 'https://hook.example/email',
      },
      templates: [
        {
          id: 't1',
          channel: 'email',
          name: 'Hi',
          subject: 'S',
          body: 'B {{fullName}}',
          enabled: true,
          intent: 'transactional',
        },
      ],
      rules: [
        {
          id: 'r1',
          name: 'R',
          enabled: true,
          trigger: 'lead.created',
          channel: 'email',
          templateId: 't1',
          delayMinutes: 5,
        },
      ],
    })
    expect(parsed.email.enabled).toBe(true)
    expect(parsed.email.provider).toBe('smtp')
    expect(parsed.email.smtpHost).toBe('smtp.example.com')
    expect(parsed.templates).toHaveLength(1)
    expect(rulesForTrigger(parsed, 'lead.created')).toHaveLength(1)
    expect(rulesForTrigger(parsed, 'lead.created')[0]!.delayMinutes).toBe(5)
  })

  it('renders template variables', () => {
    const out = renderCommsTemplate('Chào {{ fullName }} — {{phone}}', buildTemplateVars({ fullName: 'An', phone: '09' }))
    expect(out).toBe('Chào An — 09')
  })

  it('detects quiet hours overnight window', () => {
    const quiet = { enabled: true, startHour: 21, endHour: 8, timezone: 'Asia/Ho_Chi_Minh' }
    const evening = new Date('2026-07-29T22:00:00')
    evening.setHours(22)
    const noon = new Date('2026-07-29T12:00:00')
    noon.setHours(12)
    expect(isWithinQuietHours(quiet, evening)).toBe(true)
    expect(isWithinQuietHours(quiet, noon)).toBe(false)
    expect(isWithinQuietHours({ ...quiet, enabled: false }, evening)).toBe(false)
  })

  it('blocks marketing without opt-in and honors do-not-contact', () => {
    const cfg = defaultCommsAutomationConfig()
    const marketing = cfg.templates.find((t) => t.intent === 'marketing')!
    expect(shouldSendForTemplateIntent(cfg.consent, marketing, { commsOptIn: false })).toBe(false)
    expect(shouldSendForTemplateIntent(cfg.consent, marketing, { commsOptIn: true })).toBe(true)
    const tx = cfg.templates.find((t) => t.intent === 'transactional')!
    expect(shouldSendForTemplateIntent(cfg.consent, tx, { doNotContact: true })).toBe(false)
  })
})
