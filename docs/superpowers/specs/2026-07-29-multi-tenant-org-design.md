# Thiết kế multi-tenant theo trường (org)

**Ngày:** 2026-07-29  
**Phạm vi:** Một sản phẩm CRM tuyển sinh — **mỗi trường (org) dùng CRM tách biệt**. Không chia campus/cơ sở.  
**Trạng thái:** Spec chờ duyệt trước khi viết implementation plan.

---

## 1. Mục tiêu & ràng buộc

### Mục tiêu

- Nhiều trường dùng cùng một codebase / cùng hạ tầng Firebase.
- **Trường A không đọc/ghi được** lead, user, KPI, config, chứng từ, báo cáo của trường B.
- VietMy hiện tại trở thành **org đầu tiên** (`orgId = vietmy`), không big-bang rewrite.
- Giữ nguyên thế mạnh vertical: scoring, OMICall/KPI, 5 đợt thu, kế toán, cổng đăng ký, n8n giấy tờ.

### Không thuộc phạm vi (YAGNI)

- Tầng campus / nhiều cơ sở trong một trường.
- Marketplace, billing SaaS phức tạp (có thể thêm sau khi đã có `organizations`).
- Tách mỗi trường một Firebase project (chỉ xét như phương án loại).
- Viết lại toàn bộ UI thành “Salesforce clone”.

### Thành công khi

1. Rules + claim `orgId` khiến user trường A **không** query được data trường B (kể cả đoán `leadId`).
2. Tạo org thứ hai (staging) chạy độc lập: config KPI/scoring/OMICall/portal riêng.
3. VietMy production backfill xong, hành vi TVV/KT **không đổi** so với hiện tại.
4. SĐT trùng giữa hai trường **không** gộp nhầm lead / chặn đăng ký nhầm.

---

## 2. Hiện trạng (evidence)

| Khía cạnh | Thực tế trong repo |
|-----------|-------------------|
| Database | 1 Firestore DB `warmlist`, collection phẳng |
| Config | Nhiều **singleton** `scoringAux/{fixedId}` (KPI, OMICall, portal, info score…) |
| User | `users/{uid}` — role, SIP; **không** `orgId` |
| Lead query | RBAC assignee/team/global — **không** filter trường |
| Rules mẫu | Auth user đọc/ghi gần như toàn DB (`firestore.rules.example`) |
| Public portal | `/dang-ky` → 1 config + counter mã SV global |
| OMICall | 1 webhook URL project + 1 config doc; match SĐT global |
| n8n | Default `VITE_N8N_*` trỏ host VietMy |
| `tenantId` | Chỉ field mirror từ API phân tích OMICall — **không** phải CRM tenant |

Kết luận: đây là **single-tenant sẵn sàng migrate**, chưa phải multi-tenant.

---

## 3. Ba hướng kiến trúc

### Hướng 1 — Mỗi trường một Firebase project

**Ý:** VietMy = project A; Trường X = project B; build app theo env.

| Ưu | Nhược |
|----|--------|
| Cô lập hạ tầng tuyệt đối | Nhân bản Functions, indexes, secrets, CI; không “tạo trường” trong UI |
| Rules đơn giản | Không có super-admin nền tảng thật sự; chi phí ops cao |

**Không chọn** cho giai đoạn tới: trái mục tiêu “một sản phẩm, nhiều trường”, trừ khi khách enterprise đòi.

### Hướng 2 — Subcollection `orgs/{orgId}/leads/...`

**Ý:** Mọi data nghiệp vụ nằm dưới path org.

| Ưu | Nhược |
|----|--------|
| Rules theo path rõ | Đụng **mọi** path client + trigger Functions (`leads/{id}` → `orgs/{orgId}/leads/{id}`) |
| Singleton config tự nhiên | Index / collectionGroup OMICall–KPI phức tạp hơn nhiều |

**Không chọn làm bước đầu:** chi phí rewrite lớn so với lợi ích khi mới 1–N trường vừa phải.

### Hướng 3 — Collection phẳng + `orgId` + config theo org (khuyến nghị)

**Ý:**

- `leads`, `users`, `omicallCalls`, KPI events… giữ collection hiện tại, **bắt buộc** field `orgId`.
- Config trường chuyển sang `orgSettings/{orgId}/…` (hoặc `orgs/{orgId}/settings/{docId}`).
- Auth custom claim `orgId` + Firestore Rules enforce.
- Portal: `/dang-ky/:orgSlug`.

