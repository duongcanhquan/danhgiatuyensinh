import { useCallback, useEffect, useMemo, useState } from 'react'
import { CheckCircle2, Copy, RefreshCw, Save, Sparkles, Zap } from 'lucide-react'
import type { OmicallIntegrationConfig } from '../types'
import { useAuth } from '../hooks/useAuth'
import { useOmicall } from '../contexts/OmicallProvider'
import { useOmicallSyncRuns } from '../hooks/useOmicallSyncRuns'
import { DEFAULT_OMICALL_SDK_VERSION } from '../utils/omicallConfig'
import { reconcileOmicallKpi } from '../services/reconcileOmicallKpi'
import { triggerOmicallHistorySync } from '../services/triggerOmicallSync'
import { probeOmicallInternalPhones } from '../services/omicallCallCenterProbe'
import { registerOmicallWebhookOnServer } from '../services/omicallRegisterWebhook'
import { runOmicallAdminBootstrap } from '../services/omicallAutoBootstrap'
import { getFirebaseApp } from '../services/firebase'
import {
  buildOmicallWebhookUrl,
  buildQuickOmicallConfig,
  DEFAULT_OMICALL_API_BASE_URL,
  randomWebhookSecret,
} from '../utils/omicallSetup'
import { VietMyAccentHeading } from './VietMyAccentHeading'

const INPUT =
  'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-100'

function statusBadge(status: string): string {
  switch (status) {
    case 'connected':
      return 'bg-emerald-100 text-emerald-900'
    case 'loading':
    case 'registering':
      return 'bg-amber-100 text-amber-900'
    case 'error':
      return 'bg-red-100 text-red-900'
    default:
      return 'bg-slate-100 text-slate-700'
  }
}

