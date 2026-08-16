# Báo cáo thông minh trong Tổng kết (admin / quản lý / team lead)

**Ngày:** 2026-08-16  
**Hướng:** Gộp trung tâm báo cáo Apps Script vào `/tong-ket` (tab **Báo cáo**), giữ tab vận hành team/trường riêng.

## Mục tiêu

Một chỗ nhìn tổng cục: lọc kỳ · nhân sự · nguồn · hệ · ngành · tình trạng nộp phí; biểu đồ + bảng; drill-down sang Hồ sơ. Phạm vi team/trường theo quyền và nút Nhóm/Trường trên menu (ảnh hưởng báo cáo, không kéo Hồ sơ làm việc).

## Bề mặt

| Tab Tổng kết | Việc |
|---|---|
| Tổng quan | Pipeline CRM nhanh (giữ) |
| **Báo cáo** | `AdmissionsReportsView` nhúng — parity `runReportEngine` + lọc đa chiều + chart/motion |
| Quản lý team / trường | Ops CRM theo ngày tải · nguồn · tình trạng · chart |
| Đánh giá / bảng điểm / lịch gọi / vận hành | Giữ |

`/bao-cao-tuyen-sinh` vẫn dùng cùng component (không nhúng).

## Bug đã sửa trong đợt này

1. Lọc TVV báo cáo theo **UID** (trước đây so tên với `assignedTo` = UID → lọc hỏng).
2. OpsMonitor đếm theo **ngày tải** (khớp `dfrom`/`dto` Hồ sơ); bỏ `daxis=created` sai.
3. Báo cáo có tab **Nguồn** (mọi nguồn), xu hướng ngày, lọc dropdown thay vì chỉ “chứa chữ”.

## Non-goals

- PDF landscape (CSV đã có).
- Thay thế n8n daily/monthly push.
