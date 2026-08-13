# Tham chiếu logic hệ thống App Script legacy (Việt Mỹ)

> Nguồn: `Main.gs` + `Dashboard.html` + `Account.html` (bản đã chạy tốt).  
> Mục đích: ghi nhớ **toàn bộ** kiến trúc, schema, điều kiện, luồng, webhook, phân quyền để port / đối chiếu với app mới.  
> Ngày ghi: 2026-08-13.

---

## 0. Tóm tắt một câu

Hệ thống tuyển sinh Apps Script: **Google Sheet = sổ cái ghi**, **Firebase RTDB = cache đọc + users**, **Dashboard = TVV/Admin/MKT**, **Account = Kế toán duyệt tiền**, **n8n = in giấy mời + thông báo + báo cáo ngày/tháng**.

---

## 1. Kiến trúc & routing

### 1.1 Thành phần

| Thành phần | Vai trò |
|---|---|
| `Main.gs` | Backend: config, CRUD, auth, sync, webhook, báo cáo server |
| `Dashboard.html` | Cổng TVV / Admin / Teamlead / Marketing |
| `Account.html` | Cổng Kế toán (duyệt tiền, Full NE) |
| Spreadsheet chính | Master data + `DU_LIEU_SINH_VIEN` |
| Spreadsheet KT phụ | Sổ append khi duyệt `ĐỒNG Ý` |
| Firebase RTDB | `students/{maSV}` (mảng 70 ô), `users/{emailEncoded}` |
| Drive | Folder bill + folder giấy mời |
| n8n | Webhook giấy mời, CTSV, báo cáo ngày/tháng |

### 1.2 Routing `doGet` / `doPost`

| Request | Kết quả |
|---|---|
| `doGet` mặc định | Serve `Dashboard.html` — title «Hệ thống Quản trị Việt Mỹ» |
| `doGet?p=account` | Serve `Account.html` — title «CỔNG KẾ TOÁN» |
| `doGet?action=getData` | JSON `getMetaDataPublic()` |
| `doPost` body JSON | `savePublicForm(data)` → JSON `{result, message?, id?}` |

XFrame: `ALLOWALL`. Viewport mobile meta bật.

### 1.3 Luồng dữ liệu chuẩn khi ghi hồ sơ

```
UI → google.script.run → LockService
  → Validate
  → Ghi Google Sheet (source of truth)
  → SpreadsheetApp.flush()
  → writeToFirebase("students/"+maSV, row70)
  → Cột sync (index 70 / cột BS): "ĐÃ ĐỒNG BỘ" | "LỖI ĐỒNG BỘ"
  → (nếu đủ điều kiện) UrlFetchApp → n8n
```

### 1.4 Luồng đọc danh sách

```
readFromFirebase("students")
  → nếu có: Object.values(fbData)
  → nếu không: đọc Sheet từ dòng 3, tối đa 3000 dòng cuối, 70 cột
  → pad mỗi row đủ 70 ô, map safe()
  → filter theo role
  → sort ngày tạo (cột 17) mới → cũ
```

---

## 2. Cấu hình CONFIG (Main.gs)

### 2.1 Sheet names

| Key | Tên sheet | Dùng cho |
|---|---|---|
| `STUDENTS` | `DU_LIEU_SINH_VIEN` | Hồ sơ SV (dữ liệu từ **dòng 3**) |
| `MAJORS` | `NGANH_HOC` | Danh mục ngành (A2:B) |
| `COUNSELORS` | `TU_VAN_VIEN` | TVV (A3:G / migrate A3:I) |
| `KETOAN` | `KE_TOAN` | Login kế toán (A2:B = user/pass) |
| `SCHOLARSHIPS` | `HOC_BONG` | Học bổng (A2:G) |
| `TRAINING` | `HE_DAO_TAO` | Hệ + niên khóa (A2:B) |
| `STATUS` | `TRANG_THAI` | Danh sách trạng thái (cột A) |

### 2.2 Drive folders

| Key | Mục đích |
|---|---|
| `FOLDER_ROOT` | Upload bill chứng từ theo folder `{tên}_{id}` hoặc `{cleanName}_{cccdShort}` |
| `FOLDER_INVITE_ROOT` | Folder giấy mời `{họ tên}_{mã SV}` |

### 2.3 Webhooks n8n

