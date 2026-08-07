# Thiết kế — Chương trình / đợt nhập hồ sơ

| Thuộc tính | Giá trị |
|------------|---------|
| **Mã** | `DES-INTAKE-PROG-2026-08` |
| **Ngày** | 2026-08-07 |
| **Trạng thái** | Triển khai |

## Mục tiêu

Mỗi lần upload Excel gắn **chương trình** (đợt / chiến dịch tư vấn) để lọc và xử lý riêng. Hồ sơ cũ: trống = chưa phân loại; gán hàng loạt sau.

## Schema

- `leads.intakeProgram?: string` (nhãn tiếng Việt, trim)
- Không thay `uploadBatchId` (mã kỹ thuật từng file)

## UI

1. Nhập liệu: ô «Chương trình» trước khi xác nhận nhập (bắt buộc khi commit).
2. Hồ sơ: lọc «Chương trình» (+ «Chưa gắn»).
3. Chọn nhiều → gán chương trình hàng loạt.

## Sau này (không chặn)

Catalog master `intake_programs` nếu cần danh mục cố định.
