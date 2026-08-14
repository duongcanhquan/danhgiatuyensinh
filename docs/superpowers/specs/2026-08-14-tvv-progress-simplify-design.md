# DES-TVV-PROGRESS-2026-08 — Gọn tiến độ tư vấn TVV

**Status:** implemented  

**Date:** 2026-08-14  
**Related:** DES-WORKMODE-2026-08

## Problem

Tab TVV hiện có ba chỗ chồng: **Tình trạng tư vấn** (CRM), **Tình trạng hồ sơ** (pipeline), **Phản hồi nhanh** (disposition). Chọn phản hồi đã `getDispositionLeadEffects` điền sẵn hai ô kia — TVV dễ nghĩ phải chỉnh cả ba. Đóng tiền / đủ hồ sơ / chuyển đổi cũng đã ghi nhận riêng.

## Decision

Phương án **(2)**: một đường chính = phản hồi nhanh + ghi chú; tình trạng hiện **badge chỉ đọc**; chỉnh tay thu vào **Nâng cao** (đóng sẵn).

## UI (tab TVV — khối «Tiến độ tư vấn & ghi chú»)

1. Badge chỉ đọc: tư vấn (`LEAD_COUNSELOR_STATUS_LABELS`) · hồ sơ (`PIPELINE_LABEL`) + dòng giải thích tự cập nhật.
2. Phản hồi nhanh = thao tác chính; copy: lưu sẽ ghi tình trạng / nhãn HOT·WARM khi có map.
3. Khi đã chọn phản hồi có map → dòng **xem trước khi lưu**.
4. Ghi chú + Lưu cập nhật (không đổi logic `saveUnified` / effects).
5. `<details>` «Nâng cao — chỉnh tay tình trạng»: hai select cũ (CRM nếu có quyền, pipeline).
6. Tín hiệu bộ chấm: giữ chỉ khi `workFocus === 'scoring'`.

## Out of scope

Không đổi schema Firestore; không đổi map disposition; không tự ghi pipeline từ tài chính trong vòng này (đã có luồng khác).