| Key | Khi bắn |
|---|---|
| `N8N_WEBHOOK` | TVV tạo/sửa có đổi tiền/file; trigger giấy mời |
| `N8N_WEBHOOK_CTSV` | TVV create/update (cùng payload); kế toán duyệt; Full NE |
| `N8N_WEBHOOK_DAILY_REPORT` | `sendDailyReportToN8N` |
| `N8N_WEBHOOK_MONTHLY_REPORT` | `sendMonthlyReportToN8N` (chỉ ngày cuối tháng) |

### 2.4 Firebase

- Base URL RTDB + secret query `?auth=`
- Paths: `students`, `students/{id}`, `users`, `users/{emKey}`, `students_test/{id}` (tool test)
- `SYNC_COL_INDEX = 70` → cột thứ **71** trên Sheet (BS), array index 70

### 2.5 Spreadsheet kế toán phụ (hardcode trong `processPaymentDecision`)

Khi duyệt `ĐỒNG Ý`: append row 13 cột vào sheet đầu của spreadsheet riêng:

| Index row insert | Nội dung |
|---|---|
| 1 | Mã SV |
| 2 | Batch (lần thu 1–5) |
| 4 | Ngày TVV báo |
| 5 | Ngày kế toán duyệt (dd/MM/yyyy GMT+7) |
| 6 | Họ tên SV |
| 12 | Số tiền duyệt |

---

## 3. Schema hàng hồ sơ (70 cột, 0-based)

Dữ liệu bắt đầu **dòng 3** Sheet. Mỗi SV trên Firebase là mảng ~70 phần tử, key = mã SV (`row[1]`).

| Index | Ý nghĩa | Ghi chú |
|---:|---|---|
| 0 | STT | |
| 1 | **Mã SV** | Format `yyMMdd` + 4 số seq; không chứa `. # $ [ ]` (Firebase key) |
| 2 | Họ tên | |
| 3 | Giới tính | Nam / Nữ |
| 4 | Ngày sinh | Thường lưu `'dd/MM/yyyy` (prefix `'` chống Excel) |
| 5 | SĐT SV | `'digits` hoặc `'+digits` |
| 6 | Email | |
| 7 | *(trống / không dùng rõ trong UI)* | |
| 8 | Địa chỉ thường trú | |
| 9 | Nơi ở hiện tại | |
| 10 | **Hệ đào tạo** | Dùng phân loại 9+ / TC / Du học |
| 11 | *(trống)* | |
| 12 | Ngành học | |
| 13 | Niên khóa | |
| 14 | Nơi sinh | |
| 15 | Dân tộc | |
| 16 | CCCD / Passport | hoặc literal `CHƯA CÓ` |
| 17 | **Ngày tạo** | `dd/MM/yyyy HH:mm:ss` |
| 18 | **TVV** | Tên khớp `users.name` / sheet TVV |
| 19 | Cơ sở học | |
| 20 | Họ tên bố | |
| 21 | SĐT bố | |
| 22 | Họ tên mẹ | |
| 23 | SĐT mẹ | Account hiện SĐT mẹ ở cột liên hệ |
| 24 | Người giám hộ | |
| 25 | SĐT giám hộ | |
| 26 | Trường THPT | |
| 27 | Tỉnh/thành THPT | |
| 28 | Khu vực | |
| 29 | **Học bổng 1** | |
| 30 | Tiền lần 1 (Cọc/Ứng) | |
| 31 | Tiền lần 2 (Bổ sung L1) | |
| 32–33 | *(không map UI chính)* | |
| 34 | Link bill lần 1 | |
| 35 | Link bill lần 2 | |
| 36 | **URL folder giấy mời** | Drive folder |
| 37 | **Tổng tiền khai báo** | sum m1..m5 (TVV) |
| 38 | Ghi chú | **Backend lưu đây** |
| 39 | **Trạng thái hồ sơ** | xem §5 |
| 40 | *(sheet col 41 — không rõ UI)* | |
| 41 | *(Dashboard openEdit đọc note nhầm ở đây — bug)* | |
| 42 | **Tình trạng / hoàn thiện** | `"ĐÃ HOÀN THIỆN"` khi đủ field + đủ cọc |
| 43 | Điểm / score | |
| 44 | Tiền lần 3 | |
| 45 | Link bill lần 3 | |
| 46 | Tiền lần 4 | |
| 47 | Link bill lần 4 | |
| 48 | Tiền lần 5 | |
| 49 | Link bill lần 5 | |
| 50 | Duyệt lần 1 | `ĐỒNG Ý` / `TỪ CHỐI` / `""` |
| 51 | Duyệt lần 2 | |
| 52 | Duyệt lần 3 | |
| 53 | Duyệt lần 4 | |
| 54 | Duyệt lần 5 | |
| 55 | n8n_status | Chuỗi flag `okN,confirmN,noN` — bị xóa khi TVV đổi tiền/file lần N |
| 56 | **Nguồn 1 (Source)** | Bắt buộc trên Dashboard |
| 57–59 | *(không map UI chính)* | |
| 60 | Ngày thu lần 1 | `'dd/MM/yyyy` |
| 61 | Ngày thu lần 2 | |
| 62 | Ngày thu lần 3 | |
| 63 | Ngày thu lần 4 | |
| 64 | Ngày thu lần 5 | |
| 65 | **Full NE flag** | `""` / `YÊU CẦU FULL NE` / `ĐÃ FULL NE` |
| 66 | **Ngày Full NE** | `'dd/MM/yyyy` — báo cáo ngày dùng timestamp cột này |
| 67 | *(setFullNE ghi cột 67 1-based = index 66 ngày; cột 66 1-based = index 65 text)* | Xem §7.4 |
| 68 | Nguồn 2 | |
| 69 | Học bổng 2 | |
| 70 | **Sync status** | `ĐÃ ĐỒNG BỘ` / `LỖI ĐỒNG BỘ` / `""` |

