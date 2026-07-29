import type { CommsAutomationTrigger, CommsLeadContext, OrgCommsAutomationConfig } from './commsAutomationConfig'
import {
  buildTemplateVars,
  channelEnabled,
  channelSendWebhookUrl,
  getCommsAutomationConfigCache,
  isWithinQuietHours,
  renderCommsTemplate,
  rulesForTrigger,
  shouldSendForTemplateIntent,
} from './commsAutomationConfig'

export type CommsDispatchResult = {
  trigger: CommsAutomationTrigger
  attempted: number
  ok: number
  skipped: number
  failed: number
  errors: string[]
}

function recipientForChannel(channel: string, lead: CommsLeadContext): { email?: string; phone?: string } {
  if (channel === 'email') return { email: lead.email?.trim() || undefined }
  return { phone: lead.phone?.trim() || lead.parentPhone?.trim() || undefined }
}

/**
 * Chạy luật email/SMS/Zalo/WA đã bật cho một trigger.
 * Gửi qua webhook kênh (n8n/worker) — không gọi SDK nhà cung cấp trên browser.
 * `delayMinutes` > 0: đợt 1 vẫn gửi ngay kèm field `delayMinutes` để n8n Delay.
 */
export async function runCommsAutomationRules(input: {
  orgId: string
  trigger: CommsAutomationTrigger
  lead: CommsLeadContext
  config?: OrgCommsAutomationConfig | null
  fetchImpl?: typeof fetch
  now?: Date
}): Promise<CommsDispatchResult> {
  const cfg = input.config ?? getCommsAutomationConfigCache().config
  const result: CommsDispatchResult = {
    trigger: input.trigger,
    attempted: 0,
    ok: 0,
    skipped: 0,
    failed: 0,
    errors: [],
  }
  if (!cfg) return result

  const now = input.now ?? new Date()
  if (isWithinQuietHours(cfg.quietHours, now)) {
    result.skipped += 1
    return result
  }

  const rules = rulesForTrigger(cfg, input.trigger)
  const vars = buildTemplateVars(input.lead)
  const doFetch = input.fetchImpl ?? fetch

  for (const rule of rules) {
    if (!channelEnabled(cfg, rule.channel)) {
      result.skipped += 1
      continue
    }
    const webhook = channelSendWebhookUrl(cfg, rule.channel)
    if (!webhook.startsWith('http')) {
      result.skipped += 1
      continue
    }
    const template = cfg.templates.find((t) => t.id === rule.templateId && t.enabled)
    if (!template || template.channel !== rule.channel) {
      result.skipped += 1
      continue
    }
    if (!shouldSendForTemplateIntent(cfg.consent, template, input.lead)) {
      result.skipped += 1
      continue
    }
    const to = recipientForChannel(rule.channel, input.lead)
    if (rule.channel === 'email' && !to.email) {
      result.skipped += 1
      continue
    }
    if (rule.channel !== 'email' && !to.phone) {
      result.skipped += 1
      continue
    }

    const subject = renderCommsTemplate(template.subject, vars)
    const body = renderCommsTemplate(template.body, vars)
    const payload: Record<string, unknown> = {
      source: 'vietmy-crm',
      schemaVersion: 1,
      action: 'send_comms',
      orgId: input.orgId,
      trigger: input.trigger,
      channel: rule.channel,
      ruleId: rule.id,
      ruleName: rule.name,
      templateId: template.id,
      templateName: template.name,
      intent: template.intent,
      subject,
      body,
      delayMinutes: rule.delayMinutes,
      to,
      lead: {
        id: input.lead.id ?? null,
        fullName: input.lead.fullName ?? null,
        phone: input.lead.phone ?? null,
        email: input.lead.email ?? null,
      },
      providerMeta: providerMetaForChannel(cfg, rule.channel),
      occurredAt: now.toISOString(),
    }

    result.attempted += 1
    try {
      const res = await doFetch(webhook, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-VietMy-Event': 'comms.sent',
          'X-VietMy-Channel': rule.channel,
        },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      result.ok += 1
    } catch (e) {
      result.failed += 1
      result.errors.push(e instanceof Error ? e.message : String(e))
    }
  }

  return result
}

function providerMetaForChannel(cfg: OrgCommsAutomationConfig, channel: string): Record<string, unknown> {
  switch (channel) {
    case 'email':
      return {
        provider: cfg.email.provider,
        fromEmail: cfg.email.fromEmail,
        fromName: cfg.email.fromName,
        replyTo: cfg.email.replyTo,
        smtpHost: cfg.email.smtpHost || undefined,
        smtpPort: cfg.email.smtpPort || undefined,
      }
    case 'sms':
      return {
        provider: cfg.sms.provider,
        senderId: cfg.sms.senderId,
      }
    case 'zalo':
      return {
        mode: cfg.zalo.mode,
        oaId: cfg.zalo.oaId,
      }
    case 'whatsapp':
      return {
        phoneNumberId: cfg.whatsapp.phoneNumberId,
        businessAccountId: cfg.whatsapp.businessAccountId || undefined,
      }
    default:
      return {}
  }
}

/** Fire-and-forget từ luồng UI — không chặn thao tác người dùng. */
export function triggerCommsAutomation(
  orgId: string,
  trigger: CommsAutomationTrigger,
  lead: CommsLeadContext,
): void {
  void runCommsAutomationRules({ orgId, trigger, lead }).catch((e) => {
    console.warn('[commsAutomation]', trigger, e)
  })
}
