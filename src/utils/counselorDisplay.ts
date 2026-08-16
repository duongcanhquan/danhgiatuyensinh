import type { VietMyUserProfile } from '../types'

/** Chuỗi giống Firebase UID (không phải họ tên). */
export function looksLikeUserIdCode(raw: string): boolean {
  const s = raw.trim()
  if (!s) return false
  if (s.includes('…') || s.includes('...')) return true
  // Auth UID thường 28 ký tự alphanumeric
  if (/^[A-Za-z0-9]{20,36}$/.test(s)) return true
  return false
}

/** Chỉ tên hiển thị (bảng TVV, chip phụ trách) — không kèm email / mã UID. */
export function formatStaffDisplayName(
  u: Pick<VietMyUserProfile, 'displayName' | 'email' | 'id'>,
): string {
  const name = (u.displayName || '').trim()
  if (name && !looksLikeUserIdCode(name)) return name
  const em = (u.email || '').trim()
  if (em) return em
  return 'Chưa đặt tên'
}

/** Hiển thị đồng nhất trên dropdown / bảng: tên hiển thị · email đăng nhập. */
export function formatStaffDirectoryLabel(
  u: Pick<VietMyUserProfile, 'displayName' | 'email' | 'id'>,
): string {
  const name = formatStaffDisplayName(u)
  const em = (u.email || '').trim()
  if (em && name !== em) return `${name} · ${em}`
  if (em) return em
  return name
}

/**
 * Gắn nhãn TVV theo UID: danh bạ → tên trên hồ sơ (uploaderName) → «Chưa đặt tên».
 * Không bao giờ hiện mã UID cắt ngắn cho người dùng cuối.
 */
export function resolveCounselorDisplayName(
  uid: string | null | undefined,
  opts?: {
    directoryNames?: Map<string, string>
    directoryUsers?: readonly Pick<VietMyUserProfile, 'id' | 'displayName' | 'email'>[]
    leadUploaderName?: string | null
  },
): string {
  const id = String(uid ?? '').trim()
  if (!id) return '—'

  const fromMap = opts?.directoryNames?.get(id)?.trim()
  if (fromMap && fromMap !== 'Chưa đặt tên' && !looksLikeUserIdCode(fromMap)) return fromMap

  const fromUser = opts?.directoryUsers?.find((u) => u.id === id)
  if (fromUser) {
    const n = formatStaffDisplayName(fromUser)
    if (n !== 'Chưa đặt tên') return n
  }

  const up = String(opts?.leadUploaderName ?? '').trim()
  if (up && !looksLikeUserIdCode(up)) return up

  if (fromMap) return fromMap
  return 'Chưa đặt tên'
}
