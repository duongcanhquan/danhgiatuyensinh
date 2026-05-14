import { useCallback, useMemo, useState } from 'react'
import { deleteDoc, doc, setDoc, Timestamp } from 'firebase/firestore'
import type { Firestore } from 'firebase/firestore'
import { BookOpen, Key, ListChecks, Shield, Sparkles, Trash2, Wand2 } from 'lucide-react'
import type { AIIntegrationConfig, AIProviderId, AITask } from '../types'
import { FS_COLLECTIONS } from '../types'
import { useAITasks } from '../hooks/useAITasks'
import { useAuth } from '../hooks/useAuth'
import { loadAIConfigFromStorage, saveAIConfigToStorage } from '../utils/aiEngine'
import {
  DEFAULT_AI_GATEKEEPER_RULES,
  loadAiGatekeeperFromStorage,
  mergeGatekeeperConfig,
  saveAiGatekeeperToStorage,
  type AiGatekeeperStored,
} from '../utils/aiGatekeeper'
import { AI_LEAD_FIELD_OPTIONS } from './aiLeadFieldOptions'
import { VietMyAccentHeading } from './VietMyAccentHeading'

const DEFAULT_MODELS: Record<AIProviderId, string> = {
  Gemini: 'gemini-2.0-flash',
  OpenAI: 'gpt-4o-mini',
}

type SchemaRow = { key: string; typeHint: string }

type AiSettingsSubTab = 'guide' | 'api' | 'gatekeeper' | 'library' | 'tasks'

const SUB_TABS: { id: AiSettingsSubTab; label: string; short: string; Icon: typeof BookOpen }[] = [
  { id: 'guide', label: 'Hướng dẫn', short: 'HD', Icon: BookOpen },
  { id: 'api', label: 'API', short: 'API', Icon: Key },
  { id: 'gatekeeper', label: 'Gatekeeper', short: 'GK', Icon: Shield },
  { id: 'library', label: 'Tác vụ đã lưu', short: 'DS', Icon: ListChecks },
  { id: 'tasks', label: 'Tạo tác vụ', short: 'Mới', Icon: Wand2 },
]

function schemaFromRows(rows: SchemaRow[]): Record<string, string> {
  const o: Record<string, string> = {}
  for (const r of rows) {
    const k = r.key.trim()
    if (!k) continue
    o[k] = r.typeHint.trim() || 'string'
  }
  return o
}

