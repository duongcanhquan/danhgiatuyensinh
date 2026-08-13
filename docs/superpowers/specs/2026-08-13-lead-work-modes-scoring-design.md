# Thiết kế — Chế độ xử lý hồ sơ + chấm điểm linh hoạt + gọn đánh giá gọi

| Thuộc tính | Giá trị |
|------------|---------|
| **Mã** | `DES-WORKMODE-2026-08` |
| **Ngày** | 2026-08-13 (rà soát code: 2026-08-14) |
| **Trạng thái** | Đã triển khai trên nhánh `feature/lead-work-modes` — chờ merge / duyệt chạy production |
| **Phụ thuộc** | Kim chỉ nam CRM (`2026-07-29-crm-platform-north-star.md`); hàng chờ gọi (`2026-08-06-call-work-queue-design.md`); bộ chấm / InfoScore hiện có |
| **Nguyên tắc an toàn** | Triển khai theo pha; không phá lọc list, bộ chấm, OMICall, disposition, KPI; mọi thay đổi UI mặc định tương thích ngược |
| **Rà soát** | §14 — đối chiếu cấu trúc hiện có (Lead, `useLeads`, `CALL_DISPOSITIONS`, intake, URL filters) |

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
- Ngày vào / khoảng ngày (`uploadedAt` / trục ngày hiện có)  
- Người nhập (`uploadedBy`), TVV phụ trách (`assignedTo`)  
- Pipeline / CRM status  
- `workMode` (URL `wm` — client filter P1)  
- Bộ chấm đang xem + nhãn HOT/WARM/COLD (live hoặc đã lưu — giữ semantics hiện tại + hint)  
- Hàng chờ gọi / disposition (theo `DES-CALL-Q-2026-08`, `cq` / `disp`)  
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
1. Kết quả bắt buộc = **`CALL_DISPOSITIONS`** trong `src/utils/callWorkQueue.ts` (DES-CALL-Q) — **không** tạo catalog “Quan tâm” song song. Nhãn gần nhất đã có: `high_interest` («Quan tâm cao»), `not_interested`, `knm`, `callback_later`, …  
2. Tuỳ chọn 1 dòng lý do / rào cản chính.  
3. Lưu qua đường hiện có (`buildCallWorkLeadPatch` / `saveCallSessionInteraction`); nếu disposition thuộc nhóm INTERESTED (xem §7 + §14.4) → gợi ý / chuyển `care_close`.

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

Dựa trên **disposition id hiện có** (`getDispositionLeadEffects`), không invent id mới:

| Sự kiện (disposition / intake) | Hành vi |
|--------------------------------|---------|
| `high_interest`, `college_hot`, `positive`, `uni_top_high`, `uni_top_mid` | Gợi ý hoặc auto → `care_close` (cờ cấu hình) |
| `not_interested`, `negative`, `enrolled_elsewhere`, `wrong_number` | Không đẩy chăm |
| `knm`, `callback_later` (+ các bucket `callback`) | Giữ mode + follow-up / hàng chờ gọi lại |
| Cổng ĐK / nộp form | Theo kịch bản nguồn / `PublicRegistrationConfig` (khuyến nghị mặc định `care_close`) |
| QL/TVV đổi tay | Theo quyền |

Tuỳ chọn mở rộng (cấu hình): các disposition “nuôi” (`undecided_*`, `financial_issue`, …) có thể cũng gợi ý `care_close` — **tắt mặc định** để không đẩy sớm.

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

- `workMode?: 'score_queue' | 'volume_filter' | 'care_close'` (optional — lead cũ thiếu field OK)  
- Giữ nguyên các field đã có trên `Lead`: `calculatedScore`, `priorityTag`, `scoringSignals`, `callWorkBucket`, `lastCallDispositionId` / `Label`, `pipelineStatus`, `status`, `source` / `source1` / `source2`, `uploadedAt`, `uploadedBy` / `uploaderName`, `assignedTo`, `intakeProgram`, …  
- **Không** có `createdBy` trên Lead — lọc “người nhập” = `uploadedBy` (đã có server filter `uploadedByIn`).

### 9.2. Cấu hình nguồn / kịch bản

