# Lưu chứng từ tài chính trên Cloudflare R2

Chứng từ thu (bill) theo từng ứng viên được lưu qua **Cloudflare Worker + R2**, với **resize ảnh phía trình duyệt** trước upload.

## Cấu trúc thư mục R2

```
receipts/
  leads/
    {leadId}/                    ← khóa Firestore (ổn định)
      {HoTen_MaSV}/              ← tên hiển thị trên console R2
        deposit/
          2026-05-28T10-15-00_bill.jpg
        supplementL1/
        supplementL2/
        supplementL3/
        supplementL4/
```

- **leadId**: không đổi khi sửa họ tên trên hồ sơ.
- **slot**: 5 khoản thu (`deposit`, `supplementL1` … `supplementL4`).
- Metadata R2: `leadId`, `folderName`, `slot`, `originalName`, `uploadedAt`.

## Luồng ưu tiên (app)

1. **R2** — `VITE_RECEIPT_R2_UPLOAD_URL` (+ token)
2. Google Drive Apps Script — `VITE_RECEIPT_DRIVE_WEBHOOK_URL`
3. Firebase Storage — `VITE_FIREBASE_STORAGE_BUCKET`

Ảnh JPEG/PNG/WebP được nén (~1600px cạnh dài, quality 82%) trước khi upload.

## Triển khai Worker

```bash
cd workers/receipt-r2
npm install
wrangler r2 bucket create vietmy-lead-receipts
wrangler secret put UPLOAD_TOKEN
# nhập chuỗi bí mật dùng chung với VITE_RECEIPT_R2_UPLOAD_TOKEN
wrangler deploy
```

Sau deploy, ghi URL worker vào `.env`:

```env
VITE_RECEIPT_R2_UPLOAD_URL=https://vietmy-receipt-r2.<account>.workers.dev/upload
VITE_RECEIPT_R2_UPLOAD_TOKEN=<cùng UPLOAD_TOKEN>
# Tuỳ chọn — nếu dùng custom domain / CDN khác worker:
# VITE_RECEIPT_R2_PUBLIC_BASE_URL=https://cdn.example.com
```

Cập nhật `ALLOWED_ORIGINS` trong `workers/receipt-r2/wrangler.toml` (domain production).

## API Worker

### `POST /upload`

```json
{
  "token": "...",
  "leadId": "firestore-doc-id",
  "folderName": "Nguyen_Van_A_KH733556",
  "slot": "deposit",
  "fileName": "bill.jpg",
  "contentType": "image/jpeg",
  "base64": "..."
}
```

Trả về: `{ "ok": true, "fileUrl": "https://…/files/receipts/leads/…", "objectKey": "…", "bytes": 12345 }`

### `GET /files/{objectKey}`

Phục vụ file từ R2 (cache 1 năm). URL này lưu vào Firestore `finance.payments.*.receiptUrl`.

## Custom domain (tuỳ chọn)

1. R2 → bucket → Settings → Public access hoặc custom domain
2. Hoặc route Worker `your-cdn.example.com/files/*` → cùng handler GET

## Bảo mật

- **Không** đặt R2 Access Key trong Vite — chỉ token upload qua Worker.
- Token upload nên dài, random; rotate định kỳ.
- Thu hẹp `ALLOWED_ORIGINS` trên production.

## Script npm gốc

```bash
npm run deploy:receipt-r2
```
