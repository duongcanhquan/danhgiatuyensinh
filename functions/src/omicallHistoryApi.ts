/** OmiCall REST — lịch sử cuộc gọi v2/v3 (tài liệu OmiCall API). */

export type OmicallHistoryApiVersion = 'v3' | 'v2'

export type OmicallHistorySearchOpts = {
  fromMs: number
  toMs: number
  apiVersion?: OmicallHistoryApiVersion
  agentIds?: string[]
  sipUsers?: string[]
  directions?: ('outbound' | 'inbound' | 'local')[]
  isAnswer?: boolean
}

export type OmicallHistoryPageResult = {
  items: Record<string, unknown>[]
  pageNumber: number
  hasNext: boolean
  totalItems?: number
  statusCode?: number
}

function asObject(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {}
}

function str(v: unknown): string {
  return String(v ?? '').trim()
}

function num(v: unknown): number {
  const n = Number(v ?? 0)
  return Number.isFinite(n) ? n : 0
}

export function omicallAuthHeaders(apiKey: string): Record<string, string> {
  return {
    'content-type': 'application/json',
    'x-api-key': apiKey,
    Authorization: `Bearer ${apiKey}`,
  }
}

/** v3: POST /api/v3/call-transaction/search?page=&size=50 — body filter.fromDate/toDate (ms). */
export function buildV3SearchBody(opts: OmicallHistorySearchOpts): Record<string, unknown> {
  const filter: Record<string, unknown> = {
    fromDate: opts.fromMs,
    toDate: opts.toMs,
  }
  if (opts.directions?.length) filter.directions = opts.directions
  if (opts.sipUsers?.length) filter.sipUsers = opts.sipUsers
  if (opts.agentIds?.length) filter.agentIds = opts.agentIds
  if (opts.isAnswer !== undefined) filter.isAnswer = opts.isAnswer
  return {
    filter,
    sort: { field: 'time_start_call', isAsc: false },
  }
}

/** v2: POST /api/v2/callTransaction/search?page=&size=50 — body fromDate/toDate (ms). */
export function buildV2SearchBody(opts: OmicallHistorySearchOpts): Record<string, unknown> {
  const body: Record<string, unknown> = {
    fromDate: opts.fromMs,
    toDate: opts.toMs,
  }
  if (opts.directions?.length) body.directions = opts.directions
  if (opts.sipUsers?.length) body.sipUsers = opts.sipUsers
  if (opts.agentIds?.length) body.agentUuids = opts.agentIds
  if (opts.isAnswer !== undefined) body.isAnswer = opts.isAnswer
  return body
}

export function rowsFromHistoryResponse(data: Record<string, unknown>): Record<string, unknown>[] {
  for (const key of ['items', 'data', 'rows']) {
    const root = data[key]
    if (Array.isArray(root)) return root.map(asObject)
  }
  const payload = asObject(data.payload)
  for (const key of ['items', 'data', 'rows', 'docs']) {
    const arr = payload[key]
    if (Array.isArray(arr)) return arr.map(asObject)
  }
  return []
}

export function pageMetaFromHistoryResponse(
  data: Record<string, unknown>,
  page: number,
  pageSize: number,
  itemCount: number,
): Pick<OmicallHistoryPageResult, 'pageNumber' | 'hasNext' | 'totalItems'> {
  const payload = asObject(data.payload)
  const pageNumber = num(data.page_number ?? data.pageNumber ?? payload.page_number ?? payload.pageNumber ?? page)
  const totalItems = num(data.total_items ?? data.totalItems ?? payload.total_items ?? payload.totalItems)
  const hasNextRaw = data.has_next ?? data.hasNext ?? payload.has_next ?? payload.hasNext
  const hasNext =
    hasNextRaw === true ||
    (totalItems > 0 && pageNumber * pageSize < totalItems) ||
    (hasNextRaw === undefined && itemCount >= pageSize)
  return { pageNumber, hasNext, totalItems: totalItems || undefined }
}

export async function fetchOmicallHistoryPage(
  baseUrl: string,
  apiKey: string,
  page: number,
  opts: OmicallHistorySearchOpts,
  pageSize = 50,
): Promise<OmicallHistoryPageResult> {
  const version = opts.apiVersion ?? 'v3'
  const root = baseUrl.replace(/\/$/, '')
  const path =
    version === 'v2'
      ? `/api/v2/callTransaction/search?page=${page}&size=${pageSize}`
      : `/api/v3/call-transaction/search?page=${page}&size=${pageSize}`
  const body = version === 'v2' ? buildV2SearchBody(opts) : buildV3SearchBody(opts)
  const resp = await fetch(`${root}${path}`, {
    method: 'POST',
    headers: omicallAuthHeaders(apiKey),
    body: JSON.stringify(body),
  })
  if (!resp.ok) {
    const text = await resp.text().catch(() => '')
    throw new Error(`OMICall history HTTP ${resp.status}${text ? `: ${text.slice(0, 200)}` : ''}`)
  }
  const data = (await resp.json()) as Record<string, unknown>
  const items = rowsFromHistoryResponse(data)
  const meta = pageMetaFromHistoryResponse(data, page, pageSize, items.length)
  return {
    items,
    ...meta,
    statusCode: num(data.status_code ?? data.statusCode),
  }
}

/** Parse `user_data_str` / userData từ SDK — chứa leadId CRM. */
export function parseOmicallUserDataLeadId(raw: Record<string, unknown>): string | undefined {
  const candidates = [raw.user_data_str, raw.userData, raw.user_data, raw.userDataStr]
  for (const c of candidates) {
    if (!c) continue
    if (typeof c === 'object') {
      const o = c as Record<string, unknown>
      const leadId = str(o.leadId ?? o.lead_id)
      if (leadId) return leadId
      continue
    }
    const s = str(c)
    if (!s) continue
    try {
      const o = JSON.parse(s) as Record<string, unknown>
      const leadId = str(o.leadId ?? o.lead_id)
      if (leadId) return leadId
    } catch {
      /* ignore */
    }
  }
  return undefined
}

export function extractAgentFromCall(raw: Record<string, unknown>): {
  agentId?: string
  agentName?: string
  agentContactId?: string
} {
  const createBy = asObject(raw.create_by ?? raw.createBy)
  return {
    agentId: str(createBy.id) || undefined,
    agentName: str(createBy.name) || undefined,
    agentContactId: str(createBy.contact_id ?? createBy.contactId) || undefined,
  }
}

export function extractCustomerName(raw: Record<string, unknown>): string | undefined {
  const customer = asObject(raw.customer)
  return str(customer.full_name ?? customer.fullName) || undefined
}
