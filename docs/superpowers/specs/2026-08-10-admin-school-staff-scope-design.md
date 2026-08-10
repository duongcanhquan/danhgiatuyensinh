# Phân quyền Quản lý trường vs Trưởng nhóm

**Ngày:** 2026-08-10  
**Trạng thái:** Đã triển khai (client + CF assert; cần deploy functions nếu production)

## Mục tiêu

1. **Quản lý (`admin`)**: quản toàn bộ nhân sự trong trường — TVV, CTV, Trưởng nhóm, Quản lý khác — trừ `super_admin`. Nhiều Quản lý cùng quyền.
2. **Trưởng nhóm**: chỉ TVV/CTV trong `managedCounselorIds` (giữ 1 nhóm / 1 TVV).
3. Quản lý **không** cầm nhóm (`canOwnFieldStaffTeam` chỉ `team_lead`).
4. TL không dùng `analytics:advanced` để mở KPI/lịch gọi toàn trường.
5. **OMICall:** quyền `config:omicall` giữ cho Quản lý — gán số nội bộ + mật khẩu SIP cho nhân viên (TVV/CTV), Trưởng nhóm (và Quản lý nếu cần gọi). TL không cấu hình tổng đài / không gán SIP cho người khác.

## Ngoài phạm vi lần này

- Multi-TL cùng cầm một TVV
- Deploy OMICall CF org-aware đầy đủ (theo dõi riêng)