### 3.1 Mapping 5 đợt thu (thống nhất UI + backend)

| Batch | Tiền (0-based) | Bill | Duyệt | Ngày | Sheet col tiền (1-based trong processPayment) |
|---:|---:|---:|---:|---:|---:|
| 1 | 30 | 34 | 50 | 60 | 31 |
| 2 | 31 | 35 | 51 | 61 | 32 |
| 3 | 44 | 45 | 52 | 62 | 45 |
| 4 | 46 | 47 | 53 | 63 | 47 |
| 5 | 48 | 49 | 54 | 64 | 49 |

`processPaymentDecision` dùng:

- `moneyCols = [31,32,45,47,49]` (1-based Sheet)
- `billCols = [35,36,46,48,50]`
- `confirmCol = 51 + (batch-1)`
- `dateCol = 61 + (batch-1)`
- Status hồ sơ ghi cột **40** (1-based) = index 39

---

## 4. Master data & metadata

### 4.1 `getMetaDataPublic()`

Trả về:

- `nganh[]`: `{ name, isGroup }` — `isGroup` nếu cột A là số La Mã `I,II,III…` (optgroup)
- `tuvan[]`: tên TVV từ sheet COUNSELORS A3:G (cột A = name, G = dept)
- `departments[]`, `tvvDeptMap{name→dept}`
- `systems[]`, `years[]` từ HE_DAO_TAO; **ép luôn có** `"Liên thông Trung Cấp Cao Đẳng"`
- `statuses[]` từ TRANG_THAI; fallback: `MỚI`, `ĐÃ CỌC ĐỦ`, `ĐANG HOÀN THIỆN`, `CỌC THÀNH CÔNG`, `KIỂM TRA LẠI`

### 4.2 `getMetaData()` (Dashboard)

= public + `scholarships[]`:

- Sheet HOC_BONG A2:G
- Cột A = hệ (carry-forward khi trống), B = tên HB, E = giá trị, G = điều kiện
- Skip dòng không có tên HB

### 4.3 Nguồn dữ liệu (hardcode UI Dashboard)

`Email Marketing`, `SchoolTour HN`, `School Tour Tỉnh`, `MOU`, `CBNV`, `Sinh viên trường`, `Hotline`, `Facebook Ads`, `Tiktok`, `Zalo`, `Giới thiệu`, `Seeding`, `Cộng tác viên`, `Google Ads`, `Hội thảo`, `Đại lý`, `TVV Tự kiếm`, `Khác`

Form public: nguồn mặc định `data.source || "Form Public"`.

---

## 5. Trạng thái hồ sơ & rule tiền

### 5.1 Trạng thái (`row[39]`)

| Giá trị | Khi nào |
|---|---|
| `MỚI` | Tạo mới (TVV / public / import) |
| `ĐANG HOÀN THIỆN` | Có tiền duyệt > 0 nhưng chưa đủ ngưỡng cọc; hoặc KT set khi duyệt một phần |
| `CỌC THÀNH CÔNG` | Tổng tiền **đã ĐỒNG Ý** ≥ ngưỡng cọc |
| `KIỂM TRA LẠI` | KT `TỪ CHỐI` một batch |
| `ĐÃ HOÀN THIỆN` | Full NE; hoặc đủ field bắt buộc sau khi đạt cọc (ghi cột 42 + có thể status) |

