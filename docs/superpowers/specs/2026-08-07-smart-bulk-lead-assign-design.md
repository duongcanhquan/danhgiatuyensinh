# Thiết kế — Phân lead nhanh + lọc (smart bulk assign)

| Thuộc tính | Giá trị |
|------------|---------|
| **Mã** | `DES-SMART-ASSIGN-2026-08` |
| **Ngày** | 2026-08-07 |
| **Trạng thái** | Triển khai |

## Mục tiêu

Quản lý phân lead: lọc rõ (đặc biệt «Chưa gán»), chọn **cả phạm vi lọc** (số lượng lớn), giao việc **một TVV / chia đều / theo tải thấp nhất**, ghi Firestore theo lô (nhanh).

## Phạm vi

1. Lọc «Chưa gán» → fullScope (không chỉ trang 30).
2. Nút «Chọn tất cả theo bộ lọc» (tối đa `LEADS_UI_FULL_SCOPE_MAX`).
3. Modal giao việc: chế độ single / round-robin / lowest-load; hiện tải gần đúng; multi-chọn TVV.
4. `writeBatch` chunk ~400 + progress + partial error (giống gán nhãn).

## Không làm (lần này)

- Phân theo vùng/trường tự động.
- Cloud Function server-side distribute.
- Catalog TVV mới.
