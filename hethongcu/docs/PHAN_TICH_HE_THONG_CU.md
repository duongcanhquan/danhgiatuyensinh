# Phân tích hệ thống cũ `hethongcu` (Google Apps Script + Firebase RTDB + n8n)

Tài liệu tham chiếu khi thiết kế CRM mới (`danhgiatuyensinh`), migration, hoặc tích hợp từng phần.  
**Nguồn:** `hethongcu/Main.js`, `index.html`, `Dashboard.html`, `Account.html`, `appscript.json`, export `tuyensinh-ea675-default-rtdb-export.json` (snapshot ~603 hồ sơ SV, 21 user).

> **Bảo mật:** `Main.js` chứa `FIREBASE_SECRET` và mật khẩu user dạng plaintext trong RTDB. Không commit secret lên Git công khai; khi migrate nên xoay secret và chuyển auth sang Firebase Auth + Rules.

---

## 1. Tổng quan kiến trúc

```
┌─────────────────┐     POST/GET      ┌──────────────────────────────┐
│ index.html      │ ────────────────► │ Google Apps Script (Main.js) │
│ (Cổng đăng ký)  │   doPost/getData  │  Web App: ANYONE_ANONYMOUS    │
└─────────────────┘                   └──────────────┬───────────────┘
                                                     │
┌─────────────────┐     google.script.run          │ read/write
│ Dashboard.html  │ ◄──────────────────────────────┤
│ (TVV / Admin)   │                                │
└─────────────────┘                                │
┌─────────────────┐                                ▼
│ Account.html    │                    ┌───────────────────────────────┐
│ (Kế toán)       │                    │ Google Sheet (source ghi)      │
└─────────────────┘                    │ DU_LIEU_SINH_VIEN + danh mục   │
                                       └───────────────┬───────────────┘
                                                       │ sync PUT/PATCH
                                                       ▼
                                       ┌───────────────────────────────┐
                                       │ Firebase RTDB (asia-southeast1) │
                                       │ students/{studentId} → array[70]│
                                       │ users/{emailKey} → object       │
                                       └───────────────┬───────────────┘
                                                       │ webhook POST
                                                       ▼
                                       ┌───────────────────────────────┐
                                       │ n8n (apchn-host.lapage.vn)      │
                                       │ 4 webhook: giấy mời, CTSV, BC   │
                                       └───────────────────────────────┘
```

**Nguyên tắc vận hành:**

1. **Google Sheet** là nơi ghi chính khi xử lý (TVV, kế toán, import) — có lock (`LockService`) chống ghi đồng thời.
2. **Firebase RTDB** là bản đọc nhanh cho Dashboard / báo cáo / đồng bộ đa thiết bị; mỗi lần ghi Sheet xong thường `PUT students/{id}`.
3. **Cột 71 (index 70)** trên Sheet: trạng thái đồng bộ `ĐÃ ĐỒNG BỘ` / `LỖI ĐỒNG BỘ`.
4. **n8n** nhận JSON sự kiện (không thay Sheet); tạo giấy tờ, thông báo, báo cáo Zalo/Telegram (suy ra từ payload HTML).

---

## 2. Hạ tầng & cấu hình (`CONFIG` trong `Main.js`)