### 5.2 Ngưỡng tiền (dùng khắp UI + báo cáo + KT)

Gọi `money` = tổng khai báo `row[37]` **hoặc** trong báo cáo kỳ = tổng tiền `ĐỒNG Ý` trong kỳ.

| Hệ | LPXT | Cọc (NE) |
|---|---|---|
| Có `"9+"` trong hệ | **Không** dùng LPXT (báo cáo evaluate) | ≥ **2.000.000** |
| Khác | ≥ **150.000** và chưa cọc | ≥ **1.000.000** |

Cờ phụ:

- `isCoc` nếu money ≥ threshold **HOẶC** status ∈ {`CỌC THÀNH CÔNG`, `ĐÃ HOÀN THIỆN`}
- `isFullNE` nếu `row[65] === "ĐÃ FULL NE"`
- `isLpxt` nếu chưa full NE, chưa cọc, money ≥ 150k (hệ không phải 9+)
- `isDang` (Dashboard evaluate): chưa full/cọc/lpxt nhưng money > 0 hoặc status `ĐANG HOÀN THIỆN`

Phân loại hệ (báo cáo N8N `evaluateStudentForN8N`):

- `is9Plus`: hệ chứa `9+`
- `isTCSC`: chứa `TRUNG CẤP` hoặc `SƠ CẤP`
- `isDuHoc`: chứa `DU HỌC` hoặc `NGẮN HẠN` hoặc `SBS`
- Còn lại: nhóm CĐ/9+ trong báo cáo ngày

### 5.3 Field bắt buộc để gắn «ĐÃ HOÀN THIỆN» sau cọc (KT duyệt)

Trong `processPaymentDecision`, khi tổng **đã ĐỒNG Ý** ≥ threshold, check các index phải có giá trị:

`[0,1,2,3,4,5,6,8,10,12,14,15,16,17,20,21,22,23,26,27,28]`

Nếu đủ → `sheet col 42` = `"ĐÃ HOÀN THIỆN"`.

---

## 6. Validate & helper chung

### 6.1 Ngày

- `isValidDate`: chấp nhận `dd/MM/yyyy` hoặc `yyyy-MM-dd` (đổi sang dd/MM/yyyy); năm 1900 → năm hiện tại+1; check ngày theo tháng/nhuận
- `formatStandardDate`: chuẩn hóa về `dd/MM/yyyy`
- Lưu Sheet thường prefix `'` để giữ dạng text

### 6.2 SĐT

- `formatPhone`: nếu bắt đầu `+` → `+` + digits; else chỉ digits
- `isValidPhone`: `^(0\d{9}|\+\d{9,15})$`
- UI Dashboard: chỉ cho `[0-9+]`

### 6.3 CCCD / Passport

- `formatCCCD`: nếu `"CHƯA CÓ"` giữ nguyên; else bỏ ký tự không alphanumeric, upper
- `isValidID`:
  - `"CHƯA CÓ"` → OK
  - Thuần số → length 9 hoặc 12
  - Có chữ → length 7, 8 hoặc 9 (server); UI Dashboard passport cho phép 7–15 alphanumeric

### 6.4 Tiền

- Strip non-digit khi so sánh/tính
- Money cols khi sync Firebase: indices `[30,31,37,44,46,48]` chỉ giữ digits

### 6.5 Email key Firebase

`encodeEmail`: thay `.` → `,`, lower, trim. Dùng làm key `users/{emKey}`.

### 6.6 Lock

| Hàm | Lock wait |
|---|---:|
| `processPaymentDecision` | 10s |
| `saveOrUpdateStudent` | 15s |
| `savePublicForm` | 30s |
| `triggerInvitation` | 10s |
| `setFullNE` | 10s |
| `processBulkImport` | 30s |

`savePublicForm` nếu lock timeout → message thân thiện bảo bấm Gửi lại.

---

## 7. Backend functions — điều kiện chi tiết

### 7.1 Auth

#### `loginUser(email, password)` — Dashboard

1. Đọc `users` Firebase
2. Key = `encodeEmail(email)`; không có → lỗi «Tài khoản không tồn tại»
3. So sánh `password` plaintext
4. `teamMembers`:
   - `admin` → tất cả `user.name`
   - `teamlead` → mình + user có `manager === user.name`
   - khác → `[user.name]`
5. Trả: `{status, role, name, displayName, teamMembers}`

Roles quan sát trong UI: `admin`, `teamlead`, `tvv`, `marketing`.

