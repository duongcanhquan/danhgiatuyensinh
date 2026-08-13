# Thiết kế — Chế độ xử lý hồ sơ + chấm điểm linh hoạt + gọn đánh giá gọi

| Thuộc tính | Giá trị |
|------------|---------|
| **Mã** | `DES-WORKMODE-2026-08` |
| **Ngày** | 2026-08-13 |
| **Trạng thái** | Chờ duyệt triển khai — **không sửa code cho đến khi người dùng OK** |
| **Phụ thuộc** | Kim chỉ nam CRM (`2026-07-29-crm-platform-north-star.md`); hàng chờ gọi (`2026-08-06-call-work-queue-design.md`); bộ chấm / InfoScore hiện có |
| **Nguyên tắc an toàn** | Triển khai theo pha; không phá lọc list, bộ chấm, OMICall, disposition, KPI; mọi thay đổi UI mặc định tương thích ngược |

---

## 1. Vấn đề

Trên màn Hồ sơ đang trộn nhiều nhu cầu và nhiều lớp “điểm / đánh giá / profile”:

1. **Sàng data giàu** — chấm từ field → xếp hàng gọi.  
2. **Lọc data mỏng** — gọi số lớn → Quan tâm / Không → bước 2 hoặc loại.  
3. **Chăm & chốt** — đã quan tâm / đã ĐK → hồ sơ, tiền, follow-up.

Ba nhu cầu **cùng tồn tại trong một trường**, phân theo nguồn / cách vào (Excel, nhập tay, cổng ĐK…).  
Đồng thời TVV vẫn cần **lọc linh hoạt** (nguồn, ngày vào, người nhập, tự lead, bộ chấm, nhãn…).

Chỗ trùng gây rối: bộ chấm HOT/WARM, điểm thông tin %, classification, panel tín hiệu hồ sơ, bảng đánh giá cuộc gọi (kèm “tín hiệu tuyển sinh” hot/warm), tab KPI “Đánh giá / Bảng điểm”.

---

## 2. Mục tiêu

- Tách **3 lớp**: cách data vào → **chế độ xử lý** → **cách tính / thước đo**.  
- Gắn **kịch bản tiếp nhận** theo nguồn (linh hoạt, đổi được).  
- Giữ **lọc & bulk** đầy đủ, độc lập với chế độ.  
- **Gọn đánh giá khi gọi**: một kết quả rõ; hết trùng nhãn nóng với bộ chấm.  
- Không nhân top-level menu (khớp north-star: workspace Hồ sơ).  
- Triển khai **thận trọng, theo pha**, không vỡ chức năng hiện có.

### Không nằm trong spec này

- Đổi công thức KPI sale / bảng điểm tháng nhân sự (chỉ tách chữ / IA nếu cần).  
- Viết engine chấm điểm mới từ đầu.  
- So sánh ứng viên side-by-side (không yêu cầu).

---

## 3. Mô hình 3 lớp

### 3.1. Lớp vào (intake)

| Cách vào | Ghi chú |
|----------|---------|
| Tải Excel/CSV | Data có thể dày hoặc mỏng |
| Nhập tay | Thường mỏng |
| Cổng đăng ký công khai | Thường “nóng” hơn |
| (Roadmap) API / Zalo / FB | Theo kênh |

**Nguồn ≠ chế độ.** Cùng một nguồn Excel có thể sàng hoặc lọc nhanh tùy **kịch bản** lần nhập / cấu hình nguồn.

### 3.2. Lớp chế độ xử lý (`workMode`)

| `workMode` | Tên UI gợi ý | Quyết định chính trên UI |
|------------|--------------|---------------------------|
| `score_queue` | Sàng data | Bộ chấm → HOT/WARM → xếp hàng gọi |
| `volume_filter` | Lọc gọi nhanh | Hàng đợi lớn → kết quả sau gọi → chuyển bước |
| `care_close` | Chăm & chốt | Checklist hồ sơ / tài chính / follow-up |

Lead mang `workMode` (mặc định từ kịch bản; đổi tay theo quyền).  
Chuyển mode **không xóa** `calculatedScore` / `priorityTag` đã có.

### 3.3. Lớp thước đo (mỗi thước một việc)

