# Mass delete by upload date — design

**Date:** 2026-08-13  
**Status:** Approved (approach 2)  
**Scope:** Quản lý hồ sơ (`LeadManagement`)

## Goals

- Filter leads by **upload / import date** (`uploadedAt`, fallback `createdAt`) so admins can find batches easily.
- Mass-delete leads in a date range **while respecting other active filters** (TVV, chương trình, nguồn, …).
- Keep existing: delete selected, delete by program, delete by current filters.

## Non-goals

- Firestore `orderBy(uploadedAt)` / new composite indexes (v1 uses client filter + existing fullScope scan).
- Counselor self-service purge (still requires `leads:delete`).
- Soft-delete / recycle bin.

## Date semantics

- Field: `uploadedAt` if present, else `createdAt` (same as «Ngày đăng ký» column).
- Range: inclusive calendar days in `Asia/Ho_Chi_Minh` (`from` 00:00:00 → `to` 23:59:59.999).
- UI: two `type="date"` inputs — **Từ ngày** / **Đến ngày**.

## UX

1. **Filter row (Công cụ):** Từ ngày / Đến ngày; part of draft → Áp dụng lọc (same as other filters). Chip when active: `Ngày tải: dd/mm – dd/mm`.
2. **Select all matching:** existing «Chọn tất cả khớp lọc» includes date predicate.
3. **«Xóa theo ngày»** (admin only, near existing batch-delete controls):
   - Enabled when date range is applied (from and/or to set) **and** `leads:delete`.
   - Confirm copy: scope = ngày tải lên + mọi lọc đang bật; show estimated count when known.
   - Implementation: reuse `deleteEntireBatch('filters')` path (or thin wrapper) after ensuring date is in active filters — same scan + `bulkDeleteLeads` + progress / cancel / hard cap behavior.
4. Table sort by «Ngày đăng ký» already exists; no change required beyond filter.

## Data / code touchpoints

- `LeadUiFilters` (+ empty/equal/apply): `uploadedFrom`, `uploadedTo` (`YYYY-MM-DD` or `''`).
- Client filter in `LeadManagement` `filtered` memo: `leadMatchesUploadedDateRange(lead, from, to)`.
- Pure helper + unit tests: `src/utils/leadUploadedDateRange.ts`.
- Chips + «Xóa theo ngày» button; danger confirm via existing `confirmDangerousLeadBatchDelete`.
- `listNeedsFullScope`: date filter active → prefer fullScope (or same path as other client-only filters that already scan) so purge is not limited to current Firestore page.

## Permissions

- Filter: anyone who can open lead list.
- Mass delete / «Xóa theo ngày»: `leads:delete` only (same as today).

## Risks

- Without fullScope, paged mode may under-count; date filter must force scope scan for select-all / delete-all-filters.
- Large ranges: reuse existing purge caps / progress messaging.