#### `loginAccountant(email, password)` — Account

- Sheet `KE_TOAN` từ dòng 2: col A user, B pass (trim, email lower)
- Success → `{status:"success", name:"KẾ TOÁN"}`

### 7.2 Đọc data

#### `getStudentData(counselorName, role, teamMembers)`

Filter:

- `admin` **hoặc** `marketing` → full
- `teamlead` + teamMembers → `row[18]` ∈ team (case-insensitive)
- else → `row[18]` includes counselorName (case-insensitive)

Sort: `row[17]` parse `dd/MM/yyyy[ HH:mm:ss]` giảm dần.

#### `getAccountantData()`

- Full students (Firebase/Sheet)
- Filter: `parseInt(row[37] digits) > 10000`
- Sort: **pending trước** (có tiền mà duyệt trống, hoặc `row[65]==="YÊU CẦU FULL NE"`), rồi ngày tạo mới → cũ

### 7.3 `saveOrUpdateStudent(payload)` — TVV/Admin

**Input shape:**

```
{
  studentId?, counselorName, folderName,
  fields: { fullName, gender, dob, phone, email, address, currentAddress,
            eduSystem, major, schoolYear, pob, ethnicity, cccd, campus,
            father*, mother*, guardian*, school, schoolProvince, area,
            scholarship, scholarship2, source, source2,
            m1..m5, note, situation, score, d1..d5 (dates),
            reqFullNe: boolean },
  files: { d1..d5: {base64,type,name}|null },
  old: { d1..d5: url cũ }
}
```

**Điều kiện lỗi sớm:**

- Dob invalid → lỗi format
- Phone invalid → lỗi SĐT
- CCCD invalid → lỗi CCCD
- Trùng SĐT với HS khác → lỗi kèm tên HS
- Trùng CCCD với HS khác (trừ cả hai/`CHƯA CÓ`) → lỗi

**Tạo mã mới nếu không tìm thấy studentId:**

- `prefix = yyMMdd`
- `seq = max seq cùng prefix + 1`, pad 4 số

**Khi UPDATE và đổi tiền hoặc có file mới batch N:**

- Xóa `r[50+N-1]` (status duyệt)
- Set `isMoneyOrFileChanged = true`
- Gỡ trong `r[55]` các token `okN`, `confirmN`, `noN`

**Khi CREATE:** nếu total > 0 hoặc có bất kỳ file → `isMoneyOrFileChanged = true`

**reqFullNe:**

- checked → nếu chưa `ĐÃ FULL NE` thì set `YÊU CẦU FULL NE`
- unchecked → nếu đang `YÊU CẦU FULL NE` thì clear `""`

**Webhook TVV** (cả `N8N_WEBHOOK` và `N8N_WEBHOOK_CTSV`) khi:

- `isMoneyOrFileChanged` **HOẶC**
- `reqFullNe` lần đầu (old không phải YÊU CẦU / ĐÃ FULL)

Event: `create_profile` | `update_profile` + `full_data` map named fields.

### 7.4 `savePublicForm(data)`

Validate: dob, phone, cccd, **bắt buộc eduSystem**  
Chống trùng SĐT/CCCD (message hướng hotline)  
Tạo mã SV, append row tối thiểu, status `MỚI`, source mặc định Form Public  
Sync Firebase + sync col  
**Không** bắn n8n trong hàm này (theo code đã đọc)

### 7.5 `processPaymentDecision(payload)`

```
{ studentId, studentName, batch:1..5, decision:"ĐỒNG Ý"|"TỪ CHỐI",
  amount, newFile?, paymentDate? }
```

- Nếu decision hiện tại đã giống → success no-op
- Upload file mới nếu có → ghi bill col
- Ghi amount, decision, date
- `TỪ CHỐI` → status `KIỂM TRA LẠI`
- `ĐỒNG Ý` → tính tổng approved từ 5 batch; cập nhật status theo ngưỡng; có thể set col 42 hoàn thiện
- Sync Firebase
- Nếu `ĐỒNG Ý` → append spreadsheet KT
- Webhook CTSV `event: accountant_decision` (chỉ 1 webhook CTSV, chống spam đôi)

### 7.6 `setFullNE(studentId)`

1. Với mỗi batch: nếu amt > 0 và status `""` → set `ĐỒNG Ý` + ngày hôm nay; cộng `autoApprovedAmount`
2. Col 66 (1-based) = `ĐÃ FULL NE` → index 65
3. Col 67 (1-based) = `'dd/MM/yyyy` → index 66
4. Col 40 (1-based) = `ĐÃ HOÀN THIỆN` → index 39
5. Sync Firebase
6. Webhook CTSV `event: accountant_full_ne` **một lần**

