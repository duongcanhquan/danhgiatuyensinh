# Chi tiết hồ sơ — cột phải gọn + dòng thời gian theo người thao tác

| Thuộc tính | Giá trị |
|------------|---------|
| **Mã** | `DES-LEAD-DETAIL-RIGHT-TIMELINE-2026-08-10` |
| **Ngày** | 2026-08-10 |
| **Trạng thái** | Đã duyệt hướng (user: OK) |
| **Hướng** | Chỉ sửa UI (approach 1) |

## Mục tiêu

1. Cột phải (Phân công / Dòng thời gian) **gọn hơn** để cột trái (thông tin hồ sơ) rộng hơn.
2. Mỗi dòng trên dòng thời gian phải trả lời được **ai thao tác gì** — hiện **tên người**, không lấy nhãn kỹ thuật (OMICall, mã actionType…) làm tiêu đề chính.

## Quyết định đã chốt

| Hạng mục | Quyết định |
|----------|------------|
| Làm gọn | **C** — hẹp cột phải **và** mật độ UI cao hơn |
| Tên trên timeline | **B** — ưu tiên người đã lưu / gắn bản ghi (`performedByName`, `authorUid`, `counselorUid`); OMICall chỉ là chi tiết phụ |
| Approach | **1** — chỉ UI, không schema / backfill / dedupe call↔interaction |

## Phạm vi

### A. Bố cục chi tiết (`LeadDetailPanel` trong `LeadManagement.tsx`)

- Desktop grid: trái `lg:col-span-8`, phải `lg:col-span-4` (hiện 7 / 5).
- Tab phải: chiều cao / padding / chữ nhỏ hơn; nhãn ngắn nếu cần («Phân công», «Lịch sử»).
- `LeadCrmQuickBlock` (compact) và khung timeline: giảm padding/gap để thấy nhiều nội dung hơn trong cùng chiều cao.

### B. Dòng thời gian (`LeadActivityTimeline.tsx`)

**Tiêu đề dòng:** `Tên người · hành động` (ví dụ: `Nguyễn A · Gọi ra · Nghe máy`).

**Nguồn tên**

| Loại dòng | Tên |
|-----------|-----|
| Audit | `performedByName` → fallback `labelUid(performedBy)` |
| Interaction | `labelUid(authorUid)` |
| Call (OMICall record) | `labelUid(counselorUid)` nếu có; không thì `Chưa rõ người` |

**Không** dùng làm tiêu đề chính: `OMICall`, `Hệ thống · ACTION_TYPE` thô.

**Chi tiết phụ (dòng nhỏ):** SĐT, thời lượng, máy lẻ, HL / chưa HL, ghi chú, snapshot funnel/nhãn, v.v.

**Audit:** nhãn hành động tiếng Việt đời thường (Phân công, Đổi trạng thái, Ghi chú / tương tác, AI, Cập nhật hệ thống…), tên người nổi bật trên tiêu đề hoặc cạnh hành động.

**Empty copy:** tránh «ghi nhận OMICall» — dùng câu kiểu «Chưa có hoạt động trên hồ sơ này.»

### C. Không làm (lần này)

- Đổi schema Firestore / backfill bản ghi cũ thiếu `counselorUid` / `performedByName`.
- Gộp / dedupe cuộc gọi OMICall với interaction.
- Đổi logic KPI, nguồn gọi, hay `LeadAuditTimeline` (màn khác) trừ khi dùng chung helper nhãn (tuỳ chọn nhỏ).

## Thành công khi

1. Desktop: cột trái rộng hơn rõ so với trước; cột phải hẹp hơn và tab/thẻ đặc hơn.
2. Nhìn timeline biết **ai** (tên) làm **gì**; không thấy OMICall làm nhãn chính của dòng gọi.
3. Bản ghi cũ thiếu TVV trên call vẫn hiện «Chưa rõ người» + chi tiết phụ, không crash.

## Rủi ro & giảm thiểu

| Rủi ro | Giảm |
|--------|------|
| Call cũ không có `counselorUid` | Fallback «Chưa rõ người»; không bịa tên |
| `labelUid` chỉ rút gọn uid khi không có trong danh bạ | Giữ hành vi hiện có; ưu tiên `performedByName` khi có |
| Cột phải quá hẹp trên laptop nhỏ | Chỉ đổi `lg:`; mobile giữ stack như hiện tại |

## Kiểm thử chấp nhận

1. Mở chi tiết hồ sơ desktop: tỷ lệ ~8/4; tab phải và thẻ timeline/phân công gọn hơn trước.
2. Dòng gọi: tiêu đề có tên (hoặc «Chưa rõ người»), không bắt đầu bằng «OMICall».
3. Dòng tương tác / audit: tên người + hành động tiếng Việt; mô tả chi tiết vẫn đọc được.
4. Hồ sơ không hoạt động: empty state không nhắc OMICall như yêu cầu ghi nhận.
