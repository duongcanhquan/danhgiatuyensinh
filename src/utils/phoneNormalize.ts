/** Chuẩn hoá SĐT Việt Nam — dùng chung cho quay số, lưu Firestore, match hồ sơ. */

export type PhoneDialFormat = 'intl84' | 'local'

/** Chỉ lấy chữ số; bỏ + và khoảng trắng. */
export function digitsOnly(raw: string): string {
  let d = String(raw ?? '').trim().replace(/[^\d+]/g, '')
  if (d.startsWith('+')) d = d.slice(1)
  return d.replace(/\D/g, '')
}

/** Chuẩn nội bộ CRM: 0xxxxxxxxx (9–11 chữ số sau 0). */
export function normalizePhoneLocal(raw: unknown): string {
  let d = digitsOnly(String(raw ?? ''))
  if (!d) return ''
  if (d.startsWith('84') && d.length >= 11) return `0${d.slice(2)}`
  if (!d.startsWith('0') && d.length === 9) return `0${d}`
  if (d.startsWith('0')) return d
  return d
}

/** Quốc tế cho OMICall Web SDK: +849xxxxxxxxx */
export function normalizePhoneIntl(raw: unknown): string | null {
  const local = normalizePhoneLocal(raw)
  if (!local || local.length < 10) return null
  if (!local.startsWith('0')) return null
  return `+84${local.slice(1)}`
}

/** Các biến thể để query Firestore (lead có thể lưu 0…, +84…, 84…). */
export function phoneLookupVariants(raw: unknown): string[] {
  const local = normalizePhoneLocal(raw)
  if (!local) return []
  const digits = digitsOnly(local)
  const bare84 = digits.startsWith('0') ? `84${digits.slice(1)}` : digits
  const intl = normalizePhoneIntl(local)
  const out = new Set<string>([local, digits, bare84])
  if (intl) out.add(intl)
  return [...out].filter(Boolean)
}

export function phonesMatch(a: unknown, b: unknown): boolean {
  const la = normalizePhoneLocal(a)
  const lb = normalizePhoneLocal(b)
  return Boolean(la && lb && la === lb)
}

/** Quay số theo cấu hình app. */
export function formatPhoneForDial(raw: unknown, format: PhoneDialFormat = 'intl84'): string | null {
  const local = normalizePhoneLocal(raw)
  if (!local || local.length < 10) return null
  if (format === 'local') return local
  return normalizePhoneIntl(local)
}

/** Chuẩn hoá đầu số hotline (giữ nguyên 0 hoặc 84 theo API). */
export function normalizeHotlineNumber(raw: unknown): string {
  const s = String(raw ?? '').trim()
  if (!s) return ''
  const d = digitsOnly(s)
  if (d.startsWith('84')) return d.length >= 11 ? `0${d.slice(2)}` : s
  if (d.startsWith('0')) return d
  return s
}
