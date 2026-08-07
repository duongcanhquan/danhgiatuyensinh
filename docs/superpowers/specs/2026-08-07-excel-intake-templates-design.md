# Thiết kế — Nhiều mẫu nhập Excel hồ sơ

| Thuộc tính | Giá trị |
|------------|---------|
| **Mã** | `DES-INTAKE-TPL-2026-08` |
| **Ngày** | 2026-08-07 |
| **Trạng thái** | Triển khai |

## Mục tiêu

- Giữ **Mẫu 1** (20 cột quy chuẩn) như hiện tại.
- Thêm **Mẫu 2** (rút gọn): Họ tên, Giới tính, Ngày sinh, Trường học, Điện thoại, Email, Địa chỉ, Điểm tốt nghiệp.
- Kiến trúc mở để sau thêm Mẫu 3–4 mà không phá luồng cũ.
- **Hàng 1 = tiêu đề cột; dữ liệu từ hàng 2.**

## Cách làm

Registry `leadIntakeTemplates` + chọn mẫu trên màn Nhập liệu trước khi tải mẫu / parse file. Parser dùng alias theo mẫu (và alias chung). Field mới: `gender`, `studentEmail` trên Lead khi có.

## Không làm

- Không thay thế/xóa Mẫu 1.
- Không UI map cột kéo thả (phase sau nếu cần).
