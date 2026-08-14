# Import Sheet Apps Script + TVV (Excel)

## Thứ tự làm (bắt buộc)

1. **Nhập tư vấn viên trước** — Cài đặt → Nhân sự → **Nhập Excel tư vấn viên**
2. **Xuất Sheet cũ** — Google Sheet `DU_LIEU_SINH_VIEN` → Tải về `.xlsx` (giữ thứ tự cột, data từ dòng 3)
3. **Nhập hồ sơ** — Cài đặt → Nhập liệu → mẫu **«Sheet Apps Script (70 cột)»** → chọn file → đặt tên đợt → Xác nhận

## Excel tư vấn viên

Cột:

| Cột | Bắt buộc | Ghi chú |
|---|---|---|
| **Tên hiển thị** | Có | Hiện trên hệ thống + map cột TVV Sheet cũ |
| Email | Có | Tài khoản đăng nhập |
| Mật khẩu | Nên có | Mặc định tạm `DoiMatKhau@123` nếu trống |
| Vai trò | Không | Mặc định `counselor` (TVV) |
| Số nội bộ OMICall | Không | Tuỳ chọn |

Tải mẫu trên UI Nhân sự.

## Excel hồ sơ Sheet cũ

- Parse **theo vị trí cột** (không cần khớp tên header).
- Map: hồ sơ + 5 đợt tiền/bill/duyệt/ngày + Full NE + nguồn + folder giấy mời.
- Cột TVV (index 18) khớp **Tên hiển thị** nhân sự (không dấu cũng được).
- Trùng SĐT / CCCD → bỏ qua.
- TVV không khớp → gán Admin chờ điều phối.

Chi tiết cột: [`APPSCRIPT-LEGACY-LOGIC-REFERENCE.md`](./APPSCRIPT-LEGACY-LOGIC-REFERENCE.md) §3.
