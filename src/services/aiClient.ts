/**
 * Chat thử (OpenAI-compatible POST) — **ưu tiên** Cài đặt → LLM (localStorage), sau đó `.env`
 * (`VITE_AI_API_KEY`, tuỳ chọn `VITE_AI_PROVIDER`, `VITE_AI_MODEL`). URL OpenAI lấy trong `callIntegrationChat`
 * (dev: proxy `/openai-proxy`; production: `VITE_OPENAI_PROXY_URL` hoặc `VITE_AI_API_URL`).
 */
import { callIntegrationChat, resolveAIIntegrationConfig } from '../utils/aiEngine'

export type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string }

export async function callOpenAiCompatibleChat(
  messages: ChatMessage[],
  signal?: AbortSignal,
): Promise<string> {
  const integ = resolveAIIntegrationConfig()
  if (!integ?.apiKey?.trim()) {
    throw new Error(
      'Chưa có API: lưu Gemini/OpenAI trong Cài đặt → tab LLM → «Lưu API vào trình duyệt», hoặc cấu hình VITE_AI_API_KEY (tuỳ chọn VITE_AI_PROVIDER, VITE_AI_MODEL) trong .env. Với OpenAI trên web tĩnh cần thêm VITE_OPENAI_PROXY_URL.',
    )
  }
  return callIntegrationChat(integ, messages, signal)
}
