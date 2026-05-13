import type { VietMyUserProfile } from '../types'

/** Hiển thị đồng nhất trên dropdown / bảng: tên hiển thị · email đăng nhập. */
export function formatStaffDirectoryLabel(
  u: Pick<VietMyUserProfile, 'displayName' | 'email' | 'id'>,
): string {
  const name = (u.displayName || '').trim() || '—'
  const em = (u.email || '').trim()
  return em ? `${name} · ${em}` : `${name} (${u.id.slice(0, 8)}…)`
}

/** Chỉ tên hiển thị (bảng TVV, chip phụ trách) — không kèm email. */
export function formatStaffDisplayName(
  u: Pick<VietMyUserProfile, 'displayName' | 'email' | 'id'>,
): string {
  const name = (u.displayName || '').trim()
  if (name) return name
  const em = (u.email || '').trim()
  if (em) return em
  return `${u.id.slice(0, 8)}…`
}
