# Audit chi phí Firestore — đọc / ghi / download (2026-08-10)

Audit song song bởi 3 agent (client hooks, leads/KPI/dashboard, Cloud Functions).  
Tham chiếu trước: `2026-08-09-system-audit-perf-omicall.md` (chủ yếu client OMICall list).

## Bản đồ nóng (ROI cao → thấp)

| # | Vấn đề | Lớp | $ ước lượng | Effort |
|---|--------|-----|-------------|--------|
| 1 | Job `syncOmicallCallHistory` 15 phút: `loadTeamLeadMap` × mỗi cuộc gọi + audit/leads không `limit` + rollup tháng | Server | Rất cao | Trung bình |
| 2 | KPI tháng `mergeLiveCalls`: N ngày `kpiDaily/.../counselors` + MTD OMICall song song | Client | Rất cao | Thấp–TB |
| 3 | `CallHistoryView` tải OMICall **hai lần** + KPI range | Client | Cao | Thấp |
| 4 | Fallback OMICall `scope: none` (team/SIP) | Client | Cao | Thấp |
| 5 | `fullScope` leads: Analytics/Nhóm 2500; lọc «chưa gắn CT» tới **12k**; Superadmin dual getDocs | Client | Cao | TB |
| 6 | My Day: luôn chạy 2 hook KPI + scan nguồn 1500 | Client | Cao | Thấp |
| 7 | Catalog hooks trùng (`knowledge`/`scripts`/`playbooks`) mỗi panel | Client | Trung bình–cao | TB |
| 8 | Directory Superadmin: `onSnapshot(users)` không org | Client | Trung bình | TB |

## Critical — Server

1. **`syncOmicallCallHistory` (15 phút)** — history + upsert × N + backfill 500 + reconcile + CRM/finance KPI + `rollupKpiMonthly`.  
2. **`loadTeamLeadMap` mỗi cuộc gọi** — 4 query `users` theo role, không cache trong vòng lặp.  
3. **`updateDailyCrmKpiFromAuditLogs` / `updateDailyFinanceKpiFromLeads`** — query không `.limit()`.  
4. Cascading: ghi `omicallCalls` / `interactions` / `leads` → listener client đang mở hồ sơ.

## Critical — Client

1. **`useCounselorKpiDateRange` / monthly merge** — admin/team: `getDocs` cả subcollection counselors mỗi ngày.  
2. **`AdminPersonnelKpiPanel`** — luôn mount monthly merge kể cả tab «kỳ».  
3. **`CallHistoryView`** — `useOmicallCalls` + `useCounselorKpiDateRange` (gọi OMICall lần 2).  
4. **`useLeads` fullScope** — 1500–2500–12000; Superadmin VietMy đôi khi **2× getDocs**/chunk.

## Đã tốt (đừng phá)

- Hồ sơ / Dashboard TVV mặc định **paged 30**.  
- Admin tổng quan dùng **`getCountFromServer` + cache 5 phút**, không load hết leads.  
- KPI tự thân: `getDoc` theo UID/ngày.  
- CF `fetchOmicallCallsForClient` ưu tiên scoped, tránh collectionGroup (đã ghi chú P0).  
- SummaryHub unmount tab không active.

## Top 8 việc làm (thứ tự đề xuất)

1. Cache `loadTeamLeadMap` (+ config KPI) **một lần / mỗi lần chạy sync**.  
2. Tách schedule: history upsert 15′; finance/CRM/rollup **giờ/ngày**; skip backfill khi không cần.  
3. `.limit()` + watermark cho audit/leads KPI scans.  
4. Monthly KPI: `mergeLiveCalls: false` mặc định; chỉ merge hôm nay / 1–2 ngày; lazy khi tab monthly.  
5. CallHistory: **một** nguồn calls; KPI tile derive từ đó hoặc chỉ `kpiDaily`.  
6. My Day / Period: `enabled` theo tab.  
7. Chặn fallback OMICall unscoped; siết index + CF.  
8. Shared providers cho knowledge/scripts/playbooks; hạ/xoá scan 12k chương trình (denormalize flag).

## Đã triển khai (2026-08-10)

### Server (`functions/`)
- `loadTeamLeadMapCached` TTL 5 phút + dedupe concurrent; history sync preload map 1 lần / run.
- Audit CRM `.limit(500)` newest-first; finance leads `.limit(400)`.
- Schedule 15′: luôn history + reconcile stored + CRM/finance có limit; interactions + leadEvents + `rollupKpiMonthly` chỉ cửa sổ UTC minutes &lt; 15; backfill `endedAt` có điều kiện.

### Client (`src/`)
- Monthly KPI: `mergeLiveCalls` opt-in, chỉ tháng hiện tại, tối đa 2 ngày gần (`kpiMonthlyLiveBounds`).
- CallHistory: `includeOmicallCalls: false` trên KPI daily + derive live từ cùng `useOmicallCalls`.
- MyDay: gate period KPI + sources theo tab.
- Omicall: bỏ fallback unscoped team/SIP; global vẫn CF-first.
- Leads: dual getDocs → sequential legacy; `LEADS_UI_PROGRAM_SCAN_MAX` = 3000.

### Kiểm chứng
- `npm test`: 413 passed  
- `npm run build` + `functions` `tsc`: OK  

### Chưa làm (để tránh rủi ro lớn)
- Shared providers knowledge/scripts/playbooks (H1) — cần PR riêng.
- Rewrite KPI daily UID-targeted thay vì `getDocs` cả `counselors/` (vẫn còn khi mở KPI kỳ dài).
- Directory Superadmin `onSnapshot(users)` không org.

**Deploy:** cần `npm run deploy:functions` (hoặc deploy schedule `syncOmicallCallHistory`) để server áp dụng trên prod.
