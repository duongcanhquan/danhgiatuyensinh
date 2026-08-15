import type { Lead } from '../types'
import { receiptStorageFolderName } from '../services/leadReceiptStorage'
import { ensureReceiptStorageConfigLoaded, resolveReceiptStorageRuntime } from './receiptStorageConfig'
import { getFirestoreDb } from '../services/firebase'
import { DEFAULT_ORG_ID } from '../tenancy/orgConstants'

/**
 * POST Apps Script từ trình duyệt — dùng text/plain để tránh CORS preflight
 * (application/json → OPTIONS → Apps Script thường fail).
 */
export async function postAppsScriptJson(
  webhookUrl: string,
  payload: Record<string, unknown>,
): Promise<Response> {
  return fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(payload),
    redirect: 'follow',
  })
}

/**
 * Tạo/lấy folder Drive giấy mời (Apps Script `ensure_folder`).
 * Dùng cùng webhook Drive với chứng từ.
 */
export async function ensureInviteDriveFolder(opts: {
  lead: Lead
  rootFolderId: string
}): Promise<{ folderUrl: string; folderId: string } | null> {
  const rootFolderId = String(opts.rootFolderId ?? '').trim()
  if (!rootFolderId) {
    throw new Error(
      'Chưa có ID thư mục gốc giấy mời. Vào Cài đặt → Giấy mời & mẫu → «Điền folder VietMy» → Lưu.',
    )
  }

  const orgId = String(opts.lead.orgId ?? '').trim() || DEFAULT_ORG_ID
  await ensureReceiptStorageConfigLoaded(getFirestoreDb(), orgId)
  const runtime = resolveReceiptStorageRuntime()
  const webhookUrl = runtime.driveWebhookUrl
  if (!webhookUrl.startsWith('http')) {
    throw new Error(
      'Chưa có URL Apps Script (Drive). Vào Cài đặt → Chứng từ → dán URL Web App + token → Lưu.',
    )
  }

  const folderName = receiptStorageFolderName(opts.lead)
  const payload = {
    action: 'ensure_folder',
    token: runtime.driveWebhookToken || undefined,
    rootFolderId,
    folderName,
    fullName: opts.lead.fullName,
    systemCode: opts.lead.systemCode ?? '',
    customerId: opts.lead.customerId ?? '',
    leadId: opts.lead.id,
  }

  let res: Response
  try {
    res = await postAppsScriptJson(webhookUrl, payload)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    throw new Error(
      `Không gọi được Apps Script Drive (${msg}). Kiểm tra URL /exec, quyền Anyone, và token.`,
    )
  }

  const text = await res.text().catch(() => '')
  if (!res.ok) {
    throw new Error(text.slice(0, 200) || `Drive ensure_folder lỗi (${res.status})`)
  }

  let data: { ok?: boolean; folderUrl?: string; folderId?: string; error?: string }
  try {
    data = JSON.parse(text) as typeof data
  } catch {
    throw new Error(
      'Apps Script không trả JSON (có thể sai URL hoặc chưa Deploy Web app). Mở lại Deploy → copy link /exec.',
    )
  }
  if (!data.ok) {
    throw new Error(data.error?.trim() || 'Drive không tạo được thư mục giấy mời.')
  }
  const folderUrl = String(data.folderUrl ?? '').trim()
  const folderId = String(data.folderId ?? '').trim()
  if (!folderUrl && !folderId) {
    throw new Error('Apps Script không trả folderUrl/folderId.')
  }
  return {
    folderUrl: folderUrl || (folderId ? `https://drive.google.com/drive/folders/${folderId}` : ''),
    folderId,
  }
}
