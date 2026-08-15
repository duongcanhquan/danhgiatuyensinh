# Hướng dẫn cài Cloudflare R2 (chứng từ / bill)

Bill khi TVV lưu hồ sơ được đẩy lên **Cloudflare Worker + R2**, rồi lưu link vào hồ sơ (`Xem bill đã lưu`).

> **Trạng thái hiện tại (đã làm sẵn trên máy bạn):**  
> Worker đã deploy, bucket đã tạo, token đã set. Bạn chỉ cần **dán cấu hình vào app** (Bước C bên dưới).

---

## A. Những gì đã có sẵn (không cần làm lại)

| Hạng mục | Giá trị |
|---|---|
| Worker | https://vietmy-receipt-r2.duongcanhquan.workers.dev |
| Upload URL | https://vietmy-receipt-r2.duongcanhquan.workers.dev/upload |
| Bucket R2 | `vietmy-lead-receipts` |
| Secret Worker | `UPLOAD_TOKEN` (đã gắn trên Cloudflare) |
| CORS | `localhost:5173`, `danhgiatuyensinh.vercel.app`, `admission.vietmycollege.com` |

Token upload (cùng với `UPLOAD_TOKEN` trên Cloudflare):

```text
l2BQYEeC9zHgrmS7dvIZoVRc6Uf3hAOqjLJuPW0M
```

(Bản copy local: `workers/receipt-r2/.deploy-credentials.local.env` — không commit file này.)

---

## B. Kiểm tra Worker còn sống (30 giây)

Mở trình duyệt hoặc PowerShell:

```powershell
curl.exe -s https://vietmy-receipt-r2.duongcanhquan.workers.dev/
```

Kỳ vọng: `{"ok":true,"service":"vietmy-receipt-r2",...}`

---

## C. Cài trong app CRM (bắt buộc — làm ngay)

Đăng nhập **Admin** (có quyền chỉnh cấu hình trường).

1. Vào **Cài đặt** → tab **Tích hợp / Kết nối** → **Chứng từ & lưu trữ**  
   (hoặc mở trực tiếp đường dẫn kiểu `/settings?tab=connect&sub=receipts` nếu app có shortcut).
2. Chọn cách lưu: **Cloudflare R2** (hoặc **Tự động** nếu muốn Firebase dự phòng).
3. Điền đúng 3 ô:

| Ô trên màn hình | Giá trị dán vào |
|---|---|
| **URL upload R2** | `https://vietmy-receipt-r2.duongcanhquan.workers.dev/upload` |
| **Token R2** | `l2BQYEeC9zHgrmS7dvIZoVRc6Uf3hAOqjLJuPW0M` |
| **URL công khai R2** | `https://vietmy-receipt-r2.duongcanhquan.workers.dev` |

4. Bấm **Lưu** — phải hiện «Đã lưu».
5. **Hard refresh** trình duyệt (Ctrl+F5).

> Cấu hình này lưu theo **từng trường (org)** trên Firestore — không cần build lại app.

---

## D. Thử tải bill thật trên hồ sơ

1. Mở một hồ sơ → tab hồ sơ / tài chính.
2. Chọn ảnh bill (JPG/PNG/PDF) cho một khoản (vd. Cọc).
3. Thấy dòng **Chờ lưu: tên-file…**
4. Bấm **Lưu thông tin**.
5. Thành công khi:
   - Hiện **Xem bill đã lưu** (bấm mở được ảnh),
   - Thông báo kiểu «Chứng từ đã lên R2»,
   - Kế toán / Chat có link chứng từ (nếu webhook bật).

Nếu lỗi: đọc dòng đỏ sau khi lưu (token sai / URL thiếu `/upload` / CORS domain lạ).

---

## E. (Tuỳ chọn) Biến môi trường Vercel / `.env`

Chỉ cần khi muốn fallback từ env (không thay bước C nếu đã lưu trong Cài đặt):

```env
VITE_RECEIPT_R2_UPLOAD_URL=https://vietmy-receipt-r2.duongcanhquan.workers.dev/upload
VITE_RECEIPT_R2_UPLOAD_TOKEN=l2BQYEeC9zHgrmS7dvIZoVRc6Uf3hAOqjLJuPW0M
VITE_RECEIPT_R2_PUBLIC_BASE_URL=https://vietmy-receipt-r2.duongcanhquan.workers.dev
```

Trên Vercel: Project → Settings → Environment Variables → thêm 3 biến → Redeploy.

---

## F. Deploy lại Worker (khi sửa code sau này)

Máy đã `wrangler login` rồi thì:

```powershell
cd "c:\Users\PC\Desktop\TUYEN SINH APP\danhgiatuyensinh\workers\receipt-r2"
npm install --legacy-peer-deps
npx wrangler deploy
```

Đổi token mới (khi cần xoay khóa):

```powershell
# tạo token mới rồi:
echo TOKEN_MOI | npx wrangler secret put UPLOAD_TOKEN
```

Sau đó **cập nhật Token R2 trong Cài đặt app** cho khớp.

Thêm domain frontend mới (CORS): sửa `ALLOWED_ORIGINS` trong `workers/receipt-r2/wrangler.toml` → `npx wrangler deploy`.

---

## G. Làm từ đầu trên account Cloudflare khác

```powershell
cd workers/receipt-r2
npm install --legacy-peer-deps
npx wrangler login
npx wrangler r2 bucket create vietmy-lead-receipts
# tạo token dài, random:
echo YOUR_LONG_TOKEN | npx wrangler secret put UPLOAD_TOKEN
# sửa PUBLIC_BASE_URL + ALLOWED_ORIGINS trong wrangler.toml
npx wrangler deploy
```

Lấy URL dạng `https://vietmy-receipt-r2.<subdomain>.workers.dev` từ output deploy → làm lại **Bước C**.

---

## H. Cấu trúc file trên R2

```
receipts/leads/{leadId}/{HoTen_MaSV}/{slot}/{timestamp}_{tenfile}
```

Xem trên Dashboard Cloudflare → **R2** → bucket `vietmy-lead-receipts`.

---

## I. Lỗi thường gặp

| Hiện tượng | Cách xử lý |
|---|---|
| Upload quá lâu / Failed to fetch | Kiểm tra URL có đuôi `/upload`; token đúng; đã Lưu cấu hình org |
| Xem bill 404 | Public base URL sai hoặc file chưa upload thành công |
| CORS bị chặn | Domain app chưa nằm trong `ALLOWED_ORIGINS` → sửa toml + deploy lại |
| Token không hợp lệ | Token app ≠ `UPLOAD_TOKEN` trên Worker → `wrangler secret put` lại + sửa Cài đặt |
| Chỉ muốn Firebase | Chọn provider **Firebase Storage** trong Cài đặt |

---

## J. Kiểm thử kỹ thuật (dev)

```powershell
# Unit
npx vitest run workers/receipt-r2/receipt-r2.worker.test.ts

# Local
cd workers/receipt-r2
npm run dev
# terminal khác:
npm run smoke
```
