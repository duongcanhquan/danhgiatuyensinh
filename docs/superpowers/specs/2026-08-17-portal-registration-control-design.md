# Kiểm soát đăng ký cổng — design

**Date:** 2026-08-17  
**Status:** Approved

## Problem

Cổng `/dang-ky` đang chặn SV khi trùng SĐT/CCCD. Hồ sơ import mỏng (tên + lớp, TVV A) dùng hash `identity`, form cổng hash theo SĐT → dễ thành hai hồ sơ, hoặc SV không hoàn thiện được thủ tục khi TVV B bảo điền cổng.

## Goal

SV luôn nộp thành công. Trùng mạnh chờ xác nhận merge trong mục **Kiểm soát đăng ký**. Không trùng → tạo hồ sơ ngay, gán TVV B (người SV chọn trên cổng).

## Access

- Siêu quản trị + Quản lý (`admin`): mọi phiếu chờ của trường
- TVV B (counselor/CTV được chọn trên cổng): phiếu của mình
- Trưởng nhóm không vào mục này (trừ khi chính là TVV B)

## Matching

1. CCCD (`nationalIdHash`) — mạnh; chỉ được merge, không tạo hồ sơ thứ hai
2. SĐT (`uniqueHash` phone SV / phụ huynh) — mạnh; chỉ merge
3. Họ tên (đúng `fullName` hoa) — yếu; gợi ý, merge hoặc «tạo hồ sơ mới»
4. Không khớp — tạo lead ngay, không vào hàng chờ

## Merge

- Ghi đè / lấp trường SV tự khai (CCCD, SĐT, địa chỉ, ngành, phụ huynh…)
- Không đè cọc/phí, pipeline, trạng thái TVV, lịch sử gọi, `systemCode`
- Gán `assignedTo` = TVV B
- A đã gọi / tương tác (`lastCall*` hoặc `lastInteraction` call/note) → cảnh báo trên phiếu, vẫn chuyển B
- A chưa đụng → chuyển B, không cảnh báo
- Bàn giao chăm sóc sau đó: phân công nội bộ hiện có

## Data

Collection `portal_registrations`. Client chỉ đọc. Tạo/cập nhật qua Cloud Functions (`submitPublicLead`, `resolvePortalRegistration`).

## Student UX

Hàng chờ: trang thành công **không** bắt mã hồ sơ. Có lead ngay: giữ mã `systemCode` như hiện tại.
