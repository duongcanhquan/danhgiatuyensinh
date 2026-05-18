import { useCallback, useEffect, useState } from 'react'
import { RefreshCw, Save } from 'lucide-react'
import type { OmicallIntegrationConfig } from '../types'
import { useAuth } from '../hooks/useAuth'
import { useOmicall } from '../contexts/OmicallProvider'
import { DEFAULT_OMICALL_SDK_VERSION } from '../utils/omicallConfig'
import { VietMyAccentHeading } from './VietMyAccentHeading'

const INPUT =
  'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-100'

const PANEL =
  'flex min-h-0 flex-col gap-4 rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm sm:p-5 lg:min-h-[28rem]'

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
  const [msg, setMsg] = useState<string | null>(null)

  useEffect(() => {
    setDraft(config)
  }, [config])

  const patch = useCallback((partial: Partial<OmicallIntegrationConfig>) => {
    setDraft((d) => ({ ...d, ...partial }))
  }, [])

  const onSave = async () => {
    if (!canEdit) return
    setBusy(true)
    setMsg(null)
    try {
      await saveConfig(draft)
      setMsg('Đã lưu cấu hình OMICall — mọi TVV sẽ dùng sau khi tải lại trang.')
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Không lưu được')
    } finally {
      setBusy(false)
    }
  }

  const onReset = async () => {
    if (!canEdit) return
    if (!window.confirm('Xóa cấu hình OMICall trên server? App sẽ dùng giá trị mặc định / .env (nếu có).')) return
    setBusy(true)
    setMsg(null)
    try {
      await resetConfig()
      setMsg('Đã xóa cấu hình trên Firestore.')
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Không xóa được')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-0 w-full flex-col gap-4 px-1 py-2">
      <VietMyAccentHeading as="h2" tone="onLight" size="md" className="text-lg">
        Gọi điện — OMICall
      </VietMyAccentHeading>

      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-2 lg:gap-6">
        <section className={PANEL} aria-labelledby="omicall-panel-call">
          <div>
            <h3 id="omicall-panel-call" className="text-base font-bold text-slate-900">
              Tổng đài & gọi từ hồ sơ
            </h3>
            <p className="mt-0.5 text-xs text-slate-500">SIP, cách quay số, micro / máy bàn</p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium text-slate-800">Trạng thái phiên</p>
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusBadge(connectionStatus)}`}>
                {connectionLabel}
              </span>
            </div>
            {lastError ? <p className="mt-2 text-xs text-red-700">{lastError}</p> : null}
            {lastCallHint ? <p className="mt-2 text-xs text-slate-700">{lastCallHint}</p> : null}
            <button
              type="button"
              onClick={reconnect}
              className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              <RefreshCw className="h-3.5 w-3.5" aria-hidden />
              Kết nối lại
            </button>
            {configLoading ? <p className="mt-2 text-xs text-slate-500">Đang đọc cấu hình…</p> : null}
            {configFromRemote ? (
              <p className="mt-2 text-xs text-slate-500">Đã lưu trên server</p>
            ) : (
              <p className="mt-2 text-xs text-slate-500">Chưa lưu trên server</p>
            )}
          </div>

          <fieldset disabled={!canEdit || busy} className="flex min-h-0 flex-1 flex-col gap-3 disabled:opacity-60">
            <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-slate-800">
              <input
                type="checkbox"
                checked={draft.enabled}
                onChange={(e) => patch({ enabled: e.target.checked })}
                className="h-4 w-4 rounded border-slate-300"
              />
              Bật gọi điện từ app
            </label>

            <label className="block text-sm">
              <span className="mb-1 block font-medium text-slate-700">Domain tổng đài (sipRealm)</span>
              <input
                className={INPUT}
                value={draft.sipRealm}
                onChange={(e) => patch({ sipRealm: e.target.value })}
                placeholder="vd. demo01"
                autoComplete="off"
              />
            </label>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-sm">
                <span className="mb-1 block font-medium text-slate-700">Số nội bộ mặc định</span>
                <input
                  className={INPUT}
                  value={draft.defaultSipUser ?? ''}
                  onChange={(e) => patch({ defaultSipUser: e.target.value })}
                  placeholder="100"
                  autoComplete="off"
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block font-medium text-slate-700">Mật khẩu SIP mặc định</span>
                <input
                  type="password"
                  className={INPUT}
                  value={draft.defaultSipPassword ?? ''}
                  onChange={(e) => patch({ defaultSipPassword: e.target.value })}
                  autoComplete="new-password"
                />
              </label>
            </div>

            <label className="block text-sm">
              <span className="mb-1 block font-medium text-slate-700">Cách gọi</span>
              <select
                className={INPUT}
                value={draft.callMode === 'deskPhone' ? 'deskPhone' : 'browser'}
                onChange={(e) => patch({ callMode: e.target.value === 'deskPhone' ? 'deskPhone' : 'browser' })}
              >
                <option value="browser">Trình duyệt (micro)</option>
                <option value="deskPhone">Máy bàn / IP phone</option>
              </select>
            </label>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-sm">
                <span className="mb-1 block font-medium text-slate-700">Định dạng quay số</span>
                <select
                  className={INPUT}
                  value={draft.dialFormat === 'local' ? 'local' : 'intl84'}
                  onChange={(e) => patch({ dialFormat: e.target.value === 'local' ? 'local' : 'intl84' })}
                >
                  <option value="intl84">0… → +84…</option>
                  <option value="local">Giữ 0…</option>
                </select>
              </label>
              <label className="block text-sm">
                <span className="mb-1 block font-medium text-slate-700">Đầu số gọi ra</span>
                <input
                  className={INPUT}
                  value={draft.defaultOutboundNumber ?? ''}
                  onChange={(e) => patch({ defaultOutboundNumber: e.target.value })}
                  placeholder="Hotline"
                  autoComplete="off"
                />
              </label>
            </div>

            <label className="block text-sm">
              <span className="mb-1 block font-medium text-slate-700">Phiên bản Web SDK</span>
              <input
                className={INPUT}
                value={draft.sdkVersion}
                onChange={(e) => patch({ sdkVersion: e.target.value })}
                placeholder={DEFAULT_OMICALL_SDK_VERSION}
              />
            </label>

            <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-800">
              <input
                type="checkbox"
                checked={draft.hideDialPad !== false}
                onChange={(e) => patch({ hideDialPad: e.target.checked })}
                className="h-4 w-4 rounded border-slate-300"
              />
              Ẩn bàn phím OMICall
            </label>
            <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-800">
              <input
                type="checkbox"
                checked={draft.autoLogCalls !== false}
                onChange={(e) => patch({ autoLogCalls: e.target.checked })}
                className="h-4 w-4 rounded border-slate-300"
              />
              Tự lưu log vào lịch sử hồ sơ
            </label>
          </fieldset>

          <section className="mt-auto rounded-xl border border-amber-200/80 bg-amber-50/50 p-3 text-xs text-slate-700">
            <p className="font-semibold text-amber-950">Gọi không ra máy?</p>
            <ul className="mt-1.5 list-inside list-disc space-y-0.5 leading-relaxed">
              <li>Trạng thái phải là <strong>Sẵn sàng gọi</strong>.</li>
              <li>Bật <strong>micro</strong> trên trình duyệt.</li>
              <li>Thử <strong>Máy bàn</strong> hoặc đổi định dạng số 0… / +84…</li>
            </ul>
          </section>
        </section>

        <section className={PANEL} aria-labelledby="omicall-panel-sync">
          <div>
            <h3 id="omicall-panel-sync" className="text-base font-bold text-slate-900">
              Đồng bộ lịch sử & KPI
            </h3>
            <p className="mt-0.5 text-xs text-slate-500">API REST, webhook, ghi âm, phân tích cuộc gọi</p>
          </div>

          <fieldset disabled={!canEdit || busy} className="flex min-h-0 flex-1 flex-col gap-4 disabled:opacity-60">
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-slate-700">API base URL</span>
              <input
                className={INPUT}
                value={draft.apiBaseUrl ?? ''}
                onChange={(e) => patch({ apiBaseUrl: e.target.value })}
                placeholder="https://public-v1.omicall.com"
                autoComplete="off"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-slate-700">API key (Bearer)</span>
              <input
                type="password"
                className={INPUT}
                value={draft.apiKey ?? ''}
                onChange={(e) => patch({ apiKey: e.target.value })}
                placeholder="AccessToken từ OMICall"
                autoComplete="off"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-slate-700">Webhook secret</span>
              <input
                type="password"
                className={INPUT}
                value={draft.webhookSecret ?? ''}
                onChange={(e) => patch({ webhookSecret: e.target.value })}
                placeholder="Mã bí mật URL webhook"
                autoComplete="off"
              />
            </label>
          </fieldset>

          <div className="mt-auto rounded-xl border border-slate-200 bg-slate-50/80 p-3 text-xs text-slate-600">
            <p className="font-medium text-slate-800">Sau khi lưu</p>
            <p className="mt-1 leading-relaxed">
              Deploy Functions và cấu hình webhook trên OMICall trỏ tới{' '}
              <code className="rounded bg-white px-1 py-0.5 text-[11px]">omicallCallWebhook</code>.
            </p>
          </div>
        </section>
      </div>

      {!canEdit ? (
        <p className="text-sm text-amber-800">Chỉ quản trị có quyền «Tổng đài OMICall» mới chỉnh và lưu cấu hình này.</p>
      ) : (
        <div className="flex flex-wrap items-center gap-3 border-t border-slate-200 pt-4">
          <button
            type="button"
            disabled={busy}
            onClick={() => void onSave()}
            className="inline-flex items-center gap-2 rounded-lg bg-sky-800 px-4 py-2.5 text-sm font-semibold text-white hover:bg-sky-900 disabled:opacity-50"
          >
            <Save className="h-4 w-4" aria-hidden />
            {busy ? 'Đang lưu…' : 'Lưu cấu hình'}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void onReset()}
            className="rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            Xóa cấu hình trên server
          </button>
          {msg ? <p className="text-sm font-medium text-slate-800">{msg}</p> : null}
        </div>
      )}
    </div>
  )
}
