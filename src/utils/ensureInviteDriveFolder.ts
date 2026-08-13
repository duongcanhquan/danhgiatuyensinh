import type { Lead } from '../types'
import { receiptStorageFolderName } from '../services/leadReceiptStorage'
import { resolveReceiptStorageRuntime } from './receiptStorageConfig'

/**
 * Tạo/lấy folder Drive giấy mời (Apps Script `triggerInvitation` + FOLDER_INVITE_ROOT).
 * Dùng cùng webhook Drive với chứng từ (`action: ensure_folder`).
 */
export async function ensureInviteDriveFolder(opts: {
  lead: Lead
  rootFolderId: string
}): Promise<{ folderUrl: string; folderId: string } | null> {
  const rootFolderId = String(opts.rootFolderId ?? '').trim()
  if (!rootFolderId) return null

  const runtime = resolveReceiptStorageRuntime()
  const webhookUrl = runtime.driveWebhookUrl
  if (!webhookUrl.startsWith('http')) return null

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

  const res = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(text || `Drive ensure_folder lỗi (${res.status})`)
  }
  const data = (await res.json()) as {
    ok?: boolean
    folderUrl?: string
    folderId?: string
    error?: string
  }
  if (!data.ok) {
    throw new Error(data.error?.trim() || 'Drive không tạo được thư mục giấy mời.')
  }
  const folderUrl = String(data.folderUrl ?? '').trim()
  const folderId = String(data.folderId ?? '').trim()
  if (!folderUrl && !folderId) return null
  return {
    folderUrl: folderUrl || (folderId ? `https://drive.google.com/drive/folders/${folderId}` : ''),
    folderId,
  }
}
