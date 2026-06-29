import type { AIIntegrationConfig, AIProviderId, AITask, Lead } from '../types'
import { leadSemanticFieldValue } from './leadSemanticFieldValue'

let cachedOrgAiConfig: AIIntegrationConfig | null = null

/** Ghi cache cấu hình AI toàn trường (Firestore) — gọi từ OrgAiIntegrationProvider. */
export function setOrgAiIntegrationCache(cfg: AIIntegrationConfig | null): void {
  cachedOrgAiConfig = cfg
}

function getCachedOrgAiIntegration(): AIIntegrationConfig | null {
  return cachedOrgAiConfig
}

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

function defaultDeepSeekProxyPath(): string {
  const base = String(import.meta.env.BASE ?? '/')
  const prefix = base === '/' ? '' : base.replace(/\/$/, '')
  return `${prefix}/deepseek-proxy/v1/chat/completions`
}

/** Trình duyệt không được POST thẳng tới api.openai.com (CORS). Nhiều .env/gh-actions nhầm đặt proxy = URL OpenAI gốc. */
function isDirectOpenAiApiUrl(url: string): boolean {
  const t = url.trim()
  if (!t) return false
  try {
    const base = typeof window !== 'undefined' ? window.location.origin : 'http://localhost'
    const u = new URL(t, base)
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return false
    return u.hostname === 'api.openai.com'
  } catch {
    return false
  }
}

function isDirectDeepSeekApiUrl(url: string): boolean {
  const t = url.trim()
  if (!t) return false
  try {
    const base = typeof window !== 'undefined' ? window.location.origin : 'http://localhost'
    const u = new URL(t, base)
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return false
    return u.hostname === 'api.deepseek.com'
  } catch {
    return false
  }
}

/** POST body tương thích OpenAI Chat Completions — ưu tiên proxy (cùng domain) để tránh CORS. */
export function getOpenAiChatCompletionsUrl(): string {
  const proxy = String(import.meta.env.VITE_OPENAI_PROXY_URL ?? '').trim()
  if (proxy && !isDirectOpenAiApiUrl(proxy)) return proxy
  const legacy = String(import.meta.env.VITE_AI_API_URL ?? '').trim()
  if (legacy && !isDirectOpenAiApiUrl(legacy)) return legacy
  return defaultOpenAiProxyPath()
}

/** DeepSeek dùng API OpenAI-compatible — proxy cùng origin khi dev/preview. */
export function getDeepSeekChatCompletionsUrl(): string {
  const proxy = String(import.meta.env.VITE_DEEPSEEK_PROXY_URL ?? '').trim()
  if (proxy && !isDirectDeepSeekApiUrl(proxy)) return proxy
  return defaultDeepSeekProxyPath()
}

export type AiConfigSource = 'firestore' | 'localStorage' | 'env' | 'none'

export type AiIntegrationDiagnostics = {
  source: AiConfigSource
  provider: AIProviderId | null
  model: string | null
  apiKeyPresent: boolean
  chatEndpoint: string | null
  usesSameOriginProxy: boolean
  warning: string | null
}

export function resolveAiConfigSource(): AiConfigSource {
  if (getCachedOrgAiIntegration()) return 'firestore'
  if (loadAIConfigFromStorage()) return 'localStorage'
  if (String(import.meta.env.VITE_AI_API_KEY ?? '').trim()) return 'env'
  return 'none'
}

