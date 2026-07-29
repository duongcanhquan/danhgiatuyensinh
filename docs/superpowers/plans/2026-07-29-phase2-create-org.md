# Phase 2 — Create School (Organization) Implementation Plan

> **For agentic workers:** Use executing-plans / TDD. Checkbox steps.

**Goal:** Superadmin can create a second school (org), provision its first admin, seed orgSettings from template, switch into that org — without campus layer.

**Architecture:** Client-side provision (same trust model as staff create): write `organizations/{id}`, copy `orgSettings/{template}/settings/*` → new org, create Auth user + `users/{uid}` with `role:admin` + `orgId`. Pure helpers for validation/slug/id tested in Vitest.

**Tech Stack:** React, Firestore, Firebase Auth secondary app (existing staff create), Vitest.

## Global Constraints

- Platform super_admin only (`orgId` null + role super_admin).
- Vietnamese UI; bento surfaces.
- Do not remove vietmy legacy scoringAux mirror yet for DEFAULT_ORG only; new orgs write orgSettings only.
- `npm test` + `tsc`/`build` green before claiming done.

---

## Task 1: Pure helpers (TDD)

**Files:** `src/tenancy/createOrganization.ts`, `createOrganization.test.ts`

- [x] validateCreateOrganizationInput (name, slug, adminEmail, password)
- [x] orgIdFromSlug
- [x] ORG_SETTINGS_TEMPLATE_DOC_IDS list
- [x] buildOrganizationRecord
- [x] `npm test`

## Task 2: createOrganizationService (client)

**Files:** `src/services/createOrganization.ts`

- [x] Ensure unique slug/orgId
- [x] Write organizations doc
- [x] Copy settings from template org (default `vietmy`) or seed empty KPI defaults
- [x] Create admin via AuthProvider API or shared helper
- [x] Return { orgId, adminUid }

## Task 3: UI — Quản lý trường

**Files:** `OrganizationsView.tsx`, route in App/Layout nav (superadmin only), wire OrgSwitcher “Quản lý trường”

- [x] List orgs (active/suspended)
- [x] Create form (bento)
- [x] Suspend / reactivate
- [x] Switch to org after create

## Task 4: Rules notes + indexes if needed

- [x] Update firestore.rules.example for organizations write = platform
- [ ] Verify build/tests
- [ ] Commit / PR update
