# Hướng dẫn sử dụng — VietMy Admissions

Tài liệu ngắn gọn cho **tư vấn viên (TVV)**, **trưởng nhóm** và **quản trị**. Mỗi người chỉ thấy các mục menu mà tài khoản được phép.

---

## 1. Đăng nhập và menu chính

1. Mở địa chỉ web do nhà trường cung cấp.
2. Nhập **email** và **mật khẩu** → vào hệ thống.
3. Menu bên trái (hoặc biểu tượng menu trên điện thoại):

| Mục | Dùng để |
|-----|---------|
| **Tổng kết** | Xem số liệu chung, KPI, bảng điểm tháng, lịch sử gọi (tùy quyền). |
| **Hồ sơ** | Làm việc hàng ngày với danh sách thí sinh. |
| **Ngày của tôi** | KPI và việc cần làm trong ngày (TVV). |
| **Cài đặt** | Nhập liệu, danh mục, **tạo bộ chấm điểm**, nhân sự, gọi điện… (chủ yếu quản trị / trưởng nhóm). |

**Cổng kế toán** (thu, cọc, Full NE) đăng nhập riêng tại đường dẫn `/ke-toan` — không dùng chung với CRM tuyển sinh.

**Đăng xuất** khi rời máy, nhất là máy dùng chung.

---

## 2. Làm việc trên màn **Hồ sơ**

1. **Tìm hồ sơ** — gõ tên, số điện thoại, mã khách…
2. **Lọc** — nhãn ưu tiên, vùng, TVV, trạng thái…
3. **Bấm một dòng** — mở chi tiết: sửa thông tin, ghi chú, gọi điện, xem dòng thời gian.
4. **Chọn nhiều dòng** — đổi trạng thái, phân công, chạy AI (nếu được bật).

**Gọi điện:** trên chi tiết hồ sơ có nút gọi (máy tính + micro hoặc máy bàn). Cuộc gọi gắn với hồ sơ mới tính đúng KPI.

**Chia sẻ bộ lọc:** copy địa chỉ trên thanh trình duyệt sau khi lọc — người có quyền mở link sẽ thấy cùng bộ lọc.

---

## 3. Hai loại “điểm” — đừng nhầm

| Tên trên app | Ý nghĩa | Chỉnh ở đâu |
|--------------|---------|-------------|
| **Điểm thông tin %** | Hồ sơ điền đủ bao nhiêu % (tên, SĐT, ngành…). | Cài đặt → Chấm điểm → **Điểm thông tin** |
| **Bộ chấm điểm (profile)** | Cộng điểm theo quy tắc → nhãn **HOT / WARM / COLD** để ưu tiên xử lý. | Cài đặt → Chấm điểm → **Profile chấm điểm** |

Phần dưới tập trung vào **bộ chấm điểm (profile)**.

---

## 4. Tạo bộ chấm điểm (profile)

**Ai được tạo / sửa?**

- **Quản trị:** tạo bộ dùng cho cả trường, đặt bộ **mặc định** khi nhập Excel.
- **Trưởng nhóm:** tạo bộ cho nhóm TVV mình quản lý.
- **TVV:** thường **không** tạo bộ — chỉ **chọn bộ** có sẵn trên màn Hồ sơ.

**Đường đi:** **Cài đặt** → nhóm **Chấm điểm** → **Profile chấm điểm**.

### Các bước tạo mới

1. Bấm **+ Tạo** (góc trên bên phải khu soạn thảo).
2. Đặt **Tên** (ví dụ: *Ưu tiên ngành CNTT 2026*), **Mô tả** ngắn (tùy chọn).
3. Chỉnh **ngưỡng nhãn:**
   - **HOT** — từ bao nhiêu điểm trở lên (ví dụ ≥ 80).
   - **WARM** — từ bao nhiêu điểm (ví dụ ≥ 50); dưới ngưỡng WARM là **COLD**.
4. **Kéo quy tắc** từ cột **Thư viện** (bên trái) sang **khung giữa** (canvas):
   - Mỗi khối = một nhóm tiêu chí (vùng, ngành, nguồn lead…).
   - Trong khối chỉnh điều kiện và điểm cộng.
5. (Tùy chọn) Bấm **Toàn màn** nếu màn hình chật.
6. Bấm **Lưu profile** — chờ thông báo đã lưu.

**Mẹo:** Có thể tạo thêm mẫu riêng ở **Quy tắc mẫu**, rồi kéo vào profile. Profile **mặc định** (ô tick “mặc định import”) chỉ quản trị đặt — dùng khi nhập file Excel hàng loạt.

