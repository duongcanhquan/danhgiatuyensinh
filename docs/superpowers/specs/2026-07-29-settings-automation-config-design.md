# Cấu hình tự động hoá trong Cài đặt (giấy mời + chứng từ)

**Ngày:** 2026-07-29  
**Trạng thái:** Đã triển khai trên nhánh superadmin-org-management  
**Nguyên tắc:** Mọi tham số vận hành (webhook, mẫu Docs, thư mục Drive, nơi lưu bill) phải chỉnh được trên UI theo từng trường — không chỉ hardcode / .env.

## Đã đẩy vào Cài đặt → Tích hợp

| Tab | Nội dung |
|-----|----------|
| **Webhook n8n** | URL giấy mời, CTSV, báo cáo ngày/tháng |
| **Giấy mời & mẫu** | Bật/tắt loại giấy, nhãn, mã mẫu Google Docs, Drive root, tự tạo thư mục lần đầu |
| **Chứng từ & lưu trữ** | Provider auto/R2/Drive/Firebase + URL/token theo trường |
| **Cổng đăng ký SV** | (đã có) form + webhook |

## Payload giấy mời gửi n8n (bổ sung)

Ngoài `action`, `docType`, `folderId`, `studentData`:

- `driveRootFolderId`
- `autoCreateFolder`
- `templateFileId` (theo loại giấy đã cấu hình)

## Lưu trữ

`orgSettings/{orgId}/settings/inviteDocumentsConfig`  
`orgSettings/{orgId}/settings/receiptStorageConfig`

Copy khi Superadmin tạo trường mới (template list).

## Việc còn lại (đợt sau)

- Migrate cổng ĐK / OMICall còn lại từ `scoringAux` → `orgSettings`
- Module «đơn từ» khác giấy mời (nếu sản phẩm cần)
- Import/export cấu hình giấy mời cùng file backup org
