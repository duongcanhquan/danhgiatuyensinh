# Luồng tài chính → n8n → Google Chat

App gửi webhook JSON; **n8n** nhận và đẩy tin nhắn Google Chat (cấu hình trên server n8n).

## Webhook

| Biến môi trường | Mặc định | Mục đích |
|-----------------|----------|----------|
| `VITE_N8N_WEBHOOK_CTSV` | `…/webhook/testctsv` | Báo thu TVV + duyệt kế toán |
| `VITE_N8N_WEBHOOK_DAILY` | `…/webhook/baocao-ngay` | Tổng kết cuối ngày |
| `VITE_N8N_WEBHOOK_MONTHLY` | `…/webhook/baocao-thang` | Tổng kết tháng |

## 1. TVV cập nhật tiền / bill (mỗi lần)

**Khi:** Lưu tab Tài chính — đổi số tiền, ngày thu hoặc upload chứng từ (`persistLeadFinance`).

**Webhook:** `POST testctsv`

**`event`:** `update_profile`  
**`sub_event`:** `counselor_payment_submitted`

Trường quan trọng cho Google Chat:

- `message_vi` / `chat_text` — nội dung tin nhắn đầy đủ
- `notification_title`, `notification_body` — tiêu đề / tóm tắt
- `changed_slots[]` — từng lần thu: `batch`, `amount_formatted`, `receipt_url`, `pending_accountant`
- `full_data` — schema cũ (deposit_money, deposit_link, valid1…)

**n8n gợi ý:** Switch theo `event` → node Google Chat dùng `{{ $json.message_vi }}`.

## 2. Kế toán duyệt / từ chối

**Khi:** Cổng `/ke-toan` — Duyệt hoặc Từ chối từng đợt (`persistAccountantPaymentDecision`).

**Webhook:** `POST testctsv`

**`event`:** `accountant_decision`

- `decision`: `ĐỒNG Ý` | `TỪ CHỐI`
- `message_vi`, `receipt_url`, `rejection_reason`
- `full_data` — cập nhật valid1…valid5

**Full NE:** `event: accountant_full_ne`

## 3. Báo cáo cuối ngày

**Khi:** Kế toán bấm «Gửi báo cáo ngày» (Cổng kế toán → Báo cáo).

**Webhook:** `POST baocao-ngay`

**`event`:** `daily_finance_report`

- `dailyDetailHtml` — HTML (email / Chat rich)
- `message_vi` / `chat_text` — bản text: tổng HS, tổng tiền duyệt, theo hệ
- `tongTien`, `tongHocSinhNop`

> Báo cáo ngày chỉ tính khoản **kế toán đã duyệt «ĐỒNG Ý»** có ngày thu trong ngày.

## Tự động cuối ngày (tuỳ chọn trên n8n)

App **chưa** cron tự gửi — có thể thêm trên n8n:

1. Schedule Trigger 18:00
2. HTTP Request gọi API nội bộ hoặc Firestore (nếu có Cloud Function)
3. Hoặc kế toán bấm một lần/ngày trên cổng kế toán

## Kiểm tra nhanh

1. TVV lưu tài chính có bill → Chat nhận `[TVV BÁO THU]`
2. Kế toán duyệt → Chat nhận `[KẾ TOÁN] DUYỆT`
3. Báo cáo ngày → Chat nhận `📊 BÁO CÁO THU NGÀY`

Workflow n8n phải **Active** trên `apchn-host.lapage.vn`.
