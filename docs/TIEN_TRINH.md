# Tiến trình dự án — Đánh giá dữ liệu / VietMy

> **Cập nhật lần cuối:** 2026-05-18  
> **Commit gần nhất:** _(sẽ ghi sau khi push)_  
> **Mục đích file này:** Sau mỗi lần chỉnh code, bổ sung mục **Nhật ký thay đổi** + cập nhật **Việc bạn cần làm** và **Chưa xong / cần xử lý**.

---

## Cách dùng file này

1. Mỗi khi merge / deploy một đợt việc → thêm block vào **Nhật ký thay đổi** (ngày, commit, tóm tắt).
2. Cập nhật **Trạng thái hiện tại** (đang ổn / đang chờ cấu hình / đang lỗi).
3. Sửa **Việc bạn cần làm** và **Cần xử lý** — xóa dòng đã xong, thêm việc mới.
4. Ghi **Bước kiểm tra** để tự test trước khi báo lỗi.

---

## Trạng thái hiện tại (tóm tắt)

| Hạng mục | Trạng thái | Ghi chú |
|----------|------------|---------|
| Hồ sơ — tab Tài chính (TVV) | ✅ Code xong | Upload bill → Firebase Storage, link lưu Firestore |
| Hồ sơ — tab Giấy mời | ✅ Code xong | Gửi n8n `giaymoits` tạo Google Docs |
| Cổng kế toán `/accountant` | ✅ Code xong | Duyệt 5 đợt + Full NE + gửi n8n |
| Báo cáo ngày/tháng từ Firestore | ✅ Code xong | Gửi webhook + log `financeReports` |
| Chứng từ trên Firebase Storage | ✅ Code xong | Không dùng Drive cho bill |
| n8n workflow (server) | ⚠️ Cần kiểm tra | App đã gọi đúng webhook; n8n phải **active** |
| Firebase Storage Rules | ⚠️ Bạn cấu hình | Xem `storage.rules.example` |
| Giấy mời — folder Drive lần đầu | ⚠️ Cần xử lý | Chưa tạo folder tự động nếu `inviteFolderUrl` trống |

---

## Việc bạn cần làm (sau đợt 2026-05-18)

### Firebase

- [ ] `.env` production: đủ `VITE_FIREBASE_*`, đặc biệt **`VITE_FIREBASE_STORAGE_BUCKET`**
- [ ] **Storage Rules:** publish rules cho `receipts/{folder}/{file}` (mẫu `storage.rules.example`)
- [ ] **Firestore Rules:** cho phép ghi `leads.finance`, đọc/ghi `financeReports`
- [ ] Index Firestore nếu Cổng kế toán báo lỗi: `leads` — `updatedAt` DESC

### n8n (apchn-host.lapage.vn)

- [ ] Workflow **`testctsv`** — active (thông báo thu / kế toán duyệt)
- [ ] Workflow **`baocao-ngay`** / **`baocao-thang`** — active (báo cáo từ app)
- [ ] Workflow **`giaymoits`** — active (chỉ `create_document`, **không** cần nhánh upload bill)
- [ ] `.env` app: `VITE_N8N_WEBHOOK_CTSV`, `VITE_N8N_WEBHOOK`, `VITE_N8N_WEBHOOK_DAILY`, `VITE_N8N_WEBHOOK_MONTHLY`

### Quyền & vận hành

- [ ] Cấp quyền **`finance:accountant`** / **`finance:reports`** cho tài khoản kế toán (nếu không phải admin)
- [ ] Deploy bản build mới lên hosting (GitHub Pages / server)
- [ ] Test checklist ở cuối file này

### Không cần làm (tránh nhầm)

- ~~Cấu hình n8n `upload_receipt` / Drive cho bill~~ — đã bỏ, bill chỉ Firebase
- ~~`VITE_DRIVE_RECEIPT_ROOT_FOLDER_ID`~~ — không dùng cho chứng từ

---

## Cần xử lý / backlog

