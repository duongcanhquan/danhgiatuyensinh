/** OMICall REST — POST /api/click2call (Bearer). */

import { omicallAuthHeaders } from './omicallHistoryApi.js'

function str(v: unknown): string {
  return String(v ?? '').trim()
}

function asObject(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {}
}

const ERROR_MESSAGES: Record<string, string> = {
  data_is_required: 'Thiếu thông tin gọi — kiểm tra số nội bộ, đầu số và SĐT khách.',
  tenant_invalid: 'Doanh nghiệp không hợp lệ trên OMICall.',
  user_not_registered:
    'Số nội bộ chưa ghi danh Softphone / Web / IP phone — cấu hình trên OMICall → Tổng đài.',
  number_call_out_invalid: 'Đầu số gọi ra không hợp lệ hoặc TVV không được phép dùng đầu số này.',
  extension_invalid: 'Số nội bộ không tồn tại hoặc đang ngưng hoạt động.',
  user_busy: 'Số khách đang bận.',
  do_not_call: 'Số khách đăng ký không làm phiền (DNC).',
}

export type Click2CallRequest = {
  extension: string
  hotline: string
  phoneNumber: string
}

export type Click2CallResult = {
  callUuid: string
  rawPayload: Record<string, unknown>
}

function click2CallErrorMessage(payload: Record<string, unknown>, statusCode: number): string {
  const code = str(payload.error).toLowerCase()
  const msg = str(payload.message)
  if (code && ERROR_MESSAGES[code]) return ERROR_MESSAGES[code]
  if (msg) return msg
  if (statusCode && statusCode !== 9999) return `OMICall từ chối gọi (mã ${statusCode}).`
  return 'Không thực hiện được click-to-call.'
}

export async function omicallClick2Call(
  baseUrl: string,
  apiKey: string,
  req: Click2CallRequest,
): Promise<Click2CallResult> {
  const extension = str(req.extension)
  const hotline = str(req.hotline)
  const phone_number = str(req.phoneNumber)
  if (!extension || !hotline || !phone_number) {
    throw new Error(ERROR_MESSAGES.data_is_required)
  }

  const url = new URL('/api/click2call', baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`)
  const res = await fetch(url.toString(), {
    method: 'POST',
    headers: omicallAuthHeaders(apiKey),
    body: JSON.stringify({ extension, hotline, phone_number }),
  })
  const text = await res.text()
  let data: Record<string, unknown> = {}
  try {
    data = text ? (JSON.parse(text) as Record<string, unknown>) : {}
  } catch {
    throw new Error(`OMICall click2call trả về không phải JSON (${res.status}).`)
  }
  if (!res.ok) {
    const payload = asObject(data.payload)
    throw new Error(click2CallErrorMessage(payload, Number(data.status_code ?? res.status)))
  }
  const statusCode = Number(data.status_code ?? 0)
  const payload = asObject(data.payload)
  if (statusCode && statusCode !== 9999) {
    throw new Error(click2CallErrorMessage(payload, statusCode))
  }
  const callUuid = str(payload.call_uuid) || str(payload.callUuid)
  if (!callUuid) {
    throw new Error('OMICall không trả về mã cuộc gọi (call_uuid).')
  }
  return { callUuid, rawPayload: payload }
}
