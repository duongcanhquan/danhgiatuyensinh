import type { AIIntegrationConfig, AIProviderId, AITask, Lead } from '../types'
import { leadSemanticFieldValue } from './leadSemanticFieldValue'

const LS_KEY = 'vietmy_ai_integration_v1'

/**
 * Proxy cùng origin (Vite dev + `vite preview` có sẵn `/openai-proxy`).
 * Hosting tĩnh (vd. GitHub Pages) cần reverse proxy cùng path, hoặc build với `VITE_OPENAI_PROXY_URL`.
 */
function defaultOpenAiProxyPath(): string {
  const base = String(import.meta.env.BASE ?? '/')
  const prefix = base === '/' ? '' : base.replace(/\/$/, '')
  return `${prefix}/openai-proxy/v1/chat/completions`
}

/** POST body tương thích OpenAI Chat Completions — ưu tiên proxy (cùng domain) để tránh CORS. */
export function getOpenAiChatCompletionsUrl(): string {
  const proxy = String(import.meta.env.VITE_OPENAI_PROXY_URL ?? '').trim()
  if (proxy) return proxy
  const legacy = String(import.meta.env.VITE_AI_API_URL ?? '').trim()
  if (legacy) return legacy
  return defaultOpenAiProxyPath()
}

export function explainOpenAiBrowserFetchError(err: unknown, endpoint: string): Error {
  const msg = err instanceof Error ? err.message : String(err)
  const looksLikeCorsOrNetwork =
    msg === 'Failed to fetch' ||
    msg.includes('Failed to fetch') ||
    msg.includes('NetworkError') ||
    msg.includes('Load failed') ||
    err instanceof TypeError
  const hittingOpenAiDirect = endpoint.includes('api.openai.com')
  if (looksLikeCorsOrNetwork && hittingOpenAiDirect) {
    return new Error(
      'Không gọi được OpenAI từ trình duyệt (thường là CORS: api.openai.com không cho trang web gọi trực tiếp). Cách xử lý: đặt trong file .env khi build biến VITE_OPENAI_PROXY_URL (hoặc VITE_AI_API_URL) trỏ tới endpoint proxy tương thích OpenAI trên cùng domain với app; hoặc chạy «npm run dev» — dev server đã kèm proxy /openai-proxy. Hoặc chuyển sang Gemini.',
      { cause: err },
    )
  }
  const hittingSameOriginProxy = endpoint.includes('/openai-proxy/')
  if (looksLikeCorsOrNetwork && hittingSameOriginProxy) {
    return new Error(
      'Không gọi được qua /openai-proxy (host chưa cấu hình proxy tới OpenAI, hoặc bạn đang xem bản build trên hosting tĩnh). Thử: «npm run dev» hoặc «npm run preview» (cả hai đều có proxy); build với VITE_OPENAI_PROXY_URL trỏ tới máy chủ proxy; hoặc trong Cài đặt → LLM chuyển sang Gemini.',
      { cause: err },
    )
  }
  return err instanceof Error ? err : new Error(msg)
}

async function fetchOpenAiChat(endpoint: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(endpoint, init)
  } catch (e) {
    throw explainOpenAiBrowserFetchError(e, endpoint)
  }
}

const DEFAULT_MODEL_BY_PROVIDER: Record<AIProviderId, string> = {
  Gemini: 'gemini-2.0-flash',
  OpenAI: 'gpt-4o-mini',
}

function normalizeStoredConfig(o: Partial<AIIntegrationConfig>): AIIntegrationConfig | null {
  if (o.provider !== 'Gemini' && o.provider !== 'OpenAI') return null
  const apiKey = String(o.apiKey ?? '').trim()
  if (!apiKey) return null
  const modelRaw = String(o.model ?? '').trim()
  const model = modelRaw || DEFAULT_MODEL_BY_PROVIDER[o.provider]
  return { provider: o.provider, apiKey, model }
}

export function loadAIConfigFromStorage(): AIIntegrationConfig | null {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) return null
    const o = JSON.parse(raw) as Partial<AIIntegrationConfig>
    return normalizeStoredConfig(o)
  } catch {
    return null
  }
}

/**
 * Cấu hình gọi LLM cho toàn app: **ưu tiên** Cài đặt → LLM (localStorage), sau đó biến môi trường Vite:
 * `VITE_AI_API_KEY`, tuỳ chọn `VITE_AI_PROVIDER` (`OpenAI` | `Gemini`), `VITE_AI_MODEL`.
 * Dùng chung cho Phân tích hồ sơ, AI Lead Miner, Phòng thử AI (qua `callOpenAiCompatibleChat`).
 */
