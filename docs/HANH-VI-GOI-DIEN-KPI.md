# Hành vi gọi điện Sale — Checklist điểm cộng/trừ

Tài liệu mô tả hệ thống **đánh giá hành vi TVV trong cuộc gọi**: tick ô → tự động cộng/trừ điểm → lưu trên interaction → dùng báo cáo / KPI tuân thủ.

---

## 1. Dùng ở đâu?

| Vai trò | Thao tác |
|---------|----------|
| **TVV** | Gọi từ hồ sơ (OMICall) → panel **Bảng đánh giá** → tick hành vi → **Lưu đánh giá** |
| **Admin** | **Cài đặt → AI & tích hợp → Bảng đánh giá khi gọi** — chỉnh nhãn và **số điểm** từng hành vi |

Thanh **Điểm hành vi cuộc gọi** (0–100) cập nhật **ngay khi tick**, trước khi bấm Lưu.

---

## 2. Cách tính điểm một cuộc gọi

```
Điểm gốc (mặc định)     = 70
Delta                   = tổng điểm các ô đã tick (có trường points)
Điểm hành vi cuộc gọi   = clamp(70 + Delta, 0, 100)
```

**Ví dụ:**

| Tick | Điểm |
|------|------|
| Chào hỏi đúng tên (+3) | +3 |
| Đặt câu hỏi mở (+5) | +5 |
| Chen ngang khách (−5) | −5 |
| **Delta** | **+3** |
| **Điểm cuộc gọi** | **73/100** |

Chỉ các chiều có **Nhóm điểm** (Tích cực / Tiêu cực / Quy trình) mới ảnh hưởng điểm. Phần *Đánh giá khách/hồ sơ* (thái độ, sẵn sàng…) **không** cộng trừ điểm hành vi.

---

## 3. Danh mục hành vi mặc định

### 3.1. Tích cực — Mở đầu & xác nhận

| Hành vi | Điểm |
|---------|------|
| Chào hỏi đúng tên khách | +3 |
| Giới thiệu bản thân và trường | +3 |
| Hỏi thăm thời điểm gọi có thuận tiện | +2 |
| Xác nhận người quyết định nhập học | +4 |
| Xác nhận kênh liên lạc (Zalo/SĐT) | +3 |
| Nêu rõ mục đích cuộc gọi | +3 |

### 3.2. Tích cực — Kỹ năng tư vấn

| Hành vi | Điểm |
|---------|------|
| Đặt câu hỏi mở khám phá nhu cầu | +5 |
| Tóm tắt lại nhu cầu khách | +4 |
| Lắng nghe, không chen ngang | +5 |
| Gợi ý ngành phù hợp | +4 |
| Giải thích điều kiện xét tuyển | +4 |
| Đề cập học bổng / hỗ trợ tài chính | +5 |
| Nói về việc làm sau tốt nghiệp | +5 |
| Chia sẻ ví dụ SV thành công | +3 |
| Xử lý phản đối có cấu trúc | +6 |
| Giọng điệu đồng cảm | +5 |
| Trình bày giá trị trước học phí | +4 |
| Mời phụ huynh tham gia | +4 |

### 3.3. Tích cực — Chốt & bước tiếp theo

| Hành vi | Điểm |
|---------|------|
| Thống nhất bước tiếp theo rõ ràng | +6 |
| Hẹn giờ gọi / nhắn lại cụ thể | +5 |
| Hẹn tham quan / open day | +5 |
| Gửi tài liệu / link | +4 |
| Hỏi khả năng đặt cọc | +5 |
| Nhắc hạn nộp hồ sơ | +3 |
| Hẹn gọi thêm người thân | +4 |
| Kết thúc lịch sự | +3 |

### 3.4. Quy trình CRM (cộng)

