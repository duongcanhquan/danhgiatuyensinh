# DES-INTAKE-PORTAL-MERGE-2026-08 — Gộp tạo tay vào Cổng đăng ký

**Status:** approved (chờ triển khai)  
**Date:** 2026-08-14  
**Approach:** A (đã duyệt) — gộp tab, không backfill  
**Supersedes (UI):** 3 tab trong [DES-INTAKE-ORIGIN-2026-08](./2026-08-14-intake-origin-tabs-design.md). Field `intakeOrigin` gồm `manual` vẫn giữ cho hồ sơ cũ.

## Problem

«Tạo tay» và «Cổng đăng ký» cùng là hồ sơ nhập từng cái (không phải lô Excel). Tách tab làm TVV phải đoán đang tìm ở đâu. Form «Tạo mới» nhẹ hơn form cổng SV nên hồ sơ nhân viên điền thiếu mục so với sinh viên tự đăng ký.

## Decision

Một nhóm **Cổng đăng ký** = hồ sơ SV gửi form **và** hồ sơ nhân viên bấm Tạo mới. Không nhãn «TVV tạo» / «SV gửi». Cột **Tư vấn viên** trên danh sách giữ nguyên (người phụ trách).

Không sửa hàng loạt Firestore. Hồ sơ `intakeOrigin: manual` cũ vẫn hiện trong tab Cổng đăng ký.

## 1. Danh sách Hồ sơ

Hai nút nguồn nhập:

| Tab | Hiện hồ sơ |
|-----|------------|
| Tải lên / chiến dịch | `campaign_upload` (legacy thiếu origin = chiến dịch) |
| Cổng đăng ký | `public_portal` **hoặc** `manual` (kể cả suy diễn legacy) |

URL: `origin=campaign|portal`. `origin=manual` (bookmark cũ) → tab Cổng đăng ký.

Empty state tab cổng: một câu — chưa có hồ sơ cổng đăng ký trong phạm vi này; bấm Tạo mới hoặc chờ SV gửi form.

Chiến dịch: phân trang + oversample như hiện tại. Không đổi.

## 2. Khớp origin (không backfill)

`resolveLeadIntakeOrigin` giữ nguyên (field → cổng legacy → lô `manual-…` → chiến dịch).

Thêm khớp nhóm:

- Nhóm cổng = resolved origin là `public_portal` **hoặc** `manual`.
- Tab cổng dùng khớp nhóm, không so khớp một origin.

## 3. Truy vấn tab cổng

Không quét kho chiến dịch.

Một query Firestore:

`uploadedBy == 'public_portal'` **OR** `intakeOrigin in ['manual', 'public_portal']`

(Dùng `or()` như filter người phụ trách hiện có.)

Gồm: SV cổng (kể cả thiếu `intakeOrigin`), tạo tay cũ (`manual`), tạo mới sau này (`public_portal` + `uploadedBy` = UID nhân viên).

## 4. Ghi khi Tạo mới

| Field | Giá trị |
|-------|---------|
| `intakeOrigin` | `public_portal` |
| `registrationChannel` | `public_portal` |
| `uploadedBy` | UID nhân viên (giữ người tạo; cột TVV = người phụ trách) |
| `uploaderName` | Tên nhân viên |
| `source1` | Mặc định `publicRegistrationConfig.defaultSource1` (vd. «Web đăng ký»), sửa được |

`uploadBatchId` có thể giữ prefix `manual-…` — `intakeOrigin` đã ghi nên không ảnh hưởng tab.

Audit «Tạo hồ sơ…» giữ `performedBy` như hiện tại.

## 5. Form Tạo mới

Giữ tab CRM: Thông tin chung, Gia đình, Học Bổng, Hồ sơ học tập, Nguyện vọng, Ghi chú, Tài chính. Ẩn Giấy mời khi tạo mới.

**Bắt buộc** (cùng bộ cổng SV, tái sử dụng rule cổng — dob / SĐT / email / CCCD):

Họ tên · ngày sinh DD/MM/YYYY tuổi 12–70 · giới tính Nam/Nữ (select chỉ khi `isNewLead`; form sửa hồ sơ cũ giữ ô hiện tại) · nơi sinh · dân tộc · CCCD hợp lệ (hoặc «Chưa có») · SĐT SV · email · địa chỉ thường trú · SĐT mẹ · trường THPT · tỉnh/TP · đối tượng dự tuyển · hệ đào tạo · ngành · học lực (ô xếp loại hiện có, bắt buộc chọn) · người phụ trách.

Nếu cấu hình cổng chưa có `defaultSource1`, fallback «Web đăng ký» (cùng mặc định doc cổng).

Không bắt buộc: học bổng, tài chính, cơ sở, niên khóa, SĐT cha (nếu có thì phải hợp lệ), nơi ở hiện tại, ghi chú, mã KH.

Nguồn 1 tự điền theo cấu hình cổng; không còn chặn «phải chọn Nguồn 1» khi đã có mặc định.

## 6. Kiểm thử

- `leadMatchesIntakeOriginGroup(..., 'portal')` true với `manual` và `public_portal`; false với campaign.
- URL `manual` → tab portal.
- `validateManualLeadDraft` / helper dùng chung: thiếu họ tên / SĐT mẹ / email → lỗi; đủ bộ cổng → ok.
- `createManualLead` ghi `intakeOrigin` + `registrationChannel` = `public_portal`, `uploadedBy` = UID.
- UI: đúng 2 nút nguồn nhập; không còn nút «Tạo tay».

## Out of scope

- Backfill `manual` → `public_portal`
- Đổi form cổng công khai `/dang-ky`
- Đổi tab chiến dịch / Excel
- Nhãn phân biệt TVV vs SV trên bảng
- Giấy mời khi tạo mới
- Đổi ô học lực sang thang điểm 8.0–9.0 của cổng SV