- Mở rộng **`LeadSourceRecord`** (optional fields) + `mapLeadSourceDoc` / `saveLeadSourceRow` / `LeadProfileSettingsTab`.  
- Cổng ĐK: đọc mode từ nguồn `defaultSource1` **hoặc** thêm optional trên `PublicRegistrationConfig`.  
- Import Excel: cho phép ghi đè kịch bản **một lần nhập** mà không đổi mặc định nguồn (tuỳ UI intake).

### 9.3. Tương thích ngược

- Lead thiếu `workMode`: list/filter hoạt động như hiện tại; lọc `wm` chỉ thu hẹp lead đã gán (thiếu field = không khớp equality — giống pattern unset program / `cq`).  
- **P1 lọc `workMode`:** client-side + `fullScope` khi bật (mirror `cq`/`disp`) — **tránh** nổ composite index Firestore ngay. Server `where('workMode')` chỉ khi đã khai báo index tối thiểu.  
- URL param mới: **`wm`** (không đụng `cq`, `disp`, `tag`, `source`, `prog`, … trong `leadWorkspaceUrlFilters.ts`).  
- Form gọi đầy đủ vẫn đọc `scoringAux/callSessionChips`; short = subset + **không** để `enrollment_signal.required` chặn lưu khi đã ẩn UI (xem §14.5).

---

## 10. Pha triển khai (chỉ khi user OK)

| Pha | Nội dung | Rủi ro cần kiểm |
|-----|----------|-----------------|
| **P1** | `workMode?` trên Lead; optional playbook trên `LeadSourceRecord`; gán lúc Excel / manual / public portal; lọc URL `wm` (client như `cq`); bulk gán mode (QL) | `useLeads` fullScope/paging; import `DataIntake`; `manualLeadCreate`; CF `publicRegistration`; URL hydrate |
| **P2** | UI nhấn theo mode; form gọi short/full; ẩn `enrollment_signal` + nới `required` khi short; map disposition → gợi ý `care_close`; copy tách boost vs bộ chấm | `CallSessionQuickPanel` / `saveCallSessionInteraction` / `validateEvaluationSelections`; tabs `cq`/`disp` không đổi |
| **P3** | Ẩn/gộp `LeadScoringSignalsPanel` trùng; classification không nổi TVV mặc định | `persistedLeadScoringFields` / `useAutoPersistLeadScores` / rescore |

**Cấm trong mọi pha:** rewrite `scoringEngine` lớn; đổi KPI V2; xóa `CALL_DISPOSITIONS` / `scoringSignals` / `callSessionChips`; phá tab hàng chờ `cq`.

**Kiểm trước khi merge mỗi pha:** lọc nguồn/`uploadedBy`/ngày/`tag`/`cq`/`disp`; chọn bộ chấm + tính lại; lưu gọi có disposition (`high_interest` / `not_interested` / `knm`); KPI Ngày của tôi không regress; tạo tay + Excel + cổng ĐK (workMode đúng kịch bản).

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

1. User xác nhận spec (kèm §14).  
2. Khi user **OK chạy**: viết `docs/superpowers/plans/…` chi tiết file/test từng pha, rồi mới đụng code — ưu tiên P1.  
3. Không invoke triển khai ngoài yêu cầu rõ ràng.

---

## 14. Rà soát tương thích codebase (2026-08-14)

Đối chiếu spec với cấu trúc hiện có — **chốt cách làm để chạy không vỡ**.

### 14.1. Khớp / tái sử dụng (không đụng lại)

| Thành phần hiện có | Vai trò với DES-WORKMODE |
|--------------------|---------------------------|
| `ScoringProfile` + `scoringEngine` / `useLeadScoring` | Giữ — thước mode `score_queue` |
| `CALL_DISPOSITIONS` + `buildCallWorkLeadPatch` (`callWorkQueue.ts`) | **Nguồn chân lý** kết quả sau gọi; không catalog mới |
| Tabs `cq` / `disp` + `callWorkBucket` | Giữ nguyên; `wm` là lọc **thêm**, không thay |
| Lọc server: `source`, `uploadedByIn`, `priorityTag`, `pipelineStatus`, `intakeProgram`, … (`useLeads.ts`) | Giữ; thêm `wm` theo kiểu client trước |
| InfoScore / classification | Giữ kỹ thuật; UI TVV không nổi thêm |
| KPI / Scorecard | Domain khác — không đổi công thức |

