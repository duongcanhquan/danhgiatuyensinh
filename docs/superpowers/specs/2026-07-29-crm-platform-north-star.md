# Kim chỉ nam — Nền tảng CRM Tuyển sinh Đa trường

| Thuộc tính | Giá trị |
|------------|---------|
| **Mã tài liệu** | `NS-CRM-2026-07` |
| **Ngày** | 2026-07-29 |
| **Trạng thái** | Chuẩn sản phẩm — kim chỉ nam phát triển |
| **Phụ thuộc** | `2026-07-29-multi-tenant-org-design.md` (kiến trúc tách trường) |
| **Đối tượng đọc** | Product, kỹ thuật, vận hành, đối tác triển khai |

**Mục đích:** Mô tả **chuẩn xác** hệ thống phải chạy thế nào — nghiệp vụ, quyền, chức năng, UX, công nghệ, logic vận hành — để mọi quyết định thiết kế/code sau này **khớp một nguồn**. Tài liệu này **không** thay code; khi code lệch spec, sửa code hoặc cập nhật spec có ghi chú phiên bản.

**Nguyên tắc diễn đạt:** thuật ngữ UI theo tiếng Việt đời thường (hồ sơ, bảng điểm, cổng đăng ký…); tên kỹ thuật (`orgId`, collection) chỉ trong phần kiến trúc/data.

---

## 0. Tóm tắt điều hành (1 trang)

Hệ thống là **nền tảng CRM tuyển sinh theo trường**:

- Mỗi **trường** = một không gian độc lập (data, nhân sự, cấu hình, cổng đăng ký, tổng đài, thu phí).
- **Một Superadmin** điều hành toàn nền tảng: tạo/tạm ngưng trường, chọn trường đang làm việc, hỗ trợ mọi trường.
- **Admin trường** tự setup và CRUD **toàn bộ** nội dung trường mình — không thấy trường khác.
- TVV / CTV / Trưởng nhóm / Kế toán làm việc trong đúng một trường theo vai trò.

**Vòng đời giá trị:** Lead vào → ưu tiên (HOT/WARM) → gọi & tư vấn (OMICall + KPI) → cọc/thu → duyệt kế toán → giấy tờ → nhập học; song song là đo lường đội sale và cải thiện kịch bản/AI.

**UX cốt lõi:** ít màn hình, nhiều thao tác đúng chỗ; ưu tiên **Hồ sơ + Ngày của tôi + Tổng kết**; Cài đặt là xưởng cấu hình, không phải nơi làm việc hàng ngày.

**Công nghệ:** React SPA + Firebase Auth/Firestore/Functions + OMICall + n8n + lưu chứng từ (R2/Storage) + LLM; multi-tenant bằng `orgId` + Rules + claim.

---

## 1. Tầm nhìn & nguyên tắc sản phẩm

### 1.1. Tầm nhìn

> Phần mềm vận hành tuyển sinh cho nhiều trường Việt Nam: sâu nghiệp vụ (gọi–KPI–thu–giấy tờ), tách biệt từng trường, điều hành tập trung bởi Superadmin, cấu hình linh hoạt bởi Admin trường — **không** trở thành HubSpot generic.

### 1.2. Nguyên tắc bắt buộc

| # | Nguyên tắc | Ý nghĩa thực tế |
|---|------------|-----------------|
| P1 | **Một nguồn sự thật** | Firestore (theo `orgId`) là nơi ghi nghiệp vụ; Sheet/RTDB legacy chỉ tham chiếu migrate. |
| P2 | **Tách trường cứng** | Không đọc chéo giữa trường; chỉ Superadmin vượt ranh giới có kiểm soát. |
| P3 | **Ít màn — nhiều việc** | Không nhân bản dashboard; gom việc vào workspace có ngữ cảnh. |
| P4 | **Cấu hình > hard-code** | KPI, scoring, danh mục, webhook, portal: Admin trường đổi được; lưu = áp dụng. |
| P5 | **Đo bằng hành vi thật** | KPI gắn cuộc gọi/HL/lead chạm — không chỉ số “ảo” nhập tay (điểm tay chỉ là bổ sung có kiểm soát). |
| P6 | **AI hỗ trợ, người quyết** | AI gợi ý / tóm tắt / ưu tiên; không tự đổi trạng thái tài chính hay duyệt cọc. |
| P7 | **Chữ UI đời thường** | TVV không thấy tên collection/permission kỹ thuật trên luồng chính. |
| P8 | **An toàn mặc định** | Rules + claim; thao tác nguy hiểm có xác nhận; audit với Superadmin cross-org. |

