# Gap analysis: App hiện tại vs App Script legacy

> Đối chiếu hệ thống React/Firestore (`danhgiatuyensinh`) với  
> [`docs/APPSCRIPT-LEGACY-LOGIC-REFERENCE.md`](./APPSCRIPT-LEGACY-LOGIC-REFERENCE.md).  
> Cập nhật: 2026-08-14 (parity chi tiết + bootstrap chứng từ / dual webhook TVV / cổng KT).

---

## 0. Kết luận

**Parity vận hành lõi Apps Script đã đóng trên code.** Còn lại chủ yếu **deploy/ops** (CF, Drive webapp, URL n8n) và PDF landscape (CSV đã có).

---

## 1. Ma trận trạng thái (code)

| Trụ cột | Status |
|---|---|
| CCCD dedupe (create/edit/public/**Excel**) | ✅ |
| `fullNeAt` + báo cáo ngày | ✅ |
| Đủ cọc + đủ field → `ĐÃ HOÀN THIỆN` | ✅ |
| Drive `ensure_folder` giấy mời | ✅ code (cần redeploy GAS) |
| Báo cáo tuyển sinh 5 tab | ✅ `/bao-cao-tuyen-sinh` |
| Role Marketing (UI + Rules read-only create) | ✅ |
| Cron báo cáo multi-org + ngưỡng org | ✅ `sendScheduledFinanceReports` |
| Ngưỡng cọc/LPXT theo org | ✅ UI + client + CF |
| Webhook đổi URL là chạy | ✅ bootstrap + ensure-load |
| **Receipt storage bootstrap** (OrgProvider + ensure trước upload) | ✅ |
| **TVV nộp tiền → cả giayMoi + CTSV** (dedupe URL) | ✅ parity Main.gs |
| Cổng KT: Hiện CỌC, stats, bill, validate, SĐT mẹ/TVV | ✅ |
| Sort pending → createdAt mới→cũ; list 3000 | ✅ |
| Admin vào `/ke-toan` vẫn load list (duyệt cần `finance:accountant`) | ✅ |
| Soft-fail n8n sau khi đã lưu | ✅ |
| Payment/Full NE CF atomic + no-op trùng quyết định | ✅ |
| `scholarshipCondition` giấy mời | ✅ từ master HB |
| Rate limit form public | ✅ 8 req / 10 phút / IP |
| PDF admissions landscape | ⚠️ CSV có — PDF tùy chọn |

---

## 2. Việc ops (không phải thiếu code)

Xem hướng dẫn chạy ngay: [`HUONG-DAN-CAI-WEBHOOK-VA-CHAY.md`](./HUONG-DAN-CAI-WEBHOOK-VA-CHAY.md).

1. `firebase deploy --only functions` (cron + accountant CF + public rate limit)
2. `firebase deploy --only firestore:rules` (marketing không tạo/sửa HS)
3. Redeploy Apps Script Drive `ensure_folder` + cấu hình root folder
4. Cài đặt → Webhook n8n: dán 4 URL (hoặc «Điền URL mẫu VietMy») → Lưu
5. Cài đặt → Chứng từ: R2 và/hoặc Drive URL+token
6. n8n: map `message_vi` / `chat_text` → Google Chat (app không gọi Chat API trực tiếp)

---

## 3. Checklist nghiệm thu

- [ ] TVV tạo HS — chống trùng SĐT + CCCD
- [ ] Import Excel — skip trùng SĐT/CCCD
- [ ] KT duyệt / từ chối / Full NE — status đúng ngưỡng org
- [ ] TVV nộp tiền — Chat CTSV (+ giấy mời nếu URL khác)
- [ ] KT duyệt — Chat CTSV
- [ ] Webhook đổi URL rồi chạy
- [ ] Cron 23:55 ICT gửi daily (+ monthly ngày cuối tháng)
- [ ] Marketing xem báo cáo, không tạo/sửa HS
- [ ] Form public rate-limit khi spam
- [ ] Upload bill theo R2 hoặc Drive đã cấu hình

---

*File bridge legacy ↔ roadmap. Cập nhật khi đóng gap.*
