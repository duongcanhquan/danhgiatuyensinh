import { useState } from 'react'
import { VietMyAccentHeading } from '../components/VietMyAccentHeading'
import { useAuth } from '../hooks/useAuth'
import { callOpenAiCompatibleChat, type ChatMessage } from '../services/aiClient'

const PRESET = `Bạn là trợ lý tuyển sinh Cao đẳng Việt Mỹ. Gợi ý ngắn gọn, lịch sự, tiếng Việt.`

export function AiLabView() {
  const { can } = useAuth()
  const [input, setInput] = useState('')
  const [reply, setReply] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!can('ai:use')) {
    return (
      <div className="rounded-2xl border border-amber-300/60 bg-amber-50/90 p-6 text-sm text-amber-900">
        Bạn không có quyền sử dụng Phòng thử AI.
      </div>
    )
  }

  const run = async () => {
    if (!input.trim()) return
    setBusy(true)
    setError(null)
    setReply('')
    const ctrl = new AbortController()
    try {
      const messages: ChatMessage[] = [
        { role: 'system', content: PRESET },
        { role: 'user', content: input.trim() },
      ]
      const out = await callOpenAiCompatibleChat(messages, ctrl.signal)
      setReply(out)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Lỗi gọi API')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="w-full max-w-none space-y-6">
      <header>
        <VietMyAccentHeading as="h1" tone="onLight" size="lg" className="block">
          Phòng thử AI
        </VietMyAccentHeading>
        <p className="mt-1 max-w-2xl text-base leading-relaxed text-slate-700">
          Đây là chỗ <strong className="text-slate-900">hỏi thử</strong> AI qua đường dẫn API do kỹ thuật cấu hình
          cho môi trường chạy app (thường qua máy chủ trung gian để bảo vệ khóa). Còn{' '}
          <strong className="text-slate-900">phân tích từng hồ sơ</strong> trong CRM thì vào{' '}
          <strong className="text-slate-900">Cấu hình dữ liệu → Tích hợp LLM</strong> để chọn Gemini hoặc ChatGPT
          lưu trên trình duyệt — hai luồng không giống nhau.
        </p>
      </header>

      <div className="app-glass-panel rounded-2xl p-6 shadow-lg">
        <label className="text-xs font-medium text-slate-600">
          Câu hỏi / ngữ cảnh tuyển sinh
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            rows={5}
            className="mt-2 w-full rounded-xl border border-slate-200/80 bg-white/80 px-3 py-2 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-violet-400/40"
            placeholder="Ví dụ: Tóm tắt cách trả lời hồ sơ HOT ngành Điều dưỡng ngoại tỉnh…"
          />
        </label>
        <button
          type="button"
          disabled={busy}
          onClick={() => void run()}
          className="mt-4 rounded-xl border border-violet-300/60 bg-violet-600/90 px-4 py-2 text-sm font-medium text-white shadow-md hover:bg-violet-600 disabled:opacity-50"
        >
          {busy ? 'Đang gọi API…' : 'Gửi tới AI'}
        </button>
        {error ? <p className="mt-3 text-sm text-rose-600">{error}</p> : null}
        {reply ? (
          <div className="mt-4 rounded-xl border border-slate-200/80 bg-white/70 p-4 text-sm leading-relaxed text-slate-800 whitespace-pre-wrap shadow-inner">
            {reply}
          </div>
        ) : null}
      </div>
    </div>
  )
}
