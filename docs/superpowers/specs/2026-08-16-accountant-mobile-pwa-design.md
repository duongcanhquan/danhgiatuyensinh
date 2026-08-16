# Cổng kế toán — app shell + PWA (cài được)

## Mục tiêu
Trên điện thoại, cổng `/ke-toan` cảm giác như app: full màn, tab dưới, có thể **Thêm vào Màn hình chính**. Vẫn cần mạng. Chưa offline. Chưa đụng CRM chính.

## Khung UI
- `AccountantLayout`: `h-[100dvh]` + main cuộn; bottom nav (Hàng đợi / Tổng quan) trên mobile; header gọn + menu Thêm (đổi MK / thoát).
- Desktop: nav trên như hiện tại.

## PWA
- `public/manifest-ke-toan.webmanifest` (name/start_url `/ke-toan`, theme indigo, icons có sẵn).
- Meta Apple + link manifest trong `index.html` (hoặc inject khi vào cổng kế toán).
- Không service worker offline ở phase này.

## Ngoài phạm vi
Offline sync, Store app, CRM shell, nhân sự kế toán.