export function getAiIntegrationDiagnostics(): AiIntegrationDiagnostics {
  const cfg = resolveAIIntegrationConfig()
  if (!cfg) {
    return {
      source: 'none',
      provider: null,
      model: null,
      apiKeyPresent: false,
      chatEndpoint: null,
      usesSameOriginProxy: false,
      warning: 'Chưa có API key — Siêu quản trị lưu trong Cài đặt → LLM (Firestore toàn trường) hoặc đặt VITE_AI_API_KEY trên server build.',
    }
  }
  const source = resolveAiConfigSource()
  let chatEndpoint: string | null = null
  let usesSameOriginProxy = false
  let warning: string | null = null

  if (isOpenAiCompatibleProvider(cfg.provider)) {
    chatEndpoint = chatCompletionsUrl(cfg.provider)
    usesSameOriginProxy =
      chatEndpoint.includes('/openai-proxy/') || chatEndpoint.includes('/deepseek-proxy/')
    if (cfg.provider === 'DeepSeek' && isDirectDeepSeekApiUrl(chatEndpoint)) {
      warning =
        'URL DeepSeek trỏ thẳng api.deepseek.com — trình duyệt sẽ bị CORS. Xóa VITE_DEEPSEEK_PROXY_URL sai hoặc dùng /deepseek-proxy trên cùng domain.'
    }
    if (cfg.provider === 'OpenAI' && isDirectOpenAiApiUrl(chatEndpoint)) {
      warning =
        'URL OpenAI trỏ thẳng api.openai.com — trình duyệt sẽ bị CORS. Xóa VITE_OPENAI_PROXY_URL sai hoặc dùng /openai-proxy trên cùng domain.'
    }
    if (!usesSameOriginProxy && !warning && cfg.provider === 'DeepSeek') {
      warning = null
    }
    if (usesSameOriginProxy && typeof window !== 'undefined') {
      const host = window.location.hostname
      const isLocal = host === 'localhost' || host === '127.0.0.1'
      if (!isLocal && !import.meta.env.VITE_DEEPSEEK_PROXY_URL && !import.meta.env.VITE_OPENAI_PROXY_URL) {
        warning =
          'Đang dùng proxy cùng domain (/deepseek-proxy hoặc /openai-proxy). Trên Vercel cần rewrite proxy trong vercel.json; hosting tĩnh khác cần VITE_*_PROXY_URL.'
      }
    }
  } else {
    chatEndpoint = `generativelanguage.googleapis.com (model ${cfg.model})`
  }

  if (source === 'firestore') {
    warning = [
      warning,
      'Đang dùng khóa API lưu trên Firestore (cấu hình toàn trường — mọi TVV được bật quyền AI dùng chung).',
    ]
      .filter(Boolean)
      .join(' ')
  }

  if (source === 'localStorage' && String(import.meta.env.VITE_AI_API_KEY ?? '').trim()) {
    warning = [
      warning,
      'Trình duyệt đang ưu tiên khóa đã lưu localStorage (che biến VITE_AI_* trên server). Xóa bản lưu cũ nếu muốn dùng cấu hình server.',
    ]
      .filter(Boolean)
      .join(' ')
  }

  return {
    source,
    provider: cfg.provider,
    model: cfg.model,
    apiKeyPresent: Boolean(cfg.apiKey.trim()),
    chatEndpoint,
    usesSameOriginProxy,
    warning,
  }
}

export type OpenAiCompatibleProvider = 'OpenAI' | 'DeepSeek'

export function isOpenAiCompatibleProvider(provider: AIProviderId): provider is OpenAiCompatibleProvider {
  return provider === 'OpenAI' || provider === 'DeepSeek'
}

function chatCompletionsUrl(provider: OpenAiCompatibleProvider): string {
  return provider === 'DeepSeek' ? getDeepSeekChatCompletionsUrl() : getOpenAiChatCompletionsUrl()
}

