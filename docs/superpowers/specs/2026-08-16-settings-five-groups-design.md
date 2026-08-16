# Cài đặt — cấu trúc 5 nhóm (design)

**Ngày:** 2026-08-16  
**Trạng thái:** Approved → implementing

## Mục tiêu

Cài đặt dễ hiểu: mỗi nhóm một việc, màu phân vùng, Superadmin đổi trường bằng thẻ nhỏ — không banner chiếm chỗ.

## Năm nhóm chính

| `tab=` | Nhãn | Việc | Màu |
|--------|------|------|-----|
| `data` | Hồ sơ | Nhập liệu, danh mục | Sky |
| `rules` | Chấm điểm | Profile, điểm thông tin, nhãn, mẫu | Amber |
| `advise` | Tư vấn | Hub 4 bước (tri thức → mẫu → thoại → AI) | Emerald |
| `connect` | Kênh | Lưới đầu nối (+ URL sâu) | Indigo |
| `people` | Nhân sự | KPI, nhân sự, phân quyền | Rose |

## Superadmin

- Bỏ banner «Đang cấu hình…»
- Thẻ `OrgSwitcher` tone sáng góc phải thanh sticky

## URL legacy

- `tab=connect&sub=consulting` → `tab=advise&sub=consulting`
- `sub=llm` / `knowledge` → Tư vấn
- Deep link kênh (`omicall`, `webhooks`…) giữ `tab=connect`

## Chrome

- Thanh sticky thống nhất; ẩn hàng tab con khi chỉ còn 1 sub (Hồ sơ nhiều sub vẫn hiện)
- Tab nhóm màu theo `SETTINGS_MAIN_THEME`
- Nội dung full-bleed, tiêu đề chi tiết kênh không trùng
