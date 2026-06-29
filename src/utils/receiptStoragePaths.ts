import type { LeadPaymentSlotKey } from '../types'

/** Tiền tố gốc trên R2 / Firebase — một thư mục logic cho mọi backend. */
export const RECEIPT_STORAGE_ROOT = 'receipts'

/**
 * Khóa R2 chuẩn theo từng ứng viên:
 * `receipts/leads/{leadId}/{folderName}/{slot}/{timestamp}_{fileName}`
 *
 * - `leadId`: khóa Firestore — ổn định khi đổi tên hiển thị
 * - `folderName`: `{HọTên}_{MãSV}` — dễ duyệt trên console R2
 * - `slot`: deposit | supplementL1 … supplementL4
 */
export function buildReceiptObjectKey(opts: {
  leadId: string
  folderName: string
  slot: LeadPaymentSlotKey
  fileName: string
  uploadedAt?: Date
}): string {
  const ts = (opts.uploadedAt ?? new Date()).toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const safe = sanitizeReceiptFileName(opts.fileName)
  const folder = sanitizePathSegment(opts.folderName)
  const leadId = sanitizePathSegment(opts.leadId)
  return `${RECEIPT_STORAGE_ROOT}/leads/${leadId}/${folder}/${opts.slot}/${ts}_${safe}`
}

/** Legacy Firebase path (giữ tương thích fallback). */
export function buildFirebaseReceiptPath(opts: {
  folderName: string
  slot: LeadPaymentSlotKey
  fileName: string
}): string {
  const safe = sanitizeReceiptFileName(opts.fileName)
  const folder = sanitizePathSegment(opts.folderName)
  return `${RECEIPT_STORAGE_ROOT}/${folder}/${opts.slot}_${safe}`
}

export function sanitizeReceiptFileName(name: string): string {
  const base = String(name ?? '').trim() || 'bill'
  return base.replace(/[^\w.\-()À-ỹ]+/gi, '_').slice(0, 120)
}

export function sanitizePathSegment(segment: string): string {
  return String(segment ?? '')
    .trim()
    .replace(/[^\w.\-()À-ỹ\s]/gi, '_')
    .replace(/\s+/g, '_')
    .slice(0, 80) || 'unknown'
}

export function receiptPublicUrl(baseUrl: string, objectKey: string): string {
  const base = baseUrl.replace(/\/+$/, '')
  const encoded = objectKey
    .split('/')
    .map((p) => encodeURIComponent(p))
    .join('/')
  return `${base}/files/${encoded}`
}
