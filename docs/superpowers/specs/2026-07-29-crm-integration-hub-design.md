# Thiết kế — Hub Kết nối CRM Hiện đại (Integration Hub)

| Thuộc tính | Giá trị |
|------------|---------|
| **Mã** | `DES-INT-HUB-2026-07` |
| **Ngày** | 2026-07-29 |
| **Trạng thái** | Chuẩn thiết kế — triển khai Phase 1 |
| **Phụ thuộc** | `2026-07-29-crm-platform-north-star.md`, `2026-07-29-multi-tenant-org-design.md` |
| **Đối tượng** | Product, kỹ thuật, đối tác triển khai trường |

---

## 1. Bối cảnh & nghiên cứu ngoài

### 1.1. Xu hướng CRM tuyển sinh / HE 2025–2026

Khảo sát đối chiếu (Dostify, Barantum, MSM Aventra, EdVisorly, monday CRM HE, iPaaS Zapier/Make/n8n):

| Trụ cột hiện đại | Ý nghĩa cho VietMy |
|------------------|--------------------|
| **API-first + webhook 2 chiều** | Trường tự nối SIAKAD / form / ads / Chat mà không chờ release |
| **Omnichannel** (WA / Zalo / email / SMS / gọi) | Timeline đa kênh trên hồ sơ; connector từng kênh |
| **Catalog connector sẵn** | Admin bật/tắt + dán URL/key — không hard-code một workflow |
| **Event bus** | Cùng một sự kiện (`lead.created`, `finance.approved`…) fan-out nhiều đích |
| **Inbound partner API** | CTV/đại lý/landing đẩy lead có secret theo trường |
| **AI hỗ trợ, người quyết** | Giữ nguyên P6 north-star |
| **iPaaS trung gian** | n8n/Make/Zapier là lớp tự động — CRM chỉ phát sự kiện chuẩn |

### 1.2. Hiện trạng VietMy (tóm tắt)

**Đã có:** OMICall, 4 webhook n8n cố định + portal webhook, LLM, R2/Drive chứng từ (env), cổng `/dang-ky`, KPI/gọi/tài chính sâu.

**Thiếu so với chuẩn hiện đại:** hub connector mở rộng, event catalog công bố, inbound Lead API có key, Zalo/WA/SMS/email native, Slack/Teams, lịch hẹn, cổng thanh toán, sync SIAKAD, OAuth.

### 1.3. Phạm vi tài liệu này

**Làm ngay (Phase 1):** nền tảng **Hub Kết nối** — catalog đầu nối sẵn, cấu hình theo trường, event bus outbound, inbound API key + hợp đồng sự kiện, UI Cài đặt đời thường, tài liệu đối tác.

**Roadmap Phase 2+:** adapter thật (Zalo OA, WhatsApp Cloud, Resend/SMTP, VNPay…), Cloud Function inbound public, OAuth.

Không xây marketing blast kiểu HubSpot (north-star §1.3).

---

## 2. Ba hướng tiếp cận

| | A. Hard-code từng app | B. Hub registry + event bus (chọn) | C. Chỉ dựa n8n |
|--|----------------------|-----------------------------------|----------------|
| Ý tưởng | Mỗi app = tab Settings riêng khi có | Catalog + config + emit chuẩn; adapter plug sau | Mọi thứ qua 4 URL n8n |
| Ưu | Nhanh cho 1 app | Mở rộng, đa trường self-serve, Zapier-ready | Ít code CRM |
| Nhược | Phình Settings, khó quản lý | Đầu tư schema | Khóa cứng, không inbound chuẩn |
| **Khuyến nghị** | — | **B** | Bổ trợ (n8n là một connector trong hub) |

---

## 3. Kiến trúc Phase 1

```
┌─────────────────────────────────────────────────────────┐
│  App CRM (React)                                        │
│  Settings → Tích hợp → Hub kết nối                      │
│  IntegrationHubPanel + IntegrationsStatusStrip          │
└────────────┬───────────────────────────┬────────────────┘
             │ save/load                 │ emitOutboundEvent
             ▼                           ▼
   orgSettings/{orgId}/settings/   dispatch → subscriptions
   integrationHub                  (generic HTTPS + map n8n slots)
             │
             ▼
   Cloud Function (Phase 2): POST /v1/orgs/:orgId/leads
   (Phase 1: lưu API key + tài liệu hợp đồng; stub verify helper)
```

### 3.1. Đơn vị thiết kế

1. **ConnectorCatalog** — danh mục đầu nối (metadata, maturity, fields cấu hình).
2. **OrgIntegrationHubConfig** — trạng thái bật/cấu hình theo trường.
3. **OutboundEventCatalog** — sự kiện chuẩn CRM phát ra.
4. **dispatchOutboundEvent** — fan-out tới subscription URL + đồng bộ slot n8n hiện có.
5. **InboundApiContract** — key theo trường + schema lead tối thiểu (verify helper client/CF dùng chung).

### 3.2. Maturity connector

| Giá trị | Ý nghĩa UI |
|---------|------------|
| `live` | Đang chạy production trong CRM |
| `ready` | Đầu nối sẵn: điền URL/key là dùng qua event bus / inbound |
| `planned` | Có chỗ trong hub; adapter chưa gắn — admin thấy «sắp có» |

### 3.3. Catalog Phase 1 (đầu nối sẵn)

