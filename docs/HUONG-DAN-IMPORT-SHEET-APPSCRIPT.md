# Import Sheet Apps Script + TVV (Excel)

## Thứ tự làm (bắt buộc)

1. **Nhập tư vấn viên trước** — Cài đặt → **Dữ liệu → Nhập tư vấn viên**
2. Chuẩn bị danh mục (tuỳ chọn nhưng nên làm trước):
   - **Học bổng** — Cài đặt → Dữ liệu → Danh mục hồ sơ → **Học bổng** (tên khớp cột HB Sheet)
   - **Cơ sở & niên khóa** — tab **Cơ sở & niên khóa** (hoặc để import tự thêm vào danh mục)
3. **Xuất Sheet cũ** — Google Sheet `DU_LIEU_SINH_VIEN` → Tải về `.xlsx` (giữ thứ tự cột, data từ dòng 3)
4. **Nhập hồ sơ** — Cài đặt → Dữ liệu → Nhập liệu → **Mẫu 3 — Sheet Apps Script (71 cột)** → chọn file → đặt tên đợt → Xác nhận

## Excel tư vấn viên

| Cột | Bắt buộc | Ghi chú |
|---|---|---|
| **Tên hiển thị** | Có | Map cột TVV Sheet cũ (index 18) |
| Email | Có | Tài khoản đăng nhập |
| Mật khẩu | Nên có | Mặc định tạm `DoiMatKhau@123` nếu trống |
| Vai trò | Không | Mặc định `counselor` (TVV) |
| Số nội bộ OMICall | Không | Tuỳ chọn |

## Excel hồ sơ Sheet cũ (Mẫu 3)

- **71 cột** (index 0–70), parse theo **vị trí**, data từ **dòng 3**.
- Map: hồ sơ + TVV + bố/mẹ + 5 đợt thu + Full NE + nguồn.
- **Cơ sở** (19) / **Niên khóa** (13) → field hồ sơ + tự bổ sung danh mục Cài đặt.
- **HB1** (29) / **HB2** (69) → khớp tên với danh mục Học bổng → `scholarship1Id`/`2Id`. Không khớp → ghi chú trên hồ sơ (sửa tay hoặc bổ sung HB rồi import lại / chỉnh form).
- TVV (18) khớp **Tên hiển thị**. Trùng SĐT/CCCD → bỏ qua.

Chi tiết cột: [`APPSCRIPT-LEGACY-LOGIC-REFERENCE.md`](./APPSCRIPT-LEGACY-LOGIC-REFERENCE.md) §3.

## Chỉnh sửa sau import

| Trường | Ở đâu sửa danh mục | Ở đâu sửa trên hồ sơ |
|---|---|---|
| Học bổng | Danh mục hồ sơ → Học bổng | Tab Học Bổng |
| Cơ sở học | Danh mục hồ sơ → Cơ sở & niên khóa | Tab Hồ sơ học tập |
| Niên khóa | Danh mục hồ sơ → Cơ sở & niên khóa | Tab Hồ sơ học tập |
| Hệ đào tạo | Danh mục hồ sơ → Hệ đào tạo | Tab Nguyện vọng |
