# Hướng dẫn: build có `public/seed`, deploy hosting, và nạp mẫu vào Firestore

Tài liệu này trả lời hai việc tách bạch:

1. **Build + deploy** — chỉ đưa **file tĩnh** (`*.json` trong `dist/seed/`) lên hosting để trình duyệt **tải được** khi bạn bấm «Nạp … mẫu».
2. **Nạp vào Firestore** — chỉ xảy ra **sau khi** bạn đã mở app bản deploy, **đăng nhập đủ quyền**, và **bấm đúng nút** (hoặc chạy script seed trên máy có service account — không nằm trong hướng dẫn này).

**Firebase không tự có dữ liệu collection** chỉ vì bạn build xong; đó là hành vi đúng của hệ thống.

---

## Phần A — Build sao cho chắc chắn có `seed/*.json`

Trên máy, trong thư mục project:

```bash
npm run build:seed
```

Lệnh này làm hai việc nối tiếp:

1. `npm run export:public-seed` — tạo / cập nhật `public/seed/*.json` từ mã nguồn.
2. `npm run build` — copy `public/` vào `dist/` (Vite), nên sau build phải có **`dist/seed/`** cùng 3 file JSON.

**Kiểm tra nhanh:**

```bash
ls dist/seed
```

Phải thấy: `vietmy-script-snippets.json`, `knowledge-documents.json`, `consulting-playbooks.json`.

---

## Phần B — Chọn đúng bản build theo **URL** app của bạn

Trong `vite.config.ts`, bản production **mặc định** dùng base path:

`/danhgiatuyensinh/`

(tức là app và file seed nằm dưới **subpath**, phù hợp GitHub Pages kiểu `https://<user>.github.io/danhgiatuyensinh/`).

| Bạn deploy app ở đâu | Lệnh build nên dùng |
|----------------------|---------------------|
| URL có dạng `.../danhgiatuyensinh/` (đúng subpath trên) | `npm run build:seed` |
| URL ở **gốc domain** (ví dụ `https://xxx.web.app/`, `https://xxx.firebaseapp.com/`) | `npm run build:hosting` |

`build:hosting` tương đương: `VITE_BASE=/` + export seed + build — để đường dẫn asset và `fetch(.../seed/...)` không bị sai.

**Nếu build sai base:** app vẫn mở được nhưng tải seed sẽ lỗi 404 → nút «Nạp mẫu» báo lỗi tải file.

---

## Phần C — Đẩy thư mục `dist/` lên hosting

Bạn phải upload **toàn bộ nội dung** thư mục `dist/` (không chỉ mỗi file seed) lên nơi host đang phục vụ app.

### Cách 1: Firebase Hosting (đã có `hosting` trong `firebase.json`)

1. Cài CLI (một lần): `npm i -g firebase-tools`
2. Đăng nhập: `firebase login`
3. Gắn project (một lần): `firebase use --add` và chọn **Project ID** Firebase của bạn (tạo file `.firebaserc`).
4. Build đúng base (mục B), ví dụ gốc `/`:

   ```bash
   npm run build:hosting
   ```

5. Deploy chỉ hosting:

   ```bash
   firebase deploy --only hosting
   ```

Sau deploy, mở trình duyệt **dạng ẩn danh** và thử URL (thay domain đúng site bạn):

- `https://<site-của-bạn>/seed/vietmy-script-snippets.json`  
  (nếu dùng `build:hosting` và app ở gốc `/`)

hoặc

- `https://<user>.github.io/danhgiatuyensinh/seed/vietmy-script-snippets.json`  
  (nếu dùng `build:seed` mặc định và host đúng subpath)

Nếu mở URL trên mà **không** tải được JSON → chưa deploy đúng `dist` hoặc sai base — sửa lại mục B rồi build + deploy lại.

### Cách 2: GitHub Pages / host khác

Quy trình tùy repo (thường là push `dist` lên nhánh `gh-pages` hoặc GitHub Action). Điểm chung: **bản build phải là bản đã có `dist/seed/`** và **base URL** (`VITE_BASE`) phải khớp đường dẫn thật của site.

---

## Phần D — Sau khi deploy: nạp mẫu **vào Firestore** từ app

Điều kiện:

1. App đang chạy là **bản vừa deploy** (có `dist/seed`).
2. Đăng nhập Firebase Auth bằng user **có quyền trong app** (hàm `can(...)`), tối thiểu:
   - **Playbook + Script Hub + nút nạp playbook:** `config:playbooks`
   - **Tab Kho tri thức (RAG) + nút nạp knowledge:** `config:ai_engine`
3. Trong ma trận mặc định (`src/auth/permissions.ts`), **chỉ role `admin`** có đủ mọi quyền cấu hình. `counselor` **không** có `config:playbooks` / `config:ai_engine` — nếu cần TVV nạp mẫu, phải gán thêm quyền ở chỗ bạn lưu profile user (Firestore / custom claims — tùy triển khai của bạn).

**Các nút trong app (sau khi đăng nhập admin):**

| Vị trí trong app | Nút | Ghi vào collection (Firestore) |
|------------------|-----|----------------------------------|
| **Cài đặt** → tab tương ứng Playbook / Danh sách playbook | «Nạp 50 playbook mẫu» | `consultingPlaybooks` (id cố định seed) |
| **Cài đặt** → Script / Trung tâm kịch bản | «Nạp 20 snippet mẫu» | `scriptSnippets` |
| **Cài đặt** → Kho tri thức (RAG) | «Nạp mẫu kho tri thức từ JSON» | `knowledgeDocuments` |

Mỗi lần bấm, trình duyệt `fetch` file JSON từ **cùng origin** với app (`/.../seed/...`) rồi ghi batch bằng **SDK client** + quyền user đó.

**Nếu báo lỗi kiểu `permission-denied`:** Rules Firestore đang chặn ghi collection đó. Cần mở Rules trên Firebase Console (database đúng, ví dụ `warmlist` nếu app trỏ vào database đó) và cho phép user đã đăng nhập (hoặc chỉ admin) ghi các collection trên — đồng bộ với cách app kiểm tra quyền.

---

## Phần E — Tóm tắt một dòng

**Build có seed** → `npm run build:seed` hoặc `npm run build:hosting` (tùy URL) → **deploy cả `dist/`** → **đăng nhập admin** → **bấm từng nút «Nạp … mẫu»** → lúc đó Firestore mới có dữ liệu.

---

## Lệnh tham chiếu nhanh

```bash
# GitHub Pages / subpath /danhgiatuyensinh/
npm run build:seed

# Firebase Hosting / app ở gốc /
npm run build:hosting

# Chỉ tạo JSON trong public/ (không build)
npm run export:public-seed
```