| Ưu | Nhược |
|----|--------|
| Khớp SDK/hooks/Functions hiện tại | Dễ sót query nếu Rules yếu — **Rules là hàng rào bắt buộc** |
| Migrate dần: backfill `vietmy` | Cần thêm composite index (`orgId` + field sort/filter) |
| Tạo trường mới = tạo doc org + copy settings | Phone/hash phải unique **trong org** |

**Chọn hướng 3** làm chuẩn cho VietMy CRM.

---

## 4. Thiết kế đề xuất (Hướng 3)

### 4.1. Thực thể nền tảng

```
organizations/{orgId}
  - id, name, slug (unique), status: active|suspended
  - createdAt, createdBy
  - (sau) plan / notes

orgSettings/{orgId}/docs/{docId}
  # thay thế scoringAux singletons theo trường
  - kpiV2Config
  - kpiEvaluationConfig
  - omicallIntegration
  - publicRegistrationConfig
  - infoScoreConfig
  - leadClassificationConfig
  - callSessionChips
  - tvvSignalDefinitions
  - orgAiIntegration
  - n8nWebhooks          # giaymoi, ctsv, daily, monthly
  - systemLeadCodeCounters
  - studentCodeCounters

users/{uid}
  - orgId               # bắt buộc (trừ platform_super_admin)
  - role, … (như hiện tại)
```

**Platform role (mới, hẹp):** `platform_admin` — chỉ quản lý danh sách org + tạo admin trường đầu; **không** đọc lead các trường trừ khi có quy trình support có audit (mặc định: không đọc lead).

**School roles:** giữ `admin | team_lead | counselor | ctv | accountant` như hiện tại, luôn trong đúng 1 `orgId`.

Một user Auth = **một org** (giai đoạn 1). Không multi-org membership.

### 4.2. Dữ liệu nghiệp vụ

Mọi document nghiệp vụ gắn `orgId`:

- `leads` (+ denormalize `orgId` xuống `interactions` nếu dùng collectionGroup)
- `omicallCalls`, `omicallCallAnalyses`
- `kpiDaily` / `kpiMonthly` / dedupe windows: **đổi ID hoặc path** để không đụng giữa org  
  Ví dụ: `kpiDaily/{orgId}_{yyyyMMdd}` hoặc field `orgId` + doc id có prefix.
- `financeReports`, `ai_tasks`, playbooks, scripts, knowledge, scholarships, leadSources, masterData catalogs
- `stats/counselorLoads` → `stats/counselorLoads_{orgId}` hoặc map theo org

**Uniqueness trong org:**

- `uniqueHash` / SĐT: query `where orgId==X && uniqueHash==Y` (không global).
- Mã `systemCode`: counter trong `orgSettings/{orgId}/…/systemLeadCodeCounters`.

### 4.3. Auth & Rules

1. Khi tạo/sửa user trường: set custom claim `{ orgId, role }`.
2. Client đọc `orgId` từ profile + claim; mọi list query kèm `orgId`.
3. Rules (bắt buộc trước khi mở trường 2):

```
match /leads/{id} {
  allow read, write: if request.auth != null
    && resource.data.orgId == request.auth.token.orgId;
  allow create: if request.auth != null
    && request.resource.data.orgId == request.auth.token.orgId;
}
```

Tương tự cho các collection có `orgId`.  
`organizations` / tạo org: chỉ `platform_admin`.  
Callable public (unauth): **không** dùng user token — Functions Admin SDK kiểm `orgSlug` → `orgId` rồi ghi đúng org.

### 4.4. Luồng công khai & tích hợp

| Luồng | Thiết kế |
|-------|----------|
| Đăng ký SV | `/dang-ky/:orgSlug` → `getPublicRegistrationMeta({ orgSlug })` → config + masterData **của org** |
| OMICall webhook | Map `sip`/`agentId` → `users` → `orgId`; hoặc webhook path/secret **per org**; không match SĐT cross-org |
| n8n | URL lưu trong `orgSettings`; payload luôn có `orgId`, `orgSlug` |
| R2/Storage | Prefers `receipts/{orgId}/leads/{leadId}/…` |
| Seed / bootstrap | `ensureDefaultFirestoreData(orgId)` — mỗi org một lần |

