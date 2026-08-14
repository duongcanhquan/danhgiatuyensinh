# DES-WM-EFFECTIVE-2026-08 — Chế độ hiệu lực (lọc bento)

**Status:** implemented  
**Date:** 2026-08-14  
**Related:** DES-WORKMODE-2026-08 · phương án A

## Problem

Ô Sàng / Lọc / Chăm đếm 0 vì hầu hết hồ sơ cũ thiếu field `workMode`. «Tất cả» vẫn thấy số trang → lọc mode trống.

## Decision (cập nhật)

**Chế độ hiệu lực** (chỉ đếm + lọc UI, không ghi đè thầm Firestore):

1. `workMode` đã lưu  
2. Playbook nguồn (`source1` → `LeadSourceRecord.defaultWorkMode`)  
3. Giai đoạn → `care_close` nếu CRM ∈ INTERESTED / DEPOSIT_PAID / ENROLLED / SUMMER_MELT, hoặc pipeline ∈ QUALIFIED / APPLIED / ENROLLED, hoặc disposition quan tâm (`CARE_CLOSE_DISPOSITION_IDS`)  
4. Mặc định → `volume_filter`  
5. **Không** tự đoán `score_queue` từ giai đoạn (chỉ lưu hoặc playbook nguồn)

`unset` trên bento = số hồ sơ chưa có field lưu (đang suy diễn).

### Quét khi lọc (2026-08-14)

Bấm một chế độ **không** lọc trên 1 trang. Hệ thống:

- Bật `fullScope` + `fullScopeKeepMatch` (chỉ giữ hồ sơ khớp chế độ hiệu lực + các lọc client khác)
- Quét theo `docId` tới `LEADS_UI_PROGRAM_SCAN_MAX` hoặc đủ `LEADS_UI_FULL_SCOPE_MAX` kết quả khớp
- Phân trang client trên tập đã lọc sẵn

Khi «Tất cả»: đếm ô là ước tính trang hiện tại; bấm ô mới quét toàn phạm vi (tiết kiệm đọc khi chưa lọc).

### Bugfix 2026-08-14 (rà soát)

- Tab **chiến dịch** phân trang: `pagedKeepMatch` oversample đủ 1 trang khớp origin (tránh trang trống vì cổng chen chỗ).
- Đếm / bento / chương trình: theo `originScopedLeads`, không dùng `totalLeadCount` thô trên tab chiến dịch.
- «Xóa lọc» **giữ** tab nguồn (`origin` URL).

## Code

- `resolveEffectiveWorkMode` / `summarizeLeadWorkModes` / `leadMatchesWorkModeFilter` trong `src/utils/leadWorkMode.ts`
- List + bento + context card chi tiết dùng chế độ hiệu lực
