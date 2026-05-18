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

Mỗi dòng dưới đây là **một mục trên menu** sau khi đăng nhập (tên có thể khác tùy nhà trường; nếu không thấy mục cần dùng, báo quản trị).

### 3.1. Bảng điều khiển (`/`)

- Tổng quan số liệu hồ sơ đã tải về máy trình duyệt (có thể có nút **Tải thêm** nếu danh sách lớn).
- Biểu đồ giúp nắm nhanh tình hình pipeline, mức độ ưu tiên (HOT / WARM / COLD), v.v.
- **Gợi ý:** Dùng để họp nhanh hoặc xem xu hướng; chi tiết từng hồ sơ vào menu **Hồ sơ** (`/leads`).

### 3.2. Hồ sơ (`/leads`)

Màn làm việc chính với danh sách thí sinh / CRM. Bạn sẽ thấy lần lượt:

1. **Ô tìm kiếm** — gõ tên, số điện thoại, mã KH, tỉnh… (có thể dùng chung với các lọc bên dưới).
2. **Hàng lọc** — nhãn ưu tiên, vùng, hệ đào tạo, funnel tuyển sinh, tình trạng tư vấn, nguồn, trường, TVV… (tùy quyền, có thể không đủ tất cả).
3. **Bảng hồ sơ** — bấm một dòng để mở **chi tiết** (ghi chú, lịch sử, chấm điểm, gợi ý AI…).
4. **Thanh thao tác hàng loạt** (khi tick chọn dòng) — đổi tình trạng, phân công, chạy AI trên nhiều hồ sơ, v.v.

**Chia sẻ hoặc lưu lại đúng bộ lọc:** copy **địa chỉ trên thanh trình duyệt** sau khi chỉnh lọc — người nhận mở link sẽ thấy cùng trạng thái (nếu có quyền xem dữ liệu đó).

**Nút ⚡ «AI Shortlist»** chỉ **thu hẹp danh sách** tới những hồ sơ đã được AI phân tích (có **tia sét vàng** cạnh tên). Nút này **không** gọi AI. Muốn có tia sét: chọn nhãn **WARM** → tick hồ sơ → thanh dưới → **Chạy AI Phân tích (Shortlist)** → đọc cửa sổ kiểm tra → **Chạy AI** → chờ xong. Trước đó cần **lưu khóa API** trong **Cài đặt → LLM → API** trên **chính trình duyệt này**, và tài khoản được **phép dùng AI** (Quản lý nhân sự bật trong hồ sơ nhân viên). Nếu bật ⚡ mà bảng trống: thường là chưa ai chạy bước phân tích — **không phải lỗi giao diện**.

**Mở nhanh một hồ sơ:** nếu được hỗ trợ, địa chỉ trang có thể có thêm phần mở sẵn chi tiết (hỏi quản trị hoặc xem link mẫu nhà trường gửi).

Đường dẫn cũ `/counselor` tự chuyển về `/leads`.

### 3.3. Nhập liệu Excel (`/import`)

Thường dành cho **quản trị / phòng tuyển sinh** có quyền nhập liệu.

1. Tải **file mẫu** chuẩn (nếu có nút tải mẫu).
2. Điền dữ liệu theo cột hướng dẫn, lưu file.
3. **Tải file lên**, xem **bản xem trước** (trùng lặp, cập nhật / bỏ qua tùy chọn).
4. Xác nhận **nhập vào hệ thống**.

**Lưu ý:** Hệ thống có thể tự phân công TVV theo tải công việc (tùy cấu hình). Nếu thiếu quyền hoặc lỗi, liên hệ quản trị.

### 3.4. Phân tích nâng cao (`/analytics`)

- Báo cáo / biểu đồ sâu hơn so với bảng điều khiển (nếu tài khoản được mở quyền **Phân tích nâng cao**).

### 3.5. KPI Sale (hiệu suất TVV & cuộc gọi)

