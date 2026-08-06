# Cài đặt Email / tin nhắn tự động & đầu nối bên thứ 3

**Ngày:** 2026-07-29  
**Trạng thái:** Triển khai đợt 1 (cấu hình đầy đủ + gửi qua webhook/n8n)  
**Bối cảnh:** Hub đã có connector stub (email/SMS/Zalo/WA) nhưng thiếu tab vận hành, mẫu tin, luật kích hoạt, và nhiều kênh CRM phổ biến.

## Mục tiêu

Admin trường cấu hình được **toàn bộ** kênh giao tiếp tự động và đầu nối bên thứ 3 trên UI (theo từng trường), không phụ thuộc hardcode/.env. Gửi tin thật đi qua **webhook/n8n** (đã có trong stack) — adapter native (Resend/Twilio SDK) là đợt sau.

## Phạm vi đợt 1

### A. Tab Cài đặt → Tích hợp → **Email & tin nhắn**

Doc Firestore: `orgSettings/{orgId}/settings/commsAutomationConfig`

| Khối | Nội dung |
|------|----------|
| **Email** | Bật/tắt; provider Resend/SendGrid/SMTP/n8n; from/reply-to; SMTP host/port/user/TLS; URL webhook gửi |
| **SMS** | Provider Twilio/eSMS/Vietguys/custom; brandname; API key; webhook |
| **Zalo OA** | OA ID, token, webhook gửi, chế độ ZNS vs chat |
| **WhatsApp** | Phone number ID, token, verify token, webhook gửi |
| **Mẫu tin** | Nhiều mẫu theo kênh; subject (email); body với biến `{{fullName}}`, `{{phone}}`, `{{email}}`, `{{majorInterest}}`, `{{assigneeName}}`, `{{schoolName}}`… |
| **Luật tự động** | Trigger (sự kiện CRM) → kênh → mẫu; delay phút; bật/tắt từng luật |
| **Đồng ý / im lặng** | Tôn trọng không liên hệ; giờ im lặng; transactional vs marketing |

Lưu = áp dụng ngay (cache module + preload OrgProvider).

### B. Mở rộng Hub kết nối

- Làm giàu field connector email/SMS/Zalo/WA (SMTP đầy đủ, deep-link sang tab Email & tin nhắn).
- Thêm / nâng connector: Telegram, TikTok Lead Ads, Google Forms, lịch hẹn (Calendly/Google Calendar) → maturity `ready` khi đủ field cấu hình.
- Sự kiện outbound mới: `followup.due`, `comms.sent` (ghi nhận sau khi CRM đẩy tin).

### C. Runtime gửi (đợt 1)

Khi sự kiện CRM xảy ra (và đã wire):

1. `dispatchOutboundEvent` (Hub fan-out) — giữ như hiện tại.
2. `runCommsAutomationRules(orgId, trigger, leadContext)` — với mỗi luật khớp: render mẫu → POST JSON tới webhook kênh tương ứng.

Payload gửi:

```json
{
  "source": "vietmy-crm",
  "action": "send_comms",
  "channel": "email",
  "orgId": "…",
  "templateId": "…",
  "templateName": "…",
  "subject": "…",
  "body": "…",
  "to": { "email": "…", "phone": "…", "zaloUserId": null },
  "lead": { "id": "…", "fullName": "…" },
  "providerMeta": { }
}
```

Không gọi SDK nhà cung cấp trong browser — n8n/worker giữ secret thật nếu cần.

### D. Ngoài phạm vi đợt 1

- Adapter native Resend/Twilio/Zalo SDK trong Cloud Functions.
- Hộp thư hội thoại 2 chiều.
- Workflow builder kéo-thả.
- Cron `followup.due` server (UI cấu hình sẵn; kích hoạt tay / n8n schedule trước).

## Quyền

Tab dùng cùng quyền Hub: `config:master_data` hoặc `config:omicall` (module Tích hợp Superadmin giao Admin).

## Copy UI

Tiếng Việt đời thường: «Email & tin nhắn», «Mẫu gửi», «Khi nào gửi», «Giờ không gọi/nhắn». Tránh tên collection trên màn hình chính.

## Kiểm thử

- Parse/default/save config (unit).
- Render template biến.
- Rule matching + quiet hours.
- tsc / vitest xanh.
