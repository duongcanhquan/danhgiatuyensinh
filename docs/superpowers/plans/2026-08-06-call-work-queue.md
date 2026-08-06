# Call Work Queue Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** TVV lead list tabs Chưa gọi / Gọi lại / Đã gọi + disposition notes after call, combined with existing filters.

**Architecture:** Denormalize `callWorkBucket` + disposition on Lead; update on call save; URL filters `cq`/`disp`; pure bucket logic in `callWorkQueue.ts`.

**Tech Stack:** React, Firestore, Vitest, existing LeadManagement / CallSessionQuickPanel.

## Global Constraints

- Plain Vietnamese UI labels; no collection names on main flow.
- `enrolled_elsewhere` ≠ CRM ENROLLED (VietMy success).
- TDD for queue/disposition pure functions.

---

### Task 1: Catalog + bucket logic (TDD)

**Files:** `src/utils/callWorkQueue.ts`, `src/utils/callWorkQueue.test.ts`

- [ ] RED: tests for bucket from disposition, resolve uncalled default, patch builder
- [ ] GREEN: implement catalog + functions
- [ ] Commit

### Task 2: Lead type + mapDoc + server filter

**Files:** `src/types.ts`, `src/hooks/useLeads.ts`, `src/utils/leadWorkspaceUrlFilters.ts`, `firestore.indexes.json`

- [ ] Add lead fields; map in mapDoc
- [ ] LWF.CQ, LWF.DISP; LeadListServerFilters.callWorkBucket / lastCallDispositionId
- [ ] Indexes orgId+assignedTo+callWorkBucket+updatedAt (and similar)
- [ ] Commit

### Task 3: Persist on call save

**Files:** `src/services/saveCallSessionInteraction.ts`, `src/services/logOmicallInteraction.ts`, `CallSessionQuickPanel.tsx`, draft context if needed

- [ ] Require disposition on save from panel
- [ ] Hangup NO_ANSWER → callback/knm soft update
- [ ] Commit

### Task 4: LeadManagement UI

**Files:** `src/views/LeadManagement.tsx`

- [ ] Tab strip Chưa gọi / Gọi lại / Đã gọi
- [ ] Disposition filter select
- [ ] Sort uncalled list stable top→bottom
- [ ] Commit

### Task 5: Verify

- [ ] `npm test`, `npm run build`
- [ ] Push + merge main
