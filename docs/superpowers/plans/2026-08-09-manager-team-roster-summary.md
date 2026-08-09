# Manager Team Roster Summary Implementation Plan

> **For agentic workers:** Implement task-by-task. Steps use checkbox syntax.

**Goal:** Tab «Nhóm của tôi» trên Tổng kết — bảng tổng kết lead/gọi theo từng nhân sự trong phạm vi quản lý.

**Architecture:** Pure aggregator + SummaryHub tab + view đọc leads fullScope và omicallCalls.

**Tech Stack:** React, Firestore hooks hiện có, Vitest.

## Global Constraints

- Copy UI tiếng Việt đời thường (VietMy plain language)
- Thành công = disposition `college_hot` only
- Tỷ lệ = lead có gọi trong kỳ / lead đang giữ
- Branch: `cursor/manager-team-roster-summary-3c2e` (or current feature branch)

---

### Task 1: Pure util + tests

- [ ] Write failing tests for `buildTeamRosterSummary`
- [ ] Implement `src/utils/teamRosterSummary.ts`
- [ ] Commit

### Task 2: View + navigation

- [ ] Add tab id/labels/access in `summaryNavigation`
- [ ] Create `TeamRosterSummaryView`
- [ ] Wire `SummaryHubView`
- [ ] Commit

### Task 3: Verify + PR

- [ ] `tsc -b` + targeted tests
- [ ] Push + draft PR