**Sau khi lưu:** quay màn **Hồ sơ** và chọn đúng tên bộ vừa tạo (mục 5).

---

## 5. Áp dụng profile trên danh sách hồ sơ

Đây là bước TVV và quản lý dùng **mỗi ngày**.

1. Vào **Hồ sơ**.
2. Mở khối **Bộ chấm điểm** (đầu trang, có thể bấm mũi tên để mở rộng).
3. Ở ô **Chọn profile** — chọn bộ cần dùng (tên + ngưỡng HOT/WARM hiện bên cạnh).

**Ngay sau khi chọn:**

- Cột **điểm** và **nhãn HOT / WARM / COLD** trên bảng **tính lại theo bộ đó**.
- Nút lọc nhanh HOT / WARM / COLD cũng theo bộ đang chọn.
- Bấm **Quy tắc** để xem tóm tắt bộ hiện tại (không cần vào Cài đặt).

**Lưu ý quan trọng:**

- Việc chọn bộ trên danh sách chủ yếu đổi cách **bạn đang xem và lọc** trên màn hình.
- Nhãn **đã lưu sẵn** trong từng hồ sơ chỉ đổi hẳn khi bạn **cập nhật / lưu** hồ sơ (hoặc thao tác ghi đè nhãn nếu có).
- Trình duyệt **nhớ** bộ bạn chọn lần trước trên cùng máy — đổi máy hoặc xóa dữ liệu trình duyệt thì chọn lại.

**Nếu báo “chưa có quy tắc”:** vào **Cài đặt → Profile chấm điểm**, kéo thêm quy tắc vào khung giữa rồi **Lưu profile**.

**Nếu danh sách profile trống:** nhờ quản trị hoặc trưởng nhóm tạo bộ trước.

---

## 6. Các màn khác (tóm tắt)

### Tổng kết

Một chỗ gom: tổng quan trường/nhóm, KPI & nhân sự, bảng điểm tháng, lịch sử gọi, vận hành ngày — tùy quyền từng tab.

### Ngày của tôi

TVV xem KPI hôm nay, việc cần làm.

### Cài đặt — nhóm chính

| Nhóm | Việc thường làm |
|------|------------------|
| **Dữ liệu** | Nhập Excel, danh mục chung (vùng, ngành…), mẫu hồ sơ tuyển sinh. |
| **Chấm điểm** | Profile chấm điểm, điểm thông tin %, quy tắc mẫu. |
| **KPI & Nhân sự** | Quy tắc KPI, thêm/sửa nhân sự, phân quyền. |
| **Tích hợp** | Kịch bản tư vấn, tri thức, AI, **cấu hình gọi điện**. |

Chi tiết KPI gọi điện, cọc, thưởng tháng: xem **[HUONG-DAN-KPI-SALE.md](./HUONG-DAN-KPI-SALE.md)**.

---

## 7. Gặp sự cố — làm gì?

| Tình huống | Việc nên làm |
|------------|----------------|
| Không đăng nhập được | Kiểm tra email/mật khẩu; liên hệ quản trị mở tài khoản. |
| Không thấy menu Cài đặt | Báo quản trị cấp quyền phù hợp vai trò. |
| Chọn profile nhưng điểm = 0 / không đổi nhãn | Kiểm tra bộ đã có quy tắc chưa; hồ sơ thiếu dữ liệu (SĐT, ngành…) thì quy tắc không cộng điểm. |
| Lịch sử gọi báo thiếu index | Bấm link **Tạo index** trên màn hình (quản trị) hoặc chạy `npm run deploy:firestore-indexes` — chờ vài phút. |
| Gọi điện không được | Kiểm tra **Cài đặt → Tích hợp → Gọi điện** đã bật và TVV đã gán số máy lẻ. |

---

## 8. Thói quen nên nhớ

1. Làm việc trên **Hồ sơ** → chọn đúng **bộ chấm điểm** trước khi lọc HOT/WARM.
2. Sửa hồ sơ xong → đợi thông báo **đã lưu** rồi mới chuyển trang.
3. Danh sách dài → bấm **Tải thêm** (nếu có) trước khi kết luận tổng số.
4. **Điểm thông tin %** và **profile HOT/WARM** là hai thước đo khác nhau — không thay thế cho nhau.

---

*Tài liệu theo giao diện hiện tại. Nhãn nút có thể chỉnh nhẹ theo trường; luồng chính: **đăng nhập → Hồ sơ → chọn bộ chấm điểm → lọc / gọi / cập nhật hồ sơ**.*
