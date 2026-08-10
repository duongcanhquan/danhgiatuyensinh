# Quản lý trường — chia tab

**Ngày:** 2026-08-10  
**Trạng thái:** Đã duyệt (user: «ok làm đi rồi commit», hướng 3)

## Mục tiêu

Bỏ trang kéo dài; chia thao tác thành tab dễ nhìn.

## Thiết kế

### Tab chính (`TabStrip`)

| Tab | Nội dung |
|-----|----------|
| **Danh sách** | Stats + danh sách trường (Sửa / Xóa / …). Bấm **Sửa** chọn trường + chuyển sang ngữ cảnh sửa. |
| **Tạo trường** | Form tạo trường mới. |
| **Nhật ký** | Audit nền tảng. |

### Khi đang sửa trường

Hiện khối «Đang sửa: {tên}» + **tab phụ**:

| Tab phụ | Nội dung |
|---------|----------|
| **Thông tin** | Tên, slug, ghi chú, Lưu |
| **Phân quyền** | Module Admin trường |
| **Quản lý** | List admin, thêm/sửa/xóa |

Nút **Đóng** / chọn trường khác từ Danh sách thoát hoặc đổi ngữ cảnh sửa.

URL (tuỳ chọn nhẹ): `?tab=list|create|audit` — nếu dễ; không bắt buộc deep-link sub-tab.

## Ngoài phạm vi

Đổi logic soft-delete / service; chỉ UI layout.