### 1.3. Không làm (để kim chỉ nam không phình)

- Chia **campus** trong một trường (đã loại trừ).
- Marketing automation / email blast kiểu HubSpot (giai đoạn sau, module riêng).
- Mỗi trường một Firebase project.
- Self-serve “đăng ký trường” công khai trên internet (Superadmin tạo trường).
- Mobile native bắt buộc phase đầu (ưu tiên PWA / mobile-web xuất sắc).

---

## 2. Mô hình đa trường & điều hành

Chi tiết kỹ thuật path/Rules: xem `2026-07-29-multi-tenant-org-design.md`. Phần này cố định **hành vi sản phẩm**.

### 2.1. Đơn vị tenant

| Thuật ngữ | Định nghĩa |
|-----------|------------|
| **Trường / Tổ chức (`org`)** | Đơn vị độc lập thuê/dùng CRM. Mọi hồ sơ, user school, config thuộc đúng một `orgId`. |
| **Nền tảng** | Lớp Superadmin: danh sách trường, tạo trường, health, (sau) billing. |

### 2.2. Ma trận quyền điều hành

| Việc | Superadmin | Admin trường | TL / TVV / CTV / KT |
|------|:----------:|:------------:|:-------------------:|
| Tạo / tạm ngưng trường | ✓ | — | — |
| Chọn trường đang làm việc | ✓ | — (cố định org) | — |
| Setup CRM trường (danh mục, scoring, KPI, OMICall, portal, n8n, AI…) | ✓ (khi đang ở org) | ✓ | Theo quyền hẹp |
| CRUD nhân sự trong trường | ✓ | ✓ | TL: nhóm mình (hạn chế) |
| CRUD hồ sơ theo RBAC | ✓ trong org đang chọn | ✓ phạm vi trường | Theo vai trò |
| Duyệt thu / Full NE | ✓ nếu vào ngữ cảnh | Có thể cấp quyền / qua KT | Kế toán |
| Xem data trường khác | ✓ | — | — |

### 2.3. Ngữ cảnh Superadmin

1. Đăng nhập → **Danh sách trường** (+ tạo trường).
2. Chọn trường → vào CRM với badge **đang làm việc tại [Tên trường]**.
3. Mọi thao tác ghi gắn `orgId` của ngữ cảnh; đổi trường = đổi ngữ cảnh (không merge lead đa trường trên một lưới ở phase đầu).

### 2.4. Onboard trường mới (chuẩn)

Superadmin nhập: tên, slug, email Admin trường → hệ thống:

1. Tạo `organizations/{orgId}` (`active`).
2. Copy **template cấu hình** → `orgSettings/{orgId}/…`.
3. Tạo Auth + `users` role `admin`, `orgId` gắn claim.
4. Admin trường đăng nhập → checklist setup (mục 8.2).

---

## 3. Vai trò người dùng (trong một trường)

Giữ bộ role hiện có; bổ nghĩa multi-tenant.

| Role | Nhãn UI | Việc chính | Không làm |
|------|---------|------------|-----------|
| `super_admin` | Siêu quản trị | Điều hành nền tảng + mọi trường | — |
| `admin` | Quản lý | Setup & vận hành toàn trường | Thấy trường khác; tạo org |
| `team_lead` | Trưởng nhóm Sale | Hồ sơ nhóm, KPI nhóm, profile nhóm, hỗ trợ TVV | Master toàn trường, LLM engine toàn cục (trừ được cấp) |
| `counselor` | Nhân viên Sale | Hồ sơ được giao, gọi, ghi chú, Ngày của tôi | Config hệ thống |
| `ctv` | Cộng tác viên | Giống TVV hẹp hơn (không AI / không reassign peer — theo ma trận hiện tại) | — |
| `accountant` | Kế toán | Cổng `/ke-toan`: duyệt đợt thu, Full NE, báo cáo thu | CRM sale đầy đủ |

