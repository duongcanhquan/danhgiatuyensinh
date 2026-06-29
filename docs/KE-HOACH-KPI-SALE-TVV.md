# Kế hoạch hệ thống KPI Sale / TVV — VietMy Tuyển sinh

**Phiên bản:** 1.0 · **Ngày:** 2026-05  
**Mục tiêu:** Theo dõi sát sao TVV theo ngày / tuần / tháng — minh bạch, chống gian lận cuộc gọi, gắn tiền thật với kết quả.

---

## 1. Tóm tắt điều hành

| Câu hỏi quản lý | Trả lời ngắn |
|-----------------|-------------|
| TVV hôm nay gọi bao nhiêu, chuyển đổi ra sao? | Bảng **Trung tâm điều hành** (`/command`) — đọc `kpiDaily/{ngày}` |
| Lịch sử khách đầy đủ? | **Dòng thời gian** trên hồ sơ — gọi OMICall + tương tác + audit |
| Chống gian lận? | Giai đoạn 2: cuộc gọi **hợp lệ** (≥45s, có `leadId`, không trùng) |
| Thưởng cuối tháng? | Giai đoạn 4: `kpiMonthly` + bảng điểm tháng (`/scorecard`) |

**Nguyên tắc kỹ thuật:** Ghi sự kiện một lần → tổng hợp nhiều lần. Không quét toàn bộ `leads` mỗi sáng để đếm KPI.

---

## 2. Hiện trạng (đã có trong code)

### 2.1 Collections chính

```
leads/{id}                    — Hồ sơ ứng viên
leads/{id}/interactions       — Ghi chú, gọi, Zalo (snapshot CRM)
omicallCalls/{transactionId}  — CDR OMICall (nguồn sự thật cuộc gọi)
kpiDaily/{YYYY-MM-DD}/counselors/{uid}  — KPI tổng hợp theo ngày
auditLogs                     — Đổi trạng thái, phân công, cập nhật hồ sơ
```

### 2.2 Phân loại khách (đang dùng)

| Khái niệm | Trường Firestore | Giá trị |
|-----------|------------------|---------|
| Nhiệt độ | `priorityTag` | HOT, WARM, COLD, LOSS |
| Tiến độ TVV (Kanban) | `status` | NEW → INTERESTED → DEPOSIT_PAID → ENROLLED |
| Funnel trường | `pipelineStatus` | NEW → CONTACTED → … → ENROLLED |
| Tiền | `finance.payments.*` | Cọc, Bổ sung L1–L4, Full NE |

**Chuẩn báo cáo Sale:** dùng `status` + `priorityTag` + tiền đã duyệt.  
**Chuẩn báo cáo Ban GĐ:** thêm `pipelineStatus`.

### 2.3 KPI ngày (`CounselorDailyKpi`) — đã ghi từ Cloud Functions

| Nhóm | Trường | Ý nghĩa |
|------|--------|---------|
| Gọi | `totalCalls`, `connectedCalls`, `talkSeconds`, `recordings` | Từ OMICall webhook/sync |
| CRM | `crmActions`, `notesAdded`, `statusChanges` | Từ audit log |
| Tiền | `depositPaidCount`, `tuitionPaidCount`, `approvedRevenueVnd`, `fullNeCount` | Sau kế toán duyệt |

### 2.4 Thiếu (lộ trình)

- `validCalls`, `uniqueLeadsCalled` — Giai đoạn 2  
- `warmNew`, `hotNew`, `statusChanges` chi tiết theo loại — Giai đoạn 3  
- `kpiMonthly`, `kpiTargets` — Giai đoạn 4  
- UI đọc `omicallCalls` trên từng lead — **Giai đoạn 1 (đã triển khai)**

---

## 3. Bộ chỉ số KPI chuẩn

### 3.1 Theo ngày (TVV & Trưởng nhóm)

