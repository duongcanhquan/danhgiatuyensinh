# Thiết kế — Gọn workspace Hồ sơ + phân lead theo số lượng

| Thuộc tính | Giá trị |
|------------|---------|
| **Mã** | `DES-LEAD-DENSITY-ASSIGN-2026-08-10` |
| **Ngày** | 2026-08-10 |
| **Trạng thái** | Triển khai |
| **Hướng** | Mở rộng luồng smart assign hiện có (không CF) |

## Mục tiêu

1. Danh sách Hồ sơ: thu gọn tìm kiếm / lọc / chấm điểm để bảng lộ nhiều hơn.
2. Chi tiết hồ sơ: khối thao tác / gọi nhanh **thu gọn mặc định**, nhỏ gọn hơn.
3. Phân lead: trên Hồ sơ **và** luồng riêng; lọc → chọn **N** (≤ 1500) + quy tắc lấy N + TVV/mode.

## Quyết định đã chốt

| Hạng mục | Quyết định |
|----------|------------|
| Approach | Mở rộng client hiện có (`smartLeadAssign` + batch 400) |
| Chi tiết thao tác | Thu gọn mặc định (A), compact hơn |
| Phân lead UX | Cả hai: nhanh trên Hồ sơ + màn/wizard riêng (C) |
| Quy tắc lấy N | User chọn mỗi lần: cũ nhất / theo bảng / ngẫu nhiên (D) |
| Trần N | ~1.500 = `LEADS_UI_FULL_SCOPE_MAX` (A) |

## Phạm vi

### A. UI danh sách

- Thanh công cụ 1 hàng mặc định: tìm kiếm + nút bung «Bộ lọc» / «Chấm điểm» + tóm tắt ngắn (số khớp).
- Summary chips / lọc nhanh call-queue: gói vào vùng thu gọn hoặc hàng phụ chỉ khi mở «Bộ lọc».
- Giữ URL filter / Áp dụng lọc như hiện tại.

### B. UI chi tiết (`LeadDetailPanel`)

- Tab «Thao tác TVV / Hồ sơ»: chiều cao nhỏ hơn (bỏ subtitle trên mobile hoặc 1 dòng).
- «Gọi nhanh»: `<details>` **đóng mặc định**; summary hiện SĐT rút gọn + nút gọi nhanh nếu đủ số; bung để sửa số.
- Không sticky chiếm nửa viewport trên màn thấp.

### C. Phân theo số lượng

- Extends modal «Giao việc hàng loạt»:
  - Input **Số hồ sơ lần này (N)** (1…min(khớp lọc, 1500)).
  - Select **Cách lấy N**: `oldest` | `table_order` | `random`.
  - Giữ mode single / round_robin / lowest_load.
- Entry points:
  1. Hồ sơ: «Phân theo lọc» (dùng bộ lọc đang áp dụng; không bắt buộc tick trang).
  2. Màn/wizard «Phân lead thông minh» (cùng engine; copy rõ từng bước).
- Helper thuần: `pickLeadIdsForAssign(ids, rule, n, meta?)` + tests.
- Ghi Firestore: tái dùng `bulkReassignLeads` (chunk ≤400), progress UI.

## Không làm (lần này)

- Cloud Function phân nền / N > 1500.
- Đổi `LEADS_PAGE_SIZE` mặc định (có thể thêm chọn 30/50/100 sau nếu cần).
- Phân theo vùng/trường tự động.

## Rủi ro & giảm thiểu

| Rủi ro | Giảm |
|--------|------|
| Lấy N theo «cũ nhất» cần field thời gian | Dùng `createdAt` / `updatedAt` đã có trên lead; thiếu thì xếp cuối |
| Random không ổn định | Seed theo session hoặc `Math.random` một lần trước plan (document) |
| User tưởng phân hết 8k lead | Copy: «Khớp lọc X · lần này phân N (tối đa 1500)» |

## Kiểm thử chấp nhận

1. Danh sách: mặc định header gọn; mở lọc/chấm điểm vẫn hoạt động.
2. Chi tiết: gọi nhanh đóng; bung sửa SĐT + gọi được.
3. Phân theo lọc: N=500, rule=oldest, 1 TVV → đúng 500 lead được gán (hoặc ít hơn nếu khớp lọc < N).
4. Quyền: admin/TL/peer giữ rule hiện có; vượt scope → báo lỗi rõ.