**Phạm vi dữ liệu hồ sơ (trong org):**

- TVV/CTV: `assignedTo === uid`
- TL: TVV trong `managedCounselorIds`
- Admin / Superadmin (trong org): toàn trường
- Kế toán: hàng đợi tài chính theo rule cổng KT (không lẫn sale workspace trừ khi được cấp)

Quyền chi tiết: ma trận `PERMISSIONS` trong code — kim chỉ nam yêu cầu **mọi quyền mới** phải: (1) thêm vào ma trận, (2) gắn role mặc định, (3) Rules tương ứng, (4) nhãn UI tiếng Việt.

---

## 4. Mô hình miền dữ liệu (canonical)

Mọi entity nghiệp vụ **bắt buộc** có `orgId` (trừ `organizations` và user Superadmin).

### 4.1. Thực thể cốt lõi

| Entity | Ý nghĩa | Ghi chú |
|--------|---------|---------|
| **Organization** | Trường | `slug` unique; `status` active\|suspended |
| **User** | Tài khoản | School: 1 `orgId`; Superadmin: `orgId` null + claim platform |
| **Lead (Hồ sơ)** | Thí sinh / phụ huynh quan tâm | Khóa nghiệp vụ trung tâm |
| **Interaction** | Gọi / ghi chú / kênh | Timeline trên hồ sơ |
| **ScoringProfile** | Bộ chấm → HOT/WARM/COLD | Theo org; TL có thể có bộ nhóm |
| **InfoScore config** | % đầy hồ sơ | Tách khỏi HOT/WARM |
| **KPI config V2** | Chỉ tiêu & trọng số theo role × OFF/MKT | Lưu = áp dụng điểm tháng |
| **kpiDaily / Monthly** | Kết quả đo | Prefix/field theo org |
| **OmicallCall** | Cuộc gọi đồng bộ | Gắn lead + user + org |
| **Finance (trên Lead)** | 5 đợt thu + duyệt + Full NE | Không tự ý AI duyệt |
| **Scholarship** | Danh mục HB | Theo org |
| **Playbook / Script** | Kịch bản tư vấn | Theo org |
| **KnowledgeDocument** | Tri thức cho AI | Theo org |
| **PublicRegistrationConfig** | Cổng `/dang-ky/:slug` | Theo org |
| **OrgSettings / n8n** | Webhook giấy tờ, CTSV, BC | Theo org |
| **AuditLog / LeadEvent** | Truy vết | Có `orgId`; Superadmin action đánh dấu |

### 4.2. Hồ sơ (Lead) — nhóm thông tin chuẩn

1. **Định danh:** mã hệ thống, mã KH, họ tên, SĐT SV/PH, CCCD, email.  
2. **Học tập:** hệ đào tạo, ngành, học lực, trường THPT, tỉnh/vùng, nguyện vọng.  
3. **CRM:** nguồn (OFF/MKT…), trạng thái tư vấn, nhãn HOT/WARM/COLD, TVV phụ trách, follow-up.  
4. **Tài chính:** 5 đợt, chứng từ, trạng thái duyệt, enrollment / Full NE.  
5. **Vận hành:** timestamp, uniqueHash (trong org), kênh đăng ký, cờ AI.

**Uniqueness:** trùng SĐT/CCCD **chỉ trong cùng `orgId`**.

### 4.3. Trạng thái tư vấn (pipeline sale)

Giữ bộ trạng thái counselor hiện có trên app (Kanban hồ sơ). Đổi tên/thêm stage: **cấu hình theo org** (phase sau); phase đầu đồng bộ một bộ mặc định template khi tạo trường.

### 4.4. Trạng thái tuyển sinh / thu (enrollment)

Đồng bộ nghiệp vụ đã có: MỚI → ĐANG HOÀN THIỆN → CỌC THÀNH CÔNG → … → ĐÃ HOÀN THIỆN / KIỂM TRA LẠI; Full NE riêng. Logic ngưỡng cọc theo hệ đào tạo (template mặc định; Admin trường chỉnh được khi product hóa).

---

## 5. Kiến trúc chạy hệ thống (runtime)