| Mã | Tên hiển thị | Công thức / nguồn |
|----|--------------|-------------------|
| `calls_total` | Tổng cuộc gọi | `kpiDaily.totalCalls` |
| `calls_connected` | Bắt máy | `connectedCalls` |
| `connect_rate` | Tỷ lệ bắt máy | `connected / total` |
| `talk_minutes` | Phút nói | `talkSeconds / 60` |
| `crm_actions` | Thao tác CRM | `crmActions` |
| `deposit_nb` | Cọc (NB) | `depositPaidCount` |
| `tuition_ne` | Học phí / bổ sung | `tuitionPaidCount` |
| `revenue` | Doanh thu duyệt | `approvedRevenueVnd` |
| `full_ne` | Full NE | `fullNeCount` |

*NB = booking/cọc mới · NE = nhập học / thu học phí.*

### 3.2 Giai đoạn 2 — Cuộc gọi hợp lệ (chống gian lận)

| Quy tắc | Mô tả |
|---------|--------|
| R1 | Bắt buộc `leadId` trong `userData` khi gọi từ CRM |
| R2 | `billSeconds ≥ 45` mới tính **hợp lệ** |
| R3 | Tối đa 1 hợp lệ / lead / TVV / 4 giờ |
| R4 | TVV không sửa được `billSeconds` — chỉ OMICall |

Trường mới trên `omicallCalls`: `isValidCall: boolean`, `invalidReason?: string`  
Trường mới trên `kpiDaily`: `validCalls`, `uniqueLeadsCalled`

### 3.3 Giai đoạn 3 — Chuyển đổi

| Mã | Sự kiện | Cách ghi |
|----|---------|----------|
| `warm_new` | Lần đầu WARM trong ngày | `leadEvents` type `TAG_CHANGED` |
| `hot_new` | Lần đầu HOT trong ngày | tương tự |
| `new_to_interested` | NEW → INTERESTED | `auditLogs` + aggregate |
| `to_deposit` | → DEPOSIT_PAID | audit + finance |

### 3.4 Theo tháng — Bảng điểm (Giai đoạn 4)

| Hạng mục | Trọng số gợi ý |
|----------|----------------|
| Gọi hợp lệ | 20% |
| WARM/HOT mới | 15% |
| Số cọc (NB) | 25% |
| Doanh thu duyệt | 30% |
| QA / khiếu nại | 10% |

Thang thưởng: Vàng (top 10%) / Bạc (25%) / Đồng (50%) trong team.

---

## 4. Kiến trúc dữ liệu 4 lớp

```
[L1 Sự kiện]  omicallCalls, interactions, auditLogs, leadEvents (mới)
      ↓ Cloud Functions (increment, dedup)
[L2 Ngày]     kpiDaily/{date}/counselors/{uid}
      ↓ Scheduled roll-up
[L3 Tháng]    kpiMonthly/{YYYY-MM}/counselors/{uid}
      ↓
[L4 UI]       /command, /kpi, /my-day, /scorecard
```

### Collection mới (tương lai)

**`leadEvents/{id}`** (immutable)

```ts
{
  leadId, counselorUid, type: 'CALL_VALID' | 'TAG_CHANGED' | 'STATUS_CHANGED' | 'PAYMENT_APPROVED',
  at: Timestamp,
  payload: { from?, to?, transactionId?, amountVnd? }
}
```

**`kpiMonthly/{YYYY-MM}/counselors/{uid}`**

```ts
{
  validCalls, depositCount, approvedRevenueVnd, warmNew, hotNew,
  rankInTeam, bonusTier: 'gold' | 'silver' | 'bronze' | 'none'
}
```

**`kpiTargets/{YYYY-MM}`** — chỉ tiêu theo team/TVV

---

## 5. Bố trí giao diện

### 5.1 `/command` — Trung tâm điều hành

**Đối tượng:** Trưởng nhóm, Admin  
**Quyền:** `dashboard:team_lead` hoặc `analytics:advanced` hoặc `leads:read:global`

```
┌─ HÔM NAY · [chọn ngày] · Phạm vi ─────────────────────────┐
│ [Tổng gọi] [Bắt máy %] [Phút nói] [Cọc] [Doanh thu]        │
├─ Bảng TVV ─────────────────────────────────────────────────┤
│ TVV │ Gọi │ Bắt máy │ % │ Phút │ CRM │ Cọc │ HP │ Tiền │ ⚠ │
└────────────────────────────────────────────────────────────┘
```

