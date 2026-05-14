/**
 * Chat thử (OpenAI-compatible POST) — **ưu tiên** cấu hình đã lưu trong Cài đặt → LLM (localStorage),
 * giống luồng Phân tích LLM trên hồ sơ. Nếu chưa lưu API, fallback: `VITE_AI_API_URL`, `VITE_AI_API_KEY`, `VITE_AI_MODEL`.
 */
import { callIntegrationChat, loadAIConfigFromStorage } from '../utils/aiEngine'

export type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string }

export async function callOpenAiCompatibleChat(
  messages: ChatMessage[],
  signal?: AbortSignal,
): Promise<string> {
  const integ = loadAIConfigFromStorage()
  if (integ?.apiKey?.trim()) {
    return callIntegrationChat(integ, messages, signal)
  }

  const url = (import.meta.env.VITE_AI_API_URL as string | undefined)?.trim()
  if (!url) {
    throw new Error(
      'Chưa có API: Siêu quản trị cần lưu Gemini/OpenAI trong Cài đặt → tab LLM → «Lưu API vào trình duyệt», hoặc cấu hình VITE_AI_API_URL trong .env cho proxy.',
    )
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