export function resolveAIIntegrationConfig(): AIIntegrationConfig | null {
  const fromLs = loadAIConfigFromStorage()
  if (fromLs) return fromLs

  const apiKey = String(import.meta.env.VITE_AI_API_KEY ?? '').trim()
  if (!apiKey) return null

  const providerRaw = String(import.meta.env.VITE_AI_PROVIDER ?? 'OpenAI').trim()
  const provider: AIProviderId = providerRaw === 'Gemini' ? 'Gemini' : 'OpenAI'
  const modelRaw = String(import.meta.env.VITE_AI_MODEL ?? '').trim()
  const model = modelRaw || DEFAULT_MODEL_BY_PROVIDER[provider]
  return { provider, apiKey, model }
}

/** Lưu cấu hình LLM cục bộ (localStorage). Ném lỗi nếu trình duyệt chặn ghi. */
export function saveAIConfigToStorage(config: AIIntegrationConfig): void {
  const normalized = normalizeStoredConfig({
    ...config,
    apiKey: config.apiKey.trim(),
    model: config.model.trim(),
  })
  if (!normalized) {
    throw new Error('Cấu hình không hợp lệ: cần nhà cung cấp Gemini/OpenAI và API key.')
  }
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(normalized))
  } catch (e) {
    console.error(e)
    throw new Error(
      'Không ghi được localStorage (đầy bộ nhớ, chế độ ẩn danh, hoặc trình duyệt chặn). Thử tắt Private / dùng cửa sổ thường.',
      { cause: e },
    )
  }
}

export type IntegrationChatMessage = { role: 'system' | 'user' | 'assistant'; content: string }

/**
 * Chat tự do (không bắt JSON) — dùng Phòng thử AI khi đã lưu API trong Cài đặt → LLM.
 */
export async function callIntegrationChat(
  config: AIIntegrationConfig,
  messages: ReadonlyArray<IntegrationChatMessage>,
  signal?: AbortSignal,
): Promise<string> {
  if (!messages.length) throw new Error('Thiếu nội dung chat.')

  if (config.provider === 'OpenAI') {
    const endpoint = getOpenAiChatCompletionsUrl()
    const res = await fetchOpenAiChat(endpoint, {
      method: 'POST',
      signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        temperature: 0.4,
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
      }),
    })
    if (!res.ok) {
      const errText = await res.text()
      throw new Error(`OpenAI ${res.status}: ${errText.slice(0, 400)}`)
    }
    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[]
    }
    const text = data.choices?.[0]?.message?.content ?? ''
    if (!text) throw new Error('OpenAI: empty response')
    return text
  }

  const systemChunks: string[] = []
  const gemContents: { role: 'user' | 'model'; parts: { text: string }[] }[] = []
  for (const m of messages) {
    if (m.role === 'system') {
      systemChunks.push(m.content)
      continue
    }
    const role = m.role === 'assistant' ? 'model' : 'user'
    gemContents.push({ role, parts: [{ text: m.content }] })
  }
  if (gemContents.length && gemContents[0].role === 'model') {
    gemContents.unshift({ role: 'user', parts: [{ text: '(Tiếp nối hội thoại)' }] })
  }
  if (!gemContents.length) {
    gemContents.push({ role: 'user', parts: [{ text: '(Không có tin nhắn người dùng)' }] })
  }

  const sys = systemChunks.join('\n\n').trim()
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(config.model)}:generateContent?key=${encodeURIComponent(config.apiKey)}`
  const body: Record<string, unknown> = {
    contents: gemContents,
    generationConfig: { temperature: 0.4 },
  }
  if (sys) body.systemInstruction = { parts: [{ text: sys }] }

  const res = await fetch(url, {
    method: 'POST',
    signal,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`Gemini ${res.status}: ${errText.slice(0, 400)}`)
  }
  const data = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[]
  }
  const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? ''
  if (!text) throw new Error('Gemini: empty response')
  return text
}

function getLeadFieldValue(lead: Lead, field: string): unknown {
  const v = (lead as unknown as Record<string, unknown>)[field]
  if (v !== undefined && v !== null) {
    if (typeof v === 'object' && 'toDate' in (v as object)) {
      try {
        return (v as { toDate: () => Date }).toDate().toISOString()
      } catch {
        return String(v)
      }
    }
    return v
  }
  return leadSemanticFieldValue(lead, field)
}

/**
 * Trích dữ liệu lead theo `task.targetFields`. Các key không có trên `Lead` có thể truyền qua `fieldExtras`
 * (vd. `counselorNote` tổng hợp từ interactions).
 */
function buildTargetPayload(
  lead: Lead,
  task: AITask,
  fieldExtras: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const key of task.targetFields) {
    if (Object.prototype.hasOwnProperty.call(fieldExtras, key)) {
      out[key] = fieldExtras[key]
      continue
    }
    out[key] = getLeadFieldValue(lead, key)
  }
  return out
}

function schemaInstruction(schema: Record<string, string>): string {
  const lines = Object.entries(schema).map(([k, desc]) => `  "${k}": (${desc})`)
  return `{\n${lines.join(',\n')}\n}`
}

function buildUserContent(
  lead: Lead,
  task: AITask,
  fieldExtras: Record<string, unknown>,
): string {
  const payload = buildTargetPayload(lead, task, fieldExtras)
  const schema = schemaInstruction(task.expectedOutputSchema)
  return [
    '## Nhiệm vụ',
    task.userEmphasis.trim() || '(Không có nhấn mạnh thêm.)',
    '',
    '## Dữ liệu lead (JSON)',
    JSON.stringify(payload, null, 2),
    '',
    '## Đầu ra',
    'You must respond ONLY in valid JSON format exactly matching this schema (types are hints; values must be in Vietnamese where applicable):',
    schema,
    '',
    'Do not wrap in markdown. No prose before or after the JSON object.',
  ].join('\n')
}

function stripJsonFence(text: string): string {
  let t = text.trim()
  const fence = /^```(?:json)?\s*([\s\S]*?)```$/m
  const m = t.match(fence)
  if (m) t = m[1].trim()
  return t
}

async function callGemini(config: AIIntegrationConfig, system: string, user: string): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(config.model)}:generateContent?key=${encodeURIComponent(config.apiKey)}`
  const body = {
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: 'user', parts: [{ text: user }] }],
    generationConfig: {
      temperature: 0.2,
      responseMimeType: 'application/json',
    },
  }
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`Gemini ${res.status}: ${errText.slice(0, 400)}`)
  }
  const data = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[]
  }
  const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? ''
  if (!text) throw new Error('Gemini: empty response')
  return text
}

