# Lead Work Modes (DES-WORKMODE) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Thêm chế độ xử lý hồ sơ (`workMode`) theo kịch bản nguồn, lọc URL `wm`, gọn đánh giá gọi theo mode, chuyển `care_close` từ disposition — không phá hàng chờ gọi / bộ chấm / KPI.

**Architecture:** Optional `workMode` trên Lead + playbook optional trên `LeadSourceRecord`; lọc `wm` client-side như `cq`; form gọi short/full qua filter dimension + nới `enrollment_signal.required`; map disposition → gợi ý/ghi `workMode` qua helper mới cạnh `callWorkQueue`.

**Tech Stack:** React 19, TypeScript, Vitest, Firestore, Cloud Functions (public registration).

**Spec:** `docs/superpowers/specs/2026-08-13-lead-work-modes-scoring-design.md` (§14 bắt buộc).

## Global Constraints

- Không rewrite `scoringEngine`; không đổi KPI V2.
- Không xóa `CALL_DISPOSITIONS` / `scoringSignals` / `callSessionChips`; không thay tab `cq`/`disp`.
- Lead thiếu `workMode` vẫn hoạt động như cũ.
- P1 lọc `workMode` = client + fullScope (không server `where` trừ khi có index).
- URL param: `wm` only.
- UI TVV: tiếng Việt đời thường — «Sàng data · Lọc gọi nhanh · Chăm & chốt»; «Bộ chấm điểm» không gọi Profile mơ hồ.
- TDD: test fail → code → pass; commit sau mỗi task xanh.
- Copy/tests phải khớp catalog disposition thật (`high_interest`, …).

## File map

| File | Responsibility |
|------|----------------|
| `src/utils/leadWorkMode.ts` | Types, labels, parse, playbook resolve, disposition→care_close, match filter |
| `src/utils/leadWorkMode.test.ts` | Unit tests P1/P2 helpers |
| `src/types.ts` | `Lead.workMode?`, `LeadSourceRecord` playbook fields, `PublicRegistrationConfig` optional |
| `src/hooks/useLeads.ts` | `mapDoc` đọc `workMode` |
| `src/utils/leadWorkspaceUrlFilters.ts` | `LWF.WM`, parse, signature |
| `src/utils/leadProfileCatalog.ts` / `leadProfileCatalogSeed.ts` | Map/save playbook trên nguồn |
| `src/components/LeadProfileSettingsTab.tsx` | UI cấu hình mode mặc định / bộ chấm nguồn |
| `src/utils/manualLeadCreate.ts`, `DataIntake.tsx`, `excel` path | Gán workMode lúc tạo |
| `functions/src/publicRegistration.ts` | Gán workMode cổng ĐK |
| `src/views/LeadManagement.tsx` | Filter `wm`, fullScope, UI chọn mode, bulk |
| `src/utils/callSessionEvaluation.ts` (+ defaults) | Short/full dimension filter; required override |
| `src/components/CallSessionQuickPanel.tsx` / board | Dùng preset theo mode |
| `src/services/saveCallSessionInteraction.ts` | Sau disposition: optional set workMode care_close |
| `src/components/LeadScoringSignalsPanel.tsx` + LeadManagement | P3: ẩn mặc định / cờ cấu hình |

---

### Task 1: Core `leadWorkMode` helpers + tests

**Files:**
- Create: `src/utils/leadWorkMode.ts`
- Create: `src/utils/leadWorkMode.test.ts`

**Interfaces:**
- Produces: `LeadWorkMode`, `LEAD_WORK_MODES`, `leadWorkModeLabel`, `parseLeadWorkMode`, `parseLeadWorkModeFromUrl`, `leadMatchesWorkModeFilter`, `resolveWorkModeFromSourcePlaybook`, `shouldSuggestCareClose`, `CARE_CLOSE_DISPOSITION_IDS`, `workModeAfterDisposition`

- [ ] **Step 1: Write failing tests** in `leadWorkMode.test.ts` covering parse, URL, match (missing field ≠ filter value), care_close ids include `high_interest`/`college_hot`/`positive`/`uni_top_*`, exclude `not_interested`/`knm`, `workModeAfterDisposition('high_interest','volume_filter') === 'care_close'`.

- [ ] **Step 2: Run** `npx vitest run src/utils/leadWorkMode.test.ts` — expect FAIL (module missing).

- [ ] **Step 3: Implement** `leadWorkMode.ts` minimal.

- [ ] **Step 4: Run tests** — expect PASS.

- [ ] **Step 5: Commit** `feat(workmode): helpers chế độ xử lý hồ sơ + test`

---

### Task 2: Types + mapDoc + URL `wm`

**Files:**
- Modify: `src/types.ts` (`Lead`, `LeadSourceRecord`, optionally `PublicRegistrationConfig`)
- Modify: `src/hooks/useLeads.ts` (`mapDoc`)
- Modify: `src/utils/leadWorkspaceUrlFilters.ts`
- Modify: `src/utils/leadWorkspaceUrlFilters.callWork.test.ts` (or sibling test) — add `wm` cases
- Modify: `src/utils/leadProfileCatalog.ts`, `leadProfileCatalogSeed.ts`

- [ ] **Step 1: Failing tests** for `parseLeadWorkModeFromUrl` via LWF + signature includes `wm`; mapDoc-style pure parse of unknown data.