### 7.7 `triggerInvitation(payload)`

```
{ studentId, docType, scholarship?: {name,value,condition} }
```

**docType UI:**

- `LE_PHI_CO_DAU` / `LE_PHI_KHONG_DAU`
- `TRUNG_TUYEN_9_CO_DAU` / `TRUNG_TUYEN_9_KHONG_DAU`
- `TRUNG_TUYEN_CD_CO_DAU` / `TRUNG_TUYEN_CD_KHONG_DAU`
- `THU_MOI_CD_CO_DAU` / `THU_MOI_CD_KHONG_DAU`

Nếu chưa có folder URL hợp lệ Drive → tạo dưới `FOLDER_INVITE_ROOT`, ghi col 37 (index 36), sync FB  
Payload n8n: `action:"create_document"`, `folderId`, `studentData` + scholarship + source/HB text

### 7.8 Import / sync / admin users

#### `processBulkImport(dataList, counselorName)`

Mỗi item: `hoTen, ngaySinh, gioiTinh, sdt, cccd, email, diaChi, heDaoTao, nganhHoc, tinhTHPT, nguon`  
Skip trùng SĐT/CCCD; tạo mã theo ngày; status `MỚI`; patch Firebase multi; trả success/fail counts

#### `DONG_BO_DATA_LEN_FIREBASE`

Đọc display values dòng 3+, 70 cột → PUT toàn bộ `students.json` → set sync col «ĐÃ ĐỒNG BỘ»

#### `syncFailedDataToFirebase`

Quét sync col = `LỖI ĐỒNG BỘ` → retry từng dòng, sleep 500ms

#### `BACKUP_STUDENTS_TO_SHEET`

Đọc FB → clear sheet từ dòng 3 (71 cột) → write lại sorted theo mã SV + STT + sync OK

#### `adminManageUser(action, userData)`

- `delete` → DELETE `users/{emKey}`
- `update` + đổi email → xóa key cũ rồi PUT key mới
- else PUT `users/{emKey}`

#### `MIGRATE_USERS_TO_FIREBASE`

Hardcode admin + quét COUNSELORS A3:I → PUT `users`

Fields user: `name, displayName, email, password, code, phone, dept, manager, role`

### 7.9 Báo cáo server n8n

#### `sendDailyReportToN8N`

- Khung 0h–23h59 hôm nay (Asia/Ho_Chi_Minh)
- Full NE trong ngày theo `row[66]` timestamp
- Tiền: status `ĐỒNG Ý` + amt > 0 + ngày thu trong ngày
- HTML chi tiết 3 nhóm hệ + tổng tiền
- Post `N8N_WEBHOOK_DAILY_REPORT`

#### `sendMonthlyReportToN8N`

- Chỉ chạy nếu **ngày mai sang tháng khác** (ngày cuối tháng)
- `nbMonth`: tạo trong tháng & totalApproved == 0
- Có payment duyệt trong tháng: nếu coc/fullNE → neMonth + đếm theo TVV; else nếu lpxt → lpxtMonth
- Top TVV theo NE count
- Post monthly webhook

---

## 8. Dashboard.html — logic UI

### 8.1 Phân quyền giao diện sau login

| Role | Filter TVV | Cột admin (TVV/Nguồn) | Báo cáo | Tạo HS | Đổi TVV trong form | User mgmt | Admin tools | Chi tiết HS |
|---|---|---|---|---|---|---|---|---|
| admin | Có | Có | Có | Có | Có | Có | Có | Có |
| teamlead | Có (team) | Có | Có | Có | Có | Không | Không | Có |
| tvv | Không | Không | Không | Có | Không | Không | Không | Có |
| marketing | Có (xem) | *(không admin-visible class)* | Có, auto mở | Ẩn | Không | Không | Không | **Ẩn nút** |

Marketing: CSS ẩn `#studentTableBody .btn-outline-dark`; vẫn load full data.

### 8.2 Màn danh sách

- Search: tên / SĐT / CCCD; mã SV riêng; status; tiến độ phí (`CHUA_NOP` / `LPXT` / `COC` / `FULL_NE`); multi-select TVV (admin/teamlead)
- Stats bar (khi có ngữ cảnh TVV/filter): tổng, LPXT, cọc, đang HT, full NE
- Pagination 25 rows
- Click row → `openEdit`
- Export Excel danh sách đang lọc
- Refresh → `getStudentData`