| Thước đo | Câu hỏi | Chỗ đứng |
|----------|---------|----------|
| Bộ chấm (`ScoringProfile`) | Data có tiềm năng để ưu tiên gọi? | Chủ đạo `score_queue` |
| Điểm thông tin % | Hồ sơ còn thiếu field gì? | Phụ trợ mọi mode; không thay HOT/WARM |
| Kết quả / disposition sau gọi | Quan tâm? Hẹn? Không? | Chủ đạo `volume_filter`; dùng mọi mode khi gọi |
| Tiến độ pipeline + tài chính | Đã tới đâu trên đường chốt? | Chủ đạo `care_close` |
| KPI nhân sự | TVV làm việc thế nào? | Tổng kết — **không** quyết định lead |

**Phân loại tỷ trọng (classification):** giữ kỹ thuật; mặc định **không** nổi trên UI TVV trừ khi QL bật. Không thêm lớp điểm mới.

---

## 4. Kịch bản tiếp nhận (intake playbook)

Cấu hình theo **nguồn** hoặc **nhóm nguồn** (và có thể ghi đè lúc tải Excel):

| Trường cấu hình | Ý nghĩa |
|-----------------|---------|
| `defaultWorkMode` | `score_queue` \| `volume_filter` \| `care_close` |
| `defaultScoringProfileId` | id bộ chấm, hoặc `null` = không chấm |
| `allowProfileSwitchOnList` | TVV/QL được chọn bộ khác trên list |
| `callFormVariant` | `short` (mode lọc nhanh) \| `full` (chăm) — có thể suy từ mode |
| `defaultPipelineStatus` | Trạng thái CRM khi lead mới vào |

### Gán khi nào

- Import Excel / tạo tay / cổng ĐK / inbound: lead nhận `workMode` + (nếu có) gợi ý bộ chấm theo kịch bản nguồn.  
- Lead đã tồn tại trước P1: `workMode` thiếu → **không bắt buộc backfill**. UI coi thiếu = “chưa gán”; lọc theo mode chỉ áp lead đã có giá trị; hành vi list/filter cũ không đổi. (Plan P1 có thể thêm nút “Gán mode hàng loạt” cho QL — không auto-đổi thầm.)

### Ví dụ

| Tình huống | Kịch bản gợi ý |
|------------|----------------|
| Excel data dày | `score_queue` + bộ chấm MKT |
| Excel chỉ SĐT + tên | `volume_filter`, không bắt buộc bộ chấm |
| Cổng đăng ký | `care_close` (hoặc lọc nhẹ rồi chăm — theo cấu hình) |
| Nhập tay sau ngày hội | Theo form lúc tạo / nguồn gắn |

---

## 5. Lọc & thao tác (độc lập chế độ)

Bộ lọc trên Hồ sơ vẫn **AND** được (giữ hành vi hiện có + thêm mode):

- Nguồn 1/2, kênh vào (Excel / tay / cổng ĐK…)  
- Ngày vào / khoảng ngày  
- Người nhập, TVV phụ trách  
- Pipeline / CRM status  
- `workMode`  
- Bộ chấm đang xem + nhãn HOT/WARM/COLD (live hoặc đã lưu — giữ semantics hiện tại + hint)  
- Hàng chờ gọi / disposition (theo `DES-CALL-Q-2026-08`)  
- Tìm mã / tên / SĐT  

**Bulk** trên tập đã lọc: phân công, đổi trạng thái, đổi nhãn (quyền), chuyển `workMode`, tính lại theo bộ chấm, export…  
Lead tự ĐK **không** bị loại khỏi lưới lọc; chỉ khác kịch bản mặc định.

Chọn bộ chấm trên list = **cách xem / tính** trên tập đang mở — không bị khóa cứng chỉ vì mode, trừ khi kịch bản `allowProfileSwitchOnList = false`.

---

## 6. Gọn đánh giá khi gọi (chống trùng)

### 6.1. Hiện trạng trùng (cần thu hẹp)

