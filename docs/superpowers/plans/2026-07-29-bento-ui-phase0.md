# Bento UI + Phase 0 Multi-tenant Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a professional high-contrast bento design system on core CRM shells, then complete Phase 0 tenancy (`orgId=vietmy`, orgSettings dual-read, portal slug, Rules draft) with tests green before Phase 1.

**Architecture:** CSS design tokens + `BentoGrid`/`BentoCell` primitives applied to Login, Layout chrome, Summary hub, My Day. Tenancy: flat collections + `orgId` + `orgSettings/{orgId}/{docId}` with dual-read fallback to `scoringAux` (Phase 0).

**Tech Stack:** React 19, Vite, Tailwind 4, TypeScript, Vitest, Firebase types (no live Firebase required for unit tests).

## Global Constraints

- No campus layer; tenant = school (`orgId`).
- UI copy: Vietnamese plain language (workspace rule).
- KPI configs remain role-flexible (workspace rule).
- TDD for tenancy helpers; run `npm test` before claiming Phase 0 done.
- High-contrast light canvas + ink sidebar; bento cells for dashboards; avoid purple/cream-terracotta AI clichés.
- Fonts: Plus Jakarta Sans (UI) — not Inter/Roboto/Arial.

---

## Task 1: Design tokens + Bento primitives

**Files:**
- Modify: `index.html` (font link)
- Modify: `src/index.css` (tokens, bento utilities)
- Create: `src/components/bento/BentoGrid.tsx`, `BentoCell.tsx`, `BentoStat.tsx`, `index.ts`
- Create: `src/components/bento/bento.test.tsx` (smoke render / class contracts)

- [ ] Write failing test for `BentoCell` exporting stable `data-bento` attributes / variants
- [ ] Implement tokens (`--vm-ink`, `--vm-canvas`, `--vm-cell`, `--vm-accent`, contrast text)
- [ ] Implement BentoGrid / BentoCell / BentoStat
- [ ] `npm test` — pass
- [ ] Commit

## Task 2: Apply bento chrome to Login + Layout + Summary + My Day

**Files:**
- Modify: `src/views/LoginView.tsx`
- Modify: `src/components/Layout.tsx`
- Modify: `src/views/SummaryHubView.tsx`
- Modify: `src/views/MyDayView.tsx` (hero/stats strip → bento)
- Modify: `src/components/AppPageHeader.tsx` if needed

- [ ] Login: bento split (brand plane + form cell), WCAG contrast
- [ ] Layout: ink sidebar, canvas main, bento-friendly content padding
- [ ] Summary hub: wrap tab content area with bento shell
- [ ] My Day: top metrics as BentoStat grid
- [ ] Visual sanity via build; `npm test`
- [ ] Commit

## Task 3: Phase 0 — org constants, paths, types (TDD)

**Files:**
- Create: `src/tenancy/orgConstants.ts`, `orgSettingsPaths.ts`, `orgId.ts`
- Create: `src/tenancy/orgSettingsPaths.test.ts`, `orgId.test.ts`
- Modify: `src/types.ts` (`Organization`, `orgId` on profile/lead, `FS_COLLECTIONS.orgSettings` / `organizations`)

- [ ] Failing tests: default org `vietmy`; path `orgSettings/{orgId}/{docId}`; `withOrgId` injects field
- [ ] Implement
- [ ] `npm test` pass
- [ ] Commit

## Task 4: Phase 0 — dual-read settings helper + wire KPI context

**Files:**
- Create: `src/tenancy/dualReadOrgSettings.ts` (+ test)
- Modify: `src/contexts/KpiV2ConfigContext.tsx` (read orgSettings first, fallback scoringAux; write both or orgSettings+compat)

- [ ] Test dual-read preference order
- [ ] Wire KpiV2ConfigProvider
- [ ] `npm test` pass
- [ ] Commit

## Task 5: Phase 0 — portal slug route + Rules example + backfill script stub

**Files:**
- Modify: `src/App.tsx` — `/dang-ky/:orgSlug` + redirect `/dang-ky` → `/dang-ky/vietmy`
- Modify: `src/views/student/StudentRegistrationView.tsx` — read slug (pass-through ready)
- Modify: `firestore.rules.example` — orgId + platform claim sketches
- Create: `scripts/phase0-backfill-orgId.mjs` (dry-run by default; documents steps)
- Create: `src/tenancy/DEFAULT_ORG.md` short operator note OR section in plan only

- [ ] Tests for slug normalize helper
- [ ] Routes
- [ ] Rules example
- [ ] Backfill script dry-run safe
- [ ] Full `npm test` + `npm run build` (or tsc)
- [ ] Commit — **Phase 0 gate: all green before Phase 1**

---

## Phase gate

Do **not** start Phase 1 (remove scoringAux fallback, all queries filtered) until Task 5 verification passes and this checklist is checked in the PR description.
