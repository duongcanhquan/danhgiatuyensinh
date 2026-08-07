# Smart bulk lead assign — Implementation Plan

> **For agentic workers:** Implement task-by-task. Steps use checkbox syntax.

**Goal:** Fast smart bulk lead distribution with filter-aware select-all.

**Architecture:** Pure planners in `smartLeadAssign.ts`; batched Firestore writes in `bulkLeadReassign.ts`; LeadManagement wires filters, select-all, and enhanced modal.

**Tech Stack:** React, Firestore writeBatch, Vitest

## Global Constraints

- Vietnamese plain UI copy (vietmy-ui-plain-language)
- Cap select/fetch at `LEADS_UI_FULL_SCOPE_MAX` (4000)
- Reuse `assigneeFirestoreMirror`, `pickCounselorByLowestLoad` patterns

---

### Task 1: Planners + batch write + tests

- [ ] `src/utils/smartLeadAssign.ts` — plan assignments
- [ ] `src/utils/bulkLeadReassign.ts` — chunked batch
- [ ] Unit tests
- [ ] Fix `countAssignments` to use `assignedTo ?? assignedCounselorId`

### Task 2: LeadManagement wiring

- [ ] assignee `__UNASSIGNED__` → fullScope; specific assignee → server `assignedCounselorIn` when global
- [ ] Select all matching filters
- [ ] Modal modes + progress
- [ ] Replace serial `applyBulkReassign`

### Task 3: Verify

- [ ] `npm test` for new files
- [ ] `npm run build`
- [ ] Commit, push, PR