| Ưu tiên | Nội dung | Ghi chú |
|---------|----------|---------|
| Cao | Tạo **folder Drive giấy mời** khi lần đầu (hiện `folderId` có thể trống) | Cần nhánh n8n `ensure_invite_folder` hoặc tạo folder trên GAS/Drive thủ công |
| Trung bình | `scholarship` trong payload n8n `full_data` | Có thể bổ sung tên học bổng từ `scholarships` khi gửi |
| Trung bình | `row_number` / Sheet sync | Workflow cũ cập nhật Google Sheet — app Firestore không gửi `row_index` |
| Thấp | Giới tính trên giấy mời | `studentData.gender` đang để trống |
| Thấp | Xóa / lưu trữ `hethongcu/n8n-upload-receipt-branch.json` | Chỉ tham khảo, không dùng cho bill Firebase |

---

## Bước kiểm tra nhanh (QA)

1. **TVV — Tài chính:** Upload bill → Lưu → link «Xem bill» mở được.
2. **n8n:** Tab Executions → `testctsv` có request sau khi lưu; `deposit_link` là URL `firebasestorage.googleapis.com/...`.
3. **Kế toán:** Menu **Kế toán** → hồ sơ chờ duyệt → Duyệt / Từ chối → Chat cập nhật.
4. **Báo cáo:** Cổng kế toán → «Gửi báo cáo ngày» → log trong collection `financeReports`.
5. **Giấy mời:** Chọn loại giấy → n8n `giaymoits` chạy (không liên quan bill Firebase).

---

## Nhật ký thay đổi

### 2026-05-18 — Tài chính Firebase, Cổng kế toán, báo cáo Firestore

**Commit:** _(ghi hash sau push)_

**Đã làm trong code:**

- Chứng từ thu: upload **Firebase Storage** (`receipts/{HọTên_MãSV}/{slot}_{tên_file}`), URL lưu `finance.payments.*.receiptUrl`.
- TVV lưu tài chính → chỉ webhook **`testctsv`** (bỏ gọi nhầm `giaymoits`).
- **Cổng kế toán** `/accountant`: duyệt 5 đợt, Full NE, upload bill, gửi `accountant_decision` / `accountant_full_ne`.
- **Báo cáo ngày/tháng** tổng hợp từ Firestore → `baocao-ngay` / `baocao-thang`, log `financeReports`.
- Quyền mới: `finance:accountant`, `finance:reports` (admin có sẵn).
- `enrollmentStatus` trên `finance` (MỚI, ĐANG HOÀN THIỆN, CỌC THÀNH CÔNG…).
- File tham khảo: `storage.rules.example`, workflow n8n mẫu trong `hethongcu/`.
- Responsive Cài đặt / Chấm điểm (đợt trước trên nhánh `main`).

**File chính:**

| File | Vai trò |
|------|---------|
| `src/services/leadReceiptStorage.ts` | Upload + đặt tên thư mục bill |
| `src/utils/persistLeadFinance.ts` | TVV lưu tài chính |
| `src/utils/persistAccountantDecision.ts` | Kế toán duyệt / Full NE |
| `src/utils/persistFinanceReport.ts` | Gửi + log báo cáo |
| `src/utils/n8nIntegration.ts` | Webhook n8n |
| `src/views/AccountantView.tsx` | UI kế toán |
| `src/hooks/useAccountantLeads.ts` | Tải danh sách hồ sơ |

**Đã bỏ:** `receiptDriveUpload.ts` (upload bill qua Drive/n8n).

---

### 2026-05-18 (trước) — Đồng bộ từ GitHub `d1492e4`

- Tab Tài chính / Giấy mời trên hồ sơ, tích hợp n8n cơ bản, `hethongcu/` tham chiếu hệ cũ.

---

## Ghi chú kỹ thuật (webhook)

| Sự kiện | Webhook | Payload chính |
|---------|---------|----------------|
| TVV lưu tài chính | `testctsv` | `event: update_profile`, `full_data` (có `deposit_link`, …) |
| Kế toán duyệt | `testctsv` | `event: accountant_decision`, `batch`, `decision` |
| Full NE | `testctsv` | `event: accountant_full_ne` |
| Tạo giấy mời | `giaymoits` | `action: create_document`, `studentData`, `docType` |
| Báo cáo ngày | `baocao-ngay` | `date`, `dailyDetailHtml` |
| Báo cáo tháng | `baocao-thang` | `month`, `nbMonth`, … |

---

## Mẫu ghi nhật ký (copy cho lần sau)

```markdown
### YYYY-MM-DD — [Tiêu đề ngắn]

**Commit:** `abc1234`

**Đã làm:**
- …

**Việc bạn cần làm thêm:**
- [ ] …

**Cần xử lý:**
- …
```
