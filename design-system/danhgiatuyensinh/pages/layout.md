# Layout & Navigation

> Overrides MASTER.md for shell, nav, and page chrome.

## Mobile-first

- Bottom nav (≤1023px): Tổng kết · Hồ sơ · Hôm nay* · Cài đặt* · Thêm (drawer)
- Touch targets ≥44px; `safe-area-pb-nav` on main content
- Header: chỉ tiêu đề trang + tên rút gọn (sm+)

## Desktop

- Sidebar 14rem, flat slate-900, không nhóm label dư
- Không subtitle «Hệ thống tuyển sinh» dưới header

## Page headers

- Dùng `AppPageHeader` — không khung `app-glass-panel` cho tiêu đề
- Tab: `TabStrip` variant `segmented` (mặc định)

## Brand

- Giữ palette VietMy: primary `#2563eb`, accent `#059669` — **không** dùng pink từ MASTER auto-gen
