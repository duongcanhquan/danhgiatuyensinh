# Superadmin Org Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Superadmin can view/edit school fields, manage school admins, and open that school's settings with a clear context label.

**Architecture:** Pure validation/patch helpers in `src/tenancy/`; Firestore writes + audit in `src/services/createOrganization.ts` (extend); UI panel on `OrganizationsView`; Settings banner via `OrgProvider.currentOrgLabel`.

**Tech Stack:** React, Firestore, Vitest, existing Auth staff helpers (`createStaffAccount`, `updateStaffProfile`, `setStaffPassword`).

## Global Constraints

- Copy UI: tiếng Việt đời thường (trường, quản lý, cài đặt) — không lộ tên collection.
- `orgId` document id không đổi; chỉ đổi `slug` / `name` / `notes`.
- Không tạm ngưng `vietmy` từ UI (giữ rule hiện có).
- Platform-only: mọi mutate org registry yêu cầu `isPlatformSuperAdmin`.

---

## File map

| File | Responsibility |
|------|----------------|
| `src/tenancy/createOrganization.ts` | `validateUpdateOrganizationInput`, `buildOrganizationUpdatePatch` |
| `src/tenancy/createOrganization.test.ts` | Tests for update helpers |
| `src/tenancy/platformOps.ts` | New audit actions + labels |
| `src/tenancy/platformOps.test.ts` | Label tests |
| `src/types.ts` | `Organization.notes?` |
| `src/services/createOrganization.ts` | `updateOrganization`, `addSchoolAdmin` (or thin wrappers) |
| `src/views/OrganizationsView.tsx` | Detail/edit panel + admin management |
| `src/views/SettingsView.tsx` | Context banner for platform SA |

---

### Task 1: Update-org pure helpers (TDD)

**Files:**
- Modify: `src/tenancy/createOrganization.ts`
- Modify: `src/tenancy/createOrganization.test.ts`

- [ ] **Step 1: Write failing tests** for `validateUpdateOrganizationInput` / `buildOrganizationUpdatePatch`
  - Reject empty name; reject invalid slug; reject slug collision with *other* orgs (allow same org keeping its slug); notes max length 2000; trim name/notes
  - Patch only includes changed fields + normalized slug

- [ ] **Step 2: Run tests — expect FAIL**

```bash
npx vitest run src/tenancy/createOrganization.test.ts
```

- [ ] **Step 3: Implement helpers**

- [ ] **Step 4: Run tests — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add src/tenancy/createOrganization.ts src/tenancy/createOrganization.test.ts
git commit -m "Add validate/build helpers for updating school organizations."
```

---

### Task 2: Platform audit actions for update/admin

**Files:**
- Modify: `src/tenancy/platformOps.ts`
- Modify: `src/tenancy/platformOps.test.ts`

- [ ] Add `ORG_UPDATED`, `ORG_ADMIN_ADDED`, `ORG_ADMIN_DISABLED`, `ORG_ADMIN_ENABLED` + Vietnamese labels
- [ ] Tests for labels
- [ ] Commit

---

### Task 3: Service `updateOrganization` + schema notes

**Files:**
- Modify: `src/types.ts` (`notes?: string`)
- Modify: `src/services/createOrganization.ts`

- [ ] `updateOrganization(db, actor, orgId, input, { reservedSlugs, currentSlug })` → validate, `updateDoc`, audit `ORG_UPDATED`
- [ ] Commit

---

### Task 4: OrganizationsView detail panel

**Files:**
- Modify: `src/views/OrganizationsView.tsx`

- [ ] Button **Chi tiết** per row → panel with edit form, save, admin list/add/disable/password, **Mở cài đặt trường này**
- [ ] Reuse `createStaffAccount({ role: 'admin', orgId })`, `updateStaffProfile`, `setStaffPassword`
- [ ] Query admins: `users` where `orgId ==` and client-filter `role === 'admin'` (or dual where if indexed)
- [ ] Commit

---

### Task 5: Settings context banner

**Files:**
- Modify: `src/views/SettingsView.tsx`

- [ ] If platform SA: show «Đang cấu hình: {currentOrgLabel}» + link Quản lý trường
- [ ] Commit

---

### Task 6: Verify + PR

- [ ] `npx vitest run src/tenancy/createOrganization.test.ts src/tenancy/platformOps.test.ts`
- [ ] `npm run lint` (or eslint on touched files)
- [ ] Push + draft PR
