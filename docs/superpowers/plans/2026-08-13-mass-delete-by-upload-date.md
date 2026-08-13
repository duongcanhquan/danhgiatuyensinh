# Mass delete by upload date — Implementation Plan

> **For agentic workers:** Implemented inline after spec approval (2026-08-13).

**Goal:** Filter and mass-delete leads by upload date (`uploadedAt`), respecting other active filters.

**Architecture:** Client date-range helper + LeadManagement draft/apply filters; fullScope when date active; reuse `deleteEntireBatch('filters')` for «Xóa theo ngày».

**Tech Stack:** React, Firestore timestamps, Vitest

## Tasks

- [x] `src/utils/leadUploadedDateRange.ts` + tests
- [x] Wire `uploadedFrom`/`uploadedTo` into LeadUiFilters, URL `dfrom`/`dto`, `filtered`, chips, select-all, purge scan
- [x] UI: Từ/Đến ngày tải + nút «Xóa theo ngày»
