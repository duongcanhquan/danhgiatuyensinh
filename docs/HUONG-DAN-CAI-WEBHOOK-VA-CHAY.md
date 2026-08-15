# Hướng dẫn cài webhook & chạy ngay (VietMy)

Mục tiêu: sau các bước dưới, **TVV nộp tiền → Chat**, **KT duyệt → Chat**, **giấy mời → n8n/Drive**, **báo cáo ngày/tháng** chạy như Apps Script cũ.

Chi tiết payload: [`N8N_FINANCE_FLOW.md`](./N8N_FINANCE_FLOW.md) · Drive bill: [`RECEIPT_DRIVE_APPS_SCRIPT.md`](./RECEIPT_DRIVE_APPS_SCRIPT.md).

---

## 0. Checklist 10 phút

| # | Việc | Ở đâu |
|---|---|---|
| 1 | Deploy Functions + Rules (một lần) | Terminal |
| 2 | Dán 4 URL n8n → Lưu | Cài đặt → Webhook n8n |
| 3 | n8n workflow **Active** + map Chat | n8n host |
| 4 | Cấu hình Drive (hoặc R2) lưu bill | Cài đặt → Chứng từ |
| 5 | Folder giấy mời + redeploy GAS `ensure_folder` | Cài đặt → Giấy mời + Apps Script |
| 6 | Smoke test 4 bước | App thật |

---

## 1. Deploy (một lần / mỗi lần đổi CF)

```bash
firebase deploy --only functions,firestore:rules,firestore:indexes
```

Cần có:

- `accountantApplyPaymentDecision` / `accountantConfirmFullNe`
- `sendScheduledFinanceReports` (cron **23:55 Asia/Ho_Chi_Minh**)
- `submitPublicLead` rate limit
- Rules: marketing không tạo/sửa HS

---

## 2. Bốn URL webhook n8n

Vào app → **Cài đặt → Webhook n8n**.

| Ô | URL mẫu VietMy (Apps Script cũ) | Dùng khi |
|---|---|---|
| Giấy mời | `https://apchn-host.lapage.vn/webhook/giaymoits` | Chỉ tạo giấy mời |
| CTSV / tài chính | `https://apchn-host.lapage.vn/webhook/testctsv` | TVV nộp tiền + KT duyệt/từ chối/Full NE → Chat |
| Báo cáo ngày | `https://apchn-host.lapage.vn/webhook/baocao-ngay` | Gửi tay hoặc cron 23:55 |
| Báo cáo tháng | `https://apchn-host.lapage.vn/webhook/baocao-thang` | Gửi tay hoặc ngày cuối tháng |

Trong UI: bấm **«Điền URL mẫu VietMy»** (chỉ điền ô trống) → **Lưu**.

**Không cần rebuild app** sau khi đổi URL. OrgProvider + `ensureOrgN8nWebhooksLoaded` đọc lại Firestore.

URL trống = tắt luồng đó (không silent fallback hardcode sau khi đã load doc).

### Event n8n phải bắt

| Event / field | Webhook |
|---|---|
| `action: create_document` | Giấy mời |
| `event: update_profile` + `sub_event: counselor_payment_submitted` | CTSV (+ giấy mời) |
| `event: accountant_decision` | CTSV |
| `event: accountant_full_ne` | CTSV |
| `event: daily_finance_report` | Báo cáo ngày |
| payload tháng (`month`, `nbMonth`, …) | Báo cáo tháng |
| `action: student_registration` | URL cổng đăng ký (`Cài đặt → Cổng đăng ký`) — CF `submitPublicLead` + `notifyCrmPortalRegistration` |

**Google Chat:** app gửi sẵn `google_chat_payload` (text *in đậm* + cardsV2 nút xem bill). Trên n8n ưu tiên forward payload này; fallback `message_vi` / `chat_text`.

---

## 3. Lưu hóa đơn — R2 hay Drive?

| Cách | Khi nào chọn |
|---|---|
| **Drive (Apps Script)** | Giống hệ cũ nhất — khuyến nghị VietMy |
| **R2** | Đã có Cloudflare Worker (`workers/receipt-r2`) |
| **Firebase Storage** | Fallback khi chưa có R2/Drive |
| **Tự động** | R2 nếu có URL → Drive → Firebase |

