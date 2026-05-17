import { getDownloadURL, ref, uploadBytes } from 'firebase/storage'
import type { LeadPaymentSlotKey } from '../types'
import { getFirebaseStorage } from './firebase'

export async function uploadLeadReceiptFile(
  leadId: string,
  slot: LeadPaymentSlotKey,
  file: File,
): Promise<string> {
  const storage = getFirebaseStorage()
  if (!storage) throw new Error('Chưa cấu hình Firebase Storage.')
  const safeName = file.name.replace(/[^\w.\-()]+/g, '_')
  const path = `leads/${leadId}/receipts/${slot}_${Date.now()}_${safeName}`
  const storageRef = ref(storage, path)
  await uploadBytes(storageRef, file, { contentType: file.type || 'application/octet-stream' })
  return getDownloadURL(storageRef)
}
