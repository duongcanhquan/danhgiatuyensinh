import { useCallback, useEffect, useMemo, useState } from 'react'
import { deleteDoc, doc, setDoc, Timestamp } from 'firebase/firestore'
import type { Firestore } from 'firebase/firestore'
import { BookOpen, Key, ListChecks, Phone, Shield, Sparkles, Trash2, Wand2 } from 'lucide-react'
import { CallSessionChipsSettingsPanel } from './CallSessionChipsSettingsPanel'
import type { AIIntegrationConfig, AIProviderId, AITask } from '../types'
import { FS_COLLECTIONS } from '../types'
import { useAITasks } from '../hooks/useAITasks'
import { useAuth } from '../hooks/useAuth'
import { useOrgAiIntegration } from '../contexts/OrgAiIntegrationContext'
import { callIntegrationChat, clearAIConfigFromStorage, getAiIntegrationDiagnostics, loadAIConfigFromStorage, resolveAIIntegrationConfig } from '../utils/aiEngine'
import { appConfirmDelete } from '../utils/appConfirm'
import { MSG_SAVE_FAILED } from '../utils/userFacingWriteError'
import {
  DEFAULT_AI_GATEKEEPER_RULES,
  loadAiGatekeeperFromStorage,
  mergeGatekeeperConfig,
  saveAiGatekeeperToStorage,
  type AiGatekeeperStored,
} from '../utils/aiGatekeeper'
import { AI_LEAD_FIELD_OPTIONS } from './aiLeadFieldOptions'
import { VietMyAccentHeading } from './VietMyAccentHeading'
import { DEFAULT_COUNSELING_AI_TASK } from '../utils/counselingAiDefaults'

const DEFAULT_MODELS: Record<AIProviderId, string> = {
  Gemini: 'gemini-2.5-flash-lite',
  OpenAI: 'gpt-4o-mini',
  DeepSeek: 'deepseek-chat',
}

type SchemaRow = { key: string; typeHint: string }

type AiSettingsSubTab = 'guide' | 'api' | 'call_chips' | 'gatekeeper' | 'library' | 'tasks'