```
[Trình duyệt SPA]
   │  Auth email/password
   ▼
Firebase Auth ── claims: role, orgId?, platform?
   │
   ├─► Firestore DB (warmlist): data + orgSettings theo orgId
   ├─► Cloud Functions: OMICall, KPI, đăng ký công khai, staff admin, load TVV
   ├─► Storage / R2: chứng từ receipts/{orgId}/…
   ├─► OMICall: Web SDK + webhook/sync
   ├─► n8n: giấy mời, Chat CTSV, BC ngày/tháng, email đăng ký
   └─► LLM proxy: phân tích hồ sơ / cuộc gọi / miner (org AI config)
```

**Superadmin UI:** thêm lớp chọn org trước khi vào các provider dữ liệu org-scoped.

**Cổng tách:**

| Cổng | Ai | URL khái niệm |
|------|----|----------------|
| CRM | Sale / QL | `/` (sau login; Superadmin qua chọn trường) |
| Kế toán | KT | `/ke-toan` |
| Đăng ký SV | Công khai | `/dang-ky/:orgSlug` |

---

## 6. UX kim chỉ nam — tối giản màn hình, đa dạng thao tác

### 6.1. Bản đồ màn hình (cố ý ít)

| Màn | Việc | Ai |
|-----|------|----|
| **Chọn trường** | Chỉ Superadmin | Platform |
| **Tổng kết** | Hub số liệu: tổng quan, KPI, bảng điểm, lịch gọi, vận hành ngày — **tab trong một màn** | Theo quyền |
| **Hồ sơ** | Workspace chính: list + chi tiết + gọi + tài chính + giấy tờ + AI | Sale / QL |
| **Ngày của tôi** | Việc & KPI cá nhân hôm nay | TVV/CTV/(TL) |
| **Phân tích** | Funnel / chuyên sâu — chỉ khi cần | QL / TL |
| **Cài đặt** | 4 nhóm: Dữ liệu / Chấm điểm / KPI&Nhân sự / Tích hợp | Admin / TL hẹp |
| **Cổng KT** | Duyệt thu, nhân sự KT, báo cáo | KT |
| **Hướng dẫn** | Manual trong app | Tất cả |

**Cấm:** tạo thêm top-level menu cho mỗi báo cáo nhỏ — thêm **tab / panel / command** trong màn đã có.

### 6.2. Đa dạng thao tác (không nhân màn)

Trên **Hồ sơ**, mọi thao tác nóng đặt đúng ngữ cảnh:

- Hàng loạt: đổi trạng thái, phân công, gắn nhãn, export, chạy AI (nếu quyền).
- Một hồ sơ: gọi, đánh giá cuộc gọi, ghi chú nhanh (chips), sửa field, upload bill, gửi giấy mời, mở timeline.
- Deep-link bộ lọc (URL share).
- Phím tắt / command palette (mục tiêu hiện đại — phase UX): “Tìm hồ sơ”, “Gọi”, “Tạo hồ sơ”, “Đổi trường” (Superadmin).

### 6.3. Mobile-web

Bottom nav tối giản: Tổng kết / Hồ sơ / Ngày của tôi / (Cài đặt nếu quyền). Chi tiết hồ sơ full-screen; gọi ưu tiên Web SDK hoặc `tel:`.

### 6.4. Trống & lỗi

Màn trống có **một** CTA rõ (vd. “Nhập Excel” / “Bật cổng đăng ký”). Lỗi tích hợp (OMICall, n8n) hiện banner có hướng xử lý — không silent fail KPI.

---

## 7. Chức năng CRM — catalog chuẩn

Mỗi mục: **Mục đích · Ai · Hành vi · Dữ liệu · Ghi chú hiện đại**.

### 7.1. Thu thập & định danh lead

| Function | Mô tả |
|----------|--------|
| **F-IN-01 Nhập Excel/CSV** | Map cột → Lead; gán TVV; áp profile mặc định; dedupe theo org. |
| **F-IN-02 Tạo hồ sơ tay** | Form tối giản + validate SĐT/CCCD; mã hệ thống tự cấp theo org. |
| **F-IN-03 Cổng đăng ký công khai** | `/dang-ky/:orgSlug`; bật/tắt; nguồn mặc định; auto-assign theo load; webhook email. |
| **F-IN-04 API/Webhook inbound** | Hub kết nối: API key theo trường + hợp đồng JSON; CF public Phase 2. |

