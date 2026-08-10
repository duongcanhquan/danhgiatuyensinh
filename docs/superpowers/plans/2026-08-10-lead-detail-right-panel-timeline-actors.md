# Lead detail right panel + timeline actors — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use executing-plans (or implement directly in-session). Steps use checkbox (`- [ ]`) syntax.

**Goal:** Cột phải chi tiết hồ sơ hẹp + đặc hơn; timeline hiện «Tên · hành động», không OMICall làm tiêu đề.

**Architecture:** Chỉ UI — chỉnh grid `LeadDetailPanel`, densify tabs/`LeadCrmQuickBlock`/`LeadActivityTimeline`, helper nhãn audit tiếng Việt + actor name cho từng loại dòng.

**Tech Stack:** React, Tailwind, Vitest (helper thuần nếu tách).

**Spec:** `docs/superpowers/specs/2026-08-10-lead-detail-right-panel-timeline-actors-design.md`

## File map

| File | Responsibility |
|------|----------------|
| `src/views/LeadManagement.tsx` | Grid 8/4; tab phải gọn; tìm `LeadCrmQuickBlock` compact |
| `src/components/LeadActivityTimeline.tsx` | Actor-first titles; empty copy; denser cards |
| `src/utils/leadActivityTimelineLabels.ts` (new, optional) | Pure helpers + unit tests for action/actor labels |

---

### Task 1: Helpers nhãn timeline

- [ ] Tạo `src/utils/leadActivityTimelineLabels.ts` với:
  - `auditActionLabelVi(actionType)`
  - `timelineActorName({ performedByName?, uid?, labelUid })`
  - `callActionTitle({ direction, connected, valid })` — không gồm OMICall
- [ ] Test `src/utils/leadActivityTimelineLabels.test.ts`
- [ ] `npx vitest run src/utils/leadActivityTimelineLabels.test.ts`

### Task 2: `LeadActivityTimeline` actor-first + denser

- [ ] Wire helpers; tiêu đề `Tên · hành động`
- [ ] Call: phụ SĐT/thời lượng/máy lẻ; bỏ OMICall khỏi title
- [ ] Empty: «Chưa có hoạt động trên hồ sơ này.»
- [ ] Giảm padding/gap/header

### Task 3: Layout cột phải gọn

- [ ] `lg:col-span-7` → `8`, `lg:col-span-5` → `4`
- [ ] Tab: nhãn «Phân công» / «Lịch sử»; min-h/padding nhỏ hơn
- [ ] Densify `LeadCrmQuickBlock` nếu có prop `compact` / class trong cùng file

### Task 4: Verify

- [ ] Vitest helpers + `npx tsc --noEmit`
- [ ] Commit code (khi user yêu cầu hoặc cùng session nếu đã bảo triển khai)
