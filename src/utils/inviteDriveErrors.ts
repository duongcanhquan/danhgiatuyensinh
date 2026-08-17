/** Nhận diện URL Apps Script /dev — chỉ chạy khi chủ script đang đăng nhập Google. */
export function isAppsScriptDevUrl(url: string): boolean {
  return /\/dev(?:\?|$)/i.test(String(url).trim())
}

export function isLikelyHtmlBody(text: string): boolean {
  const t = String(text ?? '').trim()
  if (!t) return false
  return /<!DOCTYPE html|<html[\s>]|accounts\.google\.com|Sign in – Google/i.test(t)
}

/**
 * Lỗi gọi Apps Script từ trình duyệt — khác máy vì CORS, cookie Google, /dev, hoặc mạng.
 */
export function explainAppsScriptClientFailure(raw: unknown): string {
  const msg = raw instanceof Error ? raw.message : String(raw ?? '')
  const lower = msg.toLocaleLowerCase('vi')
  if (/failed to fetch|networkerror|load failed|err_blocked|blocked by client/i.test(msg)) {
    return (
      'Máy này không gọi được Apps Script Drive (thường do CORS, chặn quảng cáo, hoặc Web App chưa «Anyone»). ' +
      'Cần Deploy Web App: Execute as Me, Who has access Anyone, URL đuôi /exec — rồi Lưu lại Cài đặt → Chứng từ.'
    )
  }
  if (/abort|timeout|quá lâu|hết thời gian/i.test(lower)) {
    return 'Apps Script Drive trả lời quá chậm. Thử lại; nếu máy khác vẫn được thì kiểm tra mạng/firewall máy này.'
  }
  return msg.trim() || 'Không gọi được Apps Script Drive.'
}

export function explainAppsScriptResponseBody(text: string, httpStatus: number): string {
  const t = String(text ?? '').trim()
  if (isLikelyHtmlBody(t)) {
    return (
      'Apps Script trả trang đăng nhập Google thay vì JSON. Web App đang dùng URL /dev hoặc quyền «Only myself». ' +
      'Deploy lại: Execute as Me, Anyone, copy link /exec.'
    )
  }
  if (!t) return `Drive ensure_folder lỗi (mã ${httpStatus}).`
  try {
    const data = JSON.parse(t) as { error?: string; message?: string; ok?: boolean }
    const err = String(data.error || data.message || '').trim()
    if (err) return err.slice(0, 400)
  } catch {
    /* not JSON */
  }
  return t.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 280)
}

/** n8n / webhook: đừng hiện HTML dài thành «lỗi thứ hai». */
export function userFacingWebhookBodyError(text: string, status: number, fallback: string): string {
  const t = String(text ?? '').trim()
  if (!t) return `${fallback} (mã ${status}).`
  if (isLikelyHtmlBody(t)) {
    return `${fallback} — máy chủ trả HTML (sai URL webhook, CORS, hoặc bị chặn trên máy này).`
  }
  try {
    const data = JSON.parse(t) as { error?: string; message?: string; msg?: string }
    const err = String(data.error || data.message || data.msg || '').trim()
    if (err) return err.slice(0, 400)
  } catch {
    /* not JSON */
  }
  const plain = t.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
  return (plain || fallback).slice(0, 400)
}

export function combineInvitationErrors(folderWarning: string | undefined, n8nError: string): string {
  const n8n = n8nError.trim() || 'Không gửi được yêu cầu giấy mời sang n8n.'
  const folder = folderWarning?.trim()
  if (!folder) return n8n
  return `${n8n} Đồng thời chưa tạo được thư mục Drive: ${folder}`
}

export function sanitizeDriveFolderName(input: string): string {
  const cleaned = String(input ?? '')
    .replace(/[^\w.\-()À-ỹ\s]/gi, '_')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^[_.]+|[_.]+$/g, '')
    .slice(0, 120)
  return cleaned || 'HoSo'
}
