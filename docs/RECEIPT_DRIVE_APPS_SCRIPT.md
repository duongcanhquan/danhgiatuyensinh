# Lưu bill chuyển khoản lên Google Drive bằng Apps Script

Mục tiêu:
- Bill upload trong tab **Tài chính** / cổng kế toán lưu vào Drive folder gốc (VietMy cũ: `1wXoWyfUVC8hva-7MEKJaaoV6p67BEhyG`).
- Mỗi hồ sơ 1 folder con: `HoTen_MaHoSo`.
- Mỗi lần upload tạo file bill + `INFO_*.json`.
- App trả `fileUrl` → `finance.payments.{slot}.receiptUrl` (TVV, KT, n8n).
- Cùng webapp hỗ trợ `action: ensure_folder` cho giấy mời (FOLDER_INVITE_ROOT).

Cài đặt tổng: [`HUONG-DAN-CAI-WEBHOOK-VA-CHAY.md`](./HUONG-DAN-CAI-WEBHOOK-VA-CHAY.md).

## 1) Tạo Apps Script Web App

1. Vào [script.new](https://script.new/), tạo project mới.
2. Dán nội dung từ `scripts/apps-script/receipt-drive-webapp.gs`.
3. Sửa `ROOT_FOLDER_ID` nếu cần (bill).
4. `Project Settings` → Script properties → `RECEIPT_WEBHOOK_TOKEN` = **value bí mật** (không phải tên key).
5. Deploy → Web app → Execute as **Me** → Who has access **Anyone** → copy URL **`/exec`** (không dùng `/dev`).

**Lỗi «không tạo được thư mục» chỉ trên một máy:** URL `/dev` hoặc quyền «Only myself» chạy được trên máy chủ script (đã login Google), máy TVV khác thì fail CORS / trang đăng nhập. App gọi Cloud Function `ensureInviteDriveFolder` (không CORS); fallback trình duyệt nếu CF chưa deploy.

App gọi Apps Script bằng `Content-Type: text/plain` (tránh CORS preflight). Sau khi sửa `.gs`, **Deploy → Manage deployments → New version**.

Cần `firebase deploy --only functions` để máy khác tạo folder ổn định.

## 2) Cấu hình trong app (ưu tiên)

**Cài đặt → Chứng từ:**

- Cách lưu: `Drive` hoặc `Tự động`
- URL Apps Script = URL Web App
- Token = cùng `RECEIPT_WEBHOOK_TOKEN`
- **Lưu** (OrgProvider bootstrap — đổi cấu hình dùng ngay)

Tuỳ chọn `.env` / Vercel (fallback):

- `VITE_RECEIPT_DRIVE_WEBHOOK_URL`
- `VITE_RECEIPT_DRIVE_WEBHOOK_TOKEN`

## 3) Payload CRM gửi lên Apps Script

`POST application/json`:
- `token`, `leadId`, `fullName`, `systemCode`, `customerId`
- `slot`, `folderName`, `fileName`, `contentType`, `base64`

Hoặc `action: "ensure_folder"` + `rootFolderId` + `folderName` (giấy mời).

Response thành công:

```json
{
  "ok": true,
  "folderUrl": "https://drive.google.com/drive/folders/...",
  "fileUrl": "https://drive.google.com/file/d/.../view"
}
```
