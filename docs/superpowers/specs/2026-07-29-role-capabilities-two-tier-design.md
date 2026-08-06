# Phân quyền hai tầng: Superadmin ↔ Admin trường

**Ngày:** 2026-07-29  
**Nguyên tắc:**
- **Siêu quản trị** phân bổ **module/capability cho từng trường** (Admin trường được làm gì).
- **Admin trường** chịu trách nhiệm **phân quyền nhân sự vận hành** trong trường + **setup cài đặt** trong phạm vi đã được giao.

## Schema

`orgSettings/{orgId}/settings/roleCapabilities`

```json
{ "adminEnabledModuleIds": ["staff", "data", "scoring", "integrations", "ai", "analytics", "leads_school"] }
```

Module `staff` (Nhân sự & phân quyền) **bắt buộc**.

## Resolver

`resolveEffectivePermissions(profile, orgCaps)` — với `role === admin`, giao cắt quyền mặc định Admin với module Siêu quản trị đã bật.

## UI

| Ai | Ở đâu | Việc |
|----|-------|------|
| Superadmin | Quản lý trường → Chi tiết → **Phân quyền Admin trường** | Bật/tắt module |
| Admin trường | Cài đặt → Nhân sự → Sửa | Giao thêm / thu hồi quyền gợi ý cho TVV/CTV/TL |
| Mọi người có `config:users` | Cài đặt → Phân quyền | Tham chiếu ma trận (read-only) |