### 8.3 Form hồ sơ (3 tab)

**Tab Thông tin — bắt buộc khi lưu:**  
Tên, Ngày sinh, CCCD, SĐT, Hệ, Ngành, **Nguồn 1**

Client validate phone/CCCD trùng logic gần server; `checkDuplicate` disable Save nếu trùng SĐT/CCCD.

**Tab Tài chính:** 5 lần thu (tiền, ngày, file, status badge, link bill) + toggle Full NE yêu cầu + tổng realtime

**Tab Giấy mời:** chỉ khi đã có ID; chọn HB apply; 8 nút docType → `triggerInvitation`

**Lưu:** chống double-submit `isSavingProfile`; clear file inputs sau success; create → giữ modal với ID mới.

**Bug đã biết:** `openEdit` đọc note từ `sv[41]` trong khi backend ghi `r[38]`.

### 8.4 Báo cáo client (`runReportEngine`)

Kỳ lọc `[startDate, endDate]` (mặc định đầu tháng → hôm nay).

Hồ sơ vào báo cáo nếu **một trong**:

1. Ngày tạo trong kỳ, hoặc  
2. Có tiền `ĐỒNG Ý` với ngày thu trong kỳ, hoặc  
3. Full NE với ngày Full NE trong kỳ  

Trên bản **clone** row:

- Batch không thuộc kỳ → xóa money/status trên clone  
- `row[37]` = moneyInPeriod  
- Status clone tái tính theo moneyInPeriod / full NE  
- Nếu không full NE trong kỳ → xóa flag full trên clone  

Filter thêm: phòng ban + multi TVV.

**Tabs:**

1. **Tổng quan** — tổng HS; mới / đang / done (evaluate độc quyền); doughnut status; DT theo hệ  
2. **TVV** — ranking theo phòng hoặc chi tiết 1 TVV  
3. **MKT** — chỉ nguồn chứa keyword allowlist; pie; line 10 ngày; line tháng; bảng chi tiết; conversion  
4. **Ngành** — total / hoạt động / lpxt / coc / full / chưa  
5. **Tuyển sinh** — checkbox hệ + nguồn; bảng conversion + chi tiết giao dịch từng batch  

Export Excel báo cáo / PDF (html2pdf landscape) / Excel từng bảng admin (thiếu hàm `exportTableToExcel` — xem §11).

### 8.5 Excel template & bulk upload

Headers mẫu 11 cột (Họ tên… Nguồn).  
Dòng thiếu field bắt buộc bị skip.  
Confirm → `processBulkImport(validData, CURRENT_USER.name)`.

### 8.6 Admin tools / User mgmt

- Password gate hardcode trong UI (không an toàn)  
- Actions: `DONG_BO_DATA_LEN_FIREBASE`, `BACKUP_STUDENTS_TO_SHEET`, **`BACKUP_USERS_TO_SHEET` (không có trong Main.gs)**  
- User modal: create/update/delete qua `adminManageUser`; role `tvv|teamlead|admin|marketing`; manager dropdown = teamlead/admin

### 8.7 Local storage

`tvv_email`, `tvv_pass`, `tvv_auto_login` — plaintext.

---

## 9. Account.html — logic UI

### 9.1 Login / data

- `loginAccountant` → `getAccountantData`
- Local storage: `kt_user`, `kt_pass`, `kt_auto_login`

### 9.2 Hiển thị

- Stat counts theo status trên **toàn DATA** (không theo filter): MỚI / ĐANG HT / CỌC THÀNH CÔNG / KIỂM TRA LẠI
- Filter search + status
- Toggle «Hiện CỌC THÀNH CÔNG»: ẩn status cọc/hoàn thiện **trừ khi** còn batch pending (tiền > 0 + duyệt trống)
- Cột lần thu: nếu amt=0 và chưa duyệt → ô thu gọn (`-`); có tiền → input tiền + date + file + nút Duyệt/Từ chối hoặc badge
- Full NE:
  - `ĐÃ FULL NE` → badge
  - `YÊU CẦU FULL NE` → nút đỏ pulse «XÁC NHẬN FULL»
  - else nếu tổng > 0 → nút «Đánh dấu Full NE»

### 9.3 Actions

- `process(...)` → `processPaymentDecision` (chống double-submit)
- `confirmNE(...)` → `setFullNE` (chống double-submit)
- Sau duyệt thành công: replace nút bằng badge + `loadData()`

---