| Nguồn | Vai trò gốc | Xung đột |
|-------|-------------|----------|
| Bộ chấm → HOT/WARM | Tiềm năng từ **data** | Đúng |
| `LeadScoringSignalsPanel` | Tick hành vi/rủi ro **cộng điểm bộ chấm** | Trùng nội dung “sau gọi” |
| Bảng đánh giá cuộc gọi (nhiều chiều + `enrollment_signal` hot/warm) | Ghi cuộc gọi + có thể **nâng** `priorityTag` | Nhãn nóng thứ hai; form dài |

### 6.2. Nguyên tắc

- **Một quyết định ưu tiên lúc gọi:** kết quả/disposition (catalog hàng chờ gọi), không bắt TVV “chấm lại HOT” như bộ chấm.  
- Chi tiết cuộc gọi (ai quyết, rào cản…) = form **ngắn theo mode**, không nhân checkbox trùng trên hồ sơ.  
- Hành vi TVV (chất lượng gọi / KPI) tách khỏi “khách quan tâm”.  
- Bộ chấm = tiềm năng data; disposition = trạng thái xử lý sau gọi.  
- Nếu vẫn nâng ưu tiên từ gọi: chỉ **boost xếp hàng**, ghi nguồn “từ cuộc gọi”; không trộn thành một số khó hiểu với điểm bộ chấm.

### 6.3. Theo chế độ

**`volume_filter` (short)**  
1. Kết quả bắt buộc (disposition / Quan tâm–Không–Không nghe–Hẹn — **tái sử dụng catalog `DES-CALL-Q`**, không tạo song song).  
2. Tuỳ chọn 1 dòng lý do / rào cản chính.  
3. Lưu → cập nhật bucket gọi + pipeline; nếu Quan tâm → gợi ý / chuyển `care_close`.

**`care_close` (full)**  
Giữ chiều hữu ích: ai quyết định, rào cản, việc đã hẹn (gửi tài liệu, tham quan…).  
**Ẩn hoặc bỏ khỏi UI mặc định** chiều `enrollment_signal` kiểu hot/warm/cold như nhãn thứ hai — dùng disposition + pipeline.

**`score_queue`**  
Ưu tiên điểm bộ chấm trên list; sau gọi dùng disposition như trên.  
Tín hiệu cộng điểm (Add Zalo, hỏi học phí…): **một lần** — map từ sau gọi hoặc panel chỉ khi QL bật “dùng tín hiệu cho bộ chấm”.

### 6.4. Panel tín hiệu trên hồ sơ

- Mặc định TVV: không hiện hai bộ checkbox trùng với form gọi.  
- Gộp vào lưu sau gọi **hoặc** chỉ hiện khi cấu hình trường bật.  
- Không xóa dữ liệu `scoringSignals` đã lưu (tương thích ngược).

### 6.5. Quan hệ với boost HOT từ gọi

Giữ khả năng kỹ thuật `mergeCallEvalPriorityBoost` / disposition `college_hot` (theo spec hàng chờ), nhưng:

- UI không trình bày như “chấm điểm profile lần 2”.  
- Copy: ưu tiên / kết quả xử lý — tách khỏi “điểm theo bộ chấm”.

---

## 7. Chuyển `workMode`

| Sự kiện | Hành vi |
|---------|---------|
| Disposition = quan tâm / tương đương “nuôi–chốt” | Gợi ý hoặc auto → `care_close` (cấu hình được) |
| Không quan tâm / từ chối / enrolled elsewhere | Không đẩy chăm; giữ hoặc đánh dấu loại theo pipeline hiện có |
| Hẹn gọi lại / KNM | Giữ mode + follow-up / bucket callback |
| Cổng ĐK / nộp form | Theo kịch bản (mặc định khuyến nghị `care_close`) |
| QL/TVV đổi tay | Theo quyền |

---

## 8. IA / UI (không thêm menu top-level)

Trong **Hồ sơ** (và deep-link URL):

- Bộ lọc `workMode` hoặc tab hàng đợi theo mode (cạnh hàng chờ gọi hiện có — không thay thế `cq=`).  
- Chi tiết lead: nhấn mạnh panel đúng mode; ẩn/collapse phần không thuộc mode.  
- Cài đặt: nhóm Chấm điểm giữ bộ chấm / quy tắc mẫu / điểm thông tin; thêm **Kịch bản nguồn** (có thể nằm dưới Danh mục hồ sơ hoặc Chấm điểm — chốt khi plan).  
- Tổng kết: chữ KPI tránh “Đánh giá hồ sơ”; không đổi công thức trong spec này.

