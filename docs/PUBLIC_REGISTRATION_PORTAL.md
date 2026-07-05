# Cổng đăng ký sinh viên (công khai)

Form công khai tại **`/dang-ky`** — không cần đăng nhập sinh viên (phương án A). Hồ sơ ghi vào collection `leads` (Firestore `warmlist`), TVV xử lý trên app quản trị như hồ sơ thường.

## Bật cổng

1. **Cài đặt → Tích hợp → Cổng đăng ký SV**
2. Bật «Cổng đăng ký», chỉnh tiêu đề / lời giới thiệu / thông báo thành công
3. Thêm **Nguồn hồ sơ** (mặc định `Web đăng ký`) vào danh mục Nguồn nếu dùng KPI OFF/MKT
4. **Deploy Cloud Functions** (`submitPublicLead`, `getPublicRegistrationMeta`)
5. (Tuỳ chọn) Gắn tên miền riêng trỏ cùng bản build — vd. `https://dangky.example.vn/dang-ky`

## Webhook n8n — email sinh viên + TVV

Cấu hình URL trong **Cài đặt → Cổng đăng ký SV**. Sau khi tạo hồ sơ, Cloud Function POST JSON:

```json
{
  "action": "student_registration",
  "leadId": "firestore-doc-id",
  "systemCode": "2607050001",
  "registeredAt": "2026-07-05T10:00:00.000Z",
  "portalUrl": "https://…/dang-ky",
  "student": {
    "fullName": "Nguyễn Văn A",
    "phone": "0912345678",
    "parentPhone": "",
    "email": "sv@example.com",
    "dateOfBirth": "15/08/2008",
    "province": "Hà Nội",
    "highSchool": "THPT …",
    "gradeClass": "12A1",
    "educationLevel": "CĐ 9+",
    "majorInterest": "Công nghệ thông tin",
    "academicPerformance": "Khá",
    "description": "",
    "source1": "Web đăng ký"
  },
  "counselor": {
    "id": "uid-tvv",
    "name": "Trần Thị B",
    "email": "tvv@caodangvietmy.edu.vn"
  }
}
```

**Workflow n8n gợi ý:**

1. Webhook trigger (POST)
2. IF `action === student_registration`
3. **Email → sinh viên** (`student.email`): xác nhận + mã hồ sơ `systemCode`
4. **Email → TVV** (`counselor.email`, nếu có): thông báo hồ sơ mới + link CRM (tuỳ bạn ghép)

Hồ sơ vẫn được lưu nếu n8n lỗi; trường `publicRegistrationMeta.n8nOk` trên lead ghi lại kết quả.

## Firestore

- Cấu hình: `scoringAux/publicRegistrationConfig`
- Hồ sơ mới: `leads/{id}` với `registrationChannel: public_portal`, `systemCode`, `source1` theo cấu hình

## Bảo mật

- Form **không** ghi Firestore trực tiếp — chỉ qua Cloud Function
- Chống trùng SĐT (`uniqueHash`) giống tạo hồ sơ thủ công
- Nên thêm rate limit / CAPTCHA trên n8n hoặc Cloud Function khi mở rộng production
