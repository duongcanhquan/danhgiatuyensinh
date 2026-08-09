# System audit — perf + OMICall (2026-08-09)

Đối chiếu `crm-platform-north-star`, `crm-integration-hub-design`, `multi-tenant-org-design`.

## Đã làm trong đợt này

1. **Tổng kết (admin):** count tổng org trước → DB trống bỏ ~24 count; melt song song / bỏ nếu 0; admin không `useLeads` + scoring.
2. **Hồ sơ list:** `getDocsListWithOrgFallback` scoped+legacy song song; `useLeads({ enabled })`.
3. **OMICall config:** dual-read/write `orgSettings/{orgId}/settings/omicallIntegration` (+ mirror `scoringAux` cho `vietmy`); CF `loadOmicallServerConfig(orgId)`.
4. **OMICall match:** pending `orgId`; phone lookup ưu tiên cùng org; deskPhone label «máy bàn sẵn sàng».
5. **Lịch sử gọi:** CF-first (global), trần hàng thấp hơn, lọc `orgId` phía client.

## Còn mở (P1+)

- Backfill `omicallCalls.orgId` rồi siết Rules + index `orgId + endedAt`.
- Auth vẫn chờ profile+claims trước paint.
- fullScope vẫn dùng cho một số lọc Hồ sơ (hàng chờ / chưa gắn CT).
- Superadmin đổi trường: OmicallProvider ngoài `OrgProvider` — resolve qua `profile` + `activeOrg` storage.
