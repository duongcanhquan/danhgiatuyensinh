import { useCallback, useEffect, useState } from 'react'
import { Phone, RefreshCw, Save } from 'lucide-react'
import type { OmicallIntegrationConfig } from '../types'
import { useAuth } from '../hooks/useAuth'
import { useOmicall } from '../contexts/OmicallProvider'
import { DEFAULT_OMICALL_SDK_VERSION } from '../utils/omicallConfig'
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
    <div className="mx-auto max-w-3xl space-y-6 px-1 py-2">
      <div>
        <VietMyAccentHeading as="h2" tone="onLight" size="md" className="text-lg">
          Gọi điện — OMICall
        </VietMyAccentHeading>
        <p className="mt-1 text-sm leading-relaxed text-slate-600">
          Bật tổng đài để TVV bấm gọi từ hồ sơ (SĐT học sinh / phụ huynh). Cuộc gọi kết thúc có thể tự lưu vào{' '}
          <strong>lịch sử tương tác</strong> của hồ sơ. Cần whitelist domain app trên OMICall và số nội bộ SIP cho từng
          TVV (hoặc số mặc định bên dưới).
        </p>
      </div>

      <section className="rounded-xl border border-slate-200 bg-slate-50/80 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-medium text-slate-800">Trạng thái phiên hiện tại</p>
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
          <p className="mt-2 text-xs text-slate-500">Nguồn: Firestore (scoringAux/omicallIntegration)</p>
        ) : (
          <p className="mt-2 text-xs text-slate-500">Chưa có cấu hình trên server — dùng mặc định / biến .env.</p>
        )}
      </section>

      <fieldset disabled={!canEdit || busy} className="space-y-4 disabled:opacity-60">
        <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-800">
          <input
            type="checkbox"
            checked={draft.enabled}
            onChange={(e) => patch({ enabled: e.target.checked })}
            className="rounded border-slate-300"
          />
          Bật gọi điện từ app
        </label>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-700">Phiên bản Web SDK</span>
            <input
              className={INPUT}
              value={draft.sdkVersion}
              onChange={(e) => patch({ sdkVersion: e.target.value })}
              placeholder={DEFAULT_OMICALL_SDK_VERSION}
            />
            <span className="mt-0.5 block text-xs text-slate-500">Xem changelog trên trang OMICall Web SDK</span>
          </label>
          <label className="block text-sm sm:col-span-2">
            <span className="mb-1 block font-medium text-slate-700">Domain tổng đài (sipRealm)</span>
            <input
              className={INPUT}
              value={draft.sipRealm}
              onChange={(e) => patch({ sipRealm: e.target.value })}
              placeholder="vd. demo01"
              autoComplete="off"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-700">Số nội bộ mặc định (tuỳ chọn)</span>
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
          <label className="block text-sm sm:col-span-2">
            <span className="mb-1 block font-medium text-slate-700">Cách gọi</span>
            <select
              className={INPUT}
              value={draft.callMode === 'deskPhone' ? 'deskPhone' : 'browser'}
              onChange={(e) => patch({ callMode: e.target.value === 'deskPhone' ? 'deskPhone' : 'browser' })}
            >
              <option value="browser">Trình duyệt (micro — makeCall)</option>
              <option value="deskPhone">Máy bàn / IP phone (click-to-call — remoteCall)</option>
            </select>
            <span className="mt-0.5 block text-xs text-slate-500">
              Nếu bàn phím OMICall gọi được mà nút trên hồ sơ treo «đang gọi», thử chọn <strong>Máy bàn</strong>.
            </span>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-700">Định dạng quay số</span>
            <select
              className={INPUT}
              value={draft.dialFormat === 'local' ? 'local' : 'intl84'}
              onChange={(e) => patch({ dialFormat: e.target.value === 'local' ? 'local' : 'intl84' })}
            >
              <option value="intl84">Tự đổi 0… thành +84…</option>
              <option value="local">Giữ trong nước 0… (giống bàn phím OMICall)</option>
            </select>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-700">Đầu số gọi ra (hotline)</span>
            <input
              className={INPUT}
              value={draft.defaultOutboundNumber ?? ''}
              onChange={(e) => patch({ defaultOutboundNumber: e.target.value })}
              placeholder="Tuỳ chọn — nếu extension có nhiều đầu số"
              autoComplete="off"
            />
          </label>
          <label className="block text-sm sm:col-span-2">
            <span className="mb-1 block font-medium text-slate-700">API base URL đồng bộ lịch sử</span>
            <input
              className={INPUT}
              value={draft.apiBaseUrl ?? ''}
              onChange={(e) => patch({ apiBaseUrl: e.target.value })}
              placeholder="vd. https://public-v1.omicall.com"
              autoComplete="off"
            />
            <span className="mt-0.5 block text-xs text-slate-500">
              Dùng cho Cloud Functions lấy lịch sử cuộc gọi, ghi âm và tổng hợp KPI.
            </span>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-700">API key REST đồng bộ</span>
            <input
              type="password"
              className={INPUT}
              value={draft.apiKey ?? ''}
              onChange={(e) => patch({ apiKey: e.target.value })}
              placeholder="Dùng để đồng bộ lịch sử OMICall"
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
              placeholder="Mã tự đặt, nhập cùng trên URL webhook"
              autoComplete="off"
            />
          </label>
        </div>

        <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-800">
          <input
            type="checkbox"
            checked={draft.hideDialPad !== false}
            onChange={(e) => patch({ hideDialPad: e.target.checked })}
            className="rounded border-slate-300"
          />
          Ẩn bàn phím quay số của OMICall (chỉ gọi từ nút trên hồ sơ)
        </label>
        <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-800">
          <input
            type="checkbox"
            checked={draft.autoLogCalls !== false}
            onChange={(e) => patch({ autoLogCalls: e.target.checked })}
            className="rounded border-slate-300"
          />
          Tự lưu log cuộc gọi vào lịch sử tương tác khi kết thúc
        </label>
      </fieldset>

      {!canEdit ? (
        <p className="text-sm text-amber-800">Chỉ quản trị có quyền «Tổng đài OMICall» mới chỉnh và lưu cấu hình này.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => void onSave()}
            className="inline-flex items-center gap-2 rounded-lg bg-sky-800 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-900 disabled:opacity-50"
          >
            <Save className="h-4 w-4" aria-hidden />
            {busy ? 'Đang lưu…' : 'Lưu cấu hình'}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void onReset()}
            className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            Xóa cấu hình trên server
          </button>
        </div>
      )}

      {msg ? <p className="text-sm font-medium text-slate-800">{msg}</p> : null}

      <section className="rounded-xl border border-amber-200/80 bg-amber-50/50 p-4 text-sm text-slate-700">
        <p className="font-semibold text-amber-950">Gọi hiện cửa sổ nhưng không ra máy?</p>
        <ul className="mt-2 list-inside list-disc space-y-1 leading-relaxed">
          <li>Trạng thái phải là <strong>Sẵn sàng gọi</strong> (SIP đã kết nối), không chỉ «đang đăng ký».</li>
          <li>Cho phép <strong>micro</strong> trên trình duyệt khi được hỏi.</li>
          <li>Thử <strong>Cách gọi → Máy bàn / IP phone</strong> nếu bàn phím OMICall gọi được mà nút hồ sơ treo.</li>
          <li>Thử đổi <strong>Định dạng quay số</strong> (0… ↔ +84…) rồi gọi lại.</li>
          <li>Trên OMICall: extension phải có <strong>đầu số gọi ra</strong> — điền vào ô hotline ở trên nếu cần.</li>
          <li>Gọi thử từ bàn phím OMICall (tắt «Ẩn bàn phím») cùng số — nếu vẫn lỗi thì do tổng đài/SIP, không phải app.</li>
        </ul>
      </section>

      <section className="rounded-xl border border-sky-200/80 bg-sky-50/60 p-4 text-sm text-slate-700">
        <p className="font-semibold text-sky-950">Đồng bộ lịch sử cuộc gọi & KPI</p>
        <p className="mt-2 leading-relaxed">
          Sau khi deploy Functions, vào OMICall thêm webhook tới function <strong>omicallCallWebhook</strong>. Nếu có
          nhập <strong>Webhook secret</strong>, thêm tham số <code>?secret=...</code> vào URL webhook hoặc gửi header{' '}
          <code>x-vietmy-omicall-secret</code>. Lịch sử cuộc gọi sẽ được đồng bộ định kỳ để KPI có thời lượng, trạng
          thái và ghi âm.
        </p>
        <p className="mt-2 text-xs leading-relaxed text-slate-500">
          Gợi ý bảo mật: hệ thống vẫn ưu tiên Firebase Secret nếu đã cấu hình trên server; các ô ở đây giúp bạn nhập và
          test nhanh từ giao diện quản trị.
        </p>
      </section>

      <section className="rounded-xl border border-dashed border-slate-200 p-4 text-sm text-slate-600">
        <p className="flex items-center gap-2 font-medium text-slate-800">
          <Phone className="h-4 w-4 text-sky-700" aria-hidden />
          Gán số nội bộ cho từng TVV
        </p>
        <p className="mt-2 leading-relaxed">
          Tab <strong>Quản lý Nhân Sự</strong> → Sửa nhân viên → mục OMICall (số nội bộ + mật khẩu). TVV có số riêng sẽ
          dùng thay cho số mặc định ở trên.
        </p>
      </section>
    </div>
  )
}
