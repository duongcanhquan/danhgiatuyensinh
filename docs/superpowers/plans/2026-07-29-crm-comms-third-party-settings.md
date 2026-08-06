# CRM Comms & Third-Party Settings Implementation Plan

> **For agentic workers:** Implement task-by-task. Steps use checkbox syntax.

**Goal:** Admin cấu hình đầy đủ email/SMS/Zalo/WhatsApp tự động + mở rộng Hub bên thứ 3; gửi qua webhook/n8n.

**Architecture:** Doc `commsAutomationConfig` per org; panel Settings; `runCommsAutomationRules` song song Hub dispatch; catalog connector giàu field + deep-link.

**Tech Stack:** React, Firestore orgSettings, vitest, existing Integration Hub patterns.

## Global Constraints

- Plain Vietnamese UI copy (vietmy-ui-plain-language).
- Per-org via `orgSettings/{orgId}/settings/*`.
- No native provider SDK in browser this phase.
- Follow InviteDocumentsSettingsPanel patterns.

---

### Task 1: Config module + tests

**Files:**
- Create `src/utils/commsAutomationConfig.ts`
- Create `src/utils/commsAutomationConfig.test.ts`

- [ ] Default config with sample templates/rules (disabled)
- [ ] parse / save / load / cache
- [ ] `renderCommsTemplate` + `isWithinQuietHours` + `rulesForTrigger`
- [ ] Tests green

### Task 2: Runtime dispatch

**Files:**
- Create `src/utils/commsAutomationDispatch.ts`
- Modify `src/utils/n8nIntegration.ts` or call sites for lead.created / document / finance / registration

- [ ] POST to channel webhook when rule matches
- [ ] Respect quiet hours + consent flags (skip marketing if no opt-in when required)
- [ ] Wire from `createManualLead` and existing n8n trigger helpers where practical

### Task 3: Settings UI panel + navigation

**Files:**
- Create `src/components/CommsAutomationSettingsPanel.tsx`
- Modify `src/utils/settingsNavigation.ts`, `SettingsView.tsx`, `OrgProvider.tsx`, `createOrganization.ts`

- [ ] Tab `comms` — Email & tin nhắn
- [ ] Sections: 4 kênh, mẫu, luật, đồng ý/giờ im lặng
- [ ] Template list + rule list CRUD on draft

### Task 4: Expand Hub catalog + events

**Files:**
- `src/integrations/connectorCatalog.ts`
- `src/integrations/outboundEvents.ts`
- `docs/INTEGRATION_HUB.md`

- [ ] Richer email/SMS/Zalo/WA fields + settingsHref
- [ ] Telegram, TikTok Lead Ads, Google Forms; calendar → ready
- [ ] Events `followup.due`, `comms.sent`

### Task 5: Verify + commit

- [ ] vitest + tsc
- [ ] Commit, push, update PR
