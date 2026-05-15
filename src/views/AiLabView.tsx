import { useState } from 'react'
import { VietMyAccentHeading } from '../components/VietMyAccentHeading'
import { useAuth } from '../hooks/useAuth'
import { callOpenAiCompatibleChat, type ChatMessage } from '../services/aiClient'

const PRESET = `Bạn là trợ lý tuyển sinh Cao đẳng Việt Mỹ. Gợi ý ngắn gọn, lịch sự, tiếng Việt.`

export function AiLabView({ embedded = false }: { embedded?: boolean }) {
  const { can, canRunLlmAnalysis } = useAuth()
  const [input, setInput] = useState('')
  const [reply, setReply] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!can('ai:use') || !canRunLlmAnalysis) {
    return (
      <div className="rounded-2xl border border-amber-300/60 bg-amber-50/90 p-6 text-sm text-amber-900">
        Bạn chưa được mở Phòng thử AI. Nhờ quản lý vào <strong>Cài đặt → Quản lý nhân sự</strong>, mở hồ sơ của bạn và
        bật <strong>«Cho phép dùng AI trên hồ sơ»</strong>. Siêu quản trị không cần bật dòng này.
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
      {embedded ? (
        <p className="rounded-xl border border-violet-200/60 bg-violet-50/90 px-3 py-2 text-xs leading-relaxed text-violet-950">
          Phòng thử này dùng <strong>khóa API đã lưu</strong> ở tab <strong>LLM → API</strong> trên cùng trình duyệt. Với{' '}
          <strong>ChatGPT</strong>: bản chạy bằng <code className="font-mono text-[0.85em]">npm run dev</code> tự dùng
          proxy (tránh CORS); bản build trên hosting cần <code className="font-mono text-[0.85em]">VITE_OPENAI_PROXY_URL</code>{' '}
          — xem <code className="font-mono text-[0.85em]">.env.example</code>. Nếu chưa lưu khóa, nhờ Siêu quản trị cấu
          hình.
        </p>
      ) : null}
      {embedded ? null : (
        <header>
          <VietMyAccentHeading as="h1" tone="onLight" size="xl" className="block">
            Phòng thử AI
          </VietMyAccentHeading>
          <div className="mt-1 max-w-2xl space-y-1 text-sm leading-relaxed text-slate-700 md:text-base">
            <p>
              <strong className="text-slate-900">Cách dùng:</strong> nhập nội dung, bấm <strong>Gửi tới AI</strong>, đọc
              câu trả lời. Dùng để thử câu hỏi mẫu, không lưu vào hồ sơ.
            </p>
            <p>
              <strong className="text-slate-900">Để dùng AI trong CRM:</strong> Siêu quản trị vào{' '}
              <strong>Cài đặt → LLM → API</strong>, chọn ChatGPT hoặc Gemini, lưu khóa trên trình duyệt; quản lý bật quyền
              AI cho nhân viên cần dùng.
            </p>
          </div>
        </header>
      )}

      <div className="app-glass-panel rounded-2xl p-6 shadow-lg">
        <label className="text-sm font-medium text-slate-700">
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
