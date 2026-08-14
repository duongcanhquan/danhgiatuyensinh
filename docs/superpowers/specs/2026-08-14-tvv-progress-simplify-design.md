# DES-TVV-PROGRESS-2026-08 — Gọn tiến độ tư vấn TVV

**Status:** implemented (cập nhật UI 2026-08-14)  

**Date:** 2026-08-14  
**Related:** DES-WORKMODE-2026-08

## Problem

Tab TVV hiện có ba chỗ chồng: **Tình trạng tư vấn** (CRM), **Tình trạng hồ sơ** (pipeline), **Phản hồi nhanh** (disposition). Chọn phản hồi đã `getDispositionLeadEffects` điền sẵn hai ô kia — TVV dễ nghĩ phải chỉnh cả ba. Đóng tiền / đủ hồ sơ / chuyển đổi cũng đã ghi nhận riêng.

## Decision

Phương án **(2′)** (cập nhật): một đường chính = phản hồi nhanh + ghi chú; **hai select tình trạng** nằm cùng hàng tiêu đề «Tiến độ tư vấn & ghi chú» (bên phải), mặc định = tình trạng đang lưu trên hồ sơ (`crmDirty ?? lead.status`, `statusDirty ?? lead.pipelineStatus`). Bỏ badge chỉ đọc, bỏ «Nâng cao», bỏ khối «Việc trên hồ sơ này».

## UI (tab TVV — khối «Tiến độ tư vấn & ghi chú»)

1. Hàng tiêu đề: trái = tiêu đề + hàng chờ; phải = select **Tư vấn** / **Hồ sơ** (chỉnh tay luôn hiện).
2. Hai cột ngang: trái **Phản hồi nhanh** (cam); phải **Đánh giá gọi** (xanh lá, luôn mở — trước là «Đánh giá sơ bộ theo bộ chấm» đóng sẵn).
3. Khi đã chọn phản hồi có map → dòng **xem trước khi lưu**.
4. **Ghi chú TVV** nổi (khung xanh dương, chữ đậm) + Lưu cập nhật.
5. Không còn khối «Việc trên hồ sơ này» / «Nâng cao».

## Tab nổi bật

- Trái: **Thao tác TVV** (cam) · **Hồ sơ ứng viên** (indigo).
- Phải: **Phân công** (violet) · **Lịch sử** (teal).
- Điểm + nhãn chỉ còn một chỗ trên thanh tab trái (không lặp trong form hồ sơ).

## Out of scope

Không đổi schema Firestore; không đổi map disposition; không tự ghi pipeline từ tài chính trong vòng này (đã có luồng khác).