### 7.2. Workspace hồ sơ

| Function | Mô tả |
|----------|--------|
| **F-CRM-01 Danh sách thông minh** | Lọc/facet: nhãn, status, nguồn, TVV, tỉnh, follow-up quá hạn; tìm full-text mã/tên/SĐT. |
| **F-CRM-02 Chi tiết 360** | Tabs: Thông tin · Timeline · Gọi · Tài chính · Giấy tờ · AI — không tách route thừa. |
| **F-CRM-03 Phân công** | Đơn / hàng loạt; TL trong nhóm; Admin toàn trường; tôn trọng capacity (load). |
| **F-CRM-04 Pipeline Kanban/list** | Đổi status kéo thả hoặc bulk; audit. |
| **F-CRM-05 Follow-up** | Ngày nhắc; “Ngày của tôi” kéo việc đến hạn; (roadmap) nhắc push/Zalo. |
| **F-CRM-06 Timeline đa kênh** | CALL mặc định mạnh; chỗ cho SMS/EMAIL/ZALO khi có connector. |
| **F-CRM-07 Gộp trùng** (roadmap) | Gợi ý trùng trong org; merge có xác nhận. |

### 7.3. Ưu tiên & chấm điểm

| Function | Mô tả |
|----------|--------|
| **F-SC-01 Điểm thông tin %** | Rule field bắt buộc/khuyến nghị; hiển thị % đầy. |
| **F-SC-02 Profile HOT/WARM/COLD** | Kéo thả khối quy tắc; ngưỡng nhãn; bộ mặc định import. |
| **F-SC-03 Áp profile trên list** | Chọn bộ → tính lại điểm/nhãn (batch có tiến độ). |
| **F-SC-04 Phân loại tỷ trọng** | Hồ sơ vs tín hiệu gọi → nhãn cuối. |
| **F-SC-05 Tín hiệu TVV / chips gọi** | Checklist hành vi khi gọi; cộng điểm/analytics. |

### 7.4. Gọi điện & OMICall

| Function | Mô tả |
|----------|--------|
| **F-CALL-01 Click-to-call / Web SDK** | Gọi từ hồ sơ; map SIP per user. |
| **F-CALL-02 Đồng bộ lịch sử** | Webhook + sync; gắn lead theo SĐT **trong org**. |
| **F-CALL-03 Đánh giá cuộc gọi** | Dimension cấu hình; lưu trên interaction. |
| **F-CALL-04 Lịch sử gọi (Tổng kết)** | Tra cứu theo thời gian/TVV/HL. |
| **F-CALL-05 AI tóm tắt gọi** | Sau cuộc gọi: tóm tắt + gợi ý bước tiếp (không tự đổi finance). |

### 7.5. KPI & vận hành sale

| Function | Mô tả |
|----------|--------|
| **F-KPI-01 Config V2 theo role** | CTV / TVV / TL: chỉ tiêu ngày OFF/MKT, HL/tháng, trọng số điểm tháng — **riêng từng role**. |
| **F-KPI-02 Đếm metric server** | Gọi HL hợp lệ, lead chạm, LPXT… theo goLiveDate (không backfill sai). |
| **F-KPI-03 Ngày của tôi** | Tiến độ cá nhân vs chỉ tiêu; việc ưu tiên. |
| **F-KPI-04 Vận hành ngày** | QL/TL: bảng TVV trong ngày, cảnh báo dưới chuẩn. |
| **F-KPI-05 Bảng điểm tháng** | Hạng theo trọng số; điểm tay có kiểm soát. |
| **F-KPI-06 Báo cáo đánh giá kỳ** | Tổng hợp kỳ cho QL. |

### 7.6. Tài chính tuyển sinh & kế toán

