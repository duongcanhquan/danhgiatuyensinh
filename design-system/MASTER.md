# VietMy Tuyển sinh — Design System (UI only)

> Áp dụng cho refactor giao diện — **không** đổi logic, cấu hình hay dữ liệu.

## Mục tiêu sản phẩm
- CRM tuyển sinh, KPI TVV, hồ sơ ứng viên — **chuyên nghiệp, dễ quét, tin cậy**
- Ngôn ngữ UI: tiếng Việt đời thường (hồ sơ, mẫu, bảng điểm…)

## Màu (semantic tokens)
| Token | Hex | Dùng cho |
|-------|-----|----------|
| Primary | `#2563EB` | CTA chính, nav active, link |
| Accent | `#059669` | Lưu, tạo hồ sơ, thành công |
| Surface | `#FFFFFF` | Card, modal |
| Background | `#F1F5F9` | Nền app |
| Foreground | `#0F172A` | Chữ chính |
| Muted | `#64748B` | Chữ phụ |
| Border | `#E2E8F0` | Viền, divider |
| Destructive | `#DC2626` | Xóa, lỗi |

## Typography
- **Body / UI:** Fira Sans
- **Cỡ chữ:** 16px body, scale Tailwind `text-xs` → `text-xl`
- **Line-height:** 1.5–1.6 body

## Layout
- Sidebar cố định 18rem; nội dung `max-w` theo từng màn
- Spacing 4/8dp; card `rounded-2xl`, padding `p-4`–`p-6`
- Một vùng cuộn chính — tránh nested scroll (modal, form dài)

## Component utilities (CSS)
- `.vm-btn-primary` / `.vm-btn-secondary` / `.vm-btn-ghost`
- `.vm-input` / `.vm-select`
- `.app-card-glass` — card nền sáng, bóng nhẹ

## A11y & tương tác
- Touch ≥ 44px; `cursor-pointer` trên clickable
- Focus ring 2px primary; `prefers-reduced-motion`
- Không emoji làm icon — Lucide

## Tránh
- Glassmorphism quá nặng, nhiều gradient chồng
- Chữ < 12px cho nội dung chính
- Nested `overflow-hidden` + `flex-1` không có `min-h-0`