### 14.2. Chỗ gắn `workMode` (intake)

| Đường tạo lead | File chính | Việc P1 |
|----------------|------------|---------|
| Excel | `DataIntake.tsx` + `excelLeadMapper` / `pickProfileForImport` | Sau map nguồn → set `workMode` từ `LeadSourceRecord` (hoặc override lần nhập); **giữ** evaluateLead như hiện tại |
| Tạo tay | `manualLeadCreate.ts` + `CreateLeadModal` | Set `workMode` theo nguồn; vẫn cần bộ chấm đang chọn như nay |
| Cổng ĐK | `functions/src/publicRegistration.ts` (`buildLeadDoc`) | Hiện hardcode `calculatedScore: 0`, `priorityTag: 'COLD'`, `registrationChannel: 'public_portal'` — **thêm** `workMode` từ playbook nguồn/`PublicRegistrationConfig`; **không** bắt buộc bật scoring engine trên CF ở P1 |

### 14.3. Lọc & URL — quyết định an toàn

- Param: **`wm`** trong `leadWorkspaceUrlFilters.ts` (`LWF`).  
- P1: lọc client + bật `fullScope` khi `wm` active (cùng pattern `cq`/`disp` trong `LeadManagement.tsx`) — tránh thiếu index / miss lead chưa có field.  
- Server equality + composite index: chỉ phase sau khi có nhu cầu phân trang lớn theo mode.

### 14.4. Map disposition → `care_close` (đã có trong code)

Dùng `getDispositionLeadEffects` / status `INTERESTED`:

- **Đẩy chăm (mặc định):** `high_interest`, `college_hot`, `positive`, `uni_top_high`, `uni_top_mid`  
- **Không đẩy:** `not_interested`, `negative`, `enrolled_elsewhere`, `wrong_number`  
- **Giữ + gọi lại:** `knm`, `callback_later`, …

### 14.5. Rủi ro P2 nếu ẩn `enrollment_signal` — bắt buộc xử lý

- Default: `enrollment_signal` **`required: true`** (`callSessionEvaluationDefaults.ts`).  
- `CallSessionQuickPanel` → `validateEvaluationSelections`: ẩn UI mà vẫn required → **không lưu được**.  
- **Cách an toàn:** short/full preset lọc dimension + coi `enrollment_signal.required = false` khi validate (hoặc cập nhật doc org `required: false`); **không xóa** schema / analytics aggregator.  
- Boost HOT vẫn có thể từ `readiness` + **disposition thắng cuối** (`dispositionPriorityOverridesAfterScoring`) — đúng hướng “một quyết định lúc gọi”.  
- Test cần chạy lại: `callWorkQueue.test.ts`, `callSessionPriorityFromEvaluation.test.ts`, `callSessionEvaluation*.test.ts`, URL filter tests.

### 14.6. Trùng panel tín hiệu (P3, không P1)

- `LeadScoringSignalsPanel` hiện trên tab tư vấn (`detailLeftTab === 'counselor'`) — độc lập form gọi.  
- P1–P2 **không** xóa panel; P3 mới ẩn/gộp theo cấu hình.

### 14.7. Lệch nhỏ đã sửa trong spec sau rà soát

| Trước (mơ hồ) | Sau (khớp code) |
|---------------|-----------------|
| “Quan tâm” như disposition mới | Dùng `high_interest` («Quan tâm cao») |
| “Người nhập” = createdBy | `uploadedBy` |
| Lọc mode server ngay | Client + fullScope trước |
| URL không nói | `wm` |
| Playbook “leadSources hoặc scoringAux” | Ưu tiên optional trên `LeadSourceRecord` + map/save hiện có |

### 14.8. Kết luận rà soát

Mô hình 3 lớp + kịch bản nguồn **khả thi trên cấu trúc hiện tại** nếu:

1. Tái sử dụng hàng chờ gọi / disposition (không song song).  
2. `workMode` optional + lọc kiểu `cq` ở P1.  
3. P2 xử lý `required` khi rút gọn form gọi.  
4. Không rewrite scoring/KPI; gắn mode tại 3 intake path.  

Khi user **OK chạy** → plan P1 liệt kê từng file/test theo bảng §14.2–14.5.

---

*Hết DES-WORKMODE-2026-08.*

