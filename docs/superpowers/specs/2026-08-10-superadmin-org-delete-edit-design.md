# Superadmin — sửa rõ + xóa trường / xóa quản lý (soft-delete)

**Ngày:** 2026-08-10  
**Trạng thái:** Chờ duyệt spec (user chọn hướng A)  
**Liên quan:** `2026-07-29-superadmin-org-management-design.md` (đã có sửa/chi tiết; lần này bổ sung xóa + UX rõ)

---

## 1. Mục tiêu

Siêu quản trị trên màn **Quản lý trường** phải:

1. **Sửa trường** dễ thấy (không chỉ “Chi tiết”).
2. **Xóa trường** (soft-delete) có xác nhận — không purge hồ sơ / KPI / orgSettings.
3. **Xóa quản lý** (admin) của trường — xóa Auth + doc `users` như màn Nhân sự.

---

## 2. Hiện trạng (gap)

Đã có trong panel **Chi tiết**: sửa tên/slug/ghi chú, tạm ngưng/mở lại, thêm/vô hiệu/đặt MK admin.

**Thiếu:**

- Nút **Sửa** / **Xóa** rõ trên dòng danh sách.
- Soft-delete trường (`status: deleted`).
- Nút **Xóa** trên từng quản lý (chỉ có Vô hiệu).

`OrgProvider` đã chỉ load `status == 'active'` → trường soft-delete tự biến khỏi OrgSwitcher.

---

## 3. Thiết kế

### 3.1. Schema

Mở rộng:

```ts
type OrganizationStatus = 'active' | 'suspended' | 'deleted'
```

- Soft-delete: `updateDoc` → `status: 'deleted'`, `updatedAt`, (tuỳ chọn) `deletedAt`, `deletedBy`.
- **Không** xóa doc `organizations/{id}`, leads, orgSettings, scoringAux.
- **Chặn** soft-delete `vietmy` (`DEFAULT_ORG_ID`) — giống chặn tạm ngưng.
- Tạm ngưng (`suspended`) giữ nguyên; khác với `deleted` (ẩn khỏi list mặc định + switcher).

### 3.2. Service

`softDeleteOrganization(db, actor, orgId, orgName?)`:

- Chỉ `isPlatformSuperAdmin`.
- Validate id; reject `DEFAULT_ORG_ID`.
- Set `status: 'deleted'`.
- Audit `ORG_DELETED`.
- Caller UI: nếu `effectiveOrgId === orgId` → `setActiveOrgId(DEFAULT_ORG_ID)`.

### 3.3. UI danh sách trường

Mỗi dòng (ngoài các nút hiện có):

| Nút | Hành vi |
|-----|---------|
| **Sửa** | Mở panel Chi tiết (cùng state `detailId`; có thể đổi nhãn “Chi tiết” → “Sửa” hoặc giữ cả hai cùng hành vi). |
| **Xóa** | `window.confirm` tiếng Việt rõ ràng (không hoàn tác trên list; dữ liệu hồ sơ vẫn còn). Gọi soft-delete. Disabled khi `vietmy` hoặc `busy`. |

List mặc định: **không** hiện `status === 'deleted'`.  
(Tuỳ chọn YAGNI: bộ lọc “Đã xóa” + “Khôi phục” — **ngoài phạm vi** lần này.)

Stats “Đang hoạt động / Tạm ngưng”: không đếm `deleted`.

### 3.4. Xóa quản lý

Trong panel **Quản lý của trường**, mỗi admin:

- Nút **Xóa** cạnh Vô hiệu.
- Confirm: xóa vĩnh viễn Auth + Firestore (copy wording gần `StaffManagementView`).
- Gọi `deleteStaffAccount(admin.id)` từ `useAuth` (CF `adminStaffAccountAction` sẵn có).
- Không cho xóa chính tài khoản đang đăng nhập (đã chặn trong AuthProvider).
- Audit `ORG_ADMIN_DELETED` (detail = email).

### 3.5. Audit

Thêm vào `PLATFORM_AUDIT_ACTIONS` + nhãn VI:

- `ORG_DELETED` → «Xóa trường»
- `ORG_ADMIN_DELETED` → «Xóa quản lý trường»

### 3.6. Ngoài phạm vi

- Hard-delete / purge leads & orgSettings.
- Khôi phục trường đã xóa (UI “Đã xóa”).
- Xóa hàng loạt.
- Đổi quyền Cloud Function (reuse delete staff hiện có).

---

## 4. Thành công khi

1. Superadmin thấy **Sửa** / **Xóa** trên từng dòng trường; Sửa mở form thông tin.
2. Xóa trường (không phải vietmy) → biến khỏi list + OrgSwitcher; nếu đang chọn trường đó → về vietmy.
3. Xóa quản lý → tài khoản không đăng nhập được; biến khỏi list admin.
4. Audit ghi `ORG_DELETED` / `ORG_ADMIN_DELETED`.
5. Unit test: label audit mới; soft-delete reject `vietmy`; status type gồm `deleted`.

---

## 5. Rủi ro & giảm thiểu

| Rủi ro | Giảm thiểu |
|--------|------------|
| Xóa nhầm trường | Confirm + chặn vietmy + soft-delete (data còn) |
| Đang làm việc tại trường bị xóa | Auto switch về `DEFAULT_ORG_ID` |
| Xóa admin còn gắn leads | Giống Nhân sự hiện tại — chấp nhận; lead giữ `assignedTo` cũ |