| Function | Mô tả |
|----------|--------|
| **F-FIN-01 5 đợt thu trên hồ sơ** | Số tiền, bill, ngày; TVV cập nhật. |
| **F-FIN-02 Upload chứng từ** | R2 ưu tiên → fallback; path có `orgId`. |
| **F-FIN-03 Duyệt kế toán** | Đồng ý/Từ chối từng đợt; cập nhật enrollment. |
| **F-FIN-04 Full NE** | Yêu cầu / xác nhận theo quy trình KT. |
| **F-FIN-05 Báo cáo ngày/tháng** | Tổng hợp → n8n; log `financeReports`. |
| **F-FIN-06 Webhook CTSV** | Thông báo Chat khi đổi tiền/bill/duyệt — URL theo org. |

### 7.7. Giấy tờ & hành chính

| Function | Mô tả |
|----------|--------|
| **F-DOC-01 Giấy mời / trúng tuyển / lệ phí** | Chọn loại → n8n tạo Docs; lưu link trên hồ sơ. |
| **F-DOC-02 Folder Drive** | Đảm bảo folder theo hồ sơ (xử lý thiếu folder = việc bắt buộc vận hành). |

### 7.8. Tư vấn có hỗ trợ (Playbook / Knowledge / AI)

| Function | Mô tả |
|----------|--------|
| **F-AID-01 Playbook** | Mẫu theo điều kiện hồ sơ; gợi ý khi mở chi tiết. |
| **F-AID-02 Script Hub** | Đoạn GREETING→CLOSING; tìm nhanh khi gọi. |
| **F-AID-03 Tri thức** | KB theo org cho LLM. |
| **F-AID-04 AI hồ sơ** | Insight / shortlist WARM; task theo dõi. |
| **F-AID-05 AI Lead Miner** | Batch ưu tiên (quyền `allowLlmAndAiTasks`). |
| **F-AID-06 Gatekeeper** | Chặn/gợi ý khi thiếu dữ liệu trước khi gọi AI tốn phí. |

### 7.9. Phân tích

| Function | Mô tả |
|----------|--------|
| **F-AN-01 Tổng quan** | Pipeline, nhãn, khối lượng. |
| **F-AN-02 Funnel nâng cao** | Nguồn → HOT → gọi → cọc. |
| **F-AN-03 Export CSV** | Hồ sơ đã đánh giá / báo cáo gọi. |

---

## 8. Chức năng quản trị trường & nền tảng

### 8.1. Superadmin — điều hành thông minh

| Function | Mô tả |
|----------|--------|
| **F-PLT-01 Danh sách trường** | Tìm, lọc active/suspended; KPI health đơn giản (số lead 7 ngày, lỗi sync…). |
| **F-PLT-02 Tạo trường** | Wizard ngắn: tên, slug, admin email → provision. |
| **F-PLT-03 Suspend / mở lại** | Ngắt đăng nhập school user (claim/Rules) giữ data. |
| **F-PLT-04 Đổi ngữ cảnh** | Switch org mọi lúc; badge rõ. |
| **F-PLT-05 Audit platform** | Log tạo org, suspend, đăng nhập hộ hỗ trợ. |
| **F-PLT-06 Template cấu hình** | Chỉnh “bản mẫu mặc định” khi tạo trường mới (không đụng data trường cũ). |

### 8.2. Admin trường — setup toàn diện (checklist)

Thứ tự gợi ý lần đầu:

1. Nhân sự & quyền  
2. Danh mục hồ sơ / nguồn / ngành  
3. Điểm thông tin + Profile chấm điểm + phân loại nhãn  
4. KPI theo role × OFF/MKT  
5. OMICall (SIP map)  
6. Cổng đăng ký + slug  
7. n8n webhooks + thử gửi  
8. Playbook / script / tri thức / AI key  
9. Kế toán & mẫu báo cáo  

| Function | Mô tả |
|----------|--------|
| **F-ADM-01 Nhân sự** | CRUD user trong org; SIP; `managedCounselorIds`; active/inactive. |
| **F-ADM-02 Phân quyền** | Ma trận + extra/denied per user. |
| **F-ADM-03 Danh mục** | Master data, lead sources, scholarships. |
| **F-ADM-04 Cài đặt chấm điểm** | Toàn bộ nhóm Rules trong Settings. |
| **F-ADM-05 KPI** | Panel đủ field theo role — không gộp một hàng. |
| **F-ADM-06 Tích hợp** | OMICall, portal, n8n, AI. |
| **F-ADM-07 Intake** | Excel + hướng dẫn map. |
| **F-ADM-08 Seed mẫu** | Nạp playbook/script/KB mẫu **trong org** (không đè org khác). |

