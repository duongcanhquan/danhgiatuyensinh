# Phase 1 Multi-tenant Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Checkbox steps.

**Goal:** Harden single-org multi-tenant readiness: effective `orgId` everywhere in client reads/writes that matter, Superadmin org switcher, org-scoped lead queries & dedupe; keep Phase 0 dual-read until settings fully migrated.

**Architecture:** `OrgProvider` exposes `effectiveOrgId` (profile.orgId or Superadmin `activeOrgId`, default `vietmy`). Lead list/dedupe constraints include `orgId`. KPI settings dual-read keyed by `effectiveOrgId`.

**Tech Stack:** React, Firestore client SDK, Vitest, existing tenancy helpers.

## Global Constraints

- No campus; school = orgId.
- Do not start Phase 2 (create org #2 UI provision) until this plan’s tests + build pass.
- Vietnamese UI copy; Superadmin sees badge “Đang làm việc tại …”.
- TDD for pure helpers; verify `npm test` + `tsc`/`build`.

---

## Task 1: resolveEffectiveOrgId + OrgProvider storage helpers (TDD)

**Files:** Create `src/tenancy/effectiveOrgId.ts`, extend tests; Create `src/contexts/OrgProvider.tsx`, `src/hooks/useOrg.ts`

- [ ] Test resolveEffectiveOrgId matrix (school user, superadmin+active, fallbacks)
- [ ] Implement helper + localStorage key for activeOrgId
- [ ] OrgProvider + useOrg
- [ ] `npm test` pass
- [ ] Commit

## Task 2: Wire provider + Superadmin school picker

**Files:** `App.tsx` or `Layout.tsx`, `AuthProvider` profile mapping for orgId, new `OrgSwitcher.tsx`

- [ ] Map `orgId` from Firestore user doc in AuthProvider
- [ ] Wrap CRM layout with OrgProvider
- [ ] Superadmin: bento/select list of orgs (at least default vietmy + Firestore `organizations` if readable)
- [ ] Badge on header/sidebar
- [ ] Commit

## Task 3: Scope leads + dedupe by orgId

**Files:** `useLeads.ts`, `manualLeadCreate.ts` / DataIntake uniqueHash queries, tests for constraint builders

- [ ] Helper `orgConstraint(orgId)` for Firestore `where('orgId','==',…)`
- [ ] useLeads includes org filter (with fallback note: docs missing orgId won’t show until backfill)
- [ ] Dedupe queries include orgId
- [ ] Tests
- [ ] Commit

## Task 4: KPI (and path helper) use effectiveOrgId

**Files:** `KpiV2ConfigContext.tsx`

- [ ] Subscribe using effectiveOrgId from OrgProvider (fallback DEFAULT)
- [ ] Save/reset to that org’s orgSettings + legacy mirror
- [ ] Commit

## Task 5: Gate verification

- [ ] `npm test`
- [ ] `npx tsc -b` / `npm run build`
- [ ] Update PR description — Phase 1 done; Phase 2 not started