| Khóa | Mục đích |
|------|----------|
| `SPREADSHEET_ID` | Sheet trung tâm — tab `DU_LIEU_SINH_VIEN` + danh mục |
| `SHEET_NAMES.*` | `DU_LIEU_SINH_VIEN`, `NGANH_HOC`, `TU_VAN_VIEN`, `KE_TOAN`, `HOC_BONG`, `HE_DAO_TAO`, `TRANG_THAI` |
| `IDS.FOLDER_ROOT` | Google Drive — upload bill / tài liệu TVV |
| `IDS.FOLDER_INVITE_ROOT` | Drive — thư mục giấy mời (tạo folder con theo `HọTên_MãSV`) |
| `FIREBASE_URL` | RTDB `tuyensinh-ea675` region Singapore |
| `FIREBASE_SECRET` | Database secret (legacy REST auth `?auth=`) |
| `N8N_WEBHOOK` | `.../webhook/giaymoits` — giấy mời / tài liệu / profile |
| `N8N_WEBHOOK_CTSV` | `.../webhook/testctsv` — kế toán duyệt, Full NE |
| `N8N_WEBHOOK_DAILY_REPORT` | `.../webhook/baocao-ngay` |
| `N8N_WEBHOOK_MONTHLY_REPORT` | `.../webhook/baocao-thang` |
| `SYNC_COL_INDEX` | `70` — cột BS (cột thứ 71), trạng thái sync |

**Triển khai Apps Script** (`appscript.json`):

- Runtime V8, timezone `Asia/Ho_Chi_Minh`
- Web app: `executeAs: USER_DEPLOYING`, `access: ANYONE_ANONYMOUS`
- OAuth: external_request, spreadsheets, drive

---

## 3. Ba cổng (portal) và luồng vào

### 3.1. Cổng đăng ký công khai — `index.html`

| Mục | Chi tiết |
|-----|----------|
| URL backend | Deploy Web App → `SCRIPT_URL` (macros `/exec`) |
| Load danh mục | `GET ?action=getData` → `getMetaDataPublic()` |
| Gửi hồ sơ | `POST` JSON body → `doPost` → `savePublicForm(data)` |
| Auth | Không đăng nhập; ai có link đều gửi được |
| Validation client | DD/MM/YYYY, SĐT VN/`+quốc tế`, CCCD 9/12 số hoặc Passport, học lực |
| Dedupe | Trùng SĐT hoặc CCCD (trừ `CHƯA CÓ`) → từ chối |
| Mã SV mới | `yyMMdd` + 4 số seq trong ngày (quét Sheet cột B) |
| Trạng thái mặc định | `MỚI` (cột 39), nguồn `Form Public` (cột 56) |
| Không gửi n8n | `savePublicForm` **không** gọi webhook (chỉ Sheet + Firebase) |

**Luồng:**

```
Thí sinh điền form → POST Main.js → append Sheet (70 cột)
                              → PUT Firebase students/{id}
                              → cột sync = ĐÃ ĐỒNG BỘ / LỖI
```

### 3.2. Cổng TVV / Admin — `Dashboard.html` (mặc định `doGet`)

| Mục | Chi tiết |
|-----|----------|
| Đăng nhập | `loginUser(email, password)` → đọc `users/{emailKey}` trên RTDB |
| Vai trò | `admin`, `teamlead`, `tvv`, `marketing` (marketing xem full data, UI hạn chế) |
| Dữ liệu | `getStudentData(name, role, teamMembers)` — ưu tiên đọc **toàn bộ** `students` từ Firebase |
| Lọc TVV | `admin`/`marketing`: all; `teamlead`: cột 18 ∈ teamMembers; `tvv`: cột 18 khớp tên |
| Sắp xếp | Theo `created_at` (cột 17) giảm dần |
| Lưu hồ sơ | `saveOrUpdateStudent(payload)` — files base64 → Drive, tiền 5 đợt |
| Giấy mời | `triggerInvitation` → tạo folder Drive + webhook n8n `create_document` |
| Import Excel | `processBulkImport` |
| Báo cáo | UI gọi chart; server có `sendDailyReportToN8N` / `sendMonthlyReportToN8N` (trigger thời gian) |
| Quản lý user | `readFromFirebase("users")`, `adminManageUser`, `MIGRATE_USERS_TO_FIREBASE` |

**Team lead logic:** User có `manager` trỏ tới tên trưởng nhóm; `loginUser` build `teamMembers` = tên mình + lính có `manager === user.name`.

### 3.3. Cổng kế toán — `Account.html` (`?p=account`)

