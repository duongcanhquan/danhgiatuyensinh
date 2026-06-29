# Hướng dẫn KPI Sale & đánh giá TVV

Tài liệu dành cho **tư vấn viên (TVV)**, **trưởng nhóm** và **quản trị** — mô tả cách đọc số liệu, các màn hình KPI và cách cấu hình quy tắc đánh giá linh hoạt.

---

## 1. KPI Sale là gì?

Hệ thống tổng hợp hiệu suất làm việc của TVV từ:

| Nguồn | Ví dụ chỉ số |
|-------|----------------|
| **OMICall** (tổng đài) | Tổng gọi, gọi hợp lệ (HL), bắt máy, phút nói, ghi âm |
| **CRM** (thao tác trên hồ sơ) | Ghi chú, đổi trạng thái, phân công, chạy AI |
| **Sự kiện lead** | WARM+ / HOT+ (đổi nhãn), NEW→Quan tâm, cọc, nhập học |
| **Kế toán duyệt** | Cọc, học phí, doanh thu đã duyệt, Full NE |

Dữ liệu ngày lưu tại `kpiDaily`; tháng gộp tại `kpiMonthly`. Cloud Functions đồng bộ khoảng **15 phút/lần** (sau cuộc gọi OMICall và job lên lịch).

**Khác với:**

- **Điểm thông tin %** trên bảng hồ sơ → đo độ đầy dữ liệu tĩnh (Cài đặt → Điểm thông tin).
- **Profile HOT/WARM/COLD** → chấm ưu tiên hồ sơ, không phải KPI doanh số/ngày.

---

## 2. Các màn hình KPI (menu & điều hướng)

Thanh phụ **KPI Sale** xuất hiện trên các trang KPI (chuyển nhanh giữa các màn).

| Màn hình | Đường dẫn | Ai thường dùng | Mục đích |
|----------|-----------|----------------|----------|
| **Ngày của tôi** | `/my-day` | TVV | KPI cá nhân hôm nay, nhắc việc |
| **Điều hành** | `/command` | Trưởng nhóm / quản trị | Bảng TVV theo ngày + cảnh báo |
| **KPI kỳ** | `/kpi` | TVV / quản lý | Tổng hợp 7 hoặc 30 ngày |
| **Bảng điểm tháng** | `/scorecard` | Quản lý | Điểm tháng + hạng Vàng/Bạc/Đồng |

**Menu chính:** TVV thấy **Ngày của tôi**; quản lý thấy **Điều hành**. Các màn còn lại mở qua thanh KPI Sale hoặc nút trên «Ngày của tôi».

---

## 3. Cách đọc chỉ số quan trọng

### 3.1. Gọi hợp lệ (HL)

Một cuộc gọi được tính **HL** khi:

1. Gắn **mã hồ sơ** (gọi từ nút OMICall trên hồ sơ — không gọi tay ngoài CRM).
2. Thời lượng **≥ ngưỡng giây** (mặc định 45s, lấy `bill_sec` hoặc `answer_sec`).
3. **Không trùng** cùng TVV + cùng lead trong cửa sổ (mặc định 4 giờ).

Cột **HL** trên bảng = số cuộc thỏa ba điều kiện. **Tổng gọi** có thể cao hơn nhiều nếu gọi ngắn / không gắn hồ sơ.

### 3.2. WARM+ / HOT+

Đếm **lần đầu chuyển nhãn trong ngày** trên mỗi hồ sơ (tránh cộng trùng khi bật/tắt nhãn nhiều lần):

- **WARM+:** lần đầu trong ngày chuyển **sang WARM** (không tính từ HOT).
- **HOT+:** lần đầu trong ngày chuyển **sang HOT** (kể cả từ WARM).

Đổi nhãn sau **bảng đánh giá gọi** (Rất quan tâm / Sẵn sàng…) cũng được ghi vào WARM+/HOT+ nếu nhãn hồ sơ thực sự tăng.

### 3.3. Cọc & doanh thu

Chỉ tính sau khi kế toán **duyệt** (mặc định trạng thái «ĐỒNG Ý»). TVV cập nhật hồ sơ chưa đủ — phải chờ kế toán.

### 3.4. Cảnh báo trên Điều hành (theo ngày)

Ưu tiên hiển thị **một** cảnh báo / TVV / ngày:

1. **Nghi spam** — nhiều gọi nhưng tỷ lệ HL thấp.
2. **Chưa cọc** — rất nhiều gọi nhưng chưa có cọc duyệt.
3. **Bắt máy thấp** — tỷ lệ bắt máy dưới ngưỡng.

Ngưỡng và nhãn chỉnh tại **Cài đặt → KPI Sale**.

### 3.5. Điểm tháng & hạng thưởng

**Điểm tháng (KPI%)** trên Bảng điểm = **4 trụ** (mặc định, chỉnh trong Cài đặt → KPI Sale):

| Trụ | Trọng số mặc định | Gồm |
|-----|-------------------|-----|
| Gọi | 40% | HL, lead chạm, chất lượng (tỷ lệ HL / bắt máy) |
| Chuyển đổi | 30% | WARM+/HOT+, NEW→Quan tâm, thao tác CRM |
| Tuân thủ | 10% | Cảnh báo tự động + điểm trưởng nhóm nhập tay |
| Nhập học | 20% | Cọc duyệt, ghi danh / Full NE, doanh thu |

