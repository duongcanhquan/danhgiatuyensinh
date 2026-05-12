/**
 * Gọi endpoint LLM kiểu OpenAI (POST JSON: model, messages) — dùng cho Phòng thử AI / proxy ChatGPT.
 * Phân tích hồ sơ trên CRM dùng `loadAIConfigFromStorage` + Gemini hoặc OpenAI trong Cấu hình → Tích hợp LLM.
 * Biến: `VITE_AI_API_URL`, tuỳ chọn `VITE_AI_API_KEY`, `VITE_AI_MODEL`.
 */
export type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string }

export async function callOpenAiCompatibleChat(
  messages: ChatMessage[],
  signal?: AbortSignal,
): Promise<string> {
  const url = (import.meta.env.VITE_AI_API_URL as string | undefined)?.trim()
  if (!url) {
    throw new Error('Thiếu VITE_AI_API_URL trong .env (endpoint OpenAI-compatible).')
  }
  const apiKey = (import.meta.env.VITE_AI_API_KEY as string | undefined)?.trim()
  const model = (import.meta.env.VITE_AI_MODEL as string | undefined)?.trim() || 'gpt-4o-mini'

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
    },
    body: JSON.stringify({ model, messages }),
    signal,
  })

  const raw = await res.text()
  if (!res.ok) {
    throw new Error(raw || `HTTP ${res.status}`)
  }
  let data: { choices?: { message?: { content?: string } }[] }
  try {
    data = JSON.parse(raw) as typeof data
  } catch {
    return raw
  }
  const text = data.choices?.[0]?.message?.content
  return text ?? raw
}