| Mục | Chi tiết |
|-----|----------|
| Đăng nhập | `loginAccountant` — đọc sheet `KE_TOAN` (email/password), **không** dùng Firebase users |
| Dữ liệu | `getAccountantData()` — SV có `total_money` (cột 37) > 10.000đ |
| Ưu tiên hiển thị | Còn đợt chưa duyệt (`valid*` trống nhưng có tiền) hoặc `YÊU CẦU FULL NE` (cột 65) |
| Duyệt tiền | `processPaymentDecision` — 5 batch, quyết định `ĐỒNG Ý` / `TỪ CHỐI` |
| Full NE | `setFullNE(studentId)` — auto duyệt tiền treo + chốt `ĐÃ FULL NE` |
| Side effect | Đồng ý → ghi sheet kế toán riêng (`1NIMcFVj...`) + webhook `N8N_WEBHOOK_CTSV` |

**Mở từ Dashboard:** `goToAccount()` → `getScriptUrl() + "?p=account"`.

---

## 4. Firebase Realtime Database

### 4.1. Cấu trúc

```
/
├── students/
│   ├── {studentId}/          ← key = mã SV (vd. 2602025170)
│   │   └── [array 70 phần tử]  ← CHỈ là mảng, không phải object field
│   └── ...
└── users/
    ├── {emailKey}/           ← email với '.' → ',' (encodeEmail)
    │   ├── name, displayName, email, password, role, manager, dept, code, phone
    └── ...
```

**Export mẫu:** 603 keys `students`, 21 keys `users`.

**Lưu ý đọc dữ liệu:**

- Số điện thoại / CCCD trên Sheet thường có prefix `'` → export JSON có dạng `"'0334983464"`.
- Một số ô rỗng; array luôn pad đủ 70 phần tử khi sync.

### 4.2. REST API pattern (Apps Script)

```javascript
// Ghi 1 SV
PUT {FIREBASE_URL}students/{id}.json?auth={SECRET}
Body: JSON.stringify(array[70])

// Ghi hàng loạt
PUT students.json  (full replace) hoặc PATCH students.json (bulk import)

// Đọc
GET students.json / users.json
```

### 4.3. `users` — xác thực CRM

| Field | Ý nghĩa |
|-------|---------|
| `email` | Email đăng nhập |
| `password` | **Plaintext** trên RTDB |
| `role` | `admin` \| `teamlead` \| `tvv` \| ... |
| `name` | Tên hiển thị / khớp cột TVV (18) |
| `displayName` | Tên đầy đủ |
| `manager` | Tên trưởng nhóm (teamlead) |
| `dept` | Phòng ban |
| `code`, `phone` | Mã / SĐT nội bộ |

`encodeEmail`: `email.toLowerCase().replace(/\./g, ',')` → key `anh,tran@caodangvietmy,edu,vn`.

---

## 5. Schema mảng 70 cột — `students/{id}`

Chỉ số **0-based** (cột Sheet = index + 1). Đây là “hợp đồng” quan trọng nhất khi migrate sang Firestore `leads` + `enrollments`.