export function AISettingsTab({ db }: { db: Firestore }) {
  const { can } = useAuth()
  const canTasks = can('config:ai_engine')
  const canLlmApi = can('config:llm_api')
  const { tasks, loading, error } = useAITasks()

  const [subTab, setSubTab] = useState<AiSettingsSubTab>('guide')

  const [cfg, setCfg] = useState<AIIntegrationConfig>(() => {
    return (
      loadAIConfigFromStorage() ?? {
        provider: 'Gemini',
        apiKey: '',
        model: DEFAULT_MODELS.Gemini,
      }
    )
  })

  const [taskName, setTaskName] = useState('')
  const [systemPrompt, setSystemPrompt] = useState(
    'Bạn là chuyên gia tuyển sinh VietMy. Phân tích khách quan dựa chỉ trên dữ liệu được cung cấp.',
  )
  const [userEmphasis, setUserEmphasis] = useState('')
  const [targetFields, setTargetFields] = useState<string[]>(['financialStatus', 'aspirations', 'fieldTripNotes'])
  const [schemaRows, setSchemaRows] = useState<SchemaRow[]>([
    { key: 'financialReadiness', typeHint: 'Tốt|Trung Bình|Kém' },
    { key: 'reasoning', typeHint: 'string' },
  ])
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  const localApiReady = useMemo(() => Boolean(loadAIConfigFromStorage()?.apiKey), [cfg.apiKey, cfg.model, cfg.provider])

  const initialGk = useMemo(() => mergeGatekeeperConfig(loadAiGatekeeperFromStorage()), [])
  const [gkMinLen, setGkMinLen] = useState(() => String(initialGk.minCombinedNoteLength))
  const [gkKeywordsCsv, setGkKeywordsCsv] = useState(() => initialGk.intentKeywords.join(', '))
  const [gkDays, setGkDays] = useState(() => String(initialGk.maxInteractionAgeDays))

  const persistGatekeeper = useCallback(() => {
    const minN = Math.max(0, Math.min(5000, Math.floor(Number(gkMinLen) || 0)))
    const days = Math.max(
      1,
      Math.min(365, Math.floor(Number(gkDays) || DEFAULT_AI_GATEKEEPER_RULES.maxInteractionAgeDays)),
    )
    const payload: AiGatekeeperStored = {
      minCombinedNoteLength: minN,
      intentKeywordsCsv: gkKeywordsCsv,
      maxInteractionAgeDays: days,
    }
    saveAiGatekeeperToStorage(payload)
    setGkMinLen(String(minN))
    setGkDays(String(days))
    setMsg('Đã lưu quy tắc AI Gatekeeper vào trình duyệt (localStorage).')
  }, [gkMinLen, gkKeywordsCsv, gkDays])

  const resetGatekeeperDefaults = useCallback(() => {
    const d = DEFAULT_AI_GATEKEEPER_RULES
    setGkMinLen(String(d.minCombinedNoteLength))
    setGkKeywordsCsv(d.intentKeywords.join(', '))
    setGkDays(String(d.maxInteractionAgeDays))
    saveAiGatekeeperToStorage({
      minCombinedNoteLength: d.minCombinedNoteLength,
      intentKeywordsCsv: d.intentKeywords.join(', '),
      maxInteractionAgeDays: d.maxInteractionAgeDays,
    })
    setMsg('Đã khôi phục quy tắc AI Gatekeeper mặc định và lưu vào trình duyệt.')
  }, [])

  const persistConfig = useCallback(() => {
    setMsg(null)
    const apiKey = cfg.apiKey.trim()
    const modelRaw = cfg.model.trim()
    if (!apiKey) {
      setMsg('Nhập API key trước khi lưu.')
      return
    }
    const model = modelRaw || DEFAULT_MODELS[cfg.provider]
    const next: AIIntegrationConfig = { ...cfg, apiKey, model }
    try {
      saveAIConfigToStorage(next)
      setCfg(next)
      const verify = loadAIConfigFromStorage()
      if (!verify?.apiKey) {
        setMsg(
          'Đọc lại localStorage không thấy key — thử tắt chế độ ẩn danh, kiểm tra dung lượng site data, hoặc cho phép lưu trữ cho domain này.',
        )
        return
      }
      setMsg(
        'Đã lưu cấu hình API vào trình duyệt (localStorage). Phòng thử AI và Phân tích LLM / AI Miner trên cùng trình duyệt sẽ dùng bản này.',
      )
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Không lưu được vào localStorage.')
    }
  }, [cfg])

  const toggleField = useCallback((id: string) => {
    setTargetFields((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }, [])

  const saveTask = useCallback(async () => {
    if (!canTasks || !db) return
    const name = taskName.trim()
    if (!name) {
      setMsg('Nhập tên tác vụ.')
      return
    }
    const expectedOutputSchema = schemaFromRows(schemaRows)
    if (!Object.keys(expectedOutputSchema).length) {
      setMsg('Thêm ít nhất một khóa trong expected output schema.')
      return
    }
    setBusy(true)
    setMsg(null)
    try {
      const id = crypto.randomUUID()
      const t = Timestamp.now()
      const payload: Omit<AITask, 'id'> & { createdAt: typeof t; updatedAt: typeof t } = {
        name,
        systemPrompt: systemPrompt.trim(),
        userEmphasis: userEmphasis.trim(),
        targetFields,
        expectedOutputSchema,
        createdAt: t,
        updatedAt: t,
      }
      await setDoc(doc(db, FS_COLLECTIONS.ai_tasks, id), payload)
      setTaskName('')
      setUserEmphasis('')
      setMsg(`Đã lưu tác vụ «${name}».`)
      setSubTab('library')
    } catch (e) {
      console.error(e)
      setMsg('Không lưu được — kiểm tra Firestore Rules (collection ai_tasks).')
    } finally {
      setBusy(false)
    }
  }, [canTasks, db, taskName, systemPrompt, userEmphasis, targetFields, schemaRows])

  const removeTask = useCallback(
    async (t: AITask) => {
      if (!canTasks || !db) return
      if (!window.confirm(`Xóa tác vụ «${t.name}»?`)) return
      setBusy(true)
      try {
        await deleteDoc(doc(db, FS_COLLECTIONS.ai_tasks, t.id))
        setMsg('Đã xóa tác vụ.')
      } finally {
        setBusy(false)
      }
    },
    [canTasks, db],
  )

  const providerLabel = useMemo(
    () =>
      ({
        Gemini: 'Google Gemini',
        OpenAI: 'OpenAI (API ChatGPT)',
      }) as Record<AIProviderId, string>,
    [],
  )

  const anyAccess = canTasks || canLlmApi

  return (
    <section
      aria-label="Tích hợp LLM Gemini hoặc ChatGPT"
      className="overflow-hidden rounded-2xl border border-rose-500/20 bg-gradient-to-br from-slate-900 via-indigo-950/70 to-slate-900 shadow-[0_16px_48px_rgba(127,29,29,0.14)] backdrop-blur-xl"
    >
      <div className="flex max-h-[min(78vh,720px)] min-h-[320px] flex-col rounded-[18px] border border-white/12 bg-gradient-to-b from-slate-900/55 to-slate-950/40">
        {/* Header gọn */}
        <div className="shrink-0 border-b border-white/10 px-4 py-3 md:px-5">
          <div className="flex flex-wrap items-center gap-2">
            <Sparkles className="h-6 w-6 shrink-0 text-rose-300" aria-hidden />
            <VietMyAccentHeading as="h2" tone="onDark" size="md" className="mb-0">
              LLM &amp; tác vụ AI
            </VietMyAccentHeading>
          </div>
        </div>

        {/* Tabs */}
        <div
          className="shrink-0 border-b border-white/10 px-2 py-2 md:px-3"
          role="tablist"
          aria-label="Phần con cài đặt LLM"
        >
          <div className="flex flex-wrap gap-1">
            {SUB_TABS.map(({ id, label, short, Icon }) => {
              const on = subTab === id
              return (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={on}
                  onClick={() => setSubTab(id)}
                  className={[
                    'inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition md:px-3 md:text-sm',
                    on
                      ? 'bg-rose-500/25 text-rose-50 ring-1 ring-rose-400/40'
                      : 'bg-white/[0.06] text-slate-400 hover:bg-white/10 hover:text-slate-200',
                  ].join(' ')}
                >
                  <Icon className="h-3.5 w-3.5 shrink-0 opacity-90 md:h-4 md:w-4" aria-hidden />
                  <span className="max-[400px]:sr-only">{label}</span>
                  <span className="hidden max-[400px]:inline">{short}</span>
                </button>
              )
            })}
          </div>
        </div>

        {/* Thông báo chung — gọn, luôn thấy */}
        <div className="shrink-0 space-y-2 border-b border-white/5 px-4 py-2 md:px-5">
          {!anyAccess ? (
            <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
              Bạn không có quyền chỉnh. Cần <code className="text-amber-50">config:ai_engine</code> hoặc{' '}
              <code className="text-amber-50">config:llm_api</code> (Siêu quản trị).
            </p>
          ) : null}
          {error ? (
            <p className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-100">{error}</p>
          ) : null}
          {msg ? (
            <p className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-100">
              {msg}
            </p>
          ) : null}
          {!canLlmApi && (subTab === 'api' || subTab === 'gatekeeper') ? (
            <p className="rounded-lg border border-cyan-500/25 bg-cyan-950/40 px-3 py-2 text-xs text-cyan-100">
              Tab này chỉnh được khi đăng nhập <strong>Siêu quản trị</strong> (<code className="text-cyan-50">config:llm_api</code>).
            </p>
          ) : null}
          {!canTasks && (subTab === 'library' || subTab === 'tasks') ? (
            <p className="rounded-lg border border-violet-500/25 bg-violet-950/40 px-3 py-2 text-xs text-violet-100">
              Cần quyền <code className="text-violet-50">config:ai_engine</code> để xem / tạo tác vụ.
            </p>
          ) : null}
        </div>

        {/* Nội dung tab — cuộn trong khung */}
        <div
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 md:px-5 md:py-5"
          role="tabpanel"
          id={`ai-settings-panel-${subTab}`}
        >
          {subTab === 'guide' ? (
            <div className="space-y-4 text-sm leading-relaxed text-slate-300">
              <p className="text-xs font-semibold uppercase tracking-wide text-rose-200/90">Luồng đề xuất (làm lần lượt)</p>
              <ol className="list-decimal space-y-3 pl-4 marker:text-amber-400/90">
                <li>
                  <strong className="text-slate-100">Siêu quản trị</strong> mở tab <strong>API</strong>: chọn Gemini hoặc
                  OpenAI, dán khóa API, chọn model → bấm <strong>Lưu API vào trình duyệt</strong>. Khóa chỉ nằm trên máy
                  trình duyệt đó (localStorage), không gửi lên Firestore.
                </li>
                <li>
                  Cùng người (hoặc Siêu QT) mở tab <strong>Gatekeeper</strong> nếu dùng AI Miner hàng loạt: giới hạn
                  lead WARM nào được đưa vào LLM (ít tốn token) → <strong>Lưu quy tắc</strong>.
                </li>
                <li>
                  <strong>Admin / Siêu quản trị</strong> mở tab <strong>Tạo tác vụ</strong>: đặt tên, system prompt,
                  chọn trường lead gửi kèm, định nghĩa schema JSON đầu ra → <strong>Lưu tác vụ lên Firestore</strong>.
                  Kiểm tra danh sách ở tab <strong>Tác vụ đã lưu</strong>.
                </li>
                <li>
                  Trong <strong>Cài đặt → Quản lý nhân sự</strong>, quản lý bật{' '}
                  <strong>«Cho phép dùng LLM và tác vụ AI»</strong> cho từng TVV cần chạy phân tích (Siêu QT không cần
                  cờ này).
                </li>
                <li>
                  TVV được phép: mở <strong>chi tiết hồ sơ</strong> → nút <strong>Phân tích LLM</strong> → chọn tác vụ →
                  chạy. Cần đã có API trên <strong>cùng trình duyệt</strong> (thường là máy Siêu QT đã lưu key) hoặc lưu
                  lại key trên máy TVV (ít khuyến nghị hơn về bảo mật).
                </li>
                <li>
                  Tab <strong>Phòng thử AI</strong> (khác tab này): chat thử API, không ghi lead. Dùng sau khi API đã
                  lưu để kiểm tra mạng / model.
                </li>
              </ol>
              <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3 text-xs text-slate-400">
                <p className="font-medium text-slate-200">Ghi nhớ</p>
                <ul className="mt-2 list-disc space-y-1 pl-4">
                  <li>
                    Kho tri thức (tab <strong>Kho tri thức</strong>) được ghép vào prompt khi chạy tác vụ trên lead (nếu
                    có tài liệu).
                  </li>
                  <li>Tác vụ AI ≠ Chấm điểm profile: chấm điểm là công thức điểm; LLM là văn bản phân tích có cấu trúc.</li>
                </ul>
              </div>
            </div>
          ) : null}

          {subTab === 'api' ? (
            <div className="mx-auto max-w-lg space-y-4">
              <VietMyAccentHeading as="h3" tone="onDark" size="sm" className="mb-0">
                Cấu hình API
              </VietMyAccentHeading>
              <p className="text-xs leading-relaxed text-slate-400">
                {localApiReady ? (
                  <>
                    <span className="text-emerald-300/95">●</span> Trình duyệt này đang có bản lưu API hợp lệ — Phòng
                    thử AI và phân tích trên hồ sơ sẽ ưu tiên dùng đây (không cần .env trừ khi chưa lưu).
                  </>
                ) : (
                  <>
                    <span className="text-amber-300/90">○</span> Chưa có bản lưu hợp lệ trên máy này — nhập API key (và
                    model nếu cần) rồi bấm Lưu. Chỉ tài khoản <strong className="text-slate-200">Siêu quản trị</strong>{' '}
                    mới lưu được tại đây.
                  </>
                )}
              </p>
              <label className="block text-xs font-medium text-slate-400">
                Nhà cung cấp
                <select
                  value={cfg.provider}
                  disabled={!canLlmApi}
                  onChange={(e) => {
                    const p = e.target.value as AIProviderId
                    setCfg((c) => ({
                      ...c,
                      provider: p,
                      model: DEFAULT_MODELS[p],
                    }))
                  }}
                  className="mt-1.5 w-full rounded-xl border border-white/18 bg-slate-800/50 px-3 py-2.5 text-sm text-slate-100 outline-none focus:ring-2 focus:ring-rose-400/35 disabled:opacity-50"
                >
                  <option value="Gemini">{providerLabel.Gemini}</option>
                  <option value="OpenAI">{providerLabel.OpenAI}</option>
                </select>
              </label>
              <label className="block text-xs font-medium text-slate-400">
                Model
                <input
                  value={cfg.model}
                  disabled={!canLlmApi}
                  onChange={(e) => setCfg((c) => ({ ...c, model: e.target.value }))}
                  className="mt-1.5 w-full rounded-xl border border-white/18 bg-slate-800/50 px-3 py-2.5 text-sm text-slate-100 outline-none focus:ring-2 focus:ring-rose-400/35 disabled:opacity-50"
                />
              </label>
              <label className="block text-xs font-medium text-slate-400">
                API Key
                <input
                  type="password"
                  autoComplete="off"
                  value={cfg.apiKey}
                  disabled={!canLlmApi}
                  onChange={(e) => setCfg((c) => ({ ...c, apiKey: e.target.value }))}
                  placeholder="••••••••"
                  className="mt-1.5 w-full rounded-xl border border-white/18 bg-slate-800/50 px-3 py-2.5 font-mono text-sm text-slate-100 outline-none focus:ring-2 focus:ring-rose-400/35 disabled:opacity-50"
                />
              </label>
              {canLlmApi ? (
                <button
                  type="button"
                  onClick={persistConfig}
                  className="w-full rounded-xl border border-rose-400/45 bg-gradient-to-r from-rose-600/30 to-red-900/40 py-2.5 text-sm font-semibold text-rose-50 transition hover:shadow-[0_0_18px_rgba(244,63,94,0.35)]"
                >
                  Lưu API vào trình duyệt
                </button>
              ) : null}
            </div>
          ) : null}

          {subTab === 'gatekeeper' ? (
            <div className="mx-auto max-w-3xl space-y-4">
              <div className="flex flex-wrap items-start gap-3">
                <Shield className="h-6 w-6 shrink-0 text-cyan-300" aria-hidden />
                <div>
                  <VietMyAccentHeading as="h3" tone="onDark" size="sm" className="mb-0">
                    AI Gatekeeper
                  </VietMyAccentHeading>
                  <p className="mt-1 text-xs text-slate-400">
                    Lọc lead trước khi gọi LLM (AI Miner / lô). Lưu cùng localStorage với API.
                  </p>
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-xs font-medium text-slate-400">
                  Độ dài ghi chú tối thiểu (ký tự)
                  <input
                    type="number"
                    min={0}
                    max={5000}
                    value={gkMinLen}
                    disabled={!canLlmApi}
                    onChange={(e) => setGkMinLen(e.target.value)}
                    className="mt-1.5 w-full rounded-xl border border-white/18 bg-slate-800/50 px-3 py-2.5 text-sm text-slate-100 outline-none focus:ring-2 focus:ring-cyan-400/35 disabled:opacity-50"
                  />
                </label>
                <label className="block text-xs font-medium text-slate-400 sm:col-span-2">
                  Từ khóa ý định (cách nhau bằng dấu phẩy)
                  <input
                    value={gkKeywordsCsv}
                    disabled={!canLlmApi}
                    onChange={(e) => setGkKeywordsCsv(e.target.value)}
                    placeholder="vd. học phí, bố mẹ, phân vân…"
                    className="mt-1.5 w-full rounded-xl border border-white/18 bg-slate-800/50 px-3 py-2.5 text-sm text-slate-100 outline-none focus:ring-2 focus:ring-cyan-400/35 disabled:opacity-50"
                  />
                  <span className="mt-1 block text-[11px] text-slate-500">Để trống = tắt lọc theo từ khóa.</span>
                </label>
                <label className="block text-xs font-medium text-slate-400 sm:col-span-2">
                  Tương tác trong vòng (ngày)
                  <input
                    type="number"
                    min={1}
                    max={365}
                    value={gkDays}
                    disabled={!canLlmApi}
                    onChange={(e) => setGkDays(e.target.value)}
                    className="mt-1.5 max-w-[200px] rounded-xl border border-white/18 bg-slate-800/50 px-3 py-2.5 text-sm text-slate-100 outline-none focus:ring-2 focus:ring-cyan-400/35 disabled:opacity-50"
                  />
                </label>
              </div>
              {canLlmApi ? (
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={persistGatekeeper}
                    className="rounded-xl border border-cyan-400/45 bg-gradient-to-r from-cyan-600/35 to-teal-800/40 px-4 py-2 text-sm font-semibold text-cyan-50 transition hover:shadow-[0_0_18px_rgba(34,211,238,0.35)]"
                  >
                    Lưu Gatekeeper
                  </button>
                  <button
                    type="button"
                    onClick={resetGatekeeperDefaults}
                    className="rounded-xl border border-white/15 bg-white/[0.06] px-4 py-2 text-sm font-medium text-slate-200 transition hover:bg-white/10"
                  >
                    Mặc định
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}

          {subTab === 'library' ? (
            <div className="space-y-3">
              <VietMyAccentHeading as="h3" tone="onDark" size="sm" className="mb-0">
                Tác vụ đã lưu (Firestore)
              </VietMyAccentHeading>
              {loading ? <p className="text-sm text-slate-500">Đang tải…</p> : null}
              <ul className="max-h-[min(40vh,320px)] space-y-2 overflow-y-auto pr-1">
                {tasks.map((t) => (
                  <li
                    key={t.id}
                    className="flex items-start justify-between gap-2 rounded-xl border border-white/12 bg-slate-800/35 px-3 py-2.5 text-xs text-slate-300"
                  >
                    <span>
                      <span className="font-semibold text-rose-50/95">{t.name}</span>
                      <span className="mt-0.5 block text-[11px] text-slate-500">{t.targetFields.join(', ')}</span>
                    </span>
                    {canTasks ? (
                      <button
                        type="button"
                        onClick={() => void removeTask(t)}
                        className="shrink-0 rounded-lg border border-rose-400/30 p-1.5 text-rose-200 hover:bg-rose-500/15"
                        aria-label="Xóa"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    ) : null}
                  </li>
                ))}
                {!loading && !tasks.length ? (
                  <li className="rounded-lg border border-dashed border-white/15 px-3 py-6 text-center text-sm text-slate-500">
                    Chưa có tác vụ — chuyển sang tab <strong className="text-slate-300">Tạo tác vụ</strong>.
                  </li>
                ) : null}
              </ul>
            </div>
          ) : null}

          {subTab === 'tasks' ? (
            <div className="mx-auto max-w-3xl space-y-4">
              <VietMyAccentHeading as="h3" tone="onDark" size="sm" className="mb-0">
                Tạo tác vụ mới
              </VietMyAccentHeading>
              <div className="grid gap-3 md:grid-cols-2">
                <label className="block text-xs font-medium text-slate-400 md:col-span-2">
                  Tên tác vụ
                  <input
                    value={taskName}
                    disabled={!canTasks}
                    onChange={(e) => setTaskName(e.target.value)}
                    placeholder="vd. Phân tích năng lực tài chính"
                    className="mt-1.5 w-full rounded-xl border border-white/18 bg-slate-800/50 px-3 py-2.5 text-sm text-slate-100 outline-none focus:ring-2 focus:ring-rose-400/35 disabled:opacity-50"
                  />
                </label>
                <label className="block text-xs font-medium text-slate-400 md:col-span-2">
                  System prompt
                  <textarea
                    value={systemPrompt}
                    disabled={!canTasks}
                    onChange={(e) => setSystemPrompt(e.target.value)}
                    rows={3}
                    className="mt-1.5 w-full rounded-xl border border-white/18 bg-slate-800/50 px-3 py-2.5 text-sm text-slate-100 outline-none focus:ring-2 focus:ring-rose-400/35 disabled:opacity-50"
                  />
                </label>
                <label className="block text-xs font-medium text-slate-400 md:col-span-2">
                  Trọng tâm phân tích (tuỳ chọn)
                  <textarea
                    value={userEmphasis}
                    disabled={!canTasks}
                    onChange={(e) => setUserEmphasis(e.target.value)}
                    rows={2}
                    placeholder="vd. Nhấn mạnh phản ứng phụ huynh về học phí…"
                    className="mt-1.5 w-full rounded-xl border border-white/18 bg-slate-800/50 px-3 py-2.5 text-sm text-slate-100 outline-none focus:ring-2 focus:ring-rose-400/35 disabled:opacity-50"
                  />
                </label>
              </div>

              <p className="text-[11px] font-bold uppercase tracking-wider text-rose-200/85">Trường lead gửi kèm</p>
              <div className="flex flex-wrap gap-1.5">
                {AI_LEAD_FIELD_OPTIONS.map((f) => {
                  const on = targetFields.includes(f.id)
                  return (
                    <button
                      key={f.id}
                      type="button"
                      disabled={!canTasks}
                      onClick={() => toggleField(f.id)}
                      className={[
                        'rounded-full border px-2.5 py-1 text-[11px] transition md:text-xs',
                        on
                          ? 'border-amber-400/50 bg-amber-500/20 text-amber-50'
                          : 'border-white/10 bg-white/[0.04] text-slate-400 hover:border-white/20',
                        f.extra ? 'ring-1 ring-amber-400/20' : '',
                      ].join(' ')}
                      title={f.extra ? 'Cần tổng hợp ghi chú TV khi chạy từ CRM' : undefined}
                    >
                      {f.label}
                    </button>
                  )
                })}
              </div>

              <p className="text-[11px] font-bold uppercase tracking-wider text-rose-200/85">Schema JSON đầu ra</p>
              <div className="space-y-2">
                {schemaRows.map((row, i) => (
                  <div key={i} className="flex flex-wrap gap-2">
                    <input
                      value={row.key}
                      disabled={!canTasks}
                      onChange={(e) => {
                        const v = e.target.value
                        setSchemaRows((rows) => rows.map((r, j) => (j === i ? { ...r, key: v } : r)))
                      }}
                      placeholder="fieldKey"
                      className="min-w-[120px] flex-1 rounded-lg border border-white/18 bg-slate-800/50 px-2 py-2 text-sm text-slate-100 disabled:opacity-50"
                    />
                    <input
                      value={row.typeHint}
                      disabled={!canTasks}
                      onChange={(e) => {
                        const v = e.target.value
                        setSchemaRows((rows) => rows.map((r, j) => (j === i ? { ...r, typeHint: v } : r)))
                      }}
                      placeholder='vd. "Tốt|Kém" hoặc string'
                      className="min-w-[160px] flex-[2] rounded-lg border border-white/18 bg-slate-800/50 px-2 py-2 text-sm text-slate-100 disabled:opacity-50"
                    />
                    {canTasks ? (
                      <button
                        type="button"
                        onClick={() => setSchemaRows((rows) => rows.filter((_, j) => j !== i))}
                        className="rounded-lg border border-rose-400/30 px-2 py-2 text-xs text-rose-200"
                      >
                        Xóa
                      </button>
                    ) : null}
                  </div>
                ))}
                {canTasks ? (
                  <button
                    type="button"
                    onClick={() => setSchemaRows((rows) => [...rows, { key: '', typeHint: 'string' }])}
                    className="text-xs font-medium text-amber-300 hover:underline"
                  >
                    + Thêm khóa
                  </button>
                ) : null}
              </div>

              {canTasks ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void saveTask()}
                  className="w-full rounded-xl border border-rose-400/50 bg-gradient-to-r from-rose-600/40 via-red-700/35 to-zinc-900/80 py-2.5 text-sm font-bold uppercase tracking-wide text-white shadow-lg transition hover:shadow-[0_0_22px_rgba(244,63,94,0.35)] disabled:opacity-50"
                >
                  {busy ? 'Đang lưu…' : 'Lưu tác vụ lên Firestore'}
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </section>
  )
}
