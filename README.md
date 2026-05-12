# VietMy Admissions OS (`danhgiatuyensinh`)

Ứng dụng CRM tuyển sinh (React + Vite + TypeScript + Tailwind + Firebase).

Repo GitHub: [github.com/duongcanhquan/danhgiatuyensinh](https://github.com/duongcanhquan/danhgiatuyensinh)

## Chạy local

```bash
npm install
cp .env.example .env   # điền Firebase (file .env không commit)
npm run dev
```

### Firebase & đăng nhập (bắt buộc để vào app có Auth)

1. **`.env`** — điền đủ 6 dòng (không để trống):  
   `VITE_FIREBASE_API_KEY`, `AUTH_DOMAIN`, `PROJECT_ID`, `STORAGE_BUCKET`, `MESSAGING_SENDER_ID`, `APP_ID`  
   (lấy từ Firebase Console → **Project settings** → app **Web**). Tuỳ chọn: `VITE_FIREBASE_DATABASE_URL`, `MEASUREMENT_ID`, `VITE_FIREBASE_FIRESTORE_DATABASE_ID`.

2. **Khởi động lại** `npm run dev` sau mỗi lần sửa `.env` (Vite embed biến lúc build/start).

3. **Authentication** — Console → **Authentication** → Get started → **Sign-in method** → bật **Email/Password**; tạo user (email + mật khẩu) cho tài khoản cần đăng nhập.

4. **Identity Toolkit API** — Google Cloud Console, chọn đúng project → **APIs & Services** → bật **Identity Toolkit API** (nếu không sẽ lỗi `auth/configuration-not-found` / không đăng nhập được).

5. **Firestore** — tạo database (nếu chưa); Rules phải cho phép user đọc/ghi `users/{uid}` theo thiết kế app (xem `firestore.rules.example`). Nếu đăng nhập được nhưng kẹt «Đang tải hồ sơ…», thường do Rules chặn đọc/ghi `users/`.

6. **Super admin (tuỳ chọn)** — xem comment trong `.env.example` (`VITE_SUPER_ADMIN_EMAIL`, `npm run seed:super-admin` với service account ngoài Git).

## Kết nối máy bạn với GitHub (lần đầu)

Trong thư mục project (đã có code):

```bash
git init
git add .
git commit -m "Initial commit: VietMy Admissions OS"
git branch -M main
git remote add origin https://github.com/duongcanhquan/danhgiatuyensinh.git
git push -u origin main
```

Nếu remote đã tồn tại:

```bash
git remote set-url origin https://github.com/duongcanhquan/danhgiatuyensinh.git
git push -u origin main
```

Đăng nhập GitHub: dùng **Personal Access Token** (HTTPS) hoặc **SSH key** (`git@github.com:duongcanhquan/danhgiatuyensinh.git`).

## Chạy online — GitHub Pages

1. Push code lên nhánh `main` (workflow trong `.github/workflows/github-pages.yml` sẽ chạy).
2. Trên GitHub repo: **Settings → Pages → Build and deployment**.
3. **Source**: chọn **GitHub Actions** (không dùng “Deploy from branch” cho workflow này).
4. Sau khi workflow xanh, site tại:  
   **https://duongcanhquan.github.io/danhgiatuyensinh/**

`vite.config.ts` dùng `base: '/danhgiatuyensinh/'` khi build production để asset đúng đường dẫn trên GitHub Pages.

### Firebase trên Pages (bắt buộc nếu muốn đăng nhập / Firestore online)

Build trên GitHub **không** đọc file `.env` trên máy bạn. Phải thêm **Repository secrets**:

1. Repo → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**.
2. Tạo từng secret **đúng tên** (chữ in hoa + gạch dưới giống `.env`):

| Tên secret (bắt buộc) |
|--------|
| `VITE_FIREBASE_API_KEY` |
| `VITE_FIREBASE_AUTH_DOMAIN` |
| `VITE_FIREBASE_PROJECT_ID` |
| `VITE_FIREBASE_STORAGE_BUCKET` |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` |
| `VITE_FIREBASE_APP_ID` |

**Tuỳ chọn** (nên có nếu bạn dùng ở local): `VITE_FIREBASE_DATABASE_URL`, `VITE_FIREBASE_MEASUREMENT_ID`, `VITE_FIREBASE_FIRESTORE_DATABASE_ID` (vd. `warmlist`), `VITE_SUPER_ADMIN_EMAIL`.

3. **Push lại** hoặc **Actions** → workflow **Deploy GitHub Pages** → **Run workflow** để build lại. Trong log bước *Kiểm tra secrets Firebase*: nếu thiếu sẽ có **cảnh vàng** — khi đó site vẫn lên nhưng app báo chưa cấu hình Firebase.

4. **Firebase Console** → **Authentication** → **Settings** → **Authorized domains** → **Add domain**:
   - `duongcanhquan.github.io` (GitHub Pages)
   - Nếu không thêm, đăng nhập trên Pages thường lỗi `auth/unauthorized-domain`.

### Vercel (tương tự — biến môi trường + domain)

1. Project Vercel → **Settings** → **Environment Variables**: thêm **cùng tên** `VITE_FIREBASE_*` như bảng trên (Production; nếu cần Preview thì thêm cho **Preview**).
2. **Redeploy** sau khi lưu biến (Deployments → … → Redeploy).
3. **Authorized domains** trong Firebase: thêm domain Vercel, ví dụ `danhgiatuyensinh.vercel.app` hoặc URL chính xác trong mục **Domains** của Vercel (mỗi preview branch có subdomain riêng — cần thêm từng domain bạn dùng, hoặc chỉ dùng production domain).

### API key bị chặn (local OK, online lỗi `auth/invalid-api-key` / network)

Google Cloud Console → **APIs & Services** → **Credentials** → chọn API key của Web app → **Application restrictions**: nếu đang **HTTP referrers**, phải thêm:

- `https://duongcanhquan.github.io/*`
- `https://*.vercel.app/*` (nếu Google cho phép) hoặc từng `https://<project>-<hash>.vercel.app/*`

Hoặc tạm **None** để thử (kém an toàn hơn).

## Bảo mật

- Không commit `.env` hoặc file service account JSON.
- Xoá/regenerate key nếu đã lộ công khai.
