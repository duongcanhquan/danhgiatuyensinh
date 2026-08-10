# Superadmin org soft-delete + delete admin — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Superadmin can clearly edit/soft-delete schools and hard-delete school admins on `/organizations`.

**Architecture:** Extend `OrganizationStatus` + platform audit; add `softDeleteOrganization` beside existing org services; wire UI confirms in `OrganizationsView`; reuse `deleteStaffAccount` for admins. No data purge.

**Tech Stack:** React, Firestore client, existing CF `adminStaffAccountAction`, Vitest.

## Global Constraints

- Soft-delete only (`status: 'deleted'`); never purge leads/orgSettings.
- Block soft-delete of `DEFAULT_ORG_ID` (`vietmy`).
- Vietnamese UI copy; confirm before destructive actions.
- Platform superadmin only for org soft-delete.

## File map

| File | Role |
|------|------|
| `src/types.ts` | `OrganizationStatus` += `deleted` |
| `src/tenancy/platformOps.ts` (+ test) | `ORG_DELETED`, `ORG_ADMIN_DELETED` labels |
| `src/services/createOrganization.ts` (+ test if pure helpers) | `softDeleteOrganization` |
| `src/views/OrganizationsView.tsx` | Sửa/Xóa UI; filter deleted; delete admin |
| `src/contexts/authContextDefinition.ts` | expose `deleteStaffAccount` if not already on hook used |

---

### Task 1: Audit actions + labels (TDD)

- [x] Add failing tests in `platformOps.test.ts` for `ORG_DELETED` / `ORG_ADMIN_DELETED` labels
- [x] Extend `PLATFORM_AUDIT_ACTIONS` + `platformAuditActionLabel`
- [x] Commit

### Task 2: softDeleteOrganization (TDD)

- [x] Add pure helper `assertCanSoftDeleteOrganization(orgId)` rejecting empty + vietmy (unit test)
- [x] Implement `softDeleteOrganization` (Firestore update + audit) using helper
- [x] Extend `OrganizationStatus` in `types.ts`
- [x] Commit

### Task 3: OrganizationsView UI

- [x] Filter out `deleted` from list + stats
- [x] Rename Chi tiết → **Sửa**; add **Xóa** with confirm → softDelete; switch active org if needed
- [x] Wire `deleteStaffAccount` + **Xóa** on each admin + audit `ORG_ADMIN_DELETED`
- [x] Commit

### Task 4: Verify

- [x] Run relevant vitest + tsc
- [ ] Push
