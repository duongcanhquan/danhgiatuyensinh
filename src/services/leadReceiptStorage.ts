import { getDownloadURL, ref, uploadBytes } from 'firebase/storage'
import type { LeadPaymentSlotKey } from '../types'
import { getFirebaseStorage } from './firebase'

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

/**
 * Upload chứng từ lên Firebase Storage; trả URL tải xuống (lưu vào Firestore `receiptUrl`).
 * Đường dẫn: `receipts/{HọTên_MãSV}/{slot}_{tên_file_gốc}`
 */
export async function uploadLeadReceiptFile(
  lead: { id: string; fullName: string; systemCode?: string; customerId?: string },
  slot: LeadPaymentSlotKey,
  file: File,
): Promise<string> {
  if (RECEIPT_DRIVE_WEBHOOK_URL) {
    return uploadReceiptToDriveWebhook(lead, slot, file)
  }
  const storage = getFirebaseStorage()
  if (!storage) {
    throw new Error(
      'Chưa cấu hình nơi lưu chứng từ. Thiết lập VITE_RECEIPT_DRIVE_WEBHOOK_URL hoặc VITE_FIREBASE_STORAGE_BUCKET.',
    )
  }
  const folder = receiptStorageFolderName(lead)
  const safeName = file.name.replace(/[^\w.\-()]+/g, '_') || 'bill'
  const path = `receipts/${folder}/${slot}_${safeName}`
  const storageRef = ref(storage, path)
  await uploadBytes(storageRef, file, { contentType: file.type || 'application/octet-stream' })
  return getDownloadURL(storageRef)
}
