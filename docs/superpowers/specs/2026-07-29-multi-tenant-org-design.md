# Thiết kế multi-tenant theo trường (org)

**Ngày:** 2026-07-29  
**Cập nhật:** 2026-07-29 — làm rõ mô hình **superadmin toàn hệ** + **admin trường toàn quyền trong org**.  
**Phạm vi:** Một sản phẩm CRM tuyển sinh — **mỗi trường là đơn vị độc lập**. Không chia campus bên trong trường.  
**Trạng thái:** Spec chờ duyệt trước khi viết implementation plan.

---

## 1. Mục tiêu & ràng buộc

### Mục tiêu

- Nhiều trường dùng cùng một codebase / cùng hạ tầng Firebase.
- **Mỗi trường độc lập:** data, nhân sự, cấu hình, cổng đăng ký, KPI, tổng đài, n8n của trường A **tách** khỏi trường B.
- **Một Superadmin nền tảng** quản lý chung toàn bộ: tạo/sửa/tạm ngưng trường, vào bất kỳ trường nào để hỗ trợ / cấu hình / xem vận hành.
- **Admin từng trường** được **setup và CRUD toàn bộ** thông tin của trường mình (nhân sự, danh mục, scoring, KPI, OMICall, portal, playbook, tri thức, tài chính/kế toán trong phạm vi org…).
- VietMy hiện tại = **org đầu tiên** (`orgId = vietmy`), migrate dần, không big-bang rewrite.
- Giữ thế mạnh vertical: scoring, OMICall/KPI, 5 đợt thu, kế toán, cổng đăng ký, n8n giấy tờ.

### Ranh giới quyền (tóm tắt)

| Ai | Phạm vi |
|----|---------|
| **Superadmin** (`super_admin`) | Toàn platform: mọi org. Tạo/xóa/suspend trường; impersonate hoặc “chọn trường đang làm việc”; CRUD data mọi trường khi đang ở ngữ cảnh đó. |
| **Admin trường** (`admin`) | Chỉ `orgId` của mình: toàn quyền setup + thêm/xóa/sửa mọi dữ liệu & cấu hình **trong trường**. Không thấy trường khác. |
| TVV / CTV / TL / Kế toán | Như hiện tại, luôn trong đúng 1 `orgId`. |

### Không thuộc phạm vi (YAGNI)

- Tầng campus / nhiều điểm trong một trường (user đã loại).
- Marketplace, billing SaaS phức tạp (có thể thêm sau).
- Tách mỗi trường một Firebase project.
- Self-serve đăng ký trường công khai trên internet (superadmin tạo trường).
- Viết lại toàn bộ UI thành CRM generic.

### Thành công khi

1. User `admin` trường A **không** đọc/ghi được data trường B (Rules + claim).
2. `super_admin` **có thể** liệt kê mọi org, chọn org, thao tác như admin (hoặc mạnh hơn) trên org đó.
3. Admin trường tự setup đầy đủ CRM trường mình mà không cần đụng code.
4. Tạo org thứ hai (staging) chạy độc lập; VietMy backfill không đổi hành vi TVV/KT.
5. SĐT trùng giữa hai trường không gộp/chặn nhầm.

---

## 2. Hiện trạng (evidence)

| Khía cạnh | Thực tế trong repo |
|-----------|-------------------|
| Database | 1 Firestore DB `warmlist`, collection phẳng |
| Config | Nhiều **singleton** `scoringAux/{fixedId}` (KPI, OMICall, portal, info score…) |
| User | `users/{uid}` — có role `super_admin` / `admin`…; **không** `orgId` |
| Lead query | RBAC assignee/team/global — **không** filter trường |
| Rules mẫu | Auth user đọc/ghi gần như toàn DB (`firestore.rules.example`) |
| Public portal | `/dang-ky` → 1 config + counter mã SV global |
| OMICall | 1 webhook URL project + 1 config doc; match SĐT global |
| n8n | Default `VITE_N8N_*` trỏ host VietMy |
| `tenantId` | Chỉ field mirror API OMICall — **không** phải CRM tenant |

Kết luận: single-tenant; role `super_admin` hiện là “admin mạnh trong một trường”, chưa phải “điều hành nhiều trường”.

---

## 3. Ba hướng kiến trúc

### Hướng 1 — Mỗi trường một Firebase project

Cô lập hạ tầng tuyệt đối nhưng **khó** có một superadmin quản lý chung trên một UI → **loại** (trái yêu cầu superadmin toàn hệ).

### Hướng 2 — Subcollection `orgs/{orgId}/leads/...`

Rules path đẹp; rewrite client/Functions/index quá lớn → **không chọn làm bước đầu**.

### Hướng 3 — Collection phẳng + `orgId` + `orgSettings/{orgId}` (**khuyến nghị**)

- Data nghiệp vụ giữ collection hiện tại + field `orgId`.
- Config theo trường trong `orgSettings/{orgId}/…`.
- Claim: school user có `orgId`; superadmin có flag `platform: true` (không gắn một org cứng).
- Superadmin chọn **activeOrgId** (context) khi làm việc.