**Hạng Vàng/Bạc/Đồng** mặc định theo **điểm KPI tháng** (percentile trong phạm vi). Có thể chuyển sang xếp hạng theo doanh thu trong Cài đặt.

*(Phần điểm cap cũ trong tài liệu kỹ thuật chỉ còn tham khảo — UI dùng 4 trụ.)*

---

## 4. Hướng dẫn từng vai trò

### TVV — Ngày của tôi

1. Mở **Ngày của tôi** sau khi làm việc.
2. Xem HL, WARM+/HOT+, CRM, cọc, doanh thu hôm nay.
3. **Luôn gọi từ hồ sơ** (nút OMICall) để HL được tính.
4. Sau cuộc gọi: cập nhật ghi chú + tình trạng trên hồ sơ.
5. **KPI 7/30 ngày:** nút cuối trang hoặc KPI Sale → **KPI kỳ**.

### Trưởng nhóm — Điều hành

1. Mở **Điều hành**, chọn **ngày báo cáo** (họp sáng/chiều).
2. Đọc bảng TVV: HL, lead chạm, W+/H+, cọc, tiền duyệt.
3. Chú ý cột **⚠** — coaching sớm (spam / chưa cọc / bắt máy).
4. So sánh kỳ dài: **KPI kỳ** (7/30 ngày), lọc team/TVV.

### Quản trị — Bảng điểm & cấu hình

1. **Bảng điểm tháng:** chọn tháng, xem điểm + hạng thưởng.
2. **Cài đặt → KPI Sale:** chỉnh ngưỡng HL, cảnh báo, công thức điểm, hạng %, chuỗi kế toán → **Lưu**.
3. Đợi job đồng bộ (~15 phút) để server áp dụng cho HL mới và hạng tháng.
4. Đảm bảo OMICall webhook + Cloud Functions đã deploy (xem tài liệu kỹ thuật / quản trị CNTT).

---

## 5. Cài đặt KPI Sale (`/settings?tab=kpi`)

**Quyền:** thường cần `config:scoring_rules` (cùng nhóm cấu hình chấm điểm).

| Khối cài đặt | Tác dụng |
|--------------|----------|
| **Cuộc gọi HL** | Giây tối thiểu, cửa sổ không trùng lead (giờ) |
| **Cảnh báo** | Ngưỡng + nhãn spam / chưa cọc / bắt máy thấp |
| **Điểm tháng** | Trần từng nhóm, mục tiêu HL, hệ số điểm |
| **Hạng thưởng** | % top Vàng/Bạc/Đồng + nhãn hiển thị |
| **Kế toán** | Chuỗi «ĐỒNG Ý», «ĐÃ FULL NE» (khớp chính xác) |

- **Xem trước điểm:** ví dụ TVV mẫu trước khi lưu.
- **Xóa trên server:** quay về mặc định app cho mọi người.
- Lưu tại Firestore: `scoringAux/kpiEvaluationConfig`.

**Lưu ý:** Đổi cấu hình **không sửa ngược** số đã ghi ngày cũ; chỉ ảnh hưởng tính toán từ thời điểm áp dụng.

---

## 6. Dòng thời gian trên hồ sơ

Tab **Dòng thời gian** (chi tiết hồ sơ) gộp:

- Cuộc gọi OMICall (có đánh dấu HL / không HL),
- Tương tác CRM,
- Nhật ký audit.

Giúp TVV và quản lý đối chiếu KPI với lịch sử thực tế trên từng lead.

---

## 7. Xử lý sự cố thường gặp

| Triệu chứng | Nguyên nhân thường gặp | Việc nên làm |
|-------------|------------------------|--------------|
| HL = 0 dù gọi nhiều | Gọi ngoài hồ sơ / cuộc &lt; ngưỡng giây | Gọi từ nút OMICall trên lead; kiểm tra cài đặt HL |
| KPI hôm nay trống | SIP/extension chưa gắn user | Kiểm tra hồ sơ nhân sự + OMICall |
| WARM+/HOT+ = 0 | Chưa đổi nhãn trong ngày | Đổi nhãn trên hồ sơ (hệ thống ghi sự kiện) |
| Cọc không lên KPI | Chưa duyệt kế toán | Chờ «ĐỒNG Ý» đúng chuỗi cấu hình |
| Cảnh báo không đổi sau chỉnh cài đặt | UI đã cập nhật; số cũ giữ nguyên | Đọc lại bảng ngày mới; kiểm tra đã Lưu config |
| Hạng tháng chưa đổi | Job 15 phút / chưa deploy Functions | Liên hệ CNTT deploy Functions |

---

## 8. Tài liệu kỹ thuật (tham khảo)

- Đặc tả triển khai: `docs/KE-HOACH-KPI-SALE-TVV.md`
- Config Firestore: `scoringAux/kpiEvaluationConfig`
- Collections: `kpiDaily`, `kpiMonthly`, `omicallCalls`, `leadEvents`

---

*Cập nhật theo phiên bản có Cài đặt KPI Sale và màn Điều hành / Bảng điểm tích hợp config.*