Khớp north-star: đa thao tác trong Hồ sơ, không nhân route.

---

## 9. Dữ liệu (hướng dẫn triển khai — chưa code)

### 9.1. Lead (đề xuất)

- `workMode?: 'score_queue' | 'volume_filter' | 'care_close'`  
- Giữ nguyên: `calculatedScore`, `priorityTag`, `scoringSignals`, `callWorkBucket`, disposition, pipeline, nguồn, `createdAt`, người tạo/phụ trách…

### 9.2. Cấu hình nguồn / kịch bản

- Mở rộng `leadSources` (hoặc doc phụ `scoringAux` / orgSettings) với các trường mục 4.  
- Import Excel: cho phép ghi đè kịch bản **một lần nhập** mà không đổi mặc định nguồn (tuỳ UI intake).

### 9.3. Tương thích ngược

- Lead thiếu `workMode`: list/filter hoạt động như hiện tại; mode suy mặc định không chặn lọc cũ.  
- Không bắt buộc migration phá dữ liệu.  
- Form gọi đầy đủ vẫn đọc được config `callSessionChips` hiện có; variant short = subset / preset, không xóa config admin.

---

## 10. Pha triển khai (chỉ khi user OK)

| Pha | Nội dung | Rủi ro cần kiểm |
|-----|----------|-----------------|
| **P1** | Field `workMode` + kịch bản nguồn + lọc theo mode; gán lúc intake; mặc định an toàn cho lead cũ | List/filter/pagination Firestore; import; cổng ĐK |
| **P2** | UI nhấn mạnh theo mode; form gọi short/full; ẩn `enrollment_signal` khỏi UX mặc định; copy tách boost vs bộ chấm | OMICall panel, disposition, `DES-CALL-Q` tabs |
| **P3** | Gộp/ẩn panel tín hiệu trùng; tắt nổi classification trên TVV nếu chưa dùng | Rescore / `persistedLeadScoringFields` / auto-persist |

**Cấm trong mọi pha:** rewrite `scoringEngine` lớn; đổi KPI V2; xóa collection/field đang dùng mà không có dual-read.

**Kiểm trước khi merge mỗi pha:** lọc nguồn/ngày/TVV/nhãn; chọn bộ chấm + tính lại; gọi + lưu disposition; KPI Ngày của tôi / bảng điểm không regress; tạo lead tay + import + (nếu có) cổng ĐK.

---

## 11. Thuật ngữ UI (tiếng Việt đời thường)

| Tránh trên UI TVV | Dùng |
|-------------------|------|
| Profile (mơ hồ) | Bộ chấm điểm |
| Đánh giá (mơ hồ) | Nói rõ: kết quả cuộc gọi / điểm theo bộ chấm / điểm làm việc (KPI) |
| workMode (code) | Sàng data · Lọc gọi nhanh · Chăm & chốt |
| enrollment_signal | (Ẩn) — dùng kết quả gọi / giai đoạn |

---

## 12. Quyết định đã chốt với stakeholder (2026-08-13)

1. Ba nhu cầu chạy **song song** trong một trường (theo nguồn / kịch bản), không phải một pipeline bắt mọi lead đi tuần tự.  
2. Hướng **chế độ trên nguồn/lead** + UI theo chế độ; không gộp siêu-điểm.  
3. Lọc nguồn / ngày / người nhập / tự ĐK / bộ chấm **giữ và mở rộng**, độc lập mode.  
4. Đánh giá gọi **đơn giản hóa**, chống trùng với bộ chấm và panel tín hiệu.  
5. **Chưa triển khai code** đến khi user yêu cầu chạy; khi chạy phải thận trọng, theo pha, không vỡ chức năng.

---

## 13. Việc tiếp theo sau khi user duyệt file này

1. User xác nhận spec (sửa chữ nếu cần).  
2. Khi user **OK chạy**: viết `docs/superpowers/plans/…` chi tiết file/test từng pha, rồi mới đụng code — ưu tiên P1.  
3. Không invoke triển khai ngoài yêu cầu rõ ràng.

---

*Hết DES-WORKMODE-2026-08.*