| id | Nhóm | Maturity | Ghi chú |
|----|------|----------|---------|
| `omicall` | Gọi điện | live | Deep-link tab OMICall |
| `n8n` | Tự động hóa | live | Deep-link webhook 4 slot + generic events |
| `llm` | AI | live | Deep-link AI |
| `public_portal` | Thu thập | live | Deep-link cổng ĐK |
| `generic_webhooks` | iPaaS | ready | Nhiều URL đăng ký theo event |
| `inbound_lead_api` | Thu thập | ready | API key + payload chuẩn |
| `zalo_oa` | Chat | ready* | URL webhook Zalo / OA token fields |
| `whatsapp_cloud` | Chat | ready* | Meta WA Cloud webhook + token |
| `email_smtp` | Email | ready* | SMTP/Resend/SendGrid key |
| `sms_gateway` | SMS | ready* | Twilio/eSMS/VIETGUYS |
| `slack_alerts` | Nội bộ | ready | Incoming webhook Slack |
| `teams_alerts` | Nội bộ | ready | Incoming webhook Teams |
| `google_chat` | Nội bộ | live† | Qua n8n CTSV hiện có |
| `calendar_booking` | Lịch | planned | Calendly/Google Calendar |
| `payment_vnpay` | Thu | planned | IPN URL |
| `payment_momo` | Thu | planned | IPN URL |
| `sis_siakad` | Học vụ | planned | Sync outbound enrolled |
| `meta_lead_ads` | Ads | planned | Lead Ads webhook |
| `google_sheets` | Dữ liệu | planned | Sheet sync |
| `receipt_r2` | Chứng từ | live‡ | Env/worker — hiện trạng trong hub |

\* `ready*`: lưu cấu hình + có thể gắn subscription event; gửi tin nhắn thật = Phase 2 adapter.  
† Hiển thị như live qua n8n.  
‡ Health «có env» — không bắt admin dán secret vào Firestore.

---

## 4. Event catalog (outbound)

Sự kiện chuẩn (snake.dot):

| event | Khi nào | Payload tối thiểu |
|-------|---------|-------------------|
| `lead.created` | Tạo hồ sơ / portal / inbound | orgId, leadId, phone, fullName, source |
| `lead.updated` | Đổi field quan trọng / status | orgId, leadId, changedKeys |
| `lead.assigned` | Đổi TVV | orgId, leadId, assignedTo |
| `lead.priority_changed` | HOT/WARM/… | orgId, leadId, priorityTag |
| `call.completed` | Kết thúc / sync OMICall | orgId, leadId?, callId, duration |
| `finance.submitted` | TVV gửi đợt thu | (tương thích CTSV hiện có) |
| `finance.decision` | KT duyệt/từ chối | accountant_decision |
| `finance.full_ne` | Full NE | accountant_full_ne |
| `document.requested` | Giấy mời… | create_document |
| `report.daily` / `report.monthly` | Báo cáo | như hiện tại |
| `registration.public` | Cổng ĐK | student_registration |

Phase 1: `dispatchOutboundEvent` gọi các **generic_webhooks** subscriptions; các luồng n8n hiện tại **giữ nguyên** và được ghi nhận trong catalog (không phá workflow đang chạy).

---

## 5. Inbound Lead API (hợp đồng Phase 1)

- Admin tạo **API key** (hiển thị 1 lần); lưu `keyHash` + `keyPrefix` trong hub config.
- Endpoint mục tiêu (Phase 2 CF): `POST /v1/public/orgs/{orgSlug}/leads` header `Authorization: Bearer vm_…`.
- Phase 1: helper `hashInboundApiKey`, `verifyInboundApiKey`, tài liệu mẫu curl; UI «Sao chép hợp đồng JSON».

Body tối thiểu:

```json
{
  "fullName": "Nguyễn A",
  "phone": "09xxxxxxx",
  "source1": "Partner X",
  "email": "a@email.com",
  "province": "Hà Nội",
  "majorInterest": "CNTT",
  "externalId": "partner-row-1"
}
```

Dedupe theo `orgId` + phone/`externalId` (Phase 2 dùng chung pipeline portal).

---

## 6. UI (tiếng Việt đời thường)

- Tab **Hub kết nối** đứng đầu nhóm Tích hợp.
- Lưới thẻ theo nhóm: Thu thập · Gọi & chat · Tự động hóa · AI · Thông báo · Thu phí · Học vụ.
- Mỗi thẻ: trạng thái (Đang dùng / Sẵn sàng / Sắp có), nút «Mở cấu hình» hoặc deep-link tab chuyên sâu.
- Generic webhooks: bảng event → URL (+ secret HMAC tùy chọn).
- Không hiện tên collection trên luồng chính.

---

## 7. Bảo mật & đa trường

- Mọi config gắn `orgId`; Superadmin chỉ thấy org đang chọn.
- Không log full API key; chỉ prefix.
- Webhook secret optional; Phase 2 ký HMAC `X-VietMy-Signature`.
- Secrets OMICall/LLM giữ chỗ hiện tại; hub chỉ tham chiếu.

---

## 8. Kiểm thử

- Unit: parse/merge hub config, hash/verify key, filter subscriptions by event, catalog completeness.
- Không gọi mạng thật trong unit test.

---

## 9. Lộ trình sau Phase 1

1. CF inbound lead + rate limit.  
2. Adapter Zalo/WA gửi tin từ timeline.  
3. Email transactional (giấy báo, nhắc follow-up).  
4. Payment IPN → finance slot.  
5. SIS push khi ENROLLED.  
6. OAuth Google (Calendar/Sheets) nếu trường yêu cầu.

---

## 10. Quyết định đã chốt (để triển khai)

- Chọn **Approach B**.  
- Doc Firestore: `integrationHub` trong `ORG_SETTINGS_TEMPLATE_DOC_IDS`.  
- Không thay 4 URL n8n cũ — chúng là connector `n8n` live.  
- Phase 1 ship catalog + UI + generic dispatch + inbound key contract.
