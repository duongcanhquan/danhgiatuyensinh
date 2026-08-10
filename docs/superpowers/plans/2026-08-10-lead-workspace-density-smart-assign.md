# Lead workspace density + assign-by-N Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gọn UI Hồ sơ/chi tiết và phân lead theo số N (≤1500) với quy tắc lấy lead, mở rộng engine smart assign hiện có.

**Architecture:** Client-only. Helper `pickLeadIdsForAssign` + modal/toolbar trên `LeadManagement`; tái dùng `planLeadAssignments` / `bulkReassignLeads`.

**Tech Stack:** React, Firestore client batches, Vitest.

## Global Constraints

- Trần N = `LEADS_UI_FULL_SCOPE_MAX` (1500).
- Copy tiếng Việt đời thường (vietmy-ui-plain-language).
- Không Cloud Function phân nền lần này.

---

### Task 1: `pickLeadIdsForAssign` + tests

- [x] Helper + unit tests trong `src/utils/smartLeadAssign*`

### Task 2: Chi tiết hồ sơ — gọi nhanh thu gọn

- [ ] `LeadDetailPanel`: tab gọn hơn; «Gọi nhanh» `<details>` đóng mặc định

### Task 3: Danh sách — thanh công cụ thu gọn

- [ ] Mặc định ẩn lọc nhanh / bộ lọc / chấm điểm; bật bằng «Công cụ»

### Task 4: Modal phân + «Phân theo lọc»

- [ ] Input N + quy tắc; apply pick trước plan; nút entry trên toolbar

### Task 5: Verify + commit

- [ ] `npx vitest run src/utils/smartLeadAssign.test.ts`
- [ ] Commit spec/plan/code (khi user đã yêu cầu commit trước đó trong phiên — lần này user bảo triển khai; commit khi xong nếu phù hợp)
