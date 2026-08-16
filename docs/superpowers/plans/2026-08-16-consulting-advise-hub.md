# Consulting Advise Hub Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gom Cài đặt Tư vấn thành hub 4 bước (Tri thức → Mẫu → Mảnh thoại → AI), mặc định Gemini Flash-Lite, làm rõ R2 ≠ RAG.

**Architecture:** Component `ConsultingAdviseHub` bọc Knowledge / Playbook / Script Hub / AISettings; Settings navigation gộp `knowledge` vào `consulting`; đổi default model.

**Tech Stack:** React, Firestore collections hiện có, Vite.

## Global Constraints

- Copy UI tiếng Việt đời thường (vietmy-ui-plain-language).
- Không thêm vector/R2 cho RAG trong P0.
- Không phá URL legacy `sub=knowledge` / `sub=consulting`.

---

### Task 1: Spec + defaults Flash-Lite

**Files:**
- Modify: `src/utils/aiEngine.ts`, `src/services/orgAiIntegration.ts`, `src/components/AISettingsTab.tsx`, `.env.example`

- [x] Đổi `DEFAULT_MODEL` Gemini → `gemini-2.5-flash-lite`
- [x] `VITE_AI_PROVIDER` mặc định Gemini khi chỉ có key
- [x] Cập nhật `.env.example`

### Task 2: ConsultingAdviseHub UI

**Files:**
- Create: `src/components/ConsultingAdviseHub.tsx`
- Modify: `src/views/SettingsView.tsx`
- Modify: `src/utils/settingsNavigation.ts`

- [x] Hub 4 bước + mô tả ngắn «A dùng ở B»
- [x] consulting enabled nếu `canPlaybooks || canAiEngine`
- [x] Bỏ `knowledge` khỏi hàng tab; redirect `knowledge` → consulting step facts
- [x] Nhúng KnowledgeBaseTab / Playbook / ScriptHub / AISettingsTab

### Task 3: Knowledge UX gọn hơn

**Files:**
- Modify: `src/components/KnowledgeBaseTab.tsx`

- [x] Nút mẫu nhanh: «Thông tin trường», «Ngành», «FAQ phụ huynh» prefill title/type
- [x] Copy hướng dẫn ngắn trên đầu bước Tri thức

### Task 4: Verify

- [x] `npm run test` (aiEngine) + `tsc --noEmit`
- [ ] Smoke: mở Cài đặt → Tích hợp → Tư vấn, chuyển 4 bước (manual)