const SUB_TABS: { id: AiSettingsSubTab; label: string; short: string; Icon: typeof BookOpen }[] = [
  { id: 'guide', label: 'Hướng dẫn', short: 'HD', Icon: BookOpen },
  { id: 'api', label: 'API', short: 'API', Icon: Key },
  { id: 'call_chips', label: 'Bảng đánh giá gọi', short: 'Gọi', Icon: Phone },
  { id: 'gatekeeper', label: 'Lọc trước khi gọi AI', short: 'Lọc', Icon: Shield },
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
  const { orgConfig, docExists: orgDocExists, saveOrgConfig, clearOrgConfig, loading: orgLoading, error: orgError } =
    useOrgAiIntegration()
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
  const [systemPrompt, setSystemPrompt] = useState(DEFAULT_COUNSELING_AI_TASK.systemPrompt)
  const [userEmphasis, setUserEmphasis] = useState(DEFAULT_COUNSELING_AI_TASK.userEmphasis)
  const [targetFields, setTargetFields] = useState<string[]>([...DEFAULT_COUNSELING_AI_TASK.targetFields])
  const [schemaRows, setSchemaRows] = useState<SchemaRow[]>(() =>
    Object.entries(DEFAULT_COUNSELING_AI_TASK.expectedOutputSchema).map(([key, typeHint]) => ({
      key,
      typeHint,
    })),
  )
  const [busy, setBusy] = useState(false)
  const [testBusy, setTestBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  useEffect(() => {
    if (orgLoading) return
    if (orgConfig) {
      setCfg(orgConfig)
      return
    }
    const fromLs = loadAIConfigFromStorage()
    if (fromLs) setCfg(fromLs)
  }, [orgConfig, orgLoading])

  const localApiReady = useMemo(
    () => Boolean((cfg.apiKey || resolveAIIntegrationConfig()?.apiKey || '').trim()),
    [cfg.apiKey, orgConfig],
  )

  const aiDiagnostics = useMemo(
    () => getAiIntegrationDiagnostics(),
    [cfg.apiKey, cfg.provider, cfg.model, localApiReady, orgConfig],
  )

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
    setMsg('Đã lưu quy tắc «lọc trước khi gọi AI» vào trình duyệt (localStorage).')
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
    setMsg('Đã khôi phục quy tắc «lọc trước khi gọi AI» mặc định và lưu vào trình duyệt.')
  }, [])

  const persistConfig = useCallback(async () => {
    setMsg(null)
    const apiKey = cfg.apiKey.trim()
    const modelRaw = cfg.model.trim()
    if (!apiKey) {
      setMsg('Nhập API key trước khi lưu.')
      return
    }
    const model = modelRaw || DEFAULT_MODELS[cfg.provider]
    const next: AIIntegrationConfig = { ...cfg, apiKey, model }
    setBusy(true)
    try {
      await saveOrgConfig(next)
      clearAIConfigFromStorage()
      setCfg(next)
      setMsg(
        'Đã lưu khóa API cho cả team (Firestore). Mọi TVV / Trưởng nhóm được bật quyền AI sẽ dùng chung cấu hình này — không cần lưu lại trên từng máy.',
      )
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Không lưu được cấu hình toàn trường.')
    } finally {
      setBusy(false)
    }
  }, [cfg, saveOrgConfig])

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
      setMsg(MSG_SAVE_FAILED)
    } finally {
      setBusy(false)
    }
  }, [canTasks, db, taskName, systemPrompt, userEmphasis, targetFields, schemaRows])

  const seedDefaultCounselingTask = useCallback(async () => {
    if (!canTasks || !db) return
    const exists = tasks.some((t) => t.name === DEFAULT_COUNSELING_AI_TASK.name)
    if (exists) {
      setMsg(`Đã có tác vụ «${DEFAULT_COUNSELING_AI_TASK.name}» — xem tab Tác vụ đã lưu.`)
      setSubTab('library')
      return
    }
    setBusy(true)
    setMsg(null)
    try {
      const id = crypto.randomUUID()
      const t = Timestamp.now()
      await setDoc(doc(db, FS_COLLECTIONS.ai_tasks, id), {
        ...DEFAULT_COUNSELING_AI_TASK,
        createdAt: t,
        updatedAt: t,
      })
      setMsg(`Đã tạo tác vụ mẫu «${DEFAULT_COUNSELING_AI_TASK.name}».`)
      setSubTab('library')
    } catch (e) {
      console.error(e)
      setMsg('Không tạo được tác vụ mẫu. Thử lại hoặc liên hệ quản trị.')
    } finally {
      setBusy(false)
    }
  }, [canTasks, db, tasks])

  const applyDefaultToForm = useCallback(() => {
    setTaskName(DEFAULT_COUNSELING_AI_TASK.name)
    setSystemPrompt(DEFAULT_COUNSELING_AI_TASK.systemPrompt)
    setUserEmphasis(DEFAULT_COUNSELING_AI_TASK.userEmphasis)
    setTargetFields([...DEFAULT_COUNSELING_AI_TASK.targetFields])
    setSchemaRows(
      Object.entries(DEFAULT_COUNSELING_AI_TASK.expectedOutputSchema).map(([key, typeHint]) => ({
        key,
        typeHint,
      })),
    )
    setSubTab('tasks')
    setMsg('Đã điền form theo mẫu tư vấn tuyển sinh — chỉnh nếu cần rồi bấm Lưu tác vụ.')
  }, [])

  const removeTask = useCallback(
    async (t: AITask) => {
      if (!canTasks || !db) return
      if (!(await appConfirmDelete(t.name))) return
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
        OpenAI: 'OpenAI (ChatGPT)',
        DeepSeek: 'DeepSeek',
      }) as Record<AIProviderId, string>,
    [],
  )

  const testApiConnection = useCallback(async () => {
    setMsg(null)
    const effective = resolveAIIntegrationConfig()
    const apiKey = cfg.apiKey.trim() || effective?.apiKey.trim() || ''
    if (!apiKey) {
      setMsg('Nhập API key trước khi thử (hoặc cấu hình VITE_AI_API_KEY trên server).')
      return
    }
    const model = cfg.model.trim() || effective?.model || DEFAULT_MODELS[cfg.provider]
    const next: AIIntegrationConfig = {
      provider: cfg.provider,
      apiKey,
      model,
    }
    setTestBusy(true)
    try {
      const reply = await callIntegrationChat(next, [
        { role: 'user', content: 'Trả lời đúng một từ: OK' },
      ])
      setMsg(
        `Kết nối ${providerLabel[cfg.provider]} thành công (${aiDiagnostics.chatEndpoint ?? 'endpoint'}). Phản hồi: «${reply.trim().slice(0, 120)}»`,
      )
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Không gọi được API — kiểm tra key, model và proxy (npm run dev / Vercel rewrite).')
    } finally {
      setTestBusy(false)
    }
  }, [cfg, providerLabel, aiDiagnostics.chatEndpoint])

  const anyAccess = canTasks || canLlmApi

  return (
    <section
      aria-label="AI hỗ trợ trên hồ sơ — Gemini, OpenAI hoặc DeepSeek"
      className="rounded-2xl border border-slate-200 bg-white shadow-sm"
    >
      <div className="flex min-h-[280px] flex-col">
        {/* Header gọn */}
        <div className="shrink-0 border-b border-slate-200 bg-gradient-to-r from-emerald-50/90 to-white px-4 py-3 md:px-5">
          <div className="flex flex-wrap items-center gap-2">
            <Sparkles className="h-6 w-6 shrink-0 text-emerald-700" aria-hidden />
            <VietMyAccentHeading as="h2" tone="onLight" size="md" className="mb-0">
              Cấu hình AI (API &amp; tác vụ)
            </VietMyAccentHeading>
          </div>
        </div>

        {/* Tabs */}
        <div
          className="shrink-0 border-b border-slate-200 px-2 py-2 md:px-3"
          role="tablist"
          aria-label="Phần con cài đặt AI"
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
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200',
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
        <div className="shrink-0 space-y-2 border-b border-slate-100 px-4 py-2 md:px-5">
          {!anyAccess ? (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
              Bạn không có quyền chỉnh khu vực này. Cần tài khoản được giao quyền <strong>cấu hình AI</strong> hoặc{' '}
              <strong>Siêu quản trị</strong>.
            </p>
          ) : null}
          {error ? (
            <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-900">{error}</p>
          ) : null}
          {orgError ? (
            <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-900">{orgError}</p>
          ) : null}
          {msg ? (
            <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
              {msg}
            </p>
          ) : null}
          {!canLlmApi && (subTab === 'api' || subTab === 'gatekeeper') ? (
            <p className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-950">
              Tab <strong>API</strong> và <strong>Lọc trước khi gọi AI</strong> chỉ chỉnh được khi đăng nhập{' '}
              <strong>Siêu quản trị</strong>.
            </p>
          ) : null}
          {!canTasks && (subTab === 'library' || subTab === 'tasks' || subTab === 'call_chips') ? (
            <p className="rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-xs text-violet-950">
              Tab <strong>Tác vụ</strong> và <strong>Bảng đánh giá gọi</strong> chỉ dành tài khoản có quyền{' '}
              <strong>cấu hình AI / tác vụ</strong>.
            </p>
          ) : null}
        </div>

        {/* Nội dung tab — cuộn trong khung */}
        <div
          className="px-4 py-4 md:px-5 md:py-5"
          role="tabpanel"
          id={`ai-settings-panel-${subTab}`}
        >
          {subTab === 'guide' ? (
            <div className="space-y-4 text-sm leading-relaxed text-slate-700">
              <p className="text-xs font-semibold uppercase tracking-wide text-emerald-800">
                Quy trình tư vấn tuyển sinh bằng AI
              </p>
              <ol className="list-decimal space-y-3 pl-4 marker:text-emerald-600">
                <li>
                  <strong className="text-slate-900">Nạp tri thức</strong> — tab <strong>Nạp nội dung</strong> → Tri thức:
                  học phí, quy chế, ngành (đã duyệt).
                </li>
                <li>
                  <strong className="text-slate-900">Siêu quản trị</strong> — tab <strong>API</strong>: Gemini, OpenAI hoặc DeepSeek →{' '}
                  <strong>Lưu API cho cả team</strong> (Firestore — mọi TVV dùng chung).
                </li>
                <li>
                  <strong className="text-slate-900">Tác vụ</strong> — tạo mẫu «Tư vấn tuyển sinh» (Firestore — cả team thấy cùng danh sách).
                </li>
                <li>
                  <strong className="text-slate-900">Nhân sự</strong> — bật «Cho phép dùng AI trên hồ sơ» cho TVV / Trưởng nhóm (Admin / Siêu
                  quản trị không cần).
                </li>
                <li>
                  <strong className="text-slate-900">Bảng đánh giá gọi</strong> — chỉnh các chiều thái độ, sẵn sàng, tín hiệu… khi TVV gọi OMICall.
                </li>
                <li>
                  <strong className="text-slate-900">Vận hành</strong> — mở hồ sơ → <strong>Gợi ý gọi</strong> → gõ lời khách → AI soạn câu đáp từ
                  tri thức đã nạp; hoặc <strong>AI hỗ trợ</strong> phân tích sau cuộc gọi.
                </li>
              </ol>
              {canTasks ? (
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void seedDefaultCounselingTask()}
                    className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-950 transition hover:bg-amber-100 disabled:opacity-50"
                  >
                    Tạo tác vụ mẫu tư vấn
                  </button>
                  <button
                    type="button"
                    onClick={applyDefaultToForm}
                    className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-medium text-slate-800 transition hover:bg-slate-100"
                  >
                    Điền form mẫu
                  </button>
                </div>
              ) : null}
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
                <p className="font-medium text-slate-800">Cấu hình toàn trường vs phân quyền nhân sự</p>
                <ul className="mt-2 list-disc space-y-1 pl-4">
                  <li>
                    <strong>API + tác vụ + bảng đánh giá gọi + tri thức</strong> — Admin/Siêu quản trị cài một lần trên Firestore, cả team dùng chung.
                  </li>
                  <li>
                    <strong>«Cho phép dùng AI trên hồ sơ»</strong> — bật riêng từng TVV / Trưởng nhóm trong Quản lý nhân sự (kiểm soát ai được chạy LLM).
                  </li>
                  <li>
                    <strong>Mẫu tư vấn / Mảnh thoại</strong> — soạn sẵn trong Tư vấn bước 2–3, không gọi AI.
                  </li>
                  <li>
                    <strong>Chấm điểm profile</strong> — công thức CRM, khác đoạn tư vấn AI.
                  </li>
                  <li>
                    <strong>AI Miner</strong> — lọc hàng loạt; cấu hình tab «Lọc trước khi gọi AI».
                  </li>
                </ul>
              </div>
            </div>
          ) : null}

          {subTab === 'call_chips' ? (
            canTasks ? (
              <CallSessionChipsSettingsPanel />
            ) : (
              <p className="text-sm text-slate-600">Cần quyền cấu hình AI để chỉnh danh sách thẻ.</p>
            )
          ) : null}

          {subTab === 'api' ? (
            <div className="mx-auto max-w-lg space-y-4">
              <VietMyAccentHeading as="h3" tone="onLight" size="sm" className="mb-0">
                Cấu hình API
              </VietMyAccentHeading>
              <p className="text-xs leading-relaxed text-slate-600">
                {localApiReady ? (
                  <>
                    <span className="text-emerald-600">●</span> Hệ thống có khóa API (
                    {aiDiagnostics.source === 'localStorage'
                      ? 'localStorage'
                      : aiDiagnostics.source === 'env'
                        ? 'VITE_AI_* trên server'
                        : '—'}
                    ) — {aiDiagnostics.provider ?? '?'} / {aiDiagnostics.model ?? '?'}
                    {aiDiagnostics.chatEndpoint ? (
                      <>
                        {' '}
                        · endpoint: <code className="font-mono text-[0.8em]">{aiDiagnostics.chatEndpoint}</code>
                      </>
                    ) : null}
                  </>
                ) : (
                  <>
                    <span className="text-amber-300/90">○</span> Chưa có bản lưu hợp lệ trên máy này — nhập API key (và
                    model nếu cần) rồi bấm Lưu. Chỉ tài khoản <strong className="text-slate-800">Siêu quản trị</strong>{' '}
                    mới lưu được tại đây, hoặc kỹ thuật đặt <code className="font-mono text-[0.85em]">VITE_AI_API_KEY</code>{' '}
                    + <code className="font-mono text-[0.85em]">VITE_AI_PROVIDER=DeepSeek</code> trên Vercel.
                  </>
                )}
              </p>
              {aiDiagnostics.warning ? (
                <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-950">
                  {aiDiagnostics.warning}
                </p>
              ) : null}
              <label className="block text-xs font-medium text-slate-600">
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
                  className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-emerald-300 disabled:opacity-50"
                >
                  <option value="Gemini">{providerLabel.Gemini}</option>
                  <option value="OpenAI">{providerLabel.OpenAI}</option>
                  <option value="DeepSeek">{providerLabel.DeepSeek}</option>
                </select>
              </label>
              {cfg.provider === 'OpenAI' ? (
                <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-950">
                  <strong>Trình duyệt ↔ OpenAI:</strong> trang web thường không gọi trực tiếp{' '}
                  <code className="font-mono text-[0.85em]">api.openai.com</code> được (CORS) — sẽ thấy lỗi «Failed to
                  fetch». Khi chạy <code className="font-mono text-[0.85em]">npm run dev</code> app đã dùng proxy nội bộ;
                  khi <strong>build đặt lên hosting</strong> cần biến <code className="font-mono text-[0.85em]">VITE_OPENAI_PROXY_URL</code>{' '}
                  (hoặc <code className="font-mono text-[0.85em]">VITE_AI_API_URL</code>) trỏ tới máy chủ proxy tương thích
                  OpenAI rồi build lại — xem <code className="font-mono text-[0.85em]">.env.example</code>. Hoặc chọn{' '}
                  <strong>Gemini</strong> / <strong>DeepSeek</strong> nếu phù hợp.
                </p>
              ) : null}
              {orgDocExists ? (
                <p className="rounded-lg border border-emerald-500/30 bg-emerald-950/35 px-3 py-2 text-xs text-emerald-100">
                  Đã có cấu hình API toàn trường trên Firestore — mọi TVV được bật quyền AI dùng chung (
                  {aiDiagnostics.provider ?? cfg.provider} / {aiDiagnostics.model ?? cfg.model}).
                </p>
              ) : (
                <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
                  Chưa lưu API toàn trường — hiện chỉ dùng biến VITE_AI_* trên server hoặc bản lưu trình duyệt cũ (nếu có). Bấm{' '}
                  <strong>Lưu API cho cả team</strong> để cả team dùng chung.
                </p>
              )}
              {cfg.provider === 'DeepSeek' ? (
                <p className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs leading-relaxed text-sky-950">
                  <strong>DeepSeek:</strong> lấy API key tại{' '}
                  <a
                    href="https://platform.deepseek.com/api_keys"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline hover:text-cyan-50"
                  >
                    platform.deepseek.com
                  </a>
                  . Model gợi ý: <code className="font-mono text-[0.85em]">deepseek-chat</code> hoặc{' '}
                  <code className="font-mono text-[0.85em]">deepseek-reasoner</code>. Khi{' '}
                  <code className="font-mono text-[0.85em]">npm run dev</code> hoặc deploy Vercel app proxy qua{' '}
                  <code className="font-mono text-[0.85em]">/deepseek-proxy</code>; GitHub Pages cần{' '}
                  <code className="font-mono text-[0.85em]">VITE_DEEPSEEK_PROXY_URL</code>.
                </p>
              ) : null}
              <label className="block text-xs font-medium text-slate-600">
                Model
                <input
                  value={cfg.model}
                  disabled={!canLlmApi}
                  onChange={(e) => setCfg((c) => ({ ...c, model: e.target.value }))}
                  placeholder={
                    cfg.provider === 'DeepSeek'
                      ? 'deepseek-chat'
                      : cfg.provider === 'OpenAI'
                        ? 'gpt-4o-mini'
                        : 'gemini-2.5-flash-lite'
                  }
                  className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-emerald-300 disabled:opacity-50"
                />
              </label>
              <label className="block text-xs font-medium text-slate-600">
                API Key
                <input
                  type="password"
                  autoComplete="off"
                  value={cfg.apiKey}
                  disabled={!canLlmApi}
                  onChange={(e) => setCfg((c) => ({ ...c, apiKey: e.target.value }))}
                  placeholder={cfg.provider === 'DeepSeek' ? 'sk-...' : '••••••••'}
                  className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 font-mono text-sm text-slate-900 outline-none focus:ring-2 focus:ring-emerald-300 disabled:opacity-50"
                />
              </label>
              {canLlmApi ? (
                <div className="flex flex-col gap-2 sm:flex-row">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void persistConfig()}
                    className="w-full flex-1 rounded-xl border border-emerald-600 bg-emerald-600 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-50"
                  >
                    {busy ? 'Đang lưu…' : 'Lưu API cho cả team'}
                  </button>
                  <button
                    type="button"
                    disabled={testBusy}
                    onClick={() => void testApiConnection()}
                    className="w-full flex-1 rounded-xl border border-sky-300 bg-sky-50 py-2.5 text-sm font-semibold text-sky-950 transition hover:bg-sky-100 disabled:opacity-50"
                  >
                    {testBusy ? 'Đang thử…' : 'Thử kết nối API'}
                  </button>
                  {(loadAIConfigFromStorage() || orgDocExists) ? (
                    <button
                      type="button"
                      onClick={() => {
                        void (async () => {
                          try {
                            clearAIConfigFromStorage()
                            if (orgDocExists) await clearOrgConfig()
                            setCfg((c) => ({ ...c, apiKey: '' }))
                            setMsg('Đã xóa cấu hình API toàn trường / trình duyệt. App sẽ dùng VITE_AI_* từ server nếu có.')
                          } catch (e) {
                            setMsg(e instanceof Error ? e.message : 'Không xóa được cấu hình.')
                          }
                        })()
                      }}
                      className="w-full flex-1 rounded-xl border border-slate-200 bg-slate-50 py-2.5 text-sm font-semibold text-slate-800 transition hover:bg-slate-100"
                    >
                      Xóa cấu hình API
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}

          {subTab === 'gatekeeper' ? (
            <div className="mx-auto max-w-3xl space-y-4">
              <div className="flex flex-wrap items-start gap-3">
                <Shield className="h-6 w-6 shrink-0 text-cyan-300" aria-hidden />
                <div>
                  <VietMyAccentHeading as="h3" tone="onLight" size="sm" className="mb-0">
                    Lọc trước khi gọi AI
                  </VietMyAccentHeading>
                  <p className="mt-1 text-xs text-slate-600">
                    Giới hạn hồ sơ nào được gửi cho bước phân tích AI hàng loạt trên màn Hồ sơ. Quy tắc lưu cùng trình
                    duyệt với khóa API (Siêu quản trị).
                  </p>
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-xs font-medium text-slate-600">
                  Độ dài ghi chú tối thiểu (ký tự)
                  <input
                    type="number"
                    min={0}
                    max={5000}
                    value={gkMinLen}
                    disabled={!canLlmApi}
                    onChange={(e) => setGkMinLen(e.target.value)}
                    className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-sky-300 disabled:opacity-50"
                  />
                </label>
                <label className="block text-xs font-medium text-slate-600 sm:col-span-2">
                  Từ khóa ý định (cách nhau bằng dấu phẩy)
                  <input
                    value={gkKeywordsCsv}
                    disabled={!canLlmApi}
                    onChange={(e) => setGkKeywordsCsv(e.target.value)}
                    placeholder="vd. học phí, bố mẹ, phân vân…"
                    className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-sky-300 disabled:opacity-50"
                  />
                  <span className="mt-1 block text-xs text-slate-500">Để trống = tắt lọc theo từ khóa.</span>
                </label>
                <label className="block text-xs font-medium text-slate-600 sm:col-span-2">
                  Tương tác trong vòng (ngày)
                  <input
                    type="number"
                    min={1}
                    max={365}
                    value={gkDays}
                    disabled={!canLlmApi}
                    onChange={(e) => setGkDays(e.target.value)}
                    className="mt-1.5 max-w-[200px] rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-sky-300 disabled:opacity-50"
                  />
                </label>
              </div>
              {canLlmApi ? (
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={persistGatekeeper}
                    className="rounded-xl border border-sky-300 bg-sky-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-700"
                  >
                    Lưu quy tắc lọc
                  </button>
                  <button
                    type="button"
                    onClick={resetGatekeeperDefaults}
                    className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-medium text-slate-800 transition hover:bg-slate-100"
                  >
                    Mặc định
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}

          {subTab === 'library' ? (
            <div className="space-y-3">
              <VietMyAccentHeading as="h3" tone="onLight" size="sm" className="mb-0">
                Tác vụ đã lưu (Firestore)
              </VietMyAccentHeading>
              {loading ? <p className="text-sm text-slate-500">Đang tải…</p> : null}
              <ul className="space-y-2 pr-1">
                {tasks.map((t) => (
                  <li
                    key={t.id}
                    className="flex items-start justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs text-slate-700"
                  >
                    <span>
                      <span className="font-semibold text-slate-900">{t.name}</span>
                      <span className="mt-0.5 block text-xs text-slate-500">{t.targetFields.join(', ')}</span>
                    </span>
                    {canTasks ? (
                      <button
                        type="button"
                        onClick={() => void removeTask(t)}
                        className="shrink-0 rounded-lg border border-rose-200 p-1.5 text-rose-700 hover:bg-rose-50"
                        aria-label="Xóa"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    ) : null}
                  </li>
                ))}
                {!loading && !tasks.length ? (
                  <li className="rounded-lg border border-dashed border-slate-300 px-3 py-6 text-center text-sm text-slate-500">
                    Chưa có tác vụ — chuyển sang tab <strong className="text-slate-700">Tạo tác vụ</strong>.
                  </li>
                ) : null}
              </ul>
            </div>
          ) : null}

          {subTab === 'tasks' ? (
            <div className="mx-auto max-w-3xl space-y-4">
              <VietMyAccentHeading as="h3" tone="onLight" size="sm" className="mb-0">
                Tạo tác vụ mới
              </VietMyAccentHeading>
              <div className="grid gap-3 md:grid-cols-2">
                <label className="block text-xs font-medium text-slate-600 md:col-span-2">
                  Tên tác vụ
                  <input
                    value={taskName}
                    disabled={!canTasks}
                    onChange={(e) => setTaskName(e.target.value)}
                    placeholder="vd. Phân tích năng lực tài chính"
                    className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-emerald-300 disabled:opacity-50"
                  />
                </label>
                <label className="block text-xs font-medium text-slate-600 md:col-span-2">
                  System prompt
                  <textarea
                    value={systemPrompt}
                    disabled={!canTasks}
                    onChange={(e) => setSystemPrompt(e.target.value)}
                    rows={3}
                    className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-emerald-300 disabled:opacity-50"
                  />
                </label>
                <label className="block text-xs font-medium text-slate-600 md:col-span-2">
                  Trọng tâm phân tích (tuỳ chọn)
                  <textarea
                    value={userEmphasis}
                    disabled={!canTasks}
                    onChange={(e) => setUserEmphasis(e.target.value)}
                    rows={2}
                    placeholder="vd. Nhấn mạnh phản ứng phụ huynh về học phí…"
                    className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-emerald-300 disabled:opacity-50"
                  />
                </label>
              </div>

              <p className="text-xs font-bold uppercase tracking-wider text-emerald-800">Trường lead gửi kèm</p>
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
                        'rounded-full border px-2.5 py-1 text-xs transition',
                        on
                          ? 'border-emerald-400 bg-emerald-50 text-emerald-950'
                          : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300',
                        f.extra ? 'ring-1 ring-amber-400/20' : '',
                      ].join(' ')}
                      title={f.extra ? 'Cần tổng hợp ghi chú TV khi chạy từ CRM' : undefined}
                    >
                      {f.label}
                    </button>
                  )
                })}
              </div>

              <p className="text-xs font-bold uppercase tracking-wider text-emerald-800">Schema JSON đầu ra</p>
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
                      className="min-w-[120px] flex-1 rounded-lg border border-slate-200 bg-white px-2 py-2 text-sm text-slate-900 disabled:opacity-50"
                    />
                    <input
                      value={row.typeHint}
                      disabled={!canTasks}
                      onChange={(e) => {
                        const v = e.target.value
                        setSchemaRows((rows) => rows.map((r, j) => (j === i ? { ...r, typeHint: v } : r)))
                      }}
                      placeholder='vd. "Tốt|Kém" hoặc string'
                      className="min-w-[160px] flex-[2] rounded-lg border border-slate-200 bg-white px-2 py-2 text-sm text-slate-900 disabled:opacity-50"
                    />
                    {canTasks ? (
                      <button
                        type="button"
                        onClick={() => setSchemaRows((rows) => rows.filter((_, j) => j !== i))}
                        className="rounded-lg border border-rose-200 px-2 py-2 text-xs text-rose-700 hover:bg-rose-50"
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
                  className="w-full rounded-xl border border-emerald-600 bg-emerald-600 py-2.5 text-sm font-bold uppercase tracking-wide text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-50"
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