| Index | Cột Sheet (≈) | Nội dung | Ghi chú |
|------:|---------------|----------|---------|
| 0 | A | STT | Số thứ tự |
| 1 | B | **Mã SV** | PK logic, `yyMMdd####` |
| 2 | C | Họ tên | UPPERCASE khi public |
| 3 | D | Giới tính | |
| 4 | E | Ngày sinh | `'` + DD/MM/YYYY |
| 5 | F | SĐT | `'` prefix |
| 6 | G | Email | |
| 7 | H | (trống thường) | |
| 8 | I | Địa chỉ thường trú | |
| 9 | J | Địa chỉ hiện tại | |
| 10 | K | **Hệ đào tạo** | Dùng phân loại báo cáo (CĐ, 9+, TC…) |
| 11 | L | | |
| 12 | M | **Ngành** | |
| 13 | N | Niên khóa | |
| 14 | O | Nơi sinh | |
| 15 | P | Dân tộc | |
| 16 | Q | **CCCD/Passport** | `CHƯA CÓ` được phép |
| 17 | R | **Ngày tạo** | `dd/MM/yyyy HH:mm:ss` — sort list |
| 18 | S | **TVV phụ trách** | Lọc quyền TVV/teamlead |
| 19 | T | Cơ sở / campus | |
| 20–25 | | Cha/mẹ/người giám hộ + SĐT | |
| 26 | | Trường THPT | |
| 27 | | Tỉnh trường | |
| 28 | | Khu vực / area | |
| 29 | | Học bổng 1 | |
| 30 | | **Tiền đợt 1 (cọc)** | Parse số, strip non-digit |
| 31 | | Tiền đợt 2 | |
| 32–33 | | (phụ) | |
| 34 | | Link bill đợt 1 | Drive URL |
| 35 | | Link bill đợt 2 | |
| 36 | | **Folder giấy mời** | Drive folder URL |
| 37 | | **Tổng tiền** | Sum các đợt |
| 38 | | Ghi chú TVV | |
| 39 | | **Trạng thái hồ sơ** | MỚI, ĐANG HOÀN THIỆN, CỌC THÀNH CÔNG, KIỂM TRA LẠI, ĐÃ HOÀN THIỆN |
| 40 | | (liên quan status khi KT sửa) | |
| 41 | | | |
| 42 | | Đối tượng / situation | Học sinh lớp 12… |
| 43 | | Học lực / điểm TB | Text (vd. `8.0-9.0`) |
| 44 | | Tiền đợt 3 | |
| 45 | | Bill đợt 3 | |
| 46 | | Tiền đợt 4 | |
| 47 | | Bill đợt 4 | |
| 48 | | Tiền đợt 5 | |
| 49 | | Bill đợt 5 | |
| 50 | | **KT duyệt đợt 1** | `ĐỒNG Ý` / `TỪ CHỐI` / rỗng |
| 51 | | KT duyệt đợt 2 | |
| 52 | | KT duyệt đợt 3 | |
| 53 | | KT duyệt đợt 4 | |
| 54 | | KT duyệt đợt 5 | |
| 55 | | **n8n_status** | Tags `ok1`, `confirm2`… (parse chuỗi) |
| 56 | | Nguồn lead 1 | |
| 57–59 | | (mở rộng) | |
| 60–64 | | **Ngày nộp tiền** đợt 1–5 | Dùng báo cáo ngày |
| 65 | | **Full NE** | `YÊU CẦU FULL NE` / `ĐÃ FULL NE` |
| 66 | | Ngày Full NE | |
| 67 | | (phụ) | |
| 68 | | Nguồn 2 | |
| 69 | | Học bổng 2 | |
| **70** | **BS** | **Sync Firebase** | `ĐÃ ĐỒNG BỘ` / `LỖI ĐỒNG BỘ` |

**Map tiền ↔ đợt (logic kế toán):**

| Đợt | Tiền (index) | Bill (index) | KT (index) | Ngày (index) |
|-----|-------------|-------------|------------|--------------|
| 1 (cọc) | 30 | 34 | 50 | 60 |
| 2 | 31 | 35 | 51 | 61 |
| 3 | 44 | 45 | 52 | 62 |
| 4 | 46 | 47 | 53 | 63 |
| 5 | 48 | 49 | 54 | 64 |

---

## 6. Logic nghiệp vụ chi tiết

### 6.1. Sinh mã sinh viên

- Prefix: `yyMMdd` (GMT+7).
- Seq: max 4 chữ số trong ngày từ cột B (không trùng).
- Ví dụ export: `2602025170`, `2602040592`.

### 6.2. Trạng thái hồ sơ (cột 39) — máy trạng thái kế toán/TVV

Luồng khi **kế toán đồng ý** (`processPaymentDecision`):