### Drive (khuyến nghị)

1. Deploy `scripts/apps-script/receipt-drive-webapp.gs` (Web app, Anyone, token trong Script Properties).
2. Đảm bảo có **upload** + **`action: ensure_folder`**.
3. Cài đặt → **Chứng từ**:
   - Cách lưu: `Drive` hoặc `Tự động`
   - URL Apps Script + token → **Lưu**
4. Folder bill gốc Apps Script cũ: `1wXoWyfUVC8hva-7MEKJaaoV6p67BEhyG` (cấu hình trong GAS `ROOT_FOLDER_ID`).

### R2

Xem [`R2_RECEIPT_STORAGE.md`](./R2_RECEIPT_STORAGE.md) — điền URL upload / token / public base ở tab Chứng từ.

---

## 4. Giấy mời — folder Drive

1. Cài đặt → **Giấy mời & mẫu**
2. ID thư mục gốc = `1efMVihgSpNqMCeIo1M8s2SHSbFo0WYoZ` (FOLDER_INVITE_ROOT) — nút **Điền folder VietMy**
3. Bật «Tự tạo thư mục hồ sơ…»
4. Cần URL Drive ở tab Chứng từ (cùng webapp)
5. Webhook giấy mời ở tab Webhook n8n

---

## 5. Ngưỡng tiền (tuỳ chọn)

Cùng tab Webhook n8n: panel **Ngưỡng cọc / LPXT** — mặc định 150k / 1tr / 2tr (9+). Lưu = áp dụng ngay.

---

## 6. Smoke test (bắt buộc)

1. **TVV** mở hồ sơ → Tài chính → nhập tiền + bill → Lưu  
   → Chat CTSV có `[TVV BÁO THU]` (hoặc nội dung `message_vi`).
2. **Kế toán** `/ke-toan` → Duyệt ĐỒNG Ý  
   → Chat có tin duyệt; trạng thái đúng ngưỡng (CỌC / ĐÃ HOÀN THIỆN).
3. **Giấy mời** → tạo 1 loại  
   → folder Drive + n8n `create_document`.
4. **Báo cáo ngày** (cổng KT / Báo cáo) → Gửi tay  
   → workflow `baocao-ngay` nhận HTML/text.

Nếu bước 1–2 im lặng: kiểm tra workflow n8n Active, URL đã Lưu, và execution log n8n.

---

## 7. Biến .env (tuỳ chọn — fallback VietMy)

Chỉ dùng khi org **chưa** load doc Firestore (hoặc ô trống trước khi Lưu lần đầu). Ưu tiên cấu hình trên UI.

```env
VITE_N8N_WEBHOOK=https://apchn-host.lapage.vn/webhook/giaymoits
VITE_N8N_WEBHOOK_CTSV=https://apchn-host.lapage.vn/webhook/testctsv
VITE_N8N_WEBHOOK_DAILY=https://apchn-host.lapage.vn/webhook/baocao-ngay
VITE_N8N_WEBHOOK_MONTHLY=https://apchn-host.lapage.vn/webhook/baocao-thang
VITE_RECEIPT_DRIVE_WEBHOOK_URL=https://script.google.com/macros/s/.../exec
VITE_RECEIPT_DRIVE_WEBHOOK_TOKEN=...
```

---

## 8. Rà soát tính năng (đã có trên code)

| Tính năng | Trạng thái |
|---|---|
| TVV nộp tiền → n8n (CTSV + giấy mời) | ✅ |
| KT duyệt / từ chối / Full NE → n8n CTSV | ✅ soft-fail sau lưu |
| CF atomic duyệt + fallback client | ✅ |
| Cron báo cáo 23:55 ICT multi-org | ✅ cần deploy CF |
| Lọc/tìm/Hiện CỌC/stats cổng KT | ✅ |
| CCCD chống trùng | ✅ |
| Marketing read-only + báo cáo 5 tab CSV | ✅ |
| PDF admissions landscape | ⚠️ chưa (CSV có) |

Gap code còn mở: xem [`GAP-APPSCRIPT-VS-CURRENT.md`](./GAP-APPSCRIPT-VS-CURRENT.md).
