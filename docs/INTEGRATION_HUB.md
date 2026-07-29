# Hub kết nối CRM — hướng dẫn đối tác & quản trị trường

Tài liệu vận hành đi kèm thiết kế `docs/superpowers/specs/2026-07-29-crm-integration-hub-design.md`.

## Vào đâu trên app?

**Cài đặt → Tích hợp → Hub kết nối**  
(` /settings?tab=connect&sub=hub `)

Cũng mở từ Tổng kết → **Kết nối ngoài**.

## Ba mức đầu nối

| Nhãn | Ý nghĩa |
|------|---------|
| **Đang dùng** | Đã chạy (OMICall, n8n, AI, cổng ĐK, chứng từ…) — mở tab chi tiết |
| **Sẵn sàng nối** | Điền URL/key + đăng ký sự kiện là nhận được JSON ngay |
| **Sắp có** | Giữ chỗ cấu hình; adapter gửi/nhận thật gắn sau |

## Webhook tổng quát (Zapier / Make / n8n HTTP)

1. Tạo Catch Hook / Webhook trên Zapier/Make/n8n.  
2. Trong Hub → **Webhook tổng quát** → Thêm URL → chọn sự kiện (vd. `lead.created`, `finance.decision`).  
3. Lưu hub.  
4. Khi CRM có việc tương ứng (và luồng n8n chính thành công với các sự kiện tài chính/giấy tờ/báo cáo), Hub **fan-out** thêm JSON:

```json
{
  "source": "vietmy-crm",
  "schemaVersion": 1,
  "orgId": "ten-truong",
  "event": "finance.decision",
  "occurredAt": "2026-07-29T03:00:00.000Z",
  "data": { }
}
```

Header tùy chọn: `X-VietMy-Event`, `X-VietMy-Secret` (nếu điền secret).

## Slack / Teams

Bật connector → dán Incoming Webhook URL → chọn sự kiện gợi ý (KPI / duyệt cọc / báo cáo). Hệ thống POST cùng envelope.

## API nhận hồ sơ (đối tác)

1. Hub → **API nhận hồ sơ** → Tạo API key (copy **một lần**).  
2. Copy hợp đồng JSON mẫu trên panel.  
3. Phase 2: Cloud Function `POST /v1/public/orgs/{orgSlug}/leads` với `Authorization: Bearer vm_…`.  
4. Body tối thiểu: `fullName`, `phone`, `source1`; thêm `email`, `province`, `majorInterest`, `externalId`.

Key lưu dạng hash SHA-256; thu hồi trên UI.

## Zalo OA / WhatsApp / Email / SMS

**Cài đặt → Tích hợp → Email & tin nhắn** (`/settings?tab=connect&sub=comms`)

1. Bật kênh + dán URL webhook gửi (n8n/Make).  
2. Chỉnh mẫu tin (biến `{{fullName}}`, `{{phone}}`…).  
3. Bật luật (vd. Email khi tạo hồ sơ).  
4. (Tuỳ chọn) Đồng ý marketing + giờ im lặng.

CRM POST `action: send_comms` tới webhook kênh khi sự kiện khớp. Hub vẫn lưu token phụ và deep-link sang tab này.

Sự kiện thêm: `followup.due`, `comms.sent`.

## Thu thập quảng cáo / form

Hub: Meta Lead Ads, TikTok Lead Ads, Google Forms/Sheets, đặt lịch Calendly — điền token/webhook; ingest thật qua n8n.

## n8n 4 slot cố định

Vẫn tại **Cài đặt → Webhook n8n** (giấy mời / CTSV / ngày / tháng). Không thay thế bằng Hub — Hub **bổ sung** fan-out.

## Checklist triển khai trường mới

1. Hub: bật cổng ĐK + OMICall + n8n (tab riêng).  
2. **Email & tin nhắn**: bật ít nhất 1 kênh + 1 luật `lead.created` để thử.  
3. Tạo API key nếu có đối tác đẩy lead.  
4. Thêm 1–2 webhook Zapier/Make cho `lead.created` và `finance.decision`.  
5. (Tuỳ chọn) Slack / Telegram / Meta Ads / lịch hẹn.  
6. Điền Zalo/WA nếu trường đã có OA.
