import { getDownloadURL, ref, uploadBytes } from 'firebase/storage'
import type { LeadPaymentSlotKey } from '../types'
import { optimizeReceiptFile } from '../utils/receiptImageOptimize'
import { buildFirebaseReceiptPath, buildReceiptObjectKey, receiptPublicUrl } from '../utils/receiptStoragePaths'
import { getFirebaseStorage, getFirestoreDb } from './firebase'
import {
  ensureReceiptStorageConfigLoaded,
  resolveReceiptStorageRuntime,
} from '../utils/receiptStorageConfig'
import { DEFAULT_ORG_ID } from '../tenancy/orgConstants'

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
  runtime: ReturnType<typeof resolveReceiptStorageRuntime>,
): Promise<string> {
  const folderName = receiptStorageFolderName(lead)
  const objectKey = buildReceiptObjectKey({
    leadId: lead.id,
    folderName,
    slot,
    fileName: file.name || 'bill',
  })

  const payload = {
    token: runtime.r2UploadToken || undefined,
    leadId: lead.id,
    folderName,
    slot,
    fileName: file.name || 'bill',
    contentType: file.type || 'application/octet-stream',
    base64: await fileToBase64(file),
  }

  const res = await fetch(runtime.r2UploadUrl, {
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
  const base = runtime.r2PublicBaseUrl || runtime.r2UploadUrl.replace(/\/upload\/?$/, '')
  return receiptPublicUrl(base, data.objectKey ?? objectKey)
}

async function uploadReceiptToDriveWebhook(
  lead: { id: string; fullName: string; systemCode?: string; customerId?: string },
  slot: LeadPaymentSlotKey,
  file: File,
  runtime: ReturnType<typeof resolveReceiptStorageRuntime>,
): Promise<string> {
  const payload = {
    token: runtime.driveWebhookToken || undefined,
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

  const res = await fetch(runtime.driveWebhookUrl, {
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
      'Chưa cấu hình nơi lưu chứng từ. Vào Cài đặt → Tích hợp → Chứng từ & lưu trữ (hoặc VITE_RECEIPT_* / Storage).',
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
 * Ưu tiên: cấu hình trường (Cài đặt) → .env → Firebase Storage.
 * Provider: auto | r2 | drive | firebase.
 */
export async function uploadLeadReceiptFile(
  lead: { id: string; fullName: string; systemCode?: string; customerId?: string; orgId?: string | null },
  slot: LeadPaymentSlotKey,
  file: File,
): Promise<string> {
  const orgId = String(lead.orgId ?? '').trim() || DEFAULT_ORG_ID
  await ensureReceiptStorageConfigLoaded(getFirestoreDb(), orgId)
  const prepared = await optimizeReceiptFile(file)
  const runtime = resolveReceiptStorageRuntime()

  const tryR2 = async () => {
    if (!runtime.r2UploadUrl) throw new Error('Chưa có URL upload R2.')
    return uploadReceiptToR2(lead, slot, prepared, runtime)
  }
  const tryDrive = async () => {
    if (!runtime.driveWebhookUrl) throw new Error('Chưa có URL Apps Script Drive.')
    return uploadReceiptToDriveWebhook(lead, slot, prepared, runtime)
  }

  if (runtime.provider === 'r2') return tryR2()
  if (runtime.provider === 'drive') return tryDrive()
  if (runtime.provider === 'firebase') return uploadReceiptToFirebase(lead, slot, prepared)

  // auto
  if (runtime.r2UploadUrl) return tryR2()
  if (runtime.driveWebhookUrl) return tryDrive()
  return uploadReceiptToFirebase(lead, slot, prepared)
}
