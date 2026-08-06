/** API key đối tác nhận hồ sơ — hash SHA-256, prefix hiển thị. */

const KEY_PREFIX_TAG = 'vm_'

function toHex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export async function hashInboundApiKey(rawKey: string): Promise<string> {
  const data = new TextEncoder().encode(rawKey.trim())
  const digest = await crypto.subtle.digest('SHA-256', data)
  return toHex(digest)
}

export function inboundApiKeyPrefix(rawKey: string): string {
  const k = rawKey.trim()
  if (k.length <= 10) return k
  return `${k.slice(0, 7)}…${k.slice(-4)}`
}

/** Tạo key dạng vm_<32 hex>. */
export function generateInboundApiKey(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return KEY_PREFIX_TAG + toHex(bytes.buffer)
}

export async function verifyInboundApiKey(
  rawKey: string,
  storedHashes: Array<{ keyHash: string }>,
): Promise<boolean> {
  const hash = await hashInboundApiKey(rawKey)
  return storedHashes.some((k) => k.keyHash === hash)
}

export function buildInboundLeadContractExample(orgSlug: string): string {
  const slug = orgSlug.trim() || 'ten-truong'
  return JSON.stringify(
    {
      endpoint: `POST /v1/public/orgs/${slug}/leads`,
      headers: {
        Authorization: 'Bearer vm_xxxxxxxx',
        'Content-Type': 'application/json',
      },
      body: {
        fullName: 'Nguyễn Văn A',
        phone: '0901234567',
        source1: 'API đối tác',
        email: 'a@email.com',
        province: 'Hà Nội',
        majorInterest: 'Công nghệ thông tin',
        externalId: 'partner-row-1',
      },
      notes: [
        'Phase 1: lưu API key trong Hub kết nối; endpoint Cloud Function triển khai Phase 2.',
        'Dedupe theo org + SĐT / externalId.',
      ],
    },
    null,
    2,
  )
}
