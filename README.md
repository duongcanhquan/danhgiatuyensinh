# VietMy Admissions OS (`danhgiatuyensinh`)

Ứng dụng CRM tuyển sinh (React + Vite + TypeScript + Tailwind + Firebase).

Repo GitHub: [github.com/duongcanhquan/danhgiatuyensinh](https://github.com/duongcanhquan/danhgiatuyensinh)

## Chạy local

```bash
npm install
cp .env.example .env   # điền Firebase (file .env không commit)
npm run dev
```

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

### Firebase trên Pages

Build trên GitHub **không** có file `.env`. Thêm **Repository secrets** (Settings → Secrets and variables → Actions) với các tên giống biến `VITE_*` trong `.env.example`, workflow sẽ truyền vào `npm run build`. Nếu không thêm secrets, app vẫn build nhưng chưa kết nối được Firebase cho đến khi bạn cấu hình secrets.

## Bảo mật

- Không commit `.env` hoặc file service account JSON.
- Xoá/regenerate key nếu đã lộ công khai.
