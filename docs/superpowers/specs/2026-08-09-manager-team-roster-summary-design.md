# Bảng tổng kết nhóm (Nhóm của tôi)

## Mục tiêu

Quản lý (trưởng nhóm / quản trị / siêu quản trị) xem nhanh từng nhân sự dưới phạm vi mình: tổng lead đang giữ, đã gọi, thành công (HOT), không thành công, tỷ lệ gọi ngày/tuần/tháng.

## Định nghĩa số

| Cột | Định nghĩa |
|-----|------------|
| Tổng lead | Hồ sơ đang gán cho nhân sự (`assignedTo` / legacy) |
| Đã gọi | Trong các lead đang giữ, bucket gọi ≠ `uncalled` (có note/lịch sử gọi) |
| Thành công | `lastCallDispositionId === 'college_hot'` (Chọn cao đẳng, HOT) |
| Không thành công | Có note sau gọi và **không** phải HOT |
| Tỷ lệ gọi ngày/tuần/tháng | Số lead đang giữ có ≥1 cuộc gọi trong kỳ ÷ tổng lead đang giữ |

- Ngày: theo lịch VN (`Asia/Ho_Chi_Minh`) hôm nay  
- Tuần: 7 ngày gần nhất (gồm hôm nay)  
- Tháng: từ ngày 1 tháng hiện tại (VN) đến hôm nay  

## UI

- Tab Tổng kết mới: **«Nhóm của tôi»** (`nhom-cua-toi`)
- Hiện khi: `dashboard:team_lead` \| `leads:read:team_scope` \| `analytics:advanced` \| `leads:read:global`
- Trưởng nhóm: hàng = TVV/CTV trong roster quản lý  
- Quản trị / siêu quản trị: hàng = TVV/CTV trường đang chọn; lọc tùy chọn theo trưởng nhóm  
- Dòng tổng cuối bảng  

## Kiến trúc

- Pure util `buildTeamRosterSummary` (test được) nhận leads + sự kiện gọi  
- View đọc `useLeads(fullScope)` + `useOmicallCalls` (khoảng từ đầu tháng / tối thiểu 7 ngày) + `useCounselorDirectory`  
- Không đổi schema Firestore  

## Ngoài phạm vi

- Export Excel, KPI HL/doanh thu (đã có tab khác), chỉnh note catalog  