**Chọn hướng 3.**

---

## 4. Thiết kế đề xuất (Hướng 3)

### 4.1. Thực thể nền tảng

```
organizations/{orgId}
  - id, name, slug (unique), status: active|suspended
  - createdAt, createdBy (superadmin uid)
  - (sau) notes

orgSettings/{orgId}/docs/{docId}
  # toàn bộ setup của trường — admin trường CRUD
  - kpiV2Config
  - kpiEvaluationConfig
  - omicallIntegration
  - publicRegistrationConfig
  - infoScoreConfig
  - leadClassificationConfig
  - callSessionChips
  - tvvSignalDefinitions
  - orgAiIntegration
  - n8nWebhooks
  - systemLeadCodeCounters
  - studentCodeCounters

users/{uid}
  - role: super_admin | admin | team_lead | counselor | ctv | accountant
  - orgId: string | null
      # null chỉ khi role === super_admin (platform)
      # admin/TVV/KT: bắt buộc đúng 1 orgId
```

Catalogs & nội dung trường (masterData, scoringProfiles, playbooks, scripts, knowledge, scholarships, leadSources…) đều gắn `orgId` — admin trường CRUD trong org mình.

### 4.2. Hai tầng quản trị (chi tiết)

#### Superadmin (`super_admin`) — quản lý chung toàn bộ

**Được:**

| Nhóm | Việc |
|------|------|
| Tổ chức | Tạo / đổi tên / suspend / (tuỳ chọn) xóa mềm trường; xem danh sách org |
| Ngữ cảnh | Chọn **trường đang làm việc** (`activeOrgId`) — UI giống vào CRM trường đó |
| Trong ngữ cảnh org | Toàn quyền như admin trường (và hơn nếu cần): nhân sự, config, lead, KPI, KT… |
| Nhân sự cross-org | Tạo admin trường đầu khi onboard; reset/khóa tài khoản mọi org |
| Hệ thống | Theo dõi org suspended; (sau) audit thao tác superadmin |

**Không bắt buộc trong phase đầu:** “nhìn một màn hình merge mọi lead mọi trường” — mặc định làm việc **theo từng org đã chọn** (tránh nhầm lẫn). Có thể thêm dashboard tổng số org / health sau.

**Claim gợi ý:** `{ role: 'super_admin', platform: true }` — Rules: nếu `platform == true` thì bypass so khớp `orgId`.

#### Admin trường (`admin`) — toàn quyền trong cơ sở (org) của mình

**Được (trong `orgId` mình):**

- Nhân sự: thêm / sửa / xóa (hoặc vô hiệu) TVV, CTV, TL, kế toán; gán quyền phụ.
- Danh mục & master data, nguồn lead, học bổng.
- Bộ chấm điểm, % thông tin, phân loại HOT/WARM, KPI Sale, tín hiệu TVV, call chips.
- Playbook, script, tri thức, AI org (trong quyền đã có).
- OMICall, cổng đăng ký SV, webhook n8n của trường.
- Hồ sơ / tài chính / báo cáo trong trường (như admin hiện tại).
- Không tạo org mới; không xem/sửa org khác.

Map với sản phẩm hiện tại: hầu hết màn **Cài đặt** + quản trị lead/KT mà `admin` đã có → chỉ cần **khóa theo `orgId`**.

#### Các role khác

Giữ hành vi hiện tại, luôn `orgId` bắt buộc; query/Rules không vượt org.

### 4.3. Dữ liệu nghiệp vụ

Mọi document nghiệp vụ gắn `orgId`:

- `leads` (+ `orgId` trên `interactions` nếu collectionGroup)
- `omicallCalls`, `omicallCallAnalyses`
- KPI docs: prefix hoặc field `orgId` (tránh đụng `kpiDaily/{date}` giữa trường)
- `financeReports`, `ai_tasks`, playbooks, scripts, knowledge, scholarships, leadSources, masterData
- `stats/counselorLoads` theo org

**Uniqueness trong org:** `(orgId, uniqueHash)` / SĐT; counter mã SV trong `orgSettings/{orgId}`.

### 4.4. Auth & Rules

**School user**

```
allow read, write: if request.auth != null
  && request.auth.token.platform != true
  && resource.data.orgId == request.auth.token.orgId;
```

**Superadmin**

```
allow read, write: if request.auth != null
  && request.auth.token.platform == true
  && request.auth.token.role == 'super_admin';
```

- Tạo/sửa `organizations`: chỉ superadmin.
- Admin trường: CRUD `orgSettings/{ownOrgId}/**` và data `orgId == own`.
- Client school: mọi query có `where('orgId','==', profile.orgId)`.
- Client superadmin: sau khi chọn `activeOrgId`, query `where('orgId','==', activeOrgId)` (UX); Rules vẫn cho phép đọc mọi org nhờ `platform`.

Callable public (`/dang-ky/:orgSlug`): Admin SDK; không dùng token user.