### 8.3. Trưởng nhóm — quản lý hẹp, tiện

- Hồ sơ & KPI nhóm; tạo profile nhóm; hỗ trợ nghe/đánh giá theo quyền.  
- Không cần vào đủ Cài đặt admin.

---

## 9. Logic vận hành hiện đại (chuẩn hành vi hệ thống)

### 9.1. Vòng TVV trong ngày

1. Mở **Ngày của tôi** — thấy chỉ tiêu OFF/MKT, HL, việc quá hạn.  
2. Vào **Hồ sơ** đã lọc HOT/WARM + đến hạn.  
3. Gọi → đánh giá/chips → ghi chú → hẹn follow-up.  
4. Có tiền/bill → tab Tài chính (không nhảy app khác).  
5. Cuối ngày: tiến độ KPI cập nhật từ server (không tự khai báo gọi ảo).

### 9.2. Vòng Trưởng nhóm / Quản lý

1. **Vận hành ngày** — ai dưới chuẩn HL / chưa đụng lead.  
2. Can thiệp phân công / coaching.  
3. **Bảng điểm / báo cáo kỳ** — quyết định thưởng-phạt theo trọng số đã công bố.

### 9.3. Vòng kế toán

1. Hàng đợi hồ sơ có phát sinh thu.  
2. Đối chiếu bill → Duyệt/Từ chối → enrollment đổi.  
3. Full NE khi đủ điều kiện.  
4. Bấm gửi BC ngày/tháng (hoặc lịch n8n).

### 9.4. Vòng lead công khai

Submit form → dedupe org → cấp mã → (optional) auto-assign lowest load trong org → lead `MỚI` → TVV nhận trên list / Ngày của tôi.

### 9.5. Sự kiện & tự động hóa

| Sự kiện | Hệ quả chuẩn |
|---------|----------------|
| Cuộc gọi HL hợp lệ gắn lead | Cộng KPI; có thể mở AI tóm tắt |
| Đổi tiền/bill | Reset duyệt đợt liên quan (nghiệp vụ cũ); webhook CTSV |
| KT duyệt | Cập nhật enrollment; thông báo |
| Đổi config KPI | Điểm tháng tính lại theo config mới; metric server theo goLiveDate |
| Suspend org | School user không vào được; Superadmin vẫn xem được để hỗ trợ |

**Automation nội bộ (hướng hiện đại, ưu tiên sau ổn định tenant):** rule “nếu nhãn=HOT và chưa gọi 24h → nổi trong Ngày của tôi”; chưa thay toàn bộ n8n giấy tờ.

**Hub kết nối (Phase 1):** catalog đầu nối Zalo/WA/email/SMS/Slack/Teams/API inbound/Zapier — cấu hình theo trường; fan-out sự kiện chuẩn. Chi tiết: `docs/INTEGRATION_HUB.md`.

---

## 10. Công nghệ & chất lượng

### 10.1. Stack chuẩn

| Lớp | Chuẩn |
|-----|--------|
| Frontend | React + TypeScript + Vite + Tailwind; React Router |
| Auth | Firebase Auth; custom claims `role`, `orgId`, `platform` |
| Data | Firestore named DB; Timestamps server |
| Backend | Cloud Functions v2 (asia-southeast1 callables; triggers theo thiết kế hiện có) |
| Call | OMICall |
| File | R2 Worker ưu tiên; Storage/Drive fallback có tài liệu |
| Automation ngoài | n8n per-org URLs + **Hub kết nối** (generic webhooks / Slack / API key) — xem `2026-07-29-crm-integration-hub-design.md` |
| AI | OpenAI/DeepSeek/Gemini qua proxy; khóa/config theo org + quyền user |
| Test | Vitest cho logic thuần (KPI map, hash, scoring…) |

### 10.2. Quy tắc kỹ thuật khi phát triển

