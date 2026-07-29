# Superadmin — quản lý trường đầy đủ

**Ngày:** 2026-07-29  
**Trạng thái:** Đã duyệt hướng (user: «ok làm đi»)  
**Liên quan:** `2026-07-29-multi-tenant-org-design.md`, `2026-07-29-crm-platform-north-star.md`

---

## 1. Mục tiêu

Siêu quản trị nền tảng (`super_admin`, `orgId` null) **điều hành các trường**, không làm công đoạn cá nhân (Ngày của tôi / gọi / hồ sơ như TVV).

Phải làm được:

1. Xem thông tin từng trường  
2. Sửa thông tin trường (tên, slug cổng ĐK, ghi chú)  
3. Tạm ngưng / mở lại  
4. Cài đặt / quản lý **admin trường** (xem danh sách, thêm, vô hiệu, đặt lại mật khẩu)  
5. Mở **cài đặt của đúng trường** đang chọn (nhãn rõ trên UI)

Admin trường chịu trách nhiệm cấu hình trong trường. TL / TVV / CTV / KT vận hành trực tiếp.

---

## 2. Hiện trạng (gap)

Màn `/organizations` đã có: danh sách, tạo + admin lần đầu, tạm ngưng/mở lại, chuyển ngữ cảnh, health, export, nhật ký.

**Thiếu:** sửa tên/slug/ghi chú, chi tiết trường, quản lý admin sau khi tạo, badge «đang cấu hình trường X» ở Cài đặt.

---

## 3. Thiết kế

### 3.1. Schema `organizations/{orgId}`

Thêm field tuỳ chọn:

| Field | Kiểu | Ghi chú |
|-------|------|---------|
| `notes` | string | Ghi chú nội bộ Superadmin (không hiện TVV) |

`id` / `orgId` **không đổi** sau khi tạo. Đổi **slug** chỉ ảnh hưởng URL `/dang-ky/:slug` — phải unique giữa các trường.

### 3.2. Màn Quản lý trường

Mỗi dòng trường có nút **Chi tiết** mở panel:

- Form sửa: tên, slug (cảnh báo cổng ĐK), ghi chú → Lưu  
- Trạng thái + tạm ngưng / mở lại (giữ chặn suspend `vietmy`)  
- **Admin trường:** list `users` where `orgId == org` và `role == admin`  
  - Thêm admin (email, mật khẩu tạm, tên)  
  - Vô hiệu / bật lại (`isActive`)  
  - Đặt mật khẩu mới (reuse `setStaffPassword` / Cloud Function hiện có)  
- **Mở cài đặt trường này:** `setActiveOrgId` + navigate `/settings`  
- Giữ: Làm việc tại đây, Tải cấu hình

### 3.3. Nhật ký nền tảng

Thêm action: `ORG_UPDATED`, `ORG_ADMIN_ADDED`, `ORG_ADMIN_DISABLED` (và `ORG_ADMIN_ENABLED` nếu bật lại).

### 3.4. Cài đặt — nhãn ngữ cảnh

Khi Superadmin mở `/settings`, hiện dòng: «Đang cấu hình: **{tên trường}**» (+ link về Quản lý trường / Đổi trường). Dùng `currentOrgLabel` từ `OrgProvider`.

### 3.5. Ngoài phạm vi (YAGNI lần này)

- Import lại JSON cấu hình  
- Soft-delete trường  
- Cắt menu «Ngày của tôi» khỏi Superadmin (làm đợt phân quyền menu riêng)  
- Migrate hết `scoringAux` → `orgSettings` (đợt chuẩn hóa data riêng)

---

## 4. Thành công khi

1. Superadmin sửa được tên/slug/ghi chú trường đã có và thấy trên danh sách.  
2. Superadmin xem/thêm/vô hiệu/đặt MK admin của trường đó từ panel Chi tiết.  
3. «Mở cài đặt trường này» chuyển ngữ cảnh + vào Settings với nhãn đúng trường.  
4. Audit ghi nhận sửa trường / thao tác admin.  
5. Unit test cho validate/update patch và nhãn audit.