1. Ghi `valid{batch}` = `ĐỒNG Ý` hoặc `TỪ CHỐI`.
2. `TỪ CHỐI` → status `KIỂM TRA LẠI`.
3. `ĐỒNG Ý` → tính tổng tiền các đợt đã `ĐỒNG Ý`:
   - Ngưỡng cọc: hệ **9+** ≥ 2.000.000đ, còn lại ≥ 1.000.000đ.
   - Đủ ngưỡng → `CỌC THÀNH CÔNG`; kiểm tra đủ trường bắt buộc → có thể `ĐÃ HOÀN THIỆN` (cột 42 trong code setFullNe là 42 admission-related — xem 6.4).
   - Có tiền duyệt nhưng chưa đủ cọc → `ĐANG HOÀN THIỆN`.

### 6.3. TVV lưu hồ sơ (`saveOrUpdateStudent`)

**Đầu vào payload (Dashboard):**

- `studentId`, `counselorName`, `fields` (form), `files` (base64 bill), `old` (URL bill cũ), `folderName`.

**Dedupe:** SĐT + CCCD (bỏ qua `CHƯA CÓ`).

**Đổi tiền / đổi file bill:**

- Reset `valid1..5` rỗng, xóa tag n8n `ok{n}` / `confirm{n}` trong cột 55.
- Set flag `isMoneyOrFileChanged` → **trigger n8n**.

**Full NE (TVV tick):**

- Cột 65: `YÊU CẦU FULL NE` (chưa xác nhận).
- Lần đầu tick → cũng có thể trigger n8n.

**Sau ghi:**

- `PUT students/{id}` + cột sync.

### 6.4. Full NE (kế toán) — `setFullNE`

1. Duyệt tự động mọi đợt có tiền > 0 mà `valid` còn trống → `ĐỒNG Ý` + ngày = hôm nay.
2. Cột 65 = `ĐÃ FULL NE`, 66 = ngày, 39 = `ĐÃ HOÀN THIỆN`.
3. Firebase sync + **một** webhook `accountant_full_ne` → `N8N_WEBHOOK_CTSV`.

### 6.5. Giấy mời / tài liệu — `triggerInvitation`

1. Tìm SV trên Sheet.
2. Nếu chưa có folder Drive (cột 36) → tạo trong `FOLDER_INVITE_ROOT` tên `{HọTên}_{MãSV}`.
3. POST n8n:

```json
{
  "action": "create_document",
  "docType": "...",
  "folderId": "...",
  "studentData": { "id", "name", "scholarship...", "source1", "source2", ... }
}
```

→ n8n sinh file (Word/PDF) vào folder.

### 6.6. Đồng bộ & bảo trì

| Hàm | Mục đích |
|-----|----------|
| `DONG_BO_DATA_LEN_FIREBASE` | Admin: đẩy toàn bộ Sheet → RTDB (PUT `students.json`) |
| `syncFailedDataToFirebase` | Đêm: chạy bù dòng `LỖI ĐỒNG BỘ` |
| `BACKUP_STUDENTS_TO_SHEET` | Đêm: Firebase → ghi đè Sheet từ dòng 3 |
| `MIGRATE_USERS_TO_FIREBASE` | Sheet TVV → `users` |
| `TEST_TIM_LOI_DATA` | Test từng dòng lên `students_test/` |

---

## 7. n8n — webhook & payload

### 7.1. Bốn endpoint

| Webhook | URL path | Kích hoạt chính |
|---------|----------|-----------------|
| Giấy mời / hồ sơ | `/webhook/giaymoits` | TVV đổi tiền/file; tạo giấy mời; có thể trùng gọi với CTSV khi save |
| CTSV / Kế toán | `/webhook/testctsv` | KT duyệt đợt; Full NE; TVV save (khi trigger) |
| Báo cáo ngày | `/webhook/baocao-ngay` | Trigger time `sendDailyReportToN8N` |
| Báo cáo tháng | `/webhook/baocao-thang` | Ngày cuối tháng `sendMonthlyReportToN8N` |