### 4.5. UX superadmin

1. Đăng nhập → màn **Chọn trường** (danh sách `organizations`) + nút **Tạo trường**.
2. Chọn trường → vào app như admin (sidebar có badge tên trường); nút **Đổi trường**.
3. Tạo trường: form tên + slug + email admin đầu → Cloud Function tạo Auth user, `users` doc `role: admin`, `orgId`, copy `orgSettings` từ template (hoặc clone từ VietMy defaults).

Admin trường: đăng nhập → thẳng vào CRM org mình (không màn chọn trường).

### 4.6. Luồng công khai & tích hợp

| Luồng | Thiết kế |
|-------|----------|
| Đăng ký SV | `/dang-ky/:orgSlug` → config + masterData **đúng org** |
| OMICall | Config trong orgSettings; resolve org từ SIP→user; không match SĐT cross-org |
| n8n | URL theo org; payload có `orgId`, `orgSlug` |
| R2/Storage | `receipts/{orgId}/leads/{leadId}/…` |
| Seed | `ensureDefaultFirestoreData(orgId)` mỗi trường một lần (admin hoặc lúc superadmin tạo org) |

### 4.7. Index

Composite index dẫn đầu `orgId` cho mọi list query (leads, accountant, omicall, KPI…).

---

## 5. Chiến lược migrate

### Phase 0 — VietMy = org duy nhất

1. `organizations/vietmy` + copy `scoringAux/*` → `orgSettings/vietmy/...`.
2. Backfill `orgId: 'vietmy'` cho data hiện có.
3. User hiện tại: gán `orgId: vietmy`; **một** tài khoản giữ `super_admin` + `platform: true` (orgId null).
4. Dual-read settings; ghi mới theo orgSettings + `orgId`.
5. Rules: school theo orgId; superadmin platform bypass.
6. Portal `/dang-ky/vietmy` (+ redirect `/dang-ky`).

### Phase 1 — Cứng hóa

1. Gỡ fallback singleton global.
2. Mọi query có orgId (superadmin dùng activeOrgId).
3. Dedup SĐT theo org.
4. QA: admin trường CRUD settings; superadmin đổi trường / tạo org staging.

### Phase 2 — Trường thứ hai

1. Superadmin tạo org + admin trường.
2. Admin trường tự setup (OMICall/n8n có thể trống đến khi cấu hình).
3. Không phụ thuộc `VITE_N8N_*` global cho đa trường — lấy orgSettings.

### Phase 3 — Ops

- Suspend org, audit log thao tác superadmin, backup theo org.
- (Tuỳ) dashboard sức khỏe nhiều trường.

---

## 6. Rủi ro & cách xử lý

| Rủi ro | Mức | Xử lý |
|--------|-----|--------|
| Sóot query school → lộ data | Cao | Rules theo claim; checklist `orgId` |
| Superadmin nhầm trường khi thao tác | Cao | Bắt buộc chọn `activeOrgId`; badge tên trường rõ trên UI |
| Lạm dụng tài khoản superadmin | Cao | Ít user; MFA (sau); audit viết/xóa cross-org |
| Trùng SĐT hai trường | Cao | Unique trong `(orgId, hash)` |
| OMICall webhook chung | Cao | Resolve org từ user SIP; secret/config per org |
| Admin trường xóa nhầm config | Trung | Soft-delete / xác nhận UI; (sau) backup settings |
| Dual-read lệch | Trung | Deadline gỡ fallback Phase 1 |

---

## 7. Quyết định đã chốt

1. Tenant = **trường (`orgId`)** — mỗi trường độc lập; **không** campus.  
2. Kiến trúc = collection phẳng + `orgId` + `orgSettings/{orgId}`.  
3. **`super_admin` = quản lý chung toàn bộ trường** (platform claim + chọn active org).  
4. **`admin` = toàn quyền CRUD/setup trong đúng một trường**.  
5. School user ∈ đúng 1 org; superadmin không gắn một org cứng.  
6. VietMy = `vietmy` migrate trước.  
7. Một Firebase project; Rules + claim là hàng rào bảo mật.  
8. Tạo trường mới: chỉ superadmin (không self-serve công khai ở phase đầu).

---

## 8. Việc không làm trong plan đầu

- Self-serve signup trường trên internet.
- Một email thuộc nhiều org (trừ superadmin context switch).
- Viết lại toàn bộ workflow n8n.
- Native mobile.
- Màn “all-schools merged lead grid” (có thể thêm sau).

---

## 9. Bước tiếp theo sau khi duyệt spec

1. Implementation plan Phase 0 → 1 (roles/claims, orgSettings, backfill, Rules, UI chọn trường cho superadmin).  
2. Implement + test trên `vietmy`.  
3. Superadmin tạo org staging thứ hai khi Phase 1 xanh.

---

*Spec dựa trên audit `danhgiatuyensinh` + yêu cầu: trường độc lập, superadmin quản lý chung, admin trường setup/CRUD toàn bộ trong trường.*