### 5.2 `/my-day` — Ngày của tôi

**Đối tượng:** TVV (`dashboard:counselor`)  
4 ô KPI hôm nay + nhắc “gọi từ hồ sơ để tính KPI”.

### 5.3 `/kpi` — KPI tư vấn (đã có, bổ sung)

Thêm khoảng **Hôm nay** bên cạnh 7 ngày / 30 ngày.

### 5.4 Hồ sơ lead — Dòng thời gian

Tab **Lịch sử** (bên phải): gộp 📞 OMICall + 📝 Tương tác + 📋 Audit — sắp theo thời gian.

---

## 6. Báo cáo mẫu

### 6.1 Buổi sáng (7h) — Kế hoạch

- Lead HOT chưa gọi > 24h (query `leads` + `omicallCalls` — Giai đoạn 3)
- Chỉ tiêu gọi còn thiếu theo `kpiTargets`

### 6.2 Buổi chiều (17h) — Thực tế

| TVV | Gọi | Bắt máy | % | Cọc | NE | Tiền duyệt |
|-----|-----|---------|---|-----|-----|------------|
| … | từ `kpiDaily` | | | | | |

### 6.3 Cuối tháng

- Xếp hạng team + biểu đồ 4 tuần (`kpiMonthly`)
- Export Excel / PDF (n8n tuỳ chọn)

---

## 7. Lộ trình triển khai

| GĐ | Thời gian | Deliverable | Trạng thái |
|----|-----------|-------------|------------|
| **1** | 2–3 tuần | `/command`, `/my-day`, timeline lead, tab Hôm nay `/kpi` | **Hoàn thành** |
| **2** | 2 tuần | `validCall`, dedup 4h, `kpiDaily.validCalls` | **Hoàn thành** (Functions) |
| **3** | 3 tuần | `leadEvents`, WARM+/HOT+, chuyển CRM | **Hoàn thành** (client + Functions) |
| **4** | 2 tuần | `kpiMonthly`, `/scorecard`, hạng thưởng | **Hoàn thành** |

---

## 8. Chi phí Firebase (ước lượng)

50 TVV × 300 cuộc gọi/ngày:

| Hạng mục | ~Doc/tháng | Ghi chú |
|----------|------------|---------|
| `omicallCalls` | 9.000 | Chấp nhận được |
| `kpiDaily` | 1.500 | Rất rẻ khi đọc báo cáo |
| Đọc báo cáo | 50–200 reads/ngày | Đọc `kpiDaily`, không quét `leads` |

**Retention:** `omicallCalls` > 12 tháng → archive GCS, xóa Firestore.

---

## 9. Văn hóa quản lý (chuẩn mực)

1. Công bố công thức KPI trước đầu tháng — không đổi giữa chừng.  
2. Tiền chỉ tính sau **kế toán duyệt**.  
3. Không phạt TVV gọi ít nếu **tỷ lệ cọc cao**.  
4. Trưởng nhóm chịu KPI team, không chỉ cá nhân.  
5. QA ngẫu nhiên 5 cuộc gọi/TVV/tuần.  
6. Training 2 tuần: “Chỉ gọi từ hồ sơ” → sau đó mới khóa KPI.

---

## 10. File code liên quan (Giai đoạn 1)

| File | Mô tả |
|------|--------|
| `src/views/CommandCenterView.tsx` | Trung tâm điều hành |
| `src/views/MyDayView.tsx` | Ngày của TVV |
| `src/components/LeadActivityTimeline.tsx` | Timeline hồ sơ |
| `src/hooks/useLeadOmicallCalls.ts` | Đọc `omicallCalls` theo lead |
| `src/hooks/useCounselorKpi.ts` | Thêm preset `today` |
| `src/utils/kpiDisplay.ts` | Format số, %, VNĐ |

---

*Tài liệu này là căn cứ triển khai và đào tạo nội bộ. Cập nhật khi hoàn thành Giai đoạn 2–4.*