Host: `https://apchn-host.lapage.vn`

### 7.2. Sự kiện TVV (`giaymoits` + `testctsv`)

```json
{
  "event": "create_profile" | "update_profile",
  "is_money_changed": true,
  "studentId": "2602025170",
  "counselor": "Cô Hoài Thơ",
  "updatedAt": "yyyy-MM-dd HH:mm:ss",
  "totalMoney": 5000000,
  "full_data": { /* fd object ~40 field named */ }
}
```

`full_data` map từ mảng 70 (tên tiếng Anh: `deposit_money`, `valid1`, `situation`, …) — **dùng làm contract cho automation**.

### 7.3. Sự kiện kế toán

```json
{
  "event": "accountant_decision",
  "decision": "ĐỒNG Ý" | "TỪ CHỐI",
  "amount": 1000000,
  "batch": 1,
  "full_data": { ... }
}
```

Full NE:

```json
{
  "event": "accountant_full_ne",
  "decision": "FULL NE",
  "auto_approved_amount": 12345678,
  "full_data": { ... }
}
```

**Lưu ý:** Code đã comment “chỉ 1 webhook” cho KT để tránh spam 2 tin — trước đây có thể gọi trùng.

### 7.4. Báo cáo ngày

- Đọc **toàn bộ** `students` từ Firebase.
- Chỉ tính tiền **đã KT duyệt** (`valid* === ĐỒNG Ý`) và **ngày nộp** (60–64) ∈ hôm nay.
- Phân nhóm theo hệ: Cao đẳng/9+, Trung cấp/Sơ cấp, Du học/Ngắn hạn (`evaluateStudentForN8N`).
- Metrics: HS nộp, tổng tiền, LPXT (≥150k), cọc, Full NE trong ngày.
- Gửi `{ date, dailyDetailHtml }` — HTML cho kênh chat.

### 7.5. Báo cáo tháng

- Chạy khi **ngày mai sang tháng mới** (guard trong hàm).
- Đếm: hồ sơ mới tháng chưa nộp tiền, LPXT, NE (cọc/Full NE), TVV có nhiều NE nhất.

---

## 8. Google Sheet — danh mục phụ

| Sheet | Nguồn `getMetaData` | Dùng cho |
|-------|---------------------|----------|
| `NGANH_HOC` | Cột A nhóm Roman, B tên ngành | Dropdown ngành (+ optgroup) |
| `TU_VAN_VIEN` | A tên, G phòng ban | TVV + `tvvDeptMap` |
| `HE_DAO_TAO` | A hệ, B niên khóa | Hệ + năm |
| `TRANG_THAI` | Cột A | Trạng thái admission |
| `HOC_BONG` | A hệ, B tên, E giá trị, G điều kiện | Giấy mời / học bổng |
| `KE_TOAN` | A email, B password | Login Account.html only |

Public API `getData` **không** trả scholarships (chỉ internal `getMetaData` cho Dashboard).

---

## 9. Lưu trữ file (Google Drive)

| Loại | Hàm | Thư mục |
|------|-----|---------|
| Bill TVV upload | `uploadToDrive(base64, folderName)` | `FOLDER_ROOT` / subfolder theo tên SV |
| Folder giấy mời | `triggerInvitation` | `FOLDER_INVITE_ROOT/{HọTên}_{MãSV}` |

Bill URL lưu vào cột 34, 35, 45, 47, 49 (link công khai Drive).

---

## 10. Phân quyền tóm tắt

| Vai trò | Nguồn auth | Phạm vi dữ liệu |
|---------|------------|-----------------|
| Public | Không | Chỉ POST tạo mới |
| TVV | RTDB `users` | SV có cột 18 = tên TVV |
| Teamlead | RTDB `users` | SV của TVV trong `teamMembers` |
| Admin / Marketing | RTDB `users` | Toàn bộ SV |
| Kế toán | Sheet `KE_TOAN` | SV có tiền > 10k + queue duyệt |