export function OmicallSettingsTab() {
  const { can } = useAuth()
  const canEdit = can('config:omicall')
  const {
    config,
    configFromRemote,
    configLoading,
    connectionStatus,
    connectionLabel,
    lastError,
    saveConfig,
    resetConfig,
    reconnect,
    lastCallHint,
  } = useOmicall()

  const [draft, setDraft] = useState<OmicallIntegrationConfig>(config)
  const [busy, setBusy] = useState(false)
  const [quickBusy, setQuickBusy] = useState(false)
  const [webhookBusy, setWebhookBusy] = useState(false)
  const [syncBusy, setSyncBusy] = useState(false)
  const [kpiReconcileBusy, setKpiReconcileBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const { lastRun } = useOmicallSyncRuns(3)

  const projectId = getFirebaseApp()?.options.projectId ?? ''
  const webhookPreview = useMemo(() => {
    const secret = draft.webhookSecret?.trim()
    if (!projectId || !secret) return ''
    return buildOmicallWebhookUrl(projectId, secret)
  }, [draft.webhookSecret, projectId])

  useEffect(() => {
    setDraft(config)
  }, [config])

  const patch = useCallback((partial: Partial<OmicallIntegrationConfig>) => {
    setDraft((d) => ({ ...d, ...partial }))
  }, [])

  const copyText = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setMsg('Đã copy vào clipboard.')
    } catch {
      setMsg('Không copy được — hãy chọn và copy thủ công.')
    }
  }

  const onSave = async (next?: OmicallIntegrationConfig) => {
    if (!canEdit) return
    const payload = next ?? draft
    setBusy(true)
    setMsg(null)
    try {
      await saveConfig(payload)
      setDraft(payload)
      if (canEdit && payload.enabled && payload.apiKey?.trim() && payload.webhookSecret?.trim()) {
        void runOmicallAdminBootstrap({
          config: payload,
          projectId: getFirebaseApp()?.options.projectId ?? '',
        }).then((b) => {
          if (b.webhook || b.phones) reconnect()
        })
      }
      setMsg('Đã lưu — hệ thống tự đăng ký webhook & đồng bộ số nội bộ nếu cần.')
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Không lưu được')
    } finally {
      setBusy(false)
    }
  }

  const runQuickSetup = async () => {
    if (!canEdit) return
    const apiKey = draft.apiKey?.trim()
    const apiBaseUrl = (draft.apiBaseUrl ?? DEFAULT_OMICALL_API_BASE_URL).trim()
    if (!apiKey || !apiBaseUrl) {
      setMsg('Cần nhập API key và địa chỉ API trước.')
      return
    }
    setQuickBusy(true)
    setMsg(null)
    try {
      let domainHint = ''
      try {
        const phones = await probeOmicallInternalPhones()
        domainHint = phones.items.find((p) => p.domain)?.domain ?? phones.items[0]?.domain ?? ''
      } catch (e) {
        setMsg(
          `Không gọi được API Tổng đài: ${e instanceof Error ? e.message : 'lỗi'} — kiểm tra key/URL, deploy Functions (npm run deploy:omicall).`,
        )
        return
      }
      const toSave = buildQuickOmicallConfig(
        { ...draft, apiBaseUrl, apiKey },
        domainHint || draft.sipRealm,
      )
      await saveConfig(toSave)
      setDraft(toSave)
      const bootstrap = await runOmicallAdminBootstrap({
        config: toSave,
        projectId: getFirebaseApp()?.options.projectId ?? '',
        force: true,
      })
      setMsg(
        [
          `Cài đặt nhanh xong.`,
          domainHint ? `Domain tổng đài: ${domainHint}.` : '',
          bootstrap.webhook ? bootstrap.webhook : '',
          bootstrap.phones ?? '',
          bootstrap.errors.length ? `Lưu ý: ${bootstrap.errors.join(' · ')}` : '',
          'Hệ thống sẽ tự duy trì kết nối khi đăng nhập.',
        ]
          .filter(Boolean)
          .join(' '),
      )
      reconnect()
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Cài đặt nhanh thất bại')
    } finally {
      setQuickBusy(false)
    }
  }

  const runRegisterWebhook = async () => {
    if (!canEdit) return
    setWebhookBusy(true)
    setMsg(null)
    try {
      const r = await registerOmicallWebhookOnServer()
      setMsg(r.message)
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Không đăng ký webhook')
    } finally {
      setWebhookBusy(false)
    }
  }

  const webhookOk =
    Boolean(config.webhookRegisteredUrl?.trim()) &&
    Boolean(projectId && draft.webhookSecret?.trim()) &&
    config.webhookRegisteredUrl === buildOmicallWebhookUrl(projectId, draft.webhookSecret!.trim())

  const setupSteps = [
    { done: draft.enabled && Boolean(draft.apiKey?.trim()), label: 'API key đã nhập' },
    { done: Boolean(draft.sipRealm?.trim()), label: 'Domain tổng đài' },
    { done: configFromRemote, label: 'Đã lưu trên server' },
    { done: webhookOk, label: 'Webhook đã đăng ký (tự động)' },
    { done: connectionStatus === 'connected', label: 'Tổng đài: Sẵn sàng gọi' },
  ]

  return (
    <div className="flex min-h-0 w-full flex-col gap-5 px-1 py-2">
      <div>
        <VietMyAccentHeading as="h2" tone="onLight" size="md" className="text-lg">
          Gọi điện — OMICall
        </VietMyAccentHeading>
        <p className="mt-1 max-w-2xl text-sm leading-relaxed text-slate-600">
          Nhập <strong>API key + mã webhook</strong> rồi bấm <strong>Cài đặt nhanh</strong> một lần. Sau đó hệ thống{' '}
          <strong>tự đăng ký webhook</strong>, <strong>tự đồng bộ số nội bộ</strong> và <strong>tự kết nối tổng đài</strong>{' '}
          mỗi khi TVV / quản trị đăng nhập — không cần bấm lặp lại.
        </p>
      </div>

      <ol className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {setupSteps.map((s, i) => (
          <li
            key={s.label}
            className={`flex items-start gap-2 rounded-xl border px-3 py-2 text-xs ${
              s.done ? 'border-emerald-200 bg-emerald-50/80 text-emerald-950' : 'border-slate-200 bg-white text-slate-600'
            }`}
          >
            <span className="font-bold text-slate-400">{i + 1}.</span>
            {s.done ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden /> : null}
            <span>{s.label}</span>
          </li>
        ))}
      </ol>

      <section className="rounded-2xl border border-sky-200/90 bg-gradient-to-b from-sky-50/80 to-white p-5 shadow-sm">
        <h3 className="text-base font-bold text-slate-900">Bước 1 — Điền thông tin OMICall</h3>
        <fieldset disabled={!canEdit || busy || quickBusy} className="mt-4 grid gap-3 disabled:opacity-60">
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-700">Địa chỉ API</span>
            <input
              className={INPUT}
              value={draft.apiBaseUrl ?? DEFAULT_OMICALL_API_BASE_URL}
              onChange={(e) => patch({ apiBaseUrl: e.target.value })}
              placeholder={DEFAULT_OMICALL_API_BASE_URL}
              autoComplete="off"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-700">API key (Access Token)</span>
            <input
              type="password"
              className={INPUT}
              value={draft.apiKey ?? ''}
              onChange={(e) => patch({ apiKey: e.target.value })}
              placeholder="Dán token từ OMICall"
              autoComplete="off"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 flex flex-wrap items-center justify-between gap-2 font-medium text-slate-700">
              <span>Mã bí mật webhook</span>
              <button
                type="button"
                className="text-xs font-semibold text-sky-800 hover:underline"
                onClick={() => patch({ webhookSecret: randomWebhookSecret() })}
              >
                Tạo mã ngẫu nhiên
              </button>
            </span>
            <input
              type="password"
              className={INPUT}
              value={draft.webhookSecret ?? ''}
              onChange={(e) => patch({ webhookSecret: e.target.value })}
              placeholder="Tự tạo hoặc nhập tay"
              autoComplete="off"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-700">
              Domain tổng đài <span className="font-normal text-slate-500">(tự điền sau Cài đặt nhanh)</span>
            </span>
            <input
              className={INPUT}
              value={draft.sipRealm}
              onChange={(e) => patch({ sipRealm: e.target.value })}
              placeholder="vd. omiteam"
              autoComplete="off"
            />
          </label>
        </fieldset>

        {canEdit ? (
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={quickBusy || busy}
              onClick={() => void runQuickSetup()}
              className="inline-flex items-center gap-2 rounded-xl bg-sky-800 px-4 py-2.5 text-sm font-semibold text-white hover:bg-sky-900 disabled:opacity-50"
            >
              <Sparkles className="h-4 w-4" aria-hidden />
              {quickBusy ? 'Đang cài đặt…' : 'Cài đặt nhanh (lưu + domain + đồng bộ TVV)'}
            </button>
            <button
              type="button"
              disabled={busy || quickBusy}
              onClick={() => void onSave()}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-50"
            >
              <Save className="h-4 w-4" aria-hidden />
              Chỉ lưu
            </button>
          </div>
        ) : null}
      </section>

      <section className="rounded-2xl border border-violet-200/90 bg-violet-50/40 p-5 shadow-sm">
        <h3 className="text-base font-bold text-slate-900">Webhook — tự đăng ký</h3>
        <p className="mt-1 text-sm text-slate-600">
          Sau khi lưu cấu hình, app <strong>tự gọi OMICall</strong> đăng ký webhook (khi đăng nhập hoặc Cài đặt nhanh).
          Nút dưới chỉ dùng khi cần đăng ký lại thủ công.
        </p>
        {webhookOk ? (
          <p className="mt-2 text-xs font-semibold text-emerald-800">
            Đã đăng ký: {config.webhookRegisteredAt ? new Date(config.webhookRegisteredAt).toLocaleString('vi-VN') : 'gần đây'}
          </p>
        ) : null}
        {webhookPreview ? (
          <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-white p-2">
            <code className="max-w-full flex-1 break-all text-[11px] text-slate-800">{webhookPreview}</code>
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
              onClick={() => void copyText(webhookPreview)}
            >
              <Copy className="h-3.5 w-3.5" aria-hidden />
              Copy URL
            </button>
          </div>
        ) : (
          <p className="mt-2 text-xs text-amber-800">Cần mã webhook + project Firebase để hiện URL.</p>
        )}
        <p className="mt-2 font-mono text-[11px] text-slate-500">
          Deploy: <span className="text-slate-700">npm run deploy:omicall</span>
        </p>
        {canEdit ? (
          <button
            type="button"
            disabled={webhookBusy || !draft.webhookSecret?.trim() || !configFromRemote}
            onClick={() => void runRegisterWebhook()}
            className="mt-3 inline-flex items-center gap-2 rounded-xl bg-violet-800 px-4 py-2.5 text-sm font-semibold text-white hover:bg-violet-900 disabled:opacity-50"
          >
            {webhookBusy ? 'Đang đăng ký…' : 'Đăng ký webhook trên OMICall'}
          </button>
        ) : null}
        {!configFromRemote ? (
          <p className="mt-2 text-xs text-slate-500">Cần «Cài đặt nhanh» hoặc «Chỉ lưu» trước.</p>
        ) : null}
      </section>

      <section className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-base font-bold text-slate-900">Trạng thái & thử gọi</h3>
            <p className="text-xs text-slate-500">
              Mở app là tự kết nối tổng đài. TVV mở hồ sơ → Gọi (micro) hoặc Máy bàn. Lịch sử gọi đồng bộ mỗi 15 phút
              trên server.
            </p>
          </div>
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusBadge(connectionStatus)}`}>
            {connectionLabel}
          </span>
        </div>
        {lastError ? <p className="mt-2 text-xs text-red-700">{lastError}</p> : null}
        {lastCallHint ? <p className="mt-2 text-xs text-slate-700">{lastCallHint}</p> : null}
        {connectionStatus === 'error' ? (
          <button
            type="button"
            onClick={reconnect}
            className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-white"
          >
            <RefreshCw className="h-3.5 w-3.5" aria-hidden />
            Thử kết nối lại
          </button>
        ) : (
          <p className="mt-2 text-xs text-emerald-800">Đang tự giữ kết nối — không cần thao tác thêm.</p>
        )}
        {configLoading ? <p className="mt-2 text-xs text-slate-500">Đang đọc cấu hình…</p> : null}
      </section>

      <section className="rounded-2xl border border-slate-200/90 bg-slate-50/50 p-4">
        <h3 className="text-sm font-bold text-slate-900">TVV mới hoặc đổi số nội bộ</h3>
        <p className="mt-1 text-sm leading-relaxed text-slate-600">
          Tạo số nội bộ trên OMICall <strong>cùng email CRM</strong> — khi TVV đăng nhập, hệ thống{' '}
          <strong>tự gán số nội bộ</strong>. Quản trị vẫn có thể đồng bộ toàn bộ trong «Quản lý nhân sự» nếu cần.
        </p>
        {config.lastInternalPhonesSyncAt ? (
          <p className="mt-1 text-xs text-slate-500">
            Lần đồng bộ số nội bộ gần nhất: {new Date(config.lastInternalPhonesSyncAt).toLocaleString('vi-VN')}
          </p>
        ) : null}
      </section>

      <details
        className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm"
        open={showAdvanced}
        onToggle={(e) => setShowAdvanced((e.target as HTMLDetailsElement).open)}
      >
        <summary className="cursor-pointer text-sm font-bold text-slate-900">Tuỳ chọn nâng cao</summary>
        <fieldset disabled={!canEdit || busy} className="mt-4 grid gap-3 disabled:opacity-60">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={draft.enabled}
              onChange={(e) => patch({ enabled: e.target.checked })}
              className="h-4 w-4"
            />
            Bật gọi từ app
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-700">Cách gọi mặc định</span>
            <select
              className={INPUT}
              value={draft.callMode === 'deskPhone' ? 'deskPhone' : 'browser'}
              onChange={(e) => patch({ callMode: e.target.value === 'deskPhone' ? 'deskPhone' : 'browser' })}
            >
              <option value="browser">Micro trình duyệt</option>
              <option value="deskPhone">Máy bàn / app (click-to-call)</option>
            </select>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-700">Đầu số gọi ra mặc định</span>
            <input
              className={INPUT}
              value={draft.defaultOutboundNumber ?? ''}
              onChange={(e) => patch({ defaultOutboundNumber: e.target.value })}
              autoComplete="off"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-700">Phiên bản Web SDK</span>
            <input
              className={INPUT}
              value={draft.sdkVersion}
              onChange={(e) => patch({ sdkVersion: e.target.value })}
              placeholder={DEFAULT_OMICALL_SDK_VERSION}
            />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={draft.historySyncEnabled !== false}
              onChange={(e) => patch({ historySyncEnabled: e.target.checked })}
              className="h-4 w-4"
            />
            Đồng bộ lịch sử tự động (15 phút)
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-700">Quét lùi lịch sử (phút)</span>
            <input
              type="number"
              min={15}
              max={4320}
              className={INPUT}
              value={draft.historyLookbackMinutes ?? 180}
              onChange={(e) => patch({ historyLookbackMinutes: Number(e.target.value) })}
            />
          </label>
        </fieldset>
        {canEdit ? (
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={syncBusy}
              onClick={() => {
                setSyncBusy(true)
                void triggerOmicallHistorySync(draft.historyLookbackMinutes)
                  .then((r) =>
                    setMsg(
                      `Xong: ${r.processed} cuộc đồng bộ · ${r.kpiReconcileApplied ?? 0} KPI từ lịch sử · ${r.interactionsApplied ?? 0} từ tiến trình hồ sơ.`,
                    ),
                  )
                  .catch((e) => setMsg(e instanceof Error ? e.message : 'Lỗi'))
                  .finally(() => setSyncBusy(false))
              }}
              className="inline-flex items-center gap-1 rounded-lg bg-violet-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-800 disabled:opacity-50"
            >
              <Zap className="h-3.5 w-3.5" aria-hidden />
              {syncBusy ? 'Đang chạy…' : 'Đồng bộ lịch sử ngay'}
            </button>
            <button
              type="button"
              disabled={kpiReconcileBusy || syncBusy}
              onClick={() => {
                setKpiReconcileBusy(true)
                void reconcileOmicallKpi(21)
                  .then((r) =>
                    setMsg(
                      `Bù KPI: ${r.applied} cuộc từ lịch sử gọi · ${r.interactionsApplied} từ tiến trình hồ sơ (đã quét ${r.scanned}).`,
                    ),
                  )
                  .catch((e) => setMsg(e instanceof Error ? e.message : 'Lỗi bù KPI'))
                  .finally(() => setKpiReconcileBusy(false))
              }}
              className="inline-flex items-center gap-1 rounded-lg border border-violet-300 bg-white px-3 py-1.5 text-xs font-semibold text-violet-900 hover:bg-violet-50 disabled:opacity-50"
            >
              {kpiReconcileBusy ? 'Đang bù…' : 'Bù KPI 21 ngày'}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                if (!window.confirm('Xóa cấu hình OMICall trên server?')) return
                void resetConfig().then(() => setMsg('Đã xóa cấu hình.'))
              }}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50"
            >
              Xóa cấu hình server
            </button>
          </div>
        ) : null}
        {lastRun ? (
          <p className="mt-2 text-xs text-slate-600">
            Lần sync gần nhất: {lastRun.status} — {lastRun.processed ?? 0} cuộc
          </p>
        ) : null}
      </details>

      {!canEdit ? (
        <p className="text-sm text-amber-800">Chỉ quản trị có quyền «Tổng đài OMICall» mới chỉnh cấu hình.</p>
      ) : null}
      {msg ? <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800">{msg}</p> : null}
    </div>
  )
}
