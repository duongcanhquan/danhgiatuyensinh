# Phân loại mass + tín hiệu đã gọi (ca chung tài khoản)

**Ngày:** 2026-08-06  
**Trạng thái:** Duyệt hướng (user: C + C + cách 1 + «Ok triển khai»)  
**Liên quan:** LeadManagement, BulkLeadActionBar, call session / OMICall

## Mục tiêu

1. **Phân loại mass:** chọn nhiều hồ sơ → gán nhãn HOT/WARM/COLD/LOSS; giữ «Tính lại» theo bộ lọc.  
2. **Ca gọi chung TK:** trên danh sách thấy nhanh đã gọi chưa; lọc Chưa gọi / Đã gọi hôm nay / Cần gọi lại.

## Thiết kế

### A. Gán nhãn hàng loạt

- Thêm action trên `BulkLeadActionBar`: chọn nhãn → ghi `priorityTag` (+ audit nhẹ).  
- Không đổi điểm trừ khi user bấm «Tính lại» (rescore hiện có).  
- Quyền: cùng `canWriteLead` / bulk write hiện tại.

### B. Field denormalize trên Lead

Khi kết thúc cuộc gọi (call session / OMICall log):

| Field | Ý nghĩa |
|-------|---------|
| `lastCallAt` | Timestamp lần gọi gần nhất |
| `lastCalledByLabel` | Tên người / SIP / extension (không chỉ uid — vì chung TK) |
| `lastCallOutcome` | short code hoặc nhãn kết quả nếu có |

Filter:

- **Chưa gọi:** không có `lastCallAt`  
- **Đã gọi hôm nay:** `lastCallAt` trong ngày (local VN)  
- **Cần gọi lại:** có `nextFollowUpDate` ≤ hôm nay hoặc outcome kiểu callback (nếu có); tối thiểu dùng `nextFollowUpDate` đã có

### C. UI danh sách

- Cột/subline: «Gọi: {giờ} · {label}» hoặc «Chưa gọi».  
- Chip lọc ca cạnh bộ lọc hiện có.

## Ngoài phạm vi

- Màn ca gọi riêng  
- Bắt buộc mỗi người một Firebase account (chỉ tận dụng SIP/tên phiên)  
- Backfill lịch sử gọi cũ hàng loạt (có thể phase sau)
