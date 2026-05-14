import { useCallback, useMemo, useState } from 'react'
import { deleteDoc, doc, setDoc, Timestamp } from 'firebase/firestore'
import type { Firestore } from 'firebase/firestore'
import { Shield, Sparkles, Trash2 } from 'lucide-react'
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
  const canEdit = can('config:ai_engine')
  const { tasks, loading, error } = useAITasks()

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
    saveAIConfigToStorage(cfg)
    setMsg('Đã lưu cấu hình API vào trình duyệt (localStorage).')
  }, [cfg])

  const toggleField = useCallback((id: string) => {
    setTargetFields((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }, [])

  const saveTask = useCallback(async () => {
    if (!canEdit || !db) return
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
    } catch (e) {
      console.error(e)
      setMsg('Không lưu được — kiểm tra Firestore Rules (collection ai_tasks).')
    } finally {
      setBusy(false)
    }
  }, [canEdit, db, taskName, systemPrompt, userEmphasis, targetFields, schemaRows])

  const removeTask = useCallback(
    async (t: AITask) => {
      if (!canEdit || !db) return
      if (!window.confirm(`Xóa tác vụ «${t.name}»?`)) return
      setBusy(true)
      try {
        await deleteDoc(doc(db, FS_COLLECTIONS.ai_tasks, t.id))
        setMsg('Đã xóa tác vụ.')
      } finally {
        setBusy(false)
      }
    },
    [canEdit, db],
  )

  const providerLabel = useMemo(
    () =>
      ({
        Gemini: 'Google Gemini',
        OpenAI: 'OpenAI (API ChatGPT)',
      }) as Record<AIProviderId, string>,
    [],
  )

  return (
    <section
      aria-label="Tích hợp LLM Gemini hoặc ChatGPT"
      className="overflow-hidden rounded-3xl border border-rose-500/20 bg-gradient-to-br from-slate-900 via-indigo-950/70 to-slate-900 p-1 shadow-[0_24px_80px_rgba(127,29,29,0.18)] backdrop-blur-xl"
    >
      <div className="rounded-[22px] border border-white/15 bg-gradient-to-b from-slate-900/55 to-slate-950/40 p-6 md:p-8">
        <div className="flex flex-wrap items-center gap-3 border-b border-rose-500/15 pb-5">
          <Sparkles className="h-8 w-8 text-rose-300" aria-hidden />
          <div>
            <VietMyAccentHeading as="h2" tone="onDark" size="lg">
              Tích hợp LLM (Gemini / ChatGPT)
            </VietMyAccentHeading>
            <p className="mt-2 text-sm text-slate-300">
              Chọn Google Gemini hoặc OpenAI (API ChatGPT). Khóa API lưu cục bộ trên trình duyệt (MVP). Danh sách tác
              vụ lưu Firestore <code className="text-amber-200/90">ai_tasks</code>.
            </p>
          </div>
        </div>

        {!canEdit ? (
          <p className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
            Cần quyền <code className="text-amber-50">config:ai_engine</code> (mặc định Admin).
          </p>
        ) : null}
        {error ? (
          <p className="mt-4 rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">{error}</p>
        ) : null}
        {msg ? (
          <p className="mt-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
            {msg}
          </p>
        ) : null}

        <div className="mt-8 grid gap-8 lg:grid-cols-2">
          <div className="rounded-2xl border border-white/12 bg-gradient-to-br from-white/[0.08] to-rose-950/15 p-5 backdrop-blur-md">
            <VietMyAccentHeading as="h3" tone="onDark" size="md" className="mb-0">
              Cấu hình API
            </VietMyAccentHeading>
            <label className="mt-4 block text-xs font-medium text-slate-400">
              Nhà cung cấp
              <select
                value={cfg.provider}
                disabled={!canEdit}
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
            <label className="mt-4 block text-xs font-medium text-slate-400">
              Model
              <input
                value={cfg.model}
                disabled={!canEdit}
                onChange={(e) => setCfg((c) => ({ ...c, model: e.target.value }))}
                className="mt-1.5 w-full rounded-xl border border-white/18 bg-slate-800/50 px-3 py-2.5 text-sm text-slate-100 outline-none focus:ring-2 focus:ring-rose-400/35 disabled:opacity-50"
              />
            </label>
            <label className="mt-4 block text-xs font-medium text-slate-400">
              API Key
              <input
                type="password"
                autoComplete="off"
                value={cfg.apiKey}
                disabled={!canEdit}
                onChange={(e) => setCfg((c) => ({ ...c, apiKey: e.target.value }))}
                placeholder="••••••••"
                className="mt-1.5 w-full rounded-xl border border-white/18 bg-slate-800/50 px-3 py-2.5 font-mono text-sm text-slate-100 outline-none focus:ring-2 focus:ring-rose-400/35 disabled:opacity-50"
              />
            </label>
            {canEdit ? (
              <button
                type="button"
                onClick={persistConfig}
                className="mt-5 w-full rounded-xl border border-rose-400/45 bg-gradient-to-r from-rose-600/30 to-red-900/40 py-2.5 text-sm font-semibold text-rose-50 transition hover:shadow-[0_0_18px_rgba(244,63,94,0.35)]"
              >
                Lưu API vào trình duyệt
              </button>
            ) : null}
          </div>

          <div className="rounded-2xl border border-white/12 bg-gradient-to-br from-white/[0.08] to-violet-950/20 p-5 backdrop-blur-md">
            <VietMyAccentHeading as="h3" tone="onDark" size="md" className="mb-0">
              Tác vụ đã cấu hình
            </VietMyAccentHeading>
            {loading ? <p className="mt-3 text-sm text-slate-500">Đang tải…</p> : null}
            <ul className="mt-3 max-h-48 space-y-2 overflow-y-auto pr-1">
              {tasks.map((t) => (
                <li
                  key={t.id}
                  className="flex items-start justify-between gap-2 rounded-xl border border-white/12 bg-slate-800/35 px-3 py-2 text-xs text-slate-300"
                >
                  <span>
                    <span className="font-semibold text-rose-50/95">{t.name}</span>
                    <span className="mt-0.5 block text-xs text-slate-500">{t.targetFields.join(', ')}</span>
                  </span>
                  {canEdit ? (
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
                <li className="text-xs text-slate-500">Chưa có tác vụ — tạo bên dưới.</li>
              ) : null}
            </ul>
          </div>
        </div>

        <div className="mt-8 overflow-hidden rounded-2xl border border-cyan-400/25 bg-gradient-to-br from-slate-900/80 via-indigo-950/50 to-teal-950/35 p-1 shadow-[0_20px_60px_rgba(6,182,212,0.12)]">
          <div className="rounded-[14px] border border-white/10 bg-gradient-to-br from-white/[0.06] to-cyan-950/20 p-5 backdrop-blur-md md:p-6">
            <div className="flex flex-wrap items-start gap-3">
              <Shield className="h-7 w-7 shrink-0 text-cyan-300" aria-hidden />
              <div className="min-w-0 flex-1">
                <VietMyAccentHeading as="h3" tone="onDark" size="md" className="mb-0">
                  AI Gatekeeper Rules
                </VietMyAccentHeading>
                <p className="mt-2 text-sm text-slate-300">
                  Tiền lọc không tốn token trước khi gọi LLM: độ dài ghi chú tương tác, từ khóa ý định (regex), và hoạt động
                  gần đây. Cấu hình lưu cục bộ trên trình duyệt (cùng thiết bị với người chạy AI hàng loạt).
                </p>
              </div>
            </div>
            <div className="mt-5 grid gap-4 md:grid-cols-3">
              <label className="block text-xs font-medium text-slate-400">
                Độ dài ghi chú tối thiểu (ký tự)
                <input
                  type="number"
                  min={0}
                  max={5000}
                  value={gkMinLen}
                  disabled={!canEdit}
                  onChange={(e) => setGkMinLen(e.target.value)}
                  className="mt-1.5 w-full rounded-xl border border-white/18 bg-slate-800/50 px-3 py-2.5 text-sm text-slate-100 outline-none focus:ring-2 focus:ring-cyan-400/35 disabled:opacity-50"
                />
              </label>
              <label className="block text-xs font-medium text-slate-400 md:col-span-2">
                Từ khóa ý định (cách nhau bằng dấu phẩy)
                <input
                  value={gkKeywordsCsv}
                  disabled={!canEdit}
                  onChange={(e) => setGkKeywordsCsv(e.target.value)}
                  placeholder="vd. học phí, bố mẹ, phân vân…"
                  className="mt-1.5 w-full rounded-xl border border-white/18 bg-slate-800/50 px-3 py-2.5 text-sm text-slate-100 outline-none focus:ring-2 focus:ring-cyan-400/35 disabled:opacity-50"
                />
                <span className="mt-1.5 block text-[11px] text-slate-500">
                  Để trống toàn bộ = tắt lọc theo từ khóa (chỉ còn độ dài + hoạt động gần đây).
                </span>
              </label>
              <label className="block text-xs font-medium text-slate-400 md:col-span-3">
                Tương tác trong vòng (ngày)
                <input
                  type="number"
                  min={1}
                  max={365}
                  value={gkDays}
                  disabled={!canEdit}
                  onChange={(e) => setGkDays(e.target.value)}
                  className="mt-1.5 max-w-[200px] rounded-xl border border-white/18 bg-slate-800/50 px-3 py-2.5 text-sm text-slate-100 outline-none focus:ring-2 focus:ring-cyan-400/35 disabled:opacity-50"
                />
              </label>
            </div>
            {canEdit ? (
              <div className="mt-5 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={persistGatekeeper}
                  className="rounded-xl border border-cyan-400/45 bg-gradient-to-r from-cyan-600/35 to-teal-800/40 px-4 py-2.5 text-sm font-semibold text-cyan-50 transition hover:shadow-[0_0_18px_rgba(34,211,238,0.35)]"
                >
                  Lưu quy tắc Gatekeeper
                </button>
                <button
                  type="button"
                  onClick={resetGatekeeperDefaults}
                  className="rounded-xl border border-white/15 bg-white/[0.06] px-4 py-2.5 text-sm font-medium text-slate-200 transition hover:bg-white/10"
                >
                  Khôi phục mặc định
                </button>
              </div>
            ) : null}
          </div>
        </div>

        <div className="mt-8 rounded-2xl border border-rose-500/20 bg-gradient-to-br from-rose-950/25 via-slate-900/50 to-indigo-950/40 p-5 backdrop-blur-md md:p-6">
          <VietMyAccentHeading as="h3" tone="onDark" size="md" className="mb-0">
            Tạo tác vụ phân tích
          </VietMyAccentHeading>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <label className="block text-xs font-medium text-slate-400 md:col-span-2">
              Tên tác vụ
              <input
                value={taskName}
                disabled={!canEdit}
                onChange={(e) => setTaskName(e.target.value)}
                placeholder="vd. Phân tích Năng lực Tài chính"
                className="mt-1.5 w-full rounded-xl border border-white/18 bg-slate-800/50 px-3 py-2.5 text-sm text-slate-100 outline-none focus:ring-2 focus:ring-rose-400/35 disabled:opacity-50"
              />
            </label>
            <label className="block text-xs font-medium text-slate-400 md:col-span-2">
              System prompt (vai trò nền)
              <textarea
                value={systemPrompt}
                disabled={!canEdit}
                onChange={(e) => setSystemPrompt(e.target.value)}
                rows={4}
                className="mt-1.5 w-full rounded-xl border border-white/18 bg-slate-800/50 px-3 py-2.5 text-sm text-slate-100 outline-none focus:ring-2 focus:ring-rose-400/35 disabled:opacity-50"
              />
            </label>
            <label className="block text-xs font-medium text-slate-400 md:col-span-2">
              User emphasis (trọng tâm phân tích)
              <textarea
                value={userEmphasis}
                disabled={!canEdit}
                onChange={(e) => setUserEmphasis(e.target.value)}
                rows={3}
                placeholder="vd. Nhấn mạnh thái độ phụ huynh khi nhắc học phí…"
                className="mt-1.5 w-full rounded-xl border border-white/18 bg-slate-800/50 px-3 py-2.5 text-sm text-slate-100 outline-none focus:ring-2 focus:ring-rose-400/35 disabled:opacity-50"
              />
            </label>
          </div>

          <p className="mt-4 text-xs font-bold uppercase tracking-[0.22em] text-rose-200/85">Target fields (multi)</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {AI_LEAD_FIELD_OPTIONS.map((f) => {
              const on = targetFields.includes(f.id)
              return (
                <button
                  key={f.id}
                  type="button"
                  disabled={!canEdit}
                  onClick={() => toggleField(f.id)}
                  className={[
                    'rounded-full border px-3 py-1.5 text-xs transition',
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

          <p className="mt-6 text-xs font-bold uppercase tracking-[0.22em] text-rose-200/85">Expected output schema</p>
          <div className="mt-2 space-y-2">
            {schemaRows.map((row, i) => (
              <div key={i} className="flex flex-wrap gap-2">
                <input
                  value={row.key}
                  disabled={!canEdit}
                  onChange={(e) => {
                    const v = e.target.value
                    setSchemaRows((rows) => rows.map((r, j) => (j === i ? { ...r, key: v } : r)))
                  }}
                  placeholder="fieldKey"
                  className="min-w-[140px] flex-1 rounded-lg border border-white/18 bg-slate-800/50 px-2 py-2 text-sm text-slate-100 disabled:opacity-50"
                />
                <input
                  value={row.typeHint}
                  disabled={!canEdit}
                  onChange={(e) => {
                    const v = e.target.value
                    setSchemaRows((rows) => rows.map((r, j) => (j === i ? { ...r, typeHint: v } : r)))
                  }}
                  placeholder='vd. "Tốt|Kém" hoặc string'
                  className="min-w-[180px] flex-[2] rounded-lg border border-white/18 bg-slate-800/50 px-2 py-2 text-sm text-slate-100 disabled:opacity-50"
                />
                {canEdit ? (
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
            {canEdit ? (
              <button
                type="button"
                onClick={() => setSchemaRows((rows) => [...rows, { key: '', typeHint: 'string' }])}
                className="mt-1 text-xs font-medium text-amber-300 hover:underline"
              >
                + Thêm khóa
              </button>
            ) : null}
          </div>

          {canEdit ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => void saveTask()}
              className="mt-6 w-full rounded-xl border border-rose-400/50 bg-gradient-to-r from-rose-600/40 via-red-700/35 to-zinc-900/80 py-3 text-sm font-bold uppercase tracking-wide text-white shadow-lg transition hover:shadow-[0_0_22px_rgba(244,63,94,0.35)] disabled:opacity-50"
            >
              {busy ? 'Đang lưu…' : 'Lưu tác vụ lên Firestore'}
            </button>
          ) : null}
        </div>
      </div>
    </section>
  )
}
