/**
 * Tạo/lấy folder Drive giấy mời — gọi Apps Script phía server (không CORS trình duyệt).
 * Máy TVV khác nhau từng fail vì fetch script.google.com từ browser.
 */
import { type Firestore } from 'firebase-admin/firestore'
import { HttpsError, onCall } from 'firebase-functions/v2/https'

function str(v: unknown): string {
  return String(v ?? '').trim()
}

function sanitizeDriveFolderName(input: string): string {
  const cleaned = String(input ?? '')
    .replace(/[^\w.\-()À-ỹ\s]/gi, '_')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^[_.]+|[_.]+$/g, '')
    .slice(0, 120)
  return cleaned || 'HoSo'
}

function folderNameForLead(data: Record<string, unknown>, leadId: string): string {
  const id = str(data.systemCode) || str(data.customerId) || leadId
  const name = str(data.fullName) || 'HoSo'
  return sanitizeDriveFolderName(`${name}_${id}`)
}

function isLikelyHtml(text: string): boolean {
  return /<!DOCTYPE html|<html[\s>]|accounts\.google\.com/i.test(text)
}

export function registerEnsureInviteDriveFolderCallable(db: Firestore) {
  const ensureInviteDriveFolder = onCall({ timeoutSeconds: 60 }, async (request) => {
    if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Cần đăng nhập.')

    const leadId = str(request.data?.leadId)
    const rootFolderIdIn = str(request.data?.rootFolderId)
    if (!leadId) throw new HttpsError('invalid-argument', 'Thiếu leadId.')

    const userSnap = await db.collection('users').doc(request.auth.uid).get()
    const user = userSnap.data() ?? {}
    const role = str(user.role)
    const userOrg = str(user.orgId) || 'vietmy'

    const leadSnap = await db.collection('leads').doc(leadId).get()
    if (!leadSnap.exists) throw new HttpsError('not-found', 'Không tìm thấy hồ sơ.')
    const lead = leadSnap.data() as Record<string, unknown>
    const leadOrg = str(lead.orgId) || 'vietmy'
    const isAdmin = role === 'admin' || role === 'super_admin'
    if (!isAdmin && userOrg !== leadOrg) {
      throw new HttpsError('permission-denied', 'Không có quyền tạo giấy mời trên hồ sơ này.')
    }

    const [receiptSnap, inviteSnap] = await Promise.all([
      db.doc(`orgSettings/${leadOrg}/settings/receiptStorageConfig`).get(),
      db.doc(`orgSettings/${leadOrg}/settings/inviteDocumentsConfig`).get(),
    ])
    const receipt = (receiptSnap.data() ?? {}) as Record<string, unknown>
    const invite = (inviteSnap.data() ?? {}) as Record<string, unknown>
    const webhookUrl = str(receipt.driveWebhookUrl) || str(process.env.RECEIPT_DRIVE_WEBHOOK_URL)
    const token = str(receipt.driveWebhookToken) || str(process.env.RECEIPT_DRIVE_WEBHOOK_TOKEN)
    const rootFolderId =
      rootFolderIdIn || str(invite.driveRootFolderId) || '1efMVihgSpNqMCeIo1M8s2SHSbFo0WYoZ'

    if (!webhookUrl.startsWith('http')) {
      throw new HttpsError(
        'failed-precondition',
        'Chưa có URL Apps Script (Drive). Vào Cài đặt → Chứng từ → dán URL Web App + token → Lưu.',
      )
    }
    if (/\/dev(?:\?|$)/i.test(webhookUrl)) {
      throw new HttpsError(
        'failed-precondition',
        'URL Apps Script đang là /dev. Deploy Web App và dùng URL /exec rồi Lưu lại Cài đặt → Chứng từ.',
      )
    }

    const payload = {
      action: 'ensure_folder',
      token: token || undefined,
      rootFolderId,
      folderName: folderNameForLead(lead, leadId),
      fullName: str(lead.fullName),
      systemCode: str(lead.systemCode),
      customerId: str(lead.customerId),
      leadId,
    }

    let res: Response
    try {
      res = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(payload),
        redirect: 'follow',
      })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      throw new HttpsError(
        'unavailable',
        `Không gọi được Apps Script Drive từ server (${msg}). Kiểm tra URL /exec và Deploy Anyone.`,
      )
    }

    const text = await res.text().catch(() => '')
    if (isLikelyHtml(text)) {
      throw new HttpsError(
        'failed-precondition',
        'Apps Script trả trang đăng nhập Google. Deploy Web App: Execute as Me, Who has access Anyone, URL /exec.',
      )
    }
    if (!res.ok) {
      throw new HttpsError(
        'unknown',
        text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 280) ||
          `Drive ensure_folder lỗi (mã ${res.status}).`,
      )
    }

    let data: { ok?: boolean; folderUrl?: string; folderId?: string; error?: string }
    try {
      data = JSON.parse(text) as typeof data
    } catch {
      throw new HttpsError(
        'failed-precondition',
        'Apps Script không trả JSON. Mở Deploy → copy đúng link /exec rồi Lưu Cài đặt → Chứng từ.',
      )
    }
    if (!data.ok) {
      throw new HttpsError(
        'unknown',
        str(data.error) || 'Drive không tạo được thư mục giấy mời. Kiểm tra quyền folder gốc và token.',
      )
    }
    const folderUrl = str(data.folderUrl)
    const folderId = str(data.folderId)
    if (!folderUrl && !folderId) {
      throw new HttpsError('unknown', 'Apps Script không trả folderUrl/folderId.')
    }
    return {
      folderUrl: folderUrl || `https://drive.google.com/drive/folders/${folderId}`,
      folderId,
    }
  })

  return { ensureInviteDriveFolder }
}