function providerHttpLabel(provider: OpenAiCompatibleProvider): string {
  return provider === 'DeepSeek' ? 'DeepSeek' : 'OpenAI'
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
  const hittingDeepSeekDirect = endpoint.includes('api.deepseek.com')
  if (looksLikeCorsOrNetwork && hittingDeepSeekDirect) {
    return new Error(
      'Không gọi được DeepSeek từ trình duyệt (CORS: api.deepseek.com không cho web gọi trực tiếp). Xóa URL proxy sai trỏ tới api.deepseek.com; để trống VITE_DEEPSEEK_PROXY_URL để dùng /deepseek-proxy cùng domain (npm run dev, npm run preview, hoặc Vercel có rewrite proxy). Hoặc chọn Gemini trong Cài đặt → LLM.',
      { cause: err },
    )
  }
  if (looksLikeCorsOrNetwork && hittingOpenAiDirect) {
    return new Error(
      'Không gọi được OpenAI từ trình duyệt (thường là CORS: api.openai.com không cho trang web gọi trực tiếp). Kiểm tra: VITE_OPENAI_PROXY_URL / VITE_AI_API_URL không được trỏ tới https://api.openai.com — hãy xóa hoặc đổi sang máy chủ proxy thật (Cloud Function, v.v.). Nếu không cần URL riêng, xóa biến để app dùng đường /openai-proxy cùng domain; «npm run dev» / «npm run preview» có sẵn proxy. Hoặc chuyển sang Gemini trong Cài đặt → LLM.',
      { cause: err },
    )
  }
  const hittingSameOriginProxy = endpoint.includes('/openai-proxy/') || endpoint.includes('/deepseek-proxy/')
  if (looksLikeCorsOrNetwork && hittingSameOriginProxy) {
    const which = endpoint.includes('/deepseek-proxy/')
      ? 'DeepSeek (/deepseek-proxy)'
      : endpoint.includes('/openai-proxy/')
        ? 'OpenAI (/openai-proxy)'
        : 'LLM'
    return new Error(
      `Không gọi được qua proxy ${which} trên host hiện tại (host chưa cấu hình reverse proxy). Thử: «npm run dev» / «npm run preview»; trên Vercel cần rewrite trong vercel.json; hoặc build với VITE_DEEPSEEK_PROXY_URL / VITE_OPENAI_PROXY_URL trỏ tới máy chủ proxy. Hoặc chọn Gemini trong Cài đặt → LLM.`,
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
  DeepSeek: 'deepseek-chat',
}

function normalizeStoredConfig(o: Partial<AIIntegrationConfig>): AIIntegrationConfig | null {
  if (o.provider !== 'Gemini' && o.provider !== 'OpenAI' && o.provider !== 'DeepSeek') return null
  const apiKey = String(o.apiKey ?? '').trim()
  if (!apiKey) return null
  const modelRaw = String(o.model ?? '').trim()
  const model = modelRaw || DEFAULT_MODEL_BY_PROVIDER[o.provider]
  return { provider: o.provider, apiKey, model }
}

/** Parse cấu hình AI từ Firestore / form / localStorage. */
export function parseAiIntegrationConfig(o: Partial<AIIntegrationConfig>): AIIntegrationConfig | null {
  return normalizeStoredConfig(o)
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
 * Cấu hình gọi LLM cho toàn app — thứ tự ưu tiên:
 * 1. Firestore `scoringAux/orgAiIntegration` (Siêu quản trị lưu — **cả team dùng chung**)
 * 2. Biến môi trường Vite: `VITE_AI_API_KEY`, `VITE_AI_PROVIDER`, `VITE_AI_MODEL`
 * 3. Cài đặt → LLM trên trình duyệt (localStorage — chỉ máy đó)
 */
export function resolveAIIntegrationConfig(): AIIntegrationConfig | null {
  const fromOrg = getCachedOrgAiIntegration()
  if (fromOrg) return fromOrg

  const apiKey = String(import.meta.env.VITE_AI_API_KEY ?? '').trim()
  if (apiKey) {
    const providerRaw = String(import.meta.env.VITE_AI_PROVIDER ?? 'OpenAI').trim()
    const provider: AIProviderId =
      providerRaw === 'Gemini' ? 'Gemini' : providerRaw === 'DeepSeek' ? 'DeepSeek' : 'OpenAI'
    const modelRaw = String(import.meta.env.VITE_AI_MODEL ?? '').trim()
    const model = modelRaw || DEFAULT_MODEL_BY_PROVIDER[provider]
    return { provider, apiKey, model }
  }

  const fromLs = loadAIConfigFromStorage()
  if (fromLs) return fromLs

  return null
}

export function saveAIConfigToStorage(config: AIIntegrationConfig): void {
  const normalized = normalizeStoredConfig({
    ...config,
    apiKey: config.apiKey.trim(),
    model: config.model.trim(),
  })
  if (!normalized) {
    throw new Error('Cấu hình không hợp lệ: cần nhà cung cấp Gemini/OpenAI/DeepSeek và API key.')
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

/** Xóa cấu hình LLM đã lưu trên trình duyệt (để dùng lại biến VITE_AI_* từ server). */
export function clearAIConfigFromStorage(): void {
  try {
    localStorage.removeItem(LS_KEY)
  } catch {
    /* ignore */
  }
}

export type IntegrationChatMessage = { role: 'system' | 'user' | 'assistant'; content: string }

/** Chat tự do (không bắt JSON) — dùng khi cần hội thoại ngoài tác vụ có schema. */
export async function callIntegrationChat(
  config: AIIntegrationConfig,
  messages: ReadonlyArray<IntegrationChatMessage>,
  signal?: AbortSignal,
): Promise<string> {
  if (!messages.length) throw new Error('Thiếu nội dung chat.')

  if (isOpenAiCompatibleProvider(config.provider)) {
    const endpoint = chatCompletionsUrl(config.provider)
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
      throw new Error(`${providerHttpLabel(config.provider)} ${res.status}: ${errText.slice(0, 400)}`)
    }
    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[]
    }
    const text = data.choices?.[0]?.message?.content ?? ''
    if (!text) throw new Error(`${providerHttpLabel(config.provider)}: empty response`)
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
    'Trả lời CHỈ bằng JSON hợp lệ đúng schema sau (giá trị văn bản bằng tiếng Việt):',
    schema,
    '',
    'Không bọc markdown. Không thêm lời dẫn trước/sau object JSON.',
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

async function callOpenAiCompatibleJson(
  config: AIIntegrationConfig & { provider: OpenAiCompatibleProvider },
  system: string,
  user: string,
): Promise<string> {
  const endpoint = chatCompletionsUrl(config.provider)
  const body: Record<string, unknown> = {
    model: config.model,
    temperature: 0.2,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
  }
  // DeepSeek / OpenAI JSON mode — prompt phải nhắc JSON (đã có trong system/user của app).
  if (!config.model.includes('reasoner')) {
    body.response_format = { type: 'json_object' }
  }
  const res = await fetchOpenAiChat(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`${providerHttpLabel(config.provider)} ${res.status}: ${errText.slice(0, 400)}`)
  }
  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[]
  }
  const text = data.choices?.[0]?.message?.content ?? ''
  if (!text) throw new Error(`${providerHttpLabel(config.provider)}: empty response`)
  return text
}

async function callOpenAI(config: AIIntegrationConfig, system: string, user: string): Promise<string> {
  if (config.provider !== 'OpenAI' && config.provider !== 'DeepSeek') {
    throw new Error('callOpenAI: provider không tương thích OpenAI')
  }
  return callOpenAiCompatibleJson({ ...config, provider: config.provider }, system, user)
}

const RAG_SYSTEM_SUFFIX = `

## Tri thức nhà trường (đã duyệt — bắt buộc tham chiếu)
Mọi con số học phí, lệ phí, quy chế tuyển sinh, điều kiện ngành, thời hạn… phải lấy từ khối dưới đây.
Nếu thí sinh hỏi chi tiết không có trong khối này, ghi rõ «chưa có trong kho tri thức đã duyệt» — không được bịa.

### Nội dung đã duyệt
`

const PLAYBOOK_SYSTEM_SUFFIX = `

## Playbook tư vấn khớp hồ sơ (nội dung soạn sẵn — tham khảo, không thay tri thức chính thức)
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
  options?: { institutionalRagBlock?: string; playbookContextBlock?: string },
): Promise<Record<string, unknown>> {
  const rag = options?.institutionalRagBlock?.trim()
  const playbook = options?.playbookContextBlock?.trim()
  let system = task.systemPrompt.trim()
  if (playbook) {
    system += `${PLAYBOOK_SYSTEM_SUFFIX}${playbook}`
  }
  if (rag) {
    system += `${RAG_SYSTEM_SUFFIX}${rag}`
  }
  if (!rag) {
    system +=
      '\n\nLưu ý: Kho tri thức nhà trường hiện trống hoặc chưa nạp — không khẳng định học phí/quy chế cụ thể; đề xuất TVV tra cứu tài liệu nội bộ.'
  }
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
