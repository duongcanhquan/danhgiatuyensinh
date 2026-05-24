/** OmiCall REST — Tổng đài (call_center/*) theo tài liệu OmiCall API. */

import { omicallAuthHeaders } from './omicallHistoryApi.js'

function str(v: unknown): string {
  return String(v ?? '').trim()
}

function asObject(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {}
}

async function omicallGetJson(
  baseUrl: string,
  apiKey: string,
  path: string,
  query?: Record<string, string | number | undefined>,
): Promise<Record<string, unknown>> {
  const url = new URL(path.replace(/^\//, ''), baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`)
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== '') url.searchParams.set(k, String(v))
    }
  }
  const res = await fetch(url.toString(), {
    method: 'GET',
    headers: omicallAuthHeaders(apiKey),
  })
  const text = await res.text()
  let data: Record<string, unknown> = {}
  try {
    data = text ? (JSON.parse(text) as Record<string, unknown>) : {}
  } catch {
    throw new Error(`OMICall ${path} trả về không phải JSON (${res.status}).`)
  }
  if (!res.ok) {
    throw new Error(`OMICall ${path} lỗi HTTP ${res.status}: ${str(data.message ?? text).slice(0, 200)}`)
  }
  const statusCode = Number(data.status_code ?? 0)
  if (statusCode && statusCode !== 9999) {
    throw new Error(`OMICall ${path} status_code=${statusCode}`)
  }
  return data
}

export type OmicallInternalPhoneRow = {
  domain: string
  outboundProxy: string
  sipUser: string
  sipPassword: string
  fullName: string
  agentId: string
  email: string
  publicNumber: string
}

export type OmicallExtensionDetail = {
  extension: string
  fullName: string
  email: string
  sipRealm: string
  sipUser: string
  sipPassword: string
  sipWebSocketServer: string
  sipProxy: string
}

function mapInternalPhoneRow(raw: Record<string, unknown>): OmicallInternalPhoneRow {
  return {
    domain: str(raw.domain),
    outboundProxy: str(raw.outbound_proxy),
    sipUser: str(raw.sip_user),
    sipPassword: str(raw.password),
    fullName: str(raw.full_name),
    agentId: str(raw.agent_id),
    email: str(raw.email).toLowerCase(),
    publicNumber: str(raw.public_number),
  }
}

export async function fetchInternalPhoneList(
  baseUrl: string,
  apiKey: string,
  opts?: { keyword?: string; page?: number; size?: number },
): Promise<{ items: OmicallInternalPhoneRow[]; totalItems: number; pageNumber: number; hasNext: boolean }> {
  const data = await omicallGetJson(baseUrl, apiKey, '/api/call_center/internal_phone/list', {
    keyword: opts?.keyword,
    page: opts?.page ?? 1,
    size: Math.min(50, Math.max(1, opts?.size ?? 50)),
  })
  const payload = asObject(data.payload)
  const itemsRaw = Array.isArray(payload.items) ? payload.items : []
  return {
    items: itemsRaw.map((r) => mapInternalPhoneRow(asObject(r))),
    totalItems: Number(payload.total_items ?? itemsRaw.length) || itemsRaw.length,
    pageNumber: Number(payload.page_number ?? opts?.page ?? 1) || 1,
    hasNext: payload.has_next === true,
  }
}

/** Lấy toàn bộ số nội bộ (phân trang tự động, max 50 trang). */
export async function fetchAllInternalPhones(
  baseUrl: string,
  apiKey: string,
  opts?: { keyword?: string; maxPages?: number },
): Promise<OmicallInternalPhoneRow[]> {
  const maxPages = Math.min(50, Math.max(1, opts?.maxPages ?? 20))
  const all: OmicallInternalPhoneRow[] = []
  for (let page = 1; page <= maxPages; page++) {
    const result = await fetchInternalPhoneList(baseUrl, apiKey, {
      keyword: opts?.keyword,
      page,
      size: 50,
    })
    all.push(...result.items)
    if (!result.hasNext || result.items.length === 0) break
    if (all.length >= result.totalItems) break
  }
  return all
}

export async function fetchHotlineListForExtension(
  baseUrl: string,
  apiKey: string,
  extension: string,
): Promise<string[]> {
  const data = await omicallGetJson(baseUrl, apiKey, '/api/call_center/hotline/list', {
    extension: extension.trim(),
  })
  const payload = data.payload
  if (Array.isArray(payload)) return payload.map((n) => str(n)).filter(Boolean)
  return []
}

export async function fetchExtensionDetail(
  baseUrl: string,
  apiKey: string,
  type: 'sip_user' | 'user_email' | 'usr_uuid',
  keyword: string,
): Promise<OmicallExtensionDetail | null> {
  const data = await omicallGetJson(baseUrl, apiKey, '/api/call_center/extensions/detail', {
    type,
    keyword: keyword.trim(),
  })
  const payload = asObject(data.payload)
  if (!Object.keys(payload).length) return null
  const pbx = asObject(payload.pbx_account)
  return {
    extension: str(payload.extension),
    fullName: str(payload.full_name),
    email: str(payload.mail).toLowerCase(),
    sipRealm: str(pbx.sip_realm),
    sipUser: str(pbx.sip_user),
    sipPassword: str(pbx.sip_password),
    sipWebSocketServer: str(pbx.sip_web_socket_server),
    sipProxy: str(pbx.sip_proxy),
  }
}