---

## 11. Đối chiếu với CRM mới (`danhgiatuyensinh`) — gợi ý migrate

| Hệ cũ | Gợi ý CRM mới |
|--------|----------------|
| Mảng 70 cột / 1 record SV | `leads` (CRM) + `enrollments` (thu phí, 5 đợt) |
| Cột 2–28, 42–43 | Trường `Lead` + form đăng ký |
| Cột 30–54, 60–67 | `enrollment.payments[]`, `admissionStatus`, `fullNe` |
| `users` RTDB | `users` Firestore + Firebase Auth (không plaintext password) |
| Sheet master | `masterData` catalogs hoặc import một lần |
| n8n `full_data` | Giữ shape `full_data` khi chuyển Phase webhook để không gãy workflow |
| Mã SV cột 1 | `enrollment.studentCode` + `lead.legacyStudentId` |

**Không nên:** nhét 70 field vào một document `Lead` — khó bảo trì, trùng với thiết kế đã thống nhất trước đó.

---

## 12. Rủi ro & hạn chế kỹ thuật

1. **Bảo mật:** Database secret trong client/webapp; password user đọc được từ RTDB export.
2. **Schema mảng:** Không tự mô tả — phải bảng index như trên; dễ lệch cột khi sửa Sheet.
3. **Dual write:** Sheet + Firebase có thể lệch khi `LỖI ĐỒNG BỘ`.
4. **Giới hạn 3000 dòng** khi fallback đọc Sheet (không dùng Firebase).
5. **Web app anonymous:** Cổng public + macros URL — cần rate limit / CAPTCHA nếu mở internet.
6. **n8n phụ thuộc** `full_data` — đổi index cột phải cập nhật đồng bộ Apps Script + workflow n8n.

---

## 13. File trong repo `hethongcu`

| File | Vai trò |
|------|---------|
| `Main.js` | Toàn bộ backend: Firebase, Sheet, n8n, auth, báo cáo |
| `index.html` | UI đăng ký công khai |
| `Dashboard.html` | UI TVV/Admin (~3100 dòng) |
| `Account.html` | UI kế toán |
| `appscript.json` | Manifest triển khai |
| `tuyensinh-ea675-default-rtdb-export.json` | Backup RTDB (students + users) |

---

## 14. Hàm server — tra cứu nhanh

| Hàm | Cổng / mục đích |
|-----|-----------------|
| `doGet` | `getData` JSON / Dashboard / Account |
| `doPost` | Public registration |
| `getMetaDataPublic` | Danh mục cho form |
| `getMetaData` | + scholarships cho Dashboard |
| `loginUser` | Dashboard auth |
| `loginAccountant` | Account auth |
| `getStudentData` | List SV có phân quyền |
| `getAccountantData` | Queue kế toán |
| `savePublicForm` | Tạo SV từ web |
| `saveOrUpdateStudent` | TVV create/update + n8n |
| `processPaymentDecision` | KT duyệt tiền + n8n |
| `setFullNE` | KT Full NE + n8n |
| `triggerInvitation` | Giấy mời + n8n |
| `sendDailyReportToN8N` | Báo cáo ngày |
| `sendMonthlyReportToN8N` | Báo cáo tháng |
| `processBulkImport` | Import Excel |
| `adminManageUser` | CRUD user Firebase |
| `DONG_BO_DATA_LEN_FIREBASE` | Full sync Sheet→Firebase |
| `syncFailedDataToFirebase` | Retry lỗi sync |
| `BACKUP_STUDENTS_TO_SHEET` | Firebase→Sheet |

---

*Tài liệu tạo để học tập nội bộ — cập nhật khi `Main.js` hoặc export RTDB thay đổi.*
