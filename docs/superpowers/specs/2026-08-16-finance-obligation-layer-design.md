# Finance obligation layer — design

**Date:** 2026-08-16  
**Status:** Approved for implementation  
**Approach:** Lớp «nghĩa vụ phải đóng» + giữ 5 dòng ghi tiền hiện tại

## Decisions

1. Học phí kỳ 1 lấy từ **bảng giá theo ngành/hệ** (admin).
2. Học bổng: nhập **số kỳ n** + **phân bổ tiền từng kỳ** (nút chia đều gợi ý).
3. **ĐÃ HOÀN THIỆN** = đủ tiền kỳ 1 (sau trừ HB) **và** đủ field hồ sơ.
4. Hồ sơ đã hoàn thiện / đã ghi danh (ENROLLED) → **ẩn khỏi theo dõi mặc định**; xem lại bằng lọc hoặc xuất Excel.

## Status ladder

| Approved total | Status | Track by default |
|---|---|---|
| 0 | MỚI | Yes |
| > 0 và &lt; ngưỡng cọc | ĐANG HOÀN THIỆN | Yes |
| ≥ ngưỡng cọc và &lt; phải đóng kỳ 1 | CỌC THÀNH CÔNG | No (Sheet: đã xong) |
| ≥ phải đóng kỳ 1 và đủ field | ĐÃ HOÀN THIỆN | No (handover) |
| CRM ENROLLED | — | No (handover) |

## Formulas

```
phải đóng kỳ 1 = max(0, học phí ngành kỳ 1 − HB1[kỳ1] − HB2[kỳ1])
```

- Missing tuition row for lead’s major → never auto ĐÃ HOÀN THIỆN; surface warning.
- Deposit / LPXT thresholds unchanged (`financeThresholds`).
- Payment slots unchanged (deposit + L1–L4); Sheet/n8n unchanged in v1.

## Admin

1. **Bảng học phí kỳ 1** — org setting: major label (+ optional educationLevel) → `tuitionTerm1Vnd`.
2. **Học bổng** — extend `ScholarshipRecord`: `termCount`, `termAllocationsVnd[]` (sum should match `amountVnd`).
3. Keep existing deposit/LPXT panel.

## Surfaces

- Accountant queue: pending = unpaid approvals OR in-progress (chưa CỌC / chưa hoàn thiện). Sheet `CỌC THÀNH CÔNG` = out of queue (unless new unpaid slot).
- Lead list / TVV: hide CỌC THÀNH CÔNG + ĐÃ HOÀN THIỆN + Full NE + ENROLLED by default (lọc Thu phí để xem lại).
- Full NE confirm = đánh dấu đủ tiền → ĐÃ HOÀN THIỆN (tương đương đóng hết).
- Cards: show học phí · HB kỳ 1 · phải đóng · đã duyệt · còn thiếu.
- Excel handover: add obligation columns.
- Admin: **Cài đặt → Hồ sơ → Học phí kỳ 1** (tab ngang). Ngưỡng cọc / chứng từ: **Kênh → Ngưỡng cọc & chứng từ**.

## Non-goals (v1)

- Renaming payment slots to review/deposit/tuition.
- Multi-term collection tracking beyond term-1 completion.
- Changing Full NE workflow (optional; settled fee-complete still leaves work queue).
