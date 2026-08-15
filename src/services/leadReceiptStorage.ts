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
import { fetchWithTimeout, withTimeout } from '../utils/fetchWithTimeout'

/** Timeout từng lần thử R2/Drive — ngắn để mau chuyển sang Firebase. */
const RECEIPT_FETCH_TIMEOUT_MS = 12_000

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

  // multipart — nhanh hơn JSON base64, ít treo mạng.
  const form = new FormData()
  if (runtime.r2UploadToken) form.append('token', runtime.r2UploadToken)
  form.append('leadId', lead.id)
  form.append('folderName', folderName)
  form.append('slot', slot)
  form.append('fileName', file.name || 'bill')
  form.append('file', file, file.name || 'bill')

  const res = await fetchWithTimeout(
    runtime.r2UploadUrl,
    { method: 'POST', body: form },
    RECEIPT_FETCH_TIMEOUT_MS,
    'Upload R2 quá lâu',
  )
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(text || `Upload R2 lỗi (${res.status})`)
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
  const ab = await file.arrayBuffer()
  let binary = ''
  const bytes = new Uint8Array(ab)
  const chunkSize = 0x8000
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize))
  }

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
    base64: btoa(binary),
  }

  const res = await fetchWithTimeout(
    runtime.driveWebhookUrl,
    {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload),
      redirect: 'follow',
    },
    RECEIPT_FETCH_TIMEOUT_MS,
    'Upload Drive quá lâu',
  )
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
      'Chưa cấu hình Firebase Storage. Vào Cài đặt → Tích hợp → Chứng từ, chọn Firebase hoặc kiểm tra VITE_FIREBASE_STORAGE_BUCKET.',
    )
  }
  const folder = receiptStorageFolderName(lead)
  const path = buildFirebaseReceiptPath({ folderName: folder, slot, fileName: file.name || 'bill' })
  const storageRef = ref(storage, path)
  await withTimeout(
    uploadBytes(storageRef, file, { contentType: file.type || 'application/octet-stream' }),
    RECEIPT_FETCH_TIMEOUT_MS,
    'Upload Firebase Storage quá lâu',
  )
  return getDownloadURL(storageRef)
}

export type ReceiptUploadResult = {
  url: string
  /** r2 | drive | firebase */
  provider: 'r2' | 'drive' | 'firebase'
}

/**
 * Upload chứng từ — ưu tiên Firebase (ổn định), rồi R2, rồi Drive.
 * Provider cố định (r2/drive/firebase) vẫn tôn trọng; lỗi thì báo rõ.
 */
export async function uploadLeadReceiptFile(
  lead: { id: string; fullName: string; systemCode?: string; customerId?: string; orgId?: string | null },
  slot: LeadPaymentSlotKey,
  file: File,
): Promise<ReceiptUploadResult> {
  const orgId = String(lead.orgId ?? '').trim() || DEFAULT_ORG_ID
  await ensureReceiptStorageConfigLoaded(getFirestoreDb(), orgId)
  const prepared = await optimizeReceiptFile(file)
  const runtime = resolveReceiptStorageRuntime()

  const tryR2 = async (): Promise<ReceiptUploadResult> => {
    if (!runtime.r2UploadUrl) throw new Error('Chưa có URL upload R2.')
    const url = await uploadReceiptToR2(lead, slot, prepared, runtime)
    return { url, provider: 'r2' }
  }
  const tryDrive = async (): Promise<ReceiptUploadResult> => {
    if (!runtime.driveWebhookUrl) throw new Error('Chưa có URL Apps Script Drive.')
    const url = await uploadReceiptToDriveWebhook(lead, slot, prepared, runtime)
    return { url, provider: 'drive' }
  }
  const tryFirebase = async (): Promise<ReceiptUploadResult> => {
    const url = await uploadReceiptToFirebase(lead, slot, prepared)
    return { url, provider: 'firebase' }
  }

  if (runtime.provider === 'drive') return tryDrive()
  if (runtime.provider === 'r2') {
    try {
      return await tryR2()
    } catch (e) {
      // R2 hỏng → vẫn cứu bằng Firebase để TVV/KT có bill xem được.
      try {
        const fb = await tryFirebase()
        console.warn('[receipt] R2 fail, used Firebase', e)
        return fb
      } catch {
        throw e instanceof Error ? e : new Error(String(e))
      }
    }
  }
  if (runtime.provider === 'firebase') return tryFirebase()

  // auto: Firebase trước (nhanh, ổn), R2 sau, Drive cuối.
  const errors: string[] = []
  try {
    return await tryFirebase()
  } catch (e) {
    errors.push(`Firebase: ${e instanceof Error ? e.message : String(e)}`)
  }
  if (runtime.r2UploadUrl) {
    try {
      return await tryR2()
    } catch (e) {
      errors.push(`R2: ${e instanceof Error ? e.message : String(e)}`)
    }
  }
  if (runtime.driveWebhookUrl) {
    try {
      return await tryDrive()
    } catch (e) {
      errors.push(`Drive: ${e instanceof Error ? e.message : String(e)}`)
    }
  }
  throw new Error(
    errors.length
      ? `Không lưu được chứng từ. ${errors.join(' · ')}`
      : 'Không lưu được chứng từ — chưa cấu hình Firebase/R2/Drive.',
  )
}