1. Mọi query list school-data: có `orgId` (hoặc Superadmin `activeOrgId`).  
2. Mọi function mới: ghi rõ org resolution (từ auth / slug / SIP user).  
3. Không tạo singleton global mới cho nghiệp vụ trường — đặt vào `orgSettings/{orgId}`.  
4. Index: `orgId` equality đứng đầu composite cần thiết.  
5. UI copy: tuân thủ nguyên tắc chữ đời thường.  
6. KPI: không hard-code một bộ số cho mọi role.  

### 10.3. Quan sát & độ tin cậy

- Log Functions có `orgId`.  
- Banner lỗi OMICall/n8n trên Cài đặt.  
- Backup/export theo org (phase ops).

---

## 11. Bảo mật & tuân thủ tối thiểu

- Mật khẩu không lưu plaintext (khác hệ RTDB cũ).  
- Rules enforce org; Superadmin platform claim hẹp số lượng.  
- Audit: tạo/xóa user, đổi quyền, duyệt tiền, thao tác Superadmin cross-org.  
- Portal công khai: rate-limit / kiểm soát bật-tắt; không lộ data nội bộ.  
- Secret OMICall/n8n/AI: Functions secrets hoặc orgSettings được Rules chỉ admin+.

---

## 12. Lộ trình triển khai gắn kim chỉ nam

| Phase | Kết quả kiểm được |
|-------|-------------------|
| **P0** | `orgId=vietmy` backfill; orgSettings; claim; Rules; Superadmin còn 1 trường |
| **P1** | Mọi query/Functions org-aware; portal `/:slug`; UI badge; gỡ singleton global |
| **P2** | Superadmin tạo trường 2 (staging); Admin trường setup đủ checklist 8.2 |
| **P3** | Command palette, gộp trùng, inbound API, automation nội bộ nhẹ, health đa trường |
| **P4+** | Connector Zalo/FB/Email, PWA đẩy mạnh, (tuỳ) billing |

Code hiện tại ≈ **trước P0 hoàn chỉnh** (single-tenant giàu chức năng CRM). Ưu tiên P0–P1 trước khi bán/mở trường thật thứ hai.

---

## 13. Thuật ngữ

| Thuật ngữ | Nghĩa |
|-----------|--------|
| Hồ sơ | Lead thí sinh trong CRM |
| Nhãn HOT/WARM/COLD | Ưu tiên xử lý từ bộ chấm điểm |
| Điểm thông tin % | Độ đầy field hồ sơ |
| HL | Hiện liên — cuộc gọi đạt ngưỡng giây KPI |
| OFF / MKT | Bucket nguồn lead cho chỉ tiêu ngày |
| Org / Trường | Tenant độc lập |
| OrgSettings | Cấu hình theo trường |
| ActiveOrgId | Trường Superadmin đang làm việc |
| Full NE | Quy trình hoàn thiện nhập học phía kế toán |
| Cổng đăng ký | Form public theo slug trường |

---

## 14. Nhật ký quyết định

| Ngày | Quyết định |
|------|------------|
| 2026-07-29 | Multi-tenant theo trường; không campus |
| 2026-07-29 | Kiến trúc: collection phẳng + `orgId` + `orgSettings` |
| 2026-07-29 | Superadmin quản lý chung toàn bộ; Admin trường CRUD/setup full trong org |
| 2026-07-29 | UX: tối giản top-level; đa thao tác trong Hồ sơ / Tổng kết / Ngày của tôi |
| 2026-07-29 | Tài liệu này = kim chỉ nam sản phẩm + catalog function CRM/QL |

---

## 15. Cách dùng tài liệu về sau

1. **Epic/feature mới** → map vào mã `F-xxx`; nếu không có mã → bổ sung mục catalog rồi mới code.  
2. **PR lớn** → ghi “khớp NS §… / lệch §… (lý do)”.  
3. **Đổi quyết định** → sửa mục 14 + đoạn liên quan; tăng dòng **Cập nhật** ở đầu file.  
4. Chi tiết path Rules/migrate kỹ thuật → luôn đồng bộ với `2026-07-29-multi-tenant-org-design.md`.

---

*Hết kim chỉ nam NS-CRM-2026-07. Mọi triển khai đa trường và mở rộng CRM phải bám tài liệu này trừ khi có quyết định mới được ghi vào §14.*