- [ ] **Step 2: Implement types + mapDoc + LWF.WM + catalog map/save optional fields:**
  - `defaultWorkMode?: LeadWorkMode`
  - `defaultScoringProfileId?: string | null`
  - `allowProfileSwitchOnList?: boolean`

- [ ] **Step 3: Tests PASS + commit** `feat(workmode): type Lead/Source + URL wm + mapDoc`

---

### Task 3: Intake gán `workMode` (Excel, manual, public)

**Files:**
- Modify: `src/utils/manualLeadCreate.ts`
- Modify: `src/components/DataIntake.tsx` (and/or mapper)
- Modify: `functions/src/publicRegistration.ts` (+ `functions/lib` if repo commits compiled JS — follow repo pattern)
- Test: extend `leadWorkMode.test.ts` for `resolveWorkModeFromSourcePlaybook`; any existing intake tests

- [ ] Resolve mode from source label → `LeadSourceRecord.defaultWorkMode`, else leave undefined (hoặc `volume_filter` chỉ khi playbook set — **không** auto mọi lead).
- [ ] Public portal: set `workMode` from config/source playbook; keep score 0/COLD.
- [ ] Tests PASS; commit `feat(workmode): gán chế độ lúc nhập Excel/tay/cổng ĐK`

---

### Task 4: LeadManagement — lọc `wm`, UI, bulk, fullScope

**Files:**
- Modify: `src/views/LeadManagement.tsx`
- Possibly small filter component

- [ ] Hydrate/apply `wm` like `cq`.
- [ ] Client filter `leadMatchesWorkModeFilter`; force fullScope when `wm !== all`.
- [ ] Dropdown/chip «Chế độ xử lý»: Tất cả / Sàng data / Lọc gọi nhanh / Chăm & chốt.
- [ ] Bulk «Gán chế độ» (admin/TL pattern giống bulk khác).
- [ ] Chi tiết: hiện nhãn mode + cho đổi tay nếu quyền edit lead.
- [ ] Smoke: `npx vitest run` relevant URL + workMode tests; commit `feat(workmode): lọc và gán chế độ trên Hồ sơ`

---

### Task 5: P2 — Form gọi short/full + ẩn enrollment_signal an toàn

**Files:**
- Create/modify helpers in `src/utils/callSessionEvaluation.ts` or `leadWorkMode.ts`: `dimensionsForCallForm(dims, variant)` 
- Modify: `CallSessionQuickPanel.tsx` / validation path
- Test: `callSessionEvaluation.test.ts` + new cases

- [ ] `short`: disposition bắt buộc (đã có); dimensions customer tối thiểu hoặc rỗng; **không** require `enrollment_signal`.
- [ ] `full`: ẩn `enrollment_signal` khỏi UI nhưng readiness/decision/barriers/actions giữ; validation không bắt signal.
- [ ] Variant từ `lead.workMode`: `volume_filter`→short, `care_close`→full, `score_queue`→short+disposition (hoặc full nhẹ — spec: disposition như volume).
- [ ] Tests: validate passes without enrollment_signal pick when variant short/full-hidden.
- [ ] Commit `feat(workmode): gọn bảng đánh giá gọi theo chế độ`

---

### Task 6: P2 — Sau disposition → `workMode` care_close

**Files:**
- Modify: `src/services/saveCallSessionInteraction.ts`
- Modify: `src/utils/callWorkQueue.ts` or use `workModeAfterDisposition` from leadWorkMode
- Modify: LeadManagement `saveUnified` disposition path
- Test: unit on `workModeAfterDisposition` + patch shape

- [ ] Khi disposition in CARE_CLOSE set và lead chưa `care_close` → patch `workMode: 'care_close'` (cấu hình luôn bật mặc định theo spec).
- [ ] Không đổi khi `not_interested` / `knm`.
- [ ] Commit `feat(workmode): chuyển Chăm & chốt sau disposition quan tâm`

---

### Task 7: P3 — Ẩn panel tín hiệu trùng + copy

**Files:**
- Modify: `LeadManagement.tsx` (counselor tab) — ẩn `LeadScoringSignalsPanel` mặc định hoặc collapse «Nâng cao — tín hiệu bộ chấm»
- Copy: ScoringViewModeHint / enrollment labels nếu còn hiện
- Settings optional flag later YAGNI — mặc định ẩn panel trên TVV detail; admin vẫn có dữ liệu cũ

- [ ] Tests không bắt buộc UI; chạy full `npm test` subset + lint touched.
- [ ] Commit `fix(workmode): ẩn tín hiệu hồ sơ trùng đánh giá gọi`

---

### Task 8: Full verification

- [ ] `npx vitest run` (toàn bộ hoặc tối thiểu utils liên quan) — 0 fail.
- [ ] `npx tsc -b --pretty false` hoặc `npm run build` nếu ổn định — sửa lỗi type do workMode.
- [ ] `npm run functions:build` nếu đụng CF.
- [ ] Fix until green; final commit if needed.

---

## Spec coverage self-check

| Spec § | Task |
|--------|------|
| workMode 3 giá trị + labels | 1 |
| playbook LeadSourceRecord | 2–3 |
| lọc độc lập + wm | 2, 4 |
| intake 3 paths | 3 |
| reuse CALL_DISPOSITIONS | 5–6 |
| ẩn enrollment_signal + required | 5 |
| care_close map | 1, 6 |
| signals panel P3 | 7 |
| no scoring/KPI rewrite | all |

## Execution

User authorized full run with agents → **subagent-driven-development**, continuous, no pause between tasks.
