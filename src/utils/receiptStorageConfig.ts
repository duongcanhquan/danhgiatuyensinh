import { doc, getDoc, setDoc, Timestamp, type Firestore } from 'firebase/firestore'
import { FS_COLLECTIONS } from '../types'
import { orgSettingsDocSegments } from '../tenancy/orgSettingsPaths'
import { DEFAULT_ORG_ID } from '../tenancy/orgConstants'

export const RECEIPT_STORAGE_DOC_ID = 'receiptStorageConfig' as const

export type ReceiptStorageProvider = 'auto' | 'r2' | 'drive' | 'firebase'

export type OrgReceiptStorageConfig = {
  /** auto = R2 nếu có URL → Drive → Firebase */
  provider: ReceiptStorageProvider
  r2UploadUrl: string
  r2UploadToken: string
  r2PublicBaseUrl: string
  driveWebhookUrl: string
  driveWebhookToken: string
  updatedAt?: string
  updatedBy?: string
}

export function emptyReceiptStorageConfig(): OrgReceiptStorageConfig {
  return {
    provider: 'auto',
    r2UploadUrl: '',
    r2UploadToken: '',
    r2PublicBaseUrl: '',
    driveWebhookUrl: '',
    driveWebhookToken: '',
  }
}

export function parseReceiptStorageConfig(
  data: Record<string, unknown> | undefined,
): OrgReceiptStorageConfig {
  const base = emptyReceiptStorageConfig()
  if (!data) return base
  const providerRaw = String(data.provider ?? 'auto').trim()
  const provider: ReceiptStorageProvider =
    providerRaw === 'r2' || providerRaw === 'drive' || providerRaw === 'firebase' || providerRaw === 'auto'
      ? providerRaw
      : 'auto'
  return {
    provider,
    r2UploadUrl: String(data.r2UploadUrl ?? '').trim(),
    r2UploadToken: String(data.r2UploadToken ?? '').trim(),
    r2PublicBaseUrl: String(data.r2PublicBaseUrl ?? '').trim(),
    driveWebhookUrl: String(data.driveWebhookUrl ?? '').trim(),
    driveWebhookToken: String(data.driveWebhookToken ?? '').trim(),
    updatedAt: data.updatedAt != null ? String(data.updatedAt) : undefined,
    updatedBy: data.updatedBy != null ? String(data.updatedBy) : undefined,
  }
}

let receiptCache: OrgReceiptStorageConfig | null = null
let receiptCacheOrgId: string | null = null

export function setReceiptStorageConfigCache(orgId: string, cfg: OrgReceiptStorageConfig | null): void {
  receiptCacheOrgId = orgId
  receiptCache = cfg
}

export function getReceiptStorageConfigCache(): {
  orgId: string | null
  config: OrgReceiptStorageConfig | null
} {
  return { orgId: receiptCacheOrgId, config: receiptCache }
}

/** Merge org config với env fallback (env chỉ khi trường chưa điền). */
export function resolveReceiptStorageRuntime(
  cfg?: OrgReceiptStorageConfig | null,
): {
  provider: ReceiptStorageProvider
  r2UploadUrl: string
  r2UploadToken: string
  r2PublicBaseUrl: string
  driveWebhookUrl: string
  driveWebhookToken: string
} {
  const c = cfg ?? receiptCache ?? emptyReceiptStorageConfig()
  const envR2 = String(import.meta.env.VITE_RECEIPT_R2_UPLOAD_URL ?? '').trim()
  const envR2Token = String(import.meta.env.VITE_RECEIPT_R2_UPLOAD_TOKEN ?? '').trim()
  const envR2Public = String(import.meta.env.VITE_RECEIPT_R2_PUBLIC_BASE_URL ?? '').trim()
  const envDrive = String(import.meta.env.VITE_RECEIPT_DRIVE_WEBHOOK_URL ?? '').trim()
  const envDriveToken = String(import.meta.env.VITE_RECEIPT_DRIVE_WEBHOOK_TOKEN ?? '').trim()
  return {
    provider: c.provider || 'auto',
    r2UploadUrl: c.r2UploadUrl || envR2,
    r2UploadToken: c.r2UploadToken || envR2Token,
    r2PublicBaseUrl: c.r2PublicBaseUrl || envR2Public,
    driveWebhookUrl: c.driveWebhookUrl || envDrive,
    driveWebhookToken: c.driveWebhookToken || envDriveToken,
  }
}

export async function loadReceiptStorageConfig(
  db: Firestore,
  orgId: string = DEFAULT_ORG_ID,
): Promise<OrgReceiptStorageConfig> {
  const id = orgId.trim() || DEFAULT_ORG_ID
  try {
    const snap = await getDoc(doc(db, ...orgSettingsDocSegments(id, RECEIPT_STORAGE_DOC_ID)))
    const parsed = parseReceiptStorageConfig(
      snap.exists() ? (snap.data() as Record<string, unknown>) : undefined,
    )
    setReceiptStorageConfigCache(id, parsed)
    return parsed
  } catch (e) {
    console.warn('[loadReceiptStorageConfig]', id, e)
    const empty = emptyReceiptStorageConfig()
    setReceiptStorageConfigCache(id, empty)
    return empty
  }
}

export async function saveReceiptStorageConfig(
  db: Firestore,
  orgId: string,
  cfg: OrgReceiptStorageConfig,
  updatedBy: string,
): Promise<OrgReceiptStorageConfig> {
  const id = orgId.trim() || DEFAULT_ORG_ID
  const payload: OrgReceiptStorageConfig = {
    ...parseReceiptStorageConfig(cfg as unknown as Record<string, unknown>),
    updatedAt: new Date().toISOString(),
    updatedBy,
  }
  await setDoc(
    doc(db, ...orgSettingsDocSegments(id, RECEIPT_STORAGE_DOC_ID)),
    { ...payload, orgId: id, updatedAtServer: Timestamp.now() },
    { merge: true },
  )
  await setDoc(doc(db, FS_COLLECTIONS.orgSettings, id), { orgId: id, updatedAt: Timestamp.now() }, { merge: true })
  setReceiptStorageConfigCache(id, payload)
  return payload
}
