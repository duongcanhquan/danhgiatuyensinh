/**
 * Chat thử (OpenAI-compatible POST) — **ưu tiên** Cài đặt → LLM (localStorage), sau đó `.env`
 * (`VITE_AI_API_KEY`, tuỳ chọn `VITE_AI_PROVIDER`, `VITE_AI_MODEL`). URL OpenAI trong `callIntegrationChat`:
 * mặc định proxy cùng origin `…/openai-proxy/…` (Vite dev + preview có sẵn); hoặc `VITE_OPENAI_PROXY_URL` / `VITE_AI_API_URL`.
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
      'Chưa có API: lưu Gemini/OpenAI/DeepSeek trong Cài đặt → tab LLM → «Lưu API vào trình duyệt», hoặc cấu hình VITE_AI_API_KEY (tuỳ chọn VITE_AI_PROVIDER, VITE_AI_MODEL) trong .env. Với OpenAI/DeepSeek trên web tĩnh cần thêm proxy URL tương ứng.',
    )
  }
  return callIntegrationChat(integ, messages, signal)
}
