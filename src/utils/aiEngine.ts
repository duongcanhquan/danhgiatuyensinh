import type { AIIntegrationConfig, AITask, Lead } from '../types'

const LS_KEY = 'vietmy_ai_integration_v1'

export function loadAIConfigFromStorage(): AIIntegrationConfig | null {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) return null
    const o = JSON.parse(raw) as Partial<AIIntegrationConfig>
    if ((o.provider !== 'Gemini' && o.provider !== 'OpenAI') || !o.apiKey || !o.model) return null
    return { provider: o.provider, apiKey: o.apiKey, model: o.model }
  } catch {
    return null
  }
}

export function saveAIConfigToStorage(config: AIIntegrationConfig): void {
  localStorage.setItem(LS_KEY, JSON.stringify(config))
}

function getLeadFieldValue(lead: Lead, field: string): unknown {
  const v = (lead as unknown as Record<string, unknown>)[field]
  if (v === undefined || v === null) return ''
  if (typeof v === 'object' && 'toDate' in (v as object)) {
    try {
      return (v as { toDate: () => Date }).toDate().toISOString()
    } catch {
      return String(v)
    }
  }
  return v
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
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
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