async function callOpenAI(config: AIIntegrationConfig, system: string, user: string): Promise<string> {
  const endpoint = getOpenAiChatCompletionsUrl()
  const res = await fetchOpenAiChat(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      temperature: 0.2,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    }),
  })
  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`OpenAI ${res.status}: ${errText.slice(0, 400)}`)
  }
  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[]
  }
  const text = data.choices?.[0]?.message?.content ?? ''
  if (!text) throw new Error('OpenAI: empty response')
  return text
}

const RAG_SYSTEM_SUFFIX = `

## Institutional knowledge (RAG — retrieval simulation)
You must base tuition amounts, fee schedules, dorm rules, admission policies, and program-specific facts STRICTLY on the following institutional context. If the user or lead data asks for a detail that is NOT present in this context, state clearly that the information is not in the verified knowledge base — do not invent tuition, dates, or policies.

### Verified context
`

/**
 * Chạy một `AITask` trên `lead`. `fieldExtras` dùng cho các trường không lưu trực tiếp trên Lead
 * (vd. `counselorNote` tổng hợp từ lịch sử tương tác).
 * `institutionalRagBlock`: nội dung từ `KnowledgeDocument` (Settings → Kho tri thức) — ghép vào system prompt.
 */
export async function runAIAnalysis(
  lead: Lead,
  task: AITask,
  config: AIIntegrationConfig,
  fieldExtras: Record<string, unknown> = {},
  options?: { institutionalRagBlock?: string },
): Promise<Record<string, unknown>> {
  const rag = options?.institutionalRagBlock?.trim()
  const system =
    task.systemPrompt.trim() +
    (rag ? `${RAG_SYSTEM_SUFFIX}${rag}\n\nYou must base your advice STRICTLY on the institutional context above. Do not invent tuition or policies.` : '')
  const user = buildUserContent(lead, task, fieldExtras)
  const raw =
    config.provider === 'Gemini'
      ? await callGemini(config, system, user)
      : await callOpenAI(config, system, user)
  const cleaned = stripJsonFence(raw)
  let parsed: unknown
  try {
    parsed = JSON.parse(cleaned)
  } catch {
    throw new Error('LLM did not return valid JSON.')
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('LLM JSON must be an object.')
  }
  return parsed as Record<string, unknown>
}

/**
 * Raw JSON text from the LLM (markdown fences stripped). For batch miners and custom flows.
 */
export async function invokeLlmJsonText(
  config: AIIntegrationConfig,
  systemPrompt: string,
  userPrompt: string,
): Promise<string> {
  const raw =
    config.provider === 'Gemini'
      ? await callGemini(config, systemPrompt, userPrompt)
      : await callOpenAI(config, systemPrompt, userPrompt)
  return stripJsonFence(raw)
}
