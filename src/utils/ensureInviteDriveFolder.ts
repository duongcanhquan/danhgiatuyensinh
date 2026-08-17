import type { Lead } from '../types'
import { receiptStorageFolderName } from '../services/leadReceiptStorage'
import { tryEnsureInviteDriveFolderCallable } from '../services/ensureInviteDriveFolderCallable'
import { ensureReceiptStorageConfigLoaded, resolveReceiptStorageRuntime } from './receiptStorageConfig'
import { getFirestoreDb } from '../services/firebase'
import { DEFAULT_ORG_ID } from '../tenancy/orgConstants'
import { fetchWithTimeout } from './fetchWithTimeout'
import {
  explainAppsScriptClientFailure,
  explainAppsScriptResponseBody,
  isAppsScriptDevUrl,
  isLikelyHtmlBody,
} from './inviteDriveErrors'

const APPS_SCRIPT_TIMEOUT_MS = 25_000

/**
 * POST Apps Script từ trình duyệt — dùng text/plain để tránh CORS preflight
 * (application/json → OPTIONS → Apps Script thường fail).
 */
export async function postAppsScriptJson(
  webhookUrl: string,
  payload: Record<string, unknown>,
): Promise<Response> {
  return fetchWithTimeout(
    webhookUrl,
    {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload),
      redirect: 'follow',
    },
    APPS_SCRIPT_TIMEOUT_MS,
    'Apps Script Drive quá lâu',
  )
}

function parseFolderPayload(text: string): { folderUrl: string; folderId: string } {
  if (isLikelyHtmlBody(text)) {
    throw new Error(explainAppsScriptResponseBody(text, 200))
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

/**
 * Tạo/lấy folder Drive giấy mời.
 * Ưu tiên Cloud Function (không CORS — cùng kết quả mọi máy), fallback Apps Script từ trình duyệt.
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

  const viaCf = await tryEnsureInviteDriveFolderCallable({
    leadId: opts.lead.id,
    rootFolderId,
  })
  if (viaCf?.folderUrl) return viaCf

  const orgId = String(opts.lead.orgId ?? '').trim() || DEFAULT_ORG_ID
  await ensureReceiptStorageConfigLoaded(getFirestoreDb(), orgId)
  const runtime = resolveReceiptStorageRuntime()
  const webhookUrl = runtime.driveWebhookUrl
  if (!webhookUrl.startsWith('http')) {
    throw new Error(
      'Chưa có URL Apps Script (Drive). Vào Cài đặt → Chứng từ → dán URL Web App + token → Lưu.',
    )
  }
  if (isAppsScriptDevUrl(webhookUrl)) {
    throw new Error(
      'URL Apps Script đang là /dev — chỉ máy chủ script (đã đăng nhập Google) mới chạy được. Deploy Web App và dùng URL /exec.',
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
    throw new Error(explainAppsScriptClientFailure(e))
  }

  const text = await res.text().catch(() => '')
  if (!res.ok) {
    throw new Error(explainAppsScriptResponseBody(text, res.status))
  }
  return parseFolderPayload(text)
}
