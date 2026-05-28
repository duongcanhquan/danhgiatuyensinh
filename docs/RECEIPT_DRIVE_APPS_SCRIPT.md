# Lưu bill chuyển khoản lên Google Drive bằng Apps Script

Mục tiêu:
- Bill upload trong tab **Tài chính** được lưu vào Drive folder gốc: `1GLfOI4XJG4X1I9TnENrVX0aCVYIyqCf7`.
- Mỗi hồ sơ có 1 folder con: `HoTen_MaHoSo`.
- Mỗi lần upload tạo:
  - file bill
  - file `INFO_*.json` chứa thông tin đợt thu (slot, thời gian, mã hồ sơ...)
- App trả về `fileUrl` để CRM lưu vào `finance.payments.{slot}.receiptUrl`.
- Link này được dùng thống nhất ở TVV, kế toán, và payload n8n.

## 1) Tạo Apps Script Web App

1. Vào [script.new](https://script.new/), tạo project mới.
2. Tạo file `Code.gs`, dán nội dung từ `scripts/apps-script/receipt-drive-webapp.gs`.
3. Sửa hằng số `ROOT_FOLDER_ID` nếu cần (mặc định đã là folder bạn cung cấp).
4. Trong Apps Script:
   - `Project Settings` -> `Script properties`
   - thêm key `RECEIPT_WEBHOOK_TOKEN` (chuỗi bí mật tự đặt).
5. Deploy:
   - `Deploy` -> `New deployment` -> `Web app`
   - Execute as: `Me`
   - Who has access: `Anyone`
   - Deploy và copy URL Web App.

## 2) Cấu hình Vercel

Thêm 2 biến môi trường ở Vercel (Production + Preview):

- `VITE_RECEIPT_DRIVE_WEBHOOK_URL` = URL Web App vừa deploy
- `VITE_RECEIPT_DRIVE_WEBHOOK_TOKEN` = token giống `RECEIPT_WEBHOOK_TOKEN`

Sau đó redeploy.

## 3) Payload CRM gửi lên Apps Script

`POST application/json`:
- `token`
- `leadId`
- `fullName`
- `systemCode`
- `customerId`
- `slot` (deposit/supplementL1...)
- `folderName`
- `fileName`
- `contentType`
- `base64`

Response thành công:

```json
{
  "ok": true,
  "folderUrl": "https://drive.google.com/drive/folders/...",
  "fileUrl": "https://drive.google.com/file/d/.../view"
}
```

`fileUrl` sẽ được lưu vào hồ sơ và hiển thị nút **Xem bill đã lưu**.