### 4.5. Index

Mọi query list hiện tại thêm equality `orgId` đứng đầu (hoặc gần đầu) composite index. Cập nhật `firestore.indexes.json` theo từng hook (leads, accountant, omicallCalls, KPI…).

---

## 5. Chiến lược migrate (không downtime ý nghĩa với 1 trường)

### Phase 0 — Coi VietMy là org duy nhất (bắt buộc trước trường 2)

1. Tạo `organizations/vietmy` + `orgSettings/vietmy/...` copy từ `scoringAux/*` hiện có.
2. Backfill `orgId: 'vietmy'` cho leads, users, calls, KPI docs, catalogs…
3. App **đọc dual**: ưu tiên `orgSettings`, fallback `scoringAux` (compat).
4. Ghi mới **chỉ** vào `orgSettings` + luôn set `orgId` trên lead/user.
5. Bật Rules theo `orgId` (claim gắn cho user VietMy).
6. Đổi portal nội bộ sang `/dang-ky/vietmy` (redirect từ `/dang-ky`).

### Phase 1 — Cứng hóa single-org multi-tenant-ready

1. Gỡ fallback `scoringAux` singleton (hoặc chỉ còn đọc-only archive).
2. Mọi query client/Functions có `orgId`.
3. Dedup SĐT / hash theo org.
4. Test checklist: TVV, KT, KPI, OMICall, portal, giấy mời.

### Phase 2 — Trường thứ hai (staging rồi production)

1. UI / script: `createOrganization({ name, slug, adminEmail })` → Auth user + claim + copy default settings từ template.
2. OMICall: config riêng hoặc tắt cho đến khi có số tổng đài.
3. n8n: webhook riêng (hoặc workflow route theo `orgId`).
4. Không share `VITE_N8N_*` hardcode cho mọi trường trên cùng một bản build đa tenant — lấy từ orgSettings.

### Phase 3 — Ops (sau khi đã có ≥2 trường thật)

- Suspend org, audit platform_admin, backup export theo org, monitoring Functions theo `orgId` label.
- (Tuỳ chọn) billing — ngoài spec này.

---

## 6. Rủi ro & cách xử lý

| Rủi ro | Mức | Xử lý |
|--------|-----|--------|
| Sóot một query → lộ data | Cao | Rules claim-based là cổng chính; code review checklist `orgId`; test Rules |
| Trùng SĐT hai trường | Cao | Unique trong `(orgId, uniqueHash)` chỉ |
| OMICall 1 webhook chung | Cao | Resolve org từ SIP user; hoặc webhook/secret per org |
| KPI doc id đụng ngày | Trung | Prefix `orgId` trong doc id |
| Counter mã SV global | Trung | Counter trong orgSettings |
| n8n Chat nhầm trường | Trung | URL + `orgId` trong payload |
| Dual-read lâu → lệch config | Trung | Phase 0 có deadline gỡ fallback |
| Platform_admin quá mạnh | Trung | Mặc định không đọc leads |

---

## 7. Quyết định đã chốt trong spec

1. Tenant = **trường (`orgId`)**, không campus.  
2. Kiến trúc = **collection phẳng + `orgId` + `orgSettings/{orgId}`**.  
3. User ∈ đúng 1 org (phase 1–2).  
4. VietMy = org `vietmy`, migrate trước khi onboard trường khác.  
5. Không tách Firebase project/trường.  
6. Security = **custom claim + Rules**, không chỉ filter client.

---

## 8. Việc không làm trong spec / plan đầu

- UI marketing đa trường, self-serve signup công khai trên internet.
- Multi-org cho một email.
- Viết lại n8n toàn bộ workflow (chỉ thêm `orgId` + URL per org).
- Native mobile.

---

## 9. Bước tiếp theo sau khi duyệt spec

1. Viết **implementation plan** (Phase 0 → 1 chi tiết file/hook/Functions).  
2. Implement Phase 0 trên nhánh riêng + test với data `vietmy`.  
3. Chỉ khi Phase 1 xanh mới tạo org staging thứ hai.

---

*Spec dựa trên audit codebase `danhgiatuyensinh` (types `FS_COLLECTIONS` / `scoringAux`, Functions OMICall–KPI–publicRegistration, hooks leads/accountant, `n8nIntegration`, rules example).*
