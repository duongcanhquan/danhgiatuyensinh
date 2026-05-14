# Hướng dẫn sử dụng — VietMy Admissions

Tài liệu này giúp **mọi người trong trường** dùng hệ thống quản lý tuyển sinh / CRM hồ sơ một cách đơn giản. Một số màn hình chỉ hiện khi tài khoản của bạn **đủ quyền** (do quản trị cấu hình trên Firebase).

---

## 1. Bắt đầu

### Đăng nhập

1. Mở địa chỉ web mà nhà trường cung cấp (ứng dụng chạy trên trình duyệt).
2. Vào trang **Đăng nhập**, nhập **email** và **mật khẩu** do quản trị cấp.
3. Sau khi đăng nhập thành công, bạn vào **Bảng điều khiển**; menu nằm trên cùng (máy tính) hoặc trong biểu tượng **menu** (điện thoại).

### Đăng xuất

- Ở góc trên: chọn **Đăng xuất** để kết thúc phiên làm việc (nhất là khi dùng máy dùng chung).

### Nếu không đăng nhập được

- Kiểm tra đúng email/mật khẩu, mạng ổn định.
- Nếu báo tài khoản không tồn tại hoặc bị khóa: **liên hệ quản trị** để được tạo tài khoản hoặc mở lại quyền.

---

## 2. Vai trò và quyền xem menu

Hệ thống có các vai trò chính (tên hiển thị trên góc màn hình sau khi đăng nhập):

| Vai trò (gợi ý) | Thường được dùng để |
|-----------------|---------------------|
| **Tư vấn viên** | Làm việc với hồ sơ được giao, pipeline CRM, ghi chú / cuộc gọi. |
| **Trưởng ngành** | Xem phạm vi ngành, bảng điều khiển phù hợp, phân tích (nếu được cấp). |
| **Trưởng khoa** | Xem phạm vi khoa, bảng điều khiển phù hợp, phân tích (nếu được cấp). |
| **Quản trị / Hiệu trưởng** | Toàn bộ cấu hình, nhập liệu, nhân sự, dữ liệu master, v.v. |

**Lưu ý:** Bạn chỉ thấy các mục menu mà tài khoản được phép. Nếu thiếu mục cần cho công việc, báo quản trị để điều chỉnh quyền trên hệ thống.

---

## 3. Các màn hình chính (theo menu)

### 3.1. Bảng điều khiển (`/`)

- Tổng quan số liệu hồ sơ đã tải về máy trình duyệt (có thể có nút **Tải thêm** nếu danh sách lớn).
- Biểu đồ giúp nắm nhanh tình hình pipeline, mức độ ưu tiên (HOT / WARM / COLD), v.v.
- **Gợi ý:** Dùng để họp nhanh hoặc xem xu hướng; chi tiết từng hồ sơ vào menu **Hồ sơ** (`/leads`).

### 3.2. Hồ sơ (`/leads`)

Một màn CRM duy nhất cho mọi vai trò được phép:

- Tìm kiếm URL (`q`), lọc (khu vực, TVV, nhãn, funnel, nguồn, … tùy quyền), phân trang / tải theo server khi cần, bulk, AI miner, panel chi tiết (funnel, ghi chú, chấm điểm…).
- Đường dẫn cũ `/counselor` tự chuyển về `/leads`.

**Gợi ý:** Mở sẵn panel chi tiết một hồ sơ bằng `?open=<id>` trên URL.

### 3.3. Nhập liệu Excel (`/import`)

Thường dành cho **quản trị / phòng tuyển sinh** có quyền nhập liệu.

1. Tải **file mẫu** chuẩn (nếu có nút tải mẫu).
2. Điền dữ liệu theo cột hướng dẫn, lưu file.
3. **Tải file lên**, xem **bản xem trước** (trùng lặp, cập nhật / bỏ qua tùy chọn).
4. Xác nhận **nhập vào hệ thống**.

**Lưu ý:** Hệ thống có thể tự phân công TVV theo tải công việc (tùy cấu hình). Nếu thiếu quyền hoặc lỗi, liên hệ quản trị.

### 3.4. Phân tích nâng cao (`/analytics`)

- Báo cáo / biểu đồ sâu hơn so với bảng điều khiển (nếu tài khoản được mở quyền **Phân tích nâng cao**).

### 3.5. Phòng thử AI (`/ai`)

- Thử các tính năng gợi ý / AI (nếu được bật quyền **ai:use**).
- Nội dung cụ thể phụ thuộc cấu hình nhà trường.

### 3.6. Quản lý nhân sự (`/staff`)

- Quản lý tài khoản người dùng, vai trò (chỉ **quản trị** hoặc tài khoản được cấp quyền tương đương).

### 3.7. Cấu hình dữ liệu (`/settings`)

Thường do **quản trị** sử dụng:

- **Danh mục dữ liệu** (vùng, ngành, nguồn, …) dùng chung cho form và nhập liệu.
- **Chấm điểm / hồ sơ tuyển sinh**, **kịch bản tư vấn**, **kho tri thức**, **cấu hình AI / LLM** — tùy tab hiển thị.

Người dùng thông thường **không cần** vào đây trừ khi được giao nhiệm vụ cấu hình.

---

## 4. Thói quen nên nhớ

1. **Lưu ý “đã tải / chưa tải hết”:** Danh sách hồ sơ có thể chia trang; nếu có nút **Tải thêm**, bấm để lấy thêm dữ liệu trước khi kết luận tổng số.
2. **Dữ liệu thời gian thực:** Thay đổi trên Pipeline hoặc form hồ sơ được ghi nhận trên server; nên đợi thông báo thành công (toast) rồi mới chuyển trang nếu vừa thao tác quan trọng.
3. **Điện thoại / máy tính bảng:** Menu chính nằm trong biểu tượng menu góc trên; vuốt mở để chọn màn hình.

---

## 5. Ai hỗ trợ khi gặp sự cố?

| Vấn đề | Liên hệ |
|--------|---------|
| Quên mật khẩu / không đăng nhập được | Quản trị hệ thống / phòng CNTT |
| Thiếu menu hoặc không sửa được hồ sơ | Quản trị (điều chỉnh quyền vai trò) |
| Sai dữ liệu sau khi import Excel | Phòng tuyển sinh + quản trị (kiểm tra file mẫu và quy tắc trùng) |
| Lỗi “không có quyền” / permission denied | Quản trị (Firestore Rules và quyền user) |

---

*Tài liệu mô tả theo phiên bản ứng dụng tại thời điểm biên soạn. Một số nhãn nút hoặc luồng có thể được nhà trường tùy chỉnh nhẹ; phần lõi: **Đăng nhập → chọn menu → lọc/tìm → thao tác trên hồ sơ hoặc pipeline**.*
