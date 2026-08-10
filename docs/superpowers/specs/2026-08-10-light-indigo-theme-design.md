# Theme sáng indigo (toàn hệ thống)

## Mục tiêu

Đổi tông CRM sang nền sáng thoáng, CTA indigo, trạng thái emerald/amber/red rõ ràng. Sidebar desktop giữ nền tối, accent active = indigo.

## Token

| Vai trò | Hex |
|--------|-----|
| Canvas | `#F8FAFC` |
| Surface | `#FFFFFF` |
| Text primary | `#0F172A` |
| Text secondary | `#64748B` |
| Primary / accent | `#4F46E5` |
| Primary hover | `#4338CA` |
| Secondary btn bg | `#F1F5F9` |
| Success | `#10B981` |
| Warning | `#F59E0B` |
| Danger | `#EF4444` |
| Sidebar ink | giữ tối (`--vm-ink`) |

## Phạm vi đợt 1

- `src/index.css`: `@theme`, body, nút, input focus, heading thương hiệu, bento hero, focus ring, shadow nhẹ.
- `LoginView`: overlay/form khớp palette (hero tối + form trắng).
- Sidebar: `bg-[var(--vm-accent)]` khi active → indigo qua token.

## Đợt 2

- `teal-*` → `indigo-*` toàn `src`
- Hex chart `#0d9488` → `#4f46e5`
- Nút/focus/gradient emerald brand → indigo; cổng kế toán & AuthSession tone `indigo`
- Giữ `emerald-*` cho trạng thái thành công (HL, đã duyệt, chấm xanh kết nối, trang đăng ký thành công, KPI tone emerald)