## 10. Payload `full_data` (n8n) — map tên field

Dùng chung TVV / KT / Full NE:

`row_index, id, fullName, gender, dob, phone, email, address, currentAddress, system, major, schoolYear, pob, ethnicity, cccd, created_at, counselor, campus, father, fatherPhone, mother, motherPhone, guardian, guardianPhone, school, province, area, scholarship, scholarship2, source, source2, deposit_money, deposit_link, l1_money, l1_link, bs3, bill3, bs4, bill4, bs5, bill5, valid1..valid5, n8n_status, date1..date5, total_money, status, note, situation, score`

Events:

| event | Nguồn |
|---|---|
| `create_profile` / `update_profile` | TVV save |
| `accountant_decision` | KT duyệt (+ decision, amount, batch) |
| `accountant_full_ne` | Full NE (+ auto_approved_amount) |
| `create_document` (action) | Giấy mời |

---

## 11. Lỗi / lệch / nợ kỹ thuật đã phát hiện

1. **Note field:** Dashboard đọc `sv[41]`, backend ghi `r[38]`.
2. **`BACKUP_USERS_TO_SHEET`:** UI gọi, Main.gs không định nghĩa.
3. **`exportTableToExcel`:** Tab tuyển sinh gọi, không thấy định nghĩa.
4. **`#rp_select_tvv`:** UI đã chuyển checkbox multi-TVV nhưng nhánh chi tiết 1 TVV / export vẫn đọc select cũ → dễ null.
5. **Trùng định nghĩa JS** trong Dashboard (`renderTab*`, `parseDateForReport`, helpers) — bản sau ghi đè.
6. **Bảo mật:** Firebase secret, mật khẩu admin UI, password plaintext users/KT, lưu pass localStorage.
7. **Marketing** đọc full PII phía server dù UI khóa sửa.
8. Index Full NE: text ở 65, ngày ở 66 — nhất quán giữa `setFullNE` (sheet 1-based 66/67) và báo cáo (`r[65]`/`r[66]`).

---

## 12. Checklist đối chiếu khi port sang app mới

Khi làm nhiệm vụ tiếp theo, đối chiếu từng mục:

- [ ] Schema hồ sơ ↔ Lead model hiện tại (field mapping 70 cột)
- [ ] Roles: admin / teamlead / tvv / marketing / accountant
- [ ] Rule tiền: 150k LPXT / 1tr cọc / 2tr hệ 9+ / Full NE
- [ ] Status machine: MỚI → ĐANG HT → CỌC THÀNH CÔNG / KIỂM TRA LẠI → Full NE / ĐÃ HOÀN THIỆN
- [ ] 5 lần thu + duyệt độc lập + reset duyệt khi TVV sửa tiền/file
- [ ] Chống trùng SĐT/CCCD (+ ngoại lệ CHƯA CÓ)
- [ ] Mã SV `yyMMdd####`
- [ ] Phân quyền xem theo teamMembers
- [ ] Báo cáo theo kỳ: tạo OR nộp tiền OR full NE trong kỳ
- [ ] Giấy mời / n8n events
- [ ] Import Excel template 11 cột
- [ ] Cổng kế toán riêng vs nhúng quyền finance trong app mới
- [ ] Không mang secret/password plaintext sang production mới

---

## 13. Bản đồ gọi hàm UI → Main.gs

| UI | Hàm server |
|---|---|
| Dashboard `handleLogin` | `loginUser` |
| `refreshDataAndRender` | `getStudentData(name, role, teamMembers)` |
| `preloadMetaData` | `getMetaData` |
| `submitForm` | `saveOrUpdateStudent` |
| `callN8N` | `triggerInvitation` |
| `handleExcelUpload` | `processBulkImport` |
| User CRUD | `adminManageUser`, `readFromFirebase("users")` |
| Sync admin | `DONG_BO_DATA_LEN_FIREBASE` |
| Backup HS | `BACKUP_STUDENTS_TO_SHEET` |
| Link cổng KT | `getScriptUrl` + `?p=account` |
| Account `doLogin` | `loginAccountant` |
| Account `loadData` | `getAccountantData` |
| Account `process` | `processPaymentDecision` |
| Account `confirmNE` | `setFullNE` |
| Public form | `doPost` → `savePublicForm` |
| Public meta | `doGet?action=getData` → `getMetaDataPublic` |

---

*Hết file tham chiếu. Dùng làm nguồn sự thật khi nhận nhiệm vụ port / gap-analysis / implement feature còn thiếu trên app mới.*
