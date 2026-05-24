/** Chuẩn hoá SĐT — mirror logic client `phoneNormalize.ts`. */

export function digitsOnly(raw: string): string {
  let d = String(raw ?? '').trim().replace(/[^\d+]/g, '')
  if (d.startsWith('+')) d = d.slice(1)
  return d.replace(/\D/g, '')
}

export function normalizePhoneLocal(raw: unknown): string {
  let d = digitsOnly(String(raw ?? ''))
  if (!d) return ''
  if (d.startsWith('84') && d.length >= 11) return `0${d.slice(2)}`
  if (!d.startsWith('0') && d.length === 9) return `0${d}`
  if (d.startsWith('0')) return d
  return d
}

export function normalizePhoneIntl(raw: unknown): string | null {
  const local = normalizePhoneLocal(raw)
  if (!local || local.length < 10 || !local.startsWith('0')) return null
  return `+84${local.slice(1)}`
}

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

export function normalizeHotlineNumber(raw: unknown): string {
  const s = String(raw ?? '').trim()
  if (!s) return ''
  const d = digitsOnly(s)
  if (d.startsWith('84') && d.length >= 11) return `0${d.slice(2)}`
  if (d.startsWith('0')) return d
  return s
}
