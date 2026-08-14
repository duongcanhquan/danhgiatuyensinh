# Import Sheet Apps Script + TVV (Excel)

## Thứ tự làm (bắt buộc)

1. **Nhập tư vấn viên trước** — Cài đặt → **Dữ liệu → Nhập tư vấn viên**
2. **Xuất Sheet cũ** — Google Sheet `DU_LIEU_SINH_VIEN` → Tải về `.xlsx` (giữ thứ tự cột, data từ dòng 3)
3. **Nhập hồ sơ** — Cài đặt → Dữ liệu → Nhập liệu → **Mẫu 3 — Sheet Apps Script (71 cột)** → chọn file → đặt tên đợt → Xác nhận

## Excel tư vấn viên

Cột:

| Cột | Bắt buộc | Ghi chú |
|---|---|---|
| **Tên hiển thị** | Có | Hiện trên hệ thống + map cột TVV Sheet cũ (index 18) |
| Email | Có | Tài khoản đăng nhập |
| Mật khẩu | Nên có | Mặc định tạm `DoiMatKhau@123` nếu trống |
| Vai trò | Không | Mặc định `counselor` (TVV) |
| Số nội bộ OMICall | Không | Tuỳ chọn |

Tải mẫu trên tab **Nhập tư vấn viên**.

## Excel hồ sơ Sheet cũ (Mẫu 3)

- **71 cột** (index 0–70) — đúng schema Apps Script.
- Parse **theo vị trí cột** (không cần khớp tên header).
- Data bắt đầu **dòng 3**.
- Map: hồ sơ + TVV + bố/mẹ/giám hộ + 5 đợt tiền/bill/duyệt/ngày + Full NE + nguồn + HB + folder giấy mời + điểm (cột 43).
- Cột TVV (index 18) khớp **Tên hiển thị** nhân sự (không dấu cũng được).
- Trùng SĐT / CCCD → bỏ qua.
- TVV không khớp → gán Admin chờ điều phối.
- «Tải mẫu đang chọn» = file hướng dẫn + hàng tiêu đề đủ 71 cột + sheet «Danh sách cột».

Chi tiết cột: [`APPSCRIPT-LEGACY-LOGIC-REFERENCE.md`](./APPSCRIPT-LEGACY-LOGIC-REFERENCE.md) §3.
