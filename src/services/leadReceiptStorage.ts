import { getDownloadURL, ref, uploadBytes } from 'firebase/storage'
import type { LeadPaymentSlotKey } from '../types'
import { getFirebaseStorage } from './firebase'

/** Thư mục con — giống `uploadToDrive(f, họTên + "_" + mãSV)` hệ cũ. */
export function receiptStorageFolderName(lead: {
  fullName: string
  customerId?: string
  id: string
}): string {
  const id = (lead.customerId || lead.id).trim()
  const name = lead.fullName.trim() || 'HoSo'
  return `${name}_${id}`.replace(/[^\w.\-()À-ỹ\s]/gi, '_').replace(/\s+/g, '_')
}

/**
 * Upload chứng từ lên Firebase Storage; trả URL tải xuống (lưu vào Firestore `receiptUrl`).
 * Đường dẫn: `receipts/{HọTên_MãSV}/{slot}_{tên_file_gốc}`
 */
export async function uploadLeadReceiptFile(
  lead: { id: string; fullName: string; customerId?: string },
  slot: LeadPaymentSlotKey,
  file: File,
): Promise<string> {
  const storage = getFirebaseStorage()
  if (!storage) {
    throw new Error('Chưa cấu hình Firebase Storage — kiểm tra VITE_FIREBASE_STORAGE_BUCKET trong .env.')
  }
  const folder = receiptStorageFolderName(lead)
  const safeName = file.name.replace(/[^\w.\-()]+/g, '_') || 'bill'
  const path = `receipts/${folder}/${slot}_${safeName}`
  const storageRef = ref(storage, path)
  await uploadBytes(storageRef, file, { contentType: file.type || 'application/octet-stream' })
  return getDownloadURL(storageRef)
}