| Hành vi | Điểm |
|---------|------|
| Gọi từ nút OMICall trên hồ sơ | +5 |
| Theo kịch bản mở đầu | +3 |
| Dùng FAQ chính thống | +3 |
| Chọn đúng kết quả cuộc gọi | +3 |
| Cam kết cập nhật CRM | +4 |
| Ghi chú ngắn trong lúc gọi | +3 |

### 3.5. Tiêu cực — Hành vi cần tránh

| Hành vi | Điểm |
|---------|------|
| Chen ngang, cắt lời | −5 |
| Nói quá nhanh, áp đảo | −3 |
| Không giới thiệu bản thân / trường | −4 |
| Bỏ qua khám phá nhu cầu | −6 |
| Ép chốt / gây áp lực | −8 |
| Hứa hẹn không thực tế | −10 |
| Nói xấu trường khác | −6 |
| Phớt lờ phản đối | −5 |
| Kết thúc không bước tiếp theo | −5 |
| Cúp máy thiếu lịch sự | −4 |
| Gọi ngoài hồ sơ | −6 |
| Thông tin sai | −8 |
| Giọng thiếu tôn trọng | −10 |
| Làm việc khác khi gọi | −5 |
| Không ghi chú / CRM | −4 |
| Chỉ nói giá | −4 |
| Bỏ qua phụ huynh | −6 |
| Chia sẻ cá nhân không liên quan | −3 |
| Ngôn từ thiếu chuyên nghiệp | −5 |
| Gọi lại spam liên tục | −6 |

### 3.6. Thiếu sót quy trình (trừ)

| Hành vi | Điểm |
|---------|------|
| Không theo kịch bản mở đầu | −4 |
| Không theo kịch bản kết thúc | −5 |
| Quên hẹn giờ gọi lại | −4 |
| Chọn sai kết quả cuộc gọi | −3 |
| Không thông báo ghi âm | −3 |

---

## 4. Cấu hình trong hệ thống

**Firestore:** `scoringAux/callSessionChips` (version 2, mảng `dimensions`).

Mỗi chiều có:

- `scoringGroup`: `positive` | `negative` | `process` | (trống = đánh giá khách)
- Mỗi `option`: `id`, `label`, `points` (số nguyên, âm được)

**Lưu trên interaction:** `callSessionEvaluation.behaviorScore`, `behaviorPointsDelta`, `picks[].points`.

Admin có thể:

- Sửa điểm từng dòng
- Thêm/xóa hành vi
- Tạo chiều mới với nhóm điểm

Bấm **Lưu bảng đánh giá** → TVV thấy ngay ở panel OMICall.

---

## 5. Liên hệ KPI tháng

- **Trụ Tuân thủ (10%)** hiện gồm: cảnh báo spam/cọc/bắt máy + điểm trưởng nhóm nhập tay.
- **Điểm hành vi cuộc gọi** được lưu từng cuộc → có thể lấy **trung bình tháng** làm tham chiếu coaching (tab Lịch sử gọi / báo cáo đánh giá).
- Giai đoạn tiếp theo (nếu bật): gộp trung bình `behaviorScore` tháng vào trụ Tuân thủ KPI tự động.

---

## 6. Quy trình khuyến nghị cho TVV

1. Gọi **từ hồ sơ** (OMICall).
2. Trong / sau gọi: tick **hành vi đã làm** (xanh) và **hành vi sai** (đỏ) nếu có.
3. Tick **đánh giá khách** (bắt buộc các mục *).
4. **Lưu đánh giá** — điểm và picks ghi vào timeline hồ sơ.

---

## 7. Mã nguồn tham chiếu

| File | Vai trò |
|------|---------|
| `src/utils/callSessionBehaviorCatalog.ts` | Danh mục hành vi mặc định |
| `src/utils/callSessionBehaviorScore.ts` | Công thức cộng/trừ |
| `src/components/CallSessionEvaluationBoard.tsx` | UI tick + điểm live |
| `src/components/CallSessionChipsSettingsPanel.tsx` | Cài đặt điểm |
