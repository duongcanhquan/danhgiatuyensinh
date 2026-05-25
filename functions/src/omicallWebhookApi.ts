/** Đăng ký webhook cuộc gọi trên OMICall — POST /api/webhooks/register */

import { omicallAuthHeaders } from './omicallHistoryApi.js'

function str(v: unknown): string {
  return String(v ?? '').trim()
}

function asObject(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {}
}

export async function registerOmicallCallWebhook(
  baseUrl: string,
  apiKey: string,
  webhookUrl: string,
): Promise<{ ok: boolean; message: string }> {
  const url = new URL('/api/webhooks/register', baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`)
  const res = await fetch(url.toString(), {
    method: 'POST',
    headers: omicallAuthHeaders(apiKey),
    body: JSON.stringify({
      webhook: {
        type: 'call',
        url: webhookUrl,
        events: ['ringing', 'answered', 'hangup'],
      },
    }),
  })
  const text = await res.text()
  let data: Record<string, unknown> = {}
  try {
    data = text ? (JSON.parse(text) as Record<string, unknown>) : {}
  } catch {
    throw new Error(`OMICall webhooks/register không phải JSON (${res.status}).`)
  }
  if (!res.ok) {
    const payload = asObject(data.payload)
    throw new Error(str(payload.message ?? data.message ?? text).slice(0, 300) || `HTTP ${res.status}`)
  }
  const statusCode = Number(data.status_code ?? 0)
  if (statusCode && statusCode !== 9999) {
    const payload = asObject(data.payload)
    throw new Error(str(payload.message ?? payload.error ?? `status_code=${statusCode}`))
  }
  return { ok: true, message: 'Đã đăng ký webhook cuộc gọi trên OMICall.' }
}