Dành cho TVV và quản lý theo dõi **gọi điện, chuyển đổi nhãn, cọc và doanh thu đã duyệt**. Chi tiết đầy đủ: **[HUONG-DAN-KPI-SALE.md](./HUONG-DAN-KPI-SALE.md)**.

| Màn hình | Đường dẫn | Ai dùng |
|----------|-----------|---------|
| **Ngày của tôi** | `/my-day` | TVV — KPI cá nhân hôm nay |
| **Điều hành** | `/command` | Trưởng nhóm / quản trị — bảng TVV theo ngày + cảnh báo |
| **KPI kỳ** | `/kpi` | TVV / quản lý — 7 hoặc 30 ngày |
| **Bảng điểm tháng** | `/scorecard` | Quản lý — điểm tháng + hạng thưởng |

**Gọi hợp lệ (HL):** ≥ thời lượng cấu hình (mặc định 45 giây), gắn mã hồ sơ, không trùng lead trong vài giờ — **phải gọi từ nút OMICall trên hồ sơ**.

**Cấu hình linh hoạt:** **Cài đặt → KPI Sale** (`/settings?tab=kpi`) — ngưỡng HL, cảnh báo spam/chưa cọc, công thức điểm tháng, hạng Vàng/Bạc/Đồng, chuỗi duyệt kế toán. Cần quyền cấu hình chấm điểm.

**Khác** điểm % trên bảng hồ sơ (độ đầy dữ liệu) và profile HOT/WARM (ưu tiên lead).

Trên **chi tiết hồ sơ**, tab **Dòng thời gian** gộp cuộc gọi OMICall + CRM + audit để đối chiếu KPI.

### 3.6. Phòng thử AI

- Nằm trong **Cài đặt** (tab **Phòng thử AI**), dùng để **chat thử** với AI sau khi đã lưu khóa API — không ghi lên hồ sơ.
- Chỉ tài khoản được **phép dùng AI** mới vào được (quản lý bật trong Quản lý nhân sự; Siêu quản trị luôn được).

### 3.7. Quản lý nhân sự (`/staff`)

- Quản lý tài khoản người dùng, vai trò (chỉ **quản trị** hoặc tài khoản được cấp quyền tương đương).

### 3.8. Cấu hình dữ liệu (`/settings`)

Thường do **quản trị** sử dụng:

- **Danh mục dữ liệu** (vùng, ngành, nguồn, …) dùng chung cho form và nhập liệu.
- **Chấm điểm** — trong tab này có hai phần: **Điểm thông tin** (cấu hình % đầy dữ liệu tĩnh trên hồ sơ: điểm nền + các dòng tiêu chí bật và khớp, rồi kẹp min–max %) và **Profile chấm điểm** (HOT/WARM, thử JSON); hai thước đo độc lập. Mặc định bật bộ tiêu chí «lõi» (danh tính, liên hệ, địa lý, trường/hệ…); các tiêu chí như nguồn lead, ngành quan tâm, học lực, lớp, mô tả dài… **mặc định tắt** — có thể bật và chỉnh điểm trong bảng quy tắc; cột «Cách đánh giá» trong app mô tả điều kiện khớp cố định cho từng `id`. Ngoài ra còn tab **KPI Sale** (gọi HL, cảnh báo điều hành, điểm tháng — xem [HUONG-DAN-KPI-SALE.md](./HUONG-DAN-KPI-SALE.md)), **kịch bản tư vấn**, **kho tri thức**, **cấu hình AI / LLM** — tùy tab hiển thị.

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
| Lỗi “không có quyền” / không truy cập được | Quản trị (kiểm tra vai trò và quyền tài khoản) |

---

*Tài liệu mô tả theo phiên bản ứng dụng tại thời điểm biên soạn. Một số nhãn nút hoặc luồng có thể được nhà trường tùy chỉnh nhẹ; phần lõi: **Đăng nhập → chọn menu → lọc/tìm → thao tác trên hồ sơ hoặc pipeline**.*
