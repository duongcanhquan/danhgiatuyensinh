# Workflow n8n — App CRM (chạy song song hệ Apps Script)

Dùng khi **hai hệ chạy cùng lúc**: Apps Script + Sheet giữ webhook cũ; app React dùng **path mới** dưới đây.

## URL mới (dán vào app)

| Ô trong Cài đặt → Webhook n8n | Path mới (host `apchn-host.lapage.vn`) |
|---|---|
| CTSV / tài chính | `https://apchn-host.lapage.vn/webhook/app-crm-ctsv` |
| Báo cáo ngày | `https://apchn-host.lapage.vn/webhook/app-crm-baocao-ngay` |
| Báo cáo tháng | `https://apchn-host.lapage.vn/webhook/app-crm-baocao-thang` |
| Giấy mời | Giữ URL cũ `…/giaymoits` **hoặc** import workflow giấy mời riêng nếu có |

**Cổng đăng ký / tạo hồ sơ CRM** (`action: student_registration`): URL nằm ở **Cài đặt → Cổng đăng ký** (`n8nWebhookUrl`), không phải 3 ô CTSV/báo cáo. App bắn từ Cloud Function (cổng ngoài + tạo trong CRM) — cần workflow n8n Active nhận `student_registration`.

**Không** ghi đè `testctsv` / `baocao-ngay` / `baocao-thang` — để Apps Script cũ tiếp tục chạy.

Tin Chat từ app có prefix `🆕 [APP CRM]` để phân biệt với tin hệ cũ.

## Import (ALL-IN-ONE)

1. n8n → **Workflows** → **Import from File** → chọn `[APP CRM] ALL-IN-ONE.json`
2. Bật **Active** (Chat URL đã sẵn từ space VietMy cũ; đổi nếu cần)
3. Trong app: **Cài đặt → Webhook n8n** → dán 3 URL path mới → **Lưu**
4. Smoke: TVV lưu tiền → Chat có tin `🆕 [APP CRM]`; KT duyệt → tương tự; Gửi báo cáo ngày tay

## File gộp (khuyến nghị)

| File | Gồm |
|---|---|
| **`[APP CRM] ALL-IN-ONE.json`** | 3 webhook trong 1 workflow — import 1 lần, Active, dán URL vào app |

Cũng có bản tách riêng nếu cần: `CTSV…`, `Bao cao ngay`, `Bao cao thang`.

Không đọc / ghi Google Sheet — app đã tính tổng trên Firestore.
