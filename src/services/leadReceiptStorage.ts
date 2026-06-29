import { getDownloadURL, ref, uploadBytes } from 'firebase/storage'
import type { LeadPaymentSlotKey } from '../types'
import { optimizeReceiptFile } from '../utils/receiptImageOptimize'
import { buildFirebaseReceiptPath, buildReceiptObjectKey, receiptPublicUrl } from '../utils/receiptStoragePaths'
import { getFirebaseStorage } from './firebase'

const RECEIPT_R2_UPLOAD_URL = String(import.meta.env.VITE_RECEIPT_R2_UPLOAD_URL ?? '').trim()
const RECEIPT_R2_UPLOAD_TOKEN = String(import.meta.env.VITE_RECEIPT_R2_UPLOAD_TOKEN ?? '').trim()
const RECEIPT_R2_PUBLIC_BASE_URL = String(import.meta.env.VITE_RECEIPT_R2_PUBLIC_BASE_URL ?? '').trim()

const RECEIPT_DRIVE_WEBHOOK_URL = String(import.meta.env.VITE_RECEIPT_DRIVE_WEBHOOK_URL ?? '').trim()
const RECEIPT_DRIVE_WEBHOOK_TOKEN = String(import.meta.env.VITE_RECEIPT_DRIVE_WEBHOOK_TOKEN ?? '').trim()

/** Thư mục con — giống `uploadToDrive(f, họTên + "_" + mãSV)` hệ cũ. */
export function receiptStorageFolderName(lead: {
  fullName: string
  systemCode?: string
  customerId?: string
  id: string
}): string {
  const id = (lead.systemCode || lead.customerId || lead.id).trim()
  const name = lead.fullName.trim() || 'HoSo'
  return `${name}_${id}`.replace(/[^\w.\-()À-ỹ\s]/gi, '_').replace(/\s+/g, '_')
}

async function fileToBase64(file: File): Promise<string> {
  const ab = await file.arrayBuffer()
  let binary = ''
  const bytes = new Uint8Array(ab)
  const chunkSize = 0x8000
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize)
    binary += String.fromCharCode(...chunk)
  }
  return btoa(binary)
}

async function uploadReceiptToR2(
  lead: { id: string; fullName: string; systemCode?: string; customerId?: string },
  slot: LeadPaymentSlotKey,
  file: File,
): Promise<string> {
  const folderName = receiptStorageFolderName(lead)
  const objectKey = buildReceiptObjectKey({
    leadId: lead.id,
    folderName,
    slot,
    fileName: file.name || 'bill',
  })

  const payload = {
    token: RECEIPT_R2_UPLOAD_TOKEN || undefined,
    leadId: lead.id,
    folderName,
    slot,
    fileName: file.name || 'bill',
    contentType: file.type || 'application/octet-stream',
    base64: await fileToBase64(file),
  }

  const res = await fetch(RECEIPT_R2_UPLOAD_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    throw new Error(`Upload R2 lỗi (${res.status})`)
  }
  const data = (await res.json()) as { ok?: boolean; fileUrl?: string; objectKey?: string; error?: string }
  if (!data.ok) {
    throw new Error(data.error?.trim() || 'Worker R2 không trả ok.')
  }
  if (data.fileUrl) return data.fileUrl
  const base = RECEIPT_R2_PUBLIC_BASE_URL || RECEIPT_R2_UPLOAD_URL.replace(/\/upload\/?$/, '')
  return receiptPublicUrl(base, data.objectKey ?? objectKey)
}

async function uploadReceiptToDriveWebhook(
  lead: { id: string; fullName: string; systemCode?: string; customerId?: string },
  slot: LeadPaymentSlotKey,
  file: File,
): Promise<string> {
  const payload = {
    token: RECEIPT_DRIVE_WEBHOOK_TOKEN || undefined,
    leadId: lead.id,
    fullName: lead.fullName,
    systemCode: lead.systemCode ?? '',
    customerId: lead.customerId ?? '',
    slot,
    folderName: receiptStorageFolderName(lead),
    fileName: file.name || 'bill',
    contentType: file.type || 'application/octet-stream',
    base64: await fileToBase64(file),
  }

  const res = await fetch(RECEIPT_DRIVE_WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    throw new Error(`Upload Drive lỗi (${res.status})`)
  }
  const data = (await res.json()) as { ok?: boolean; fileUrl?: string; error?: string }
  if (!data.ok || !data.fileUrl) {
    throw new Error(data.error?.trim() || 'Apps Script không trả fileUrl hợp lệ.')
  }
  return data.fileUrl
}

async function uploadReceiptToFirebase(
  lead: { id: string; fullName: string; systemCode?: string; customerId?: string },
  slot: LeadPaymentSlotKey,
  file: File,
): Promise<string> {
  const storage = getFirebaseStorage()
  if (!storage) {
    throw new Error(
      'Chưa cấu hình nơi lưu chứng từ. Thiết lập VITE_RECEIPT_R2_UPLOAD_URL, VITE_RECEIPT_DRIVE_WEBHOOK_URL hoặc VITE_FIREBASE_STORAGE_BUCKET.',
    )
  }
  const folder = receiptStorageFolderName(lead)
  const path = buildFirebaseReceiptPath({ folderName: folder, slot, fileName: file.name || 'bill' })
  const storageRef = ref(storage, path)
  await uploadBytes(storageRef, file, { contentType: file.type || 'application/octet-stream' })
  return getDownloadURL(storageRef)
}

/**
 * Upload chứng từ tài chính; trả URL lưu vào Firestore `receiptUrl`.
 *
 * **Ưu tiên backend:** Cloudflare R2 → Google Drive (Apps Script) → Firebase Storage.
 * Ảnh được resize/nén trước khi gửi (JPEG ~1600px).
 *
 * R2 key: `receipts/leads/{leadId}/{HọTên_MãSV}/{slot}/{timestamp}_{file}`
 */
export async function uploadLeadReceiptFile(
  lead: { id: string; fullName: string; systemCode?: string; customerId?: string },
  slot: LeadPaymentSlotKey,
  file: File,
): Promise<string> {
  const prepared = await optimizeReceiptFile(file)

  if (RECEIPT_R2_UPLOAD_URL) {
    return uploadReceiptToR2(lead, slot, prepared)
  }
  if (RECEIPT_DRIVE_WEBHOOK_URL) {
    return uploadReceiptToDriveWebhook(lead, slot, prepared)
  }
  return uploadReceiptToFirebase(lead, slot, prepared)
}
