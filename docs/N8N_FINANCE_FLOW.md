# Luồng tài chính → n8n → Google Chat

App gửi webhook JSON; **n8n** nhận và đẩy tin nhắn Google Chat (cấu hình trên server n8n).  
**Cấu hình ưu tiên:** Cài đặt → Webhook n8n (Firestore `orgSettings/.../n8nWebhooks`).  
`.env` `VITE_N8N_*` chỉ là fallback VietMy khi doc chưa load.

Hướng dẫn cài nhanh: [`HUONG-DAN-CAI-WEBHOOK-VA-CHAY.md`](./HUONG-DAN-CAI-WEBHOOK-VA-CHAY.md).

## Webhook (4 URL)

| Ô UI / field | URL mẫu VietMy | Mục đích |
|---|---|---|
| Giấy mời `giayMoi` | `…/webhook/giaymoits` | Tạo giấy mời; TVV nộp tiền cũng gửi (parity Apps Script) |
| CTSV `ctsv` | `…/webhook/testctsv` | Báo thu TVV + duyệt kế toán + Full NE → Chat |
| Báo cáo ngày `daily` | `…/webhook/baocao-ngay` | Tổng kết cuối ngày |
| Báo cáo tháng `monthly` | `…/webhook/baocao-thang` | Tổng kết tháng |

## 1. TVV cập nhật tiền / bill

**Khi:** Lưu tab Tài chính — đổi số tiền, ngày thu, upload chứng từ, hoặc lần đầu YÊU CẦU FULL NE (`persistLeadFinance`).

**Webhook:** POST **CTSV** và **Giấy mời** (cùng payload; trùng URL thì chỉ 1 lần).

**`event`:** `update_profile`  
**`sub_event`:** `counselor_payment_submitted`

Trường quan trọng cho Google Chat:

- `message_vi` / `chat_text` — nội dung tin nhắn đầy đủ
- `notification_title`, `notification_body` — tiêu đề / tóm tắt
- `changed_slots[]` — từng lần thu: `batch`, `amount_formatted`, `receipt_url`, `pending_accountant`
- `full_data` — schema cũ (deposit_money, deposit_link, valid1…)

**n8n gợi ý:** Switch theo `event` → node Google Chat dùng `{{ $json.message_vi }}`.

Sau khi lưu Firestore, lỗi HTTP n8n **không rollback** hồ sơ (soft-fail).

## 2. Kế toán duyệt / từ chối

**Khi:** Cổng `/ke-toan` — Duyệt hoặc Từ chối (`persistAccountantPaymentDecision` → CF atomic ưu tiên).

**Webhook:** chỉ **CTSV**

**`event`:** `accountant_decision`

- `decision`: `ĐỒNG Ý` | `TỪ CHỐI`
- `message_vi`, `receipt_url`, `rejection_reason`
- `full_data` — cập nhật valid1…valid5

**Full NE:** `event: accountant_full_ne` (cùng CTSV)

## 3. Báo cáo cuối ngày

**Khi:**

- Kế toán bấm «Gửi báo cáo ngày», hoặc
- Cloud Function `sendScheduledFinanceReports` lúc **23:55 ICT** (cần đã deploy functions)

**Webhook:** `baocao-ngay`

**`event`:** `daily_finance_report`

- `dailyDetailHtml` — HTML
- `message_vi` / `chat_text` — bản text
- `tongTien`, `tongHocSinhNop`, `orgId`

> Chỉ tính khoản **ĐỒNG Ý** có ngày thu trong ngày (và Full NE theo `fullNeAt`).

## 4. Báo cáo tháng

**Khi:** Gửi tay hoặc cron **ngày cuối tháng ICT**.

Payload: `month`, `nbMonth`, `lpxtMonth`, `neMonth`, `topTvvName`, `topTvvCount`, `orgId`.

## Kiểm tra nhanh

1. TVV lưu tài chính có bill → Chat nhận tin báo thu
2. Kế toán duyệt → Chat nhận tin duyệt
3. Báo cáo ngày (tay) → Chat/email nhận tổng kết
4. Workflow n8n phải **Active** trên host (vd. `apchn-host.lapage.vn`)
