import { useCallback, useEffect, useMemo, useState } from 'react'
import { Copy, KeyRound, Plus, Save, Trash2 } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { useOrg } from '../contexts/OrgProvider'
import { getFirestoreDb } from '../services/firebase'
import {
  CONNECTOR_GROUP_LABELS,
  connectorsByGroup,
  maturityLabel,
  type ConnectorDef,
  type ConnectorMaturity,
} from '../integrations/connectorCatalog'
import { OUTBOUND_EVENT_CATALOG, type OutboundEventId } from '../integrations/outboundEvents'
import {
  emptyOrgIntegrationHub,
  loadOrgIntegrationHub,
  saveOrgIntegrationHub,
  type OrgIntegrationHubConfig,
  type WebhookSubscription,
} from '../integrations/orgIntegrationHub'
import {
  buildInboundLeadContractExample,
  generateInboundApiKey,
  hashInboundApiKey,
  inboundApiKeyPrefix,
} from '../integrations/inboundApiKey'
import { Link } from 'react-router-dom'

const INPUT =
  'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-teal-400 focus:outline-none focus:ring-2 focus:ring-teal-100'

function maturityClass(m: ConnectorMaturity): string {
  switch (m) {
    case 'live':
      return 'bg-emerald-100 text-emerald-900'
    case 'ready':
      return 'bg-sky-100 text-sky-900'
    case 'planned':
      return 'bg-slate-100 text-slate-600'
  }
}

function newSubId(): string {
  return `sub_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`
}

/** Hub kết nối — catalog đầu nối + webhook tổng quát + API key đối tác. */
export function IntegrationHubPanel() {
  const { can, profile } = useAuth()
  const { effectiveOrgId, currentOrgLabel } = useOrg()
  const canEdit = can('config:master_data') || can('config:omicall')
  const db = getFirestoreDb()
  const [hub, setHub] = useState<OrgIntegrationHubConfig>(emptyOrgIntegrationHub())
  const [loaded, setLoaded] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [activeConnectorId, setActiveConnectorId] = useState<string | null>('generic_webhooks')
  const [freshApiKey, setFreshApiKey] = useState<string | null>(null)

  const groups = useMemo(() => connectorsByGroup(), [])
  const activeDef = useMemo(
    () => groups.flatMap((g) => g.items).find((c) => c.id === activeConnectorId) ?? null,
    [groups, activeConnectorId],
  )

  useEffect(() => {
    if (!db) return
    let cancelled = false
    setLoaded(false)
    void loadOrgIntegrationHub(db, effectiveOrgId).then((cfg) => {
      if (cancelled) return
      setHub(cfg)
      setLoaded(true)
    })
    return () => {
      cancelled = true
    }
  }, [db, effectiveOrgId])

  const patchConnectorField = useCallback((connectorId: string, key: string, value: string) => {
    setHub((h) => ({
      ...h,
      connectors: {
        ...h.connectors,
        [connectorId]: { ...(h.connectors[connectorId] ?? {}), [key]: value },
      },
    }))
  }, [])

  const onSave = async () => {
    if (!db || !canEdit) return
    setBusy(true)
    setMsg(null)
    try {
      const saved = await saveOrgIntegrationHub(
        db,
        effectiveOrgId,
        hub,
        profile?.email ?? profile?.id ?? 'admin',
      )
      setHub(saved)
      setMsg('Đã lưu hub kết nối — áp dụng ngay cho trường này.')
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Không lưu được.')
    } finally {
      setBusy(false)
    }
  }

  const addSubscription = () => {
    const event = (OUTBOUND_EVENT_CATALOG[0]?.id ?? 'lead.created') as OutboundEventId
    const row: WebhookSubscription = {
      id: newSubId(),
      event,
      url: '',
      enabled: true,
      label: 'Webhook mới',
    }
    setHub((h) => ({ ...h, subscriptions: [...h.subscriptions, row] }))
    setActiveConnectorId('generic_webhooks')
  }

  const updateSub = (id: string, patch: Partial<WebhookSubscription>) => {
    setHub((h) => ({
      ...h,
      subscriptions: h.subscriptions.map((s) => (s.id === id ? { ...s, ...patch } : s)),
    }))
  }

  const removeSub = (id: string) => {
    setHub((h) => ({ ...h, subscriptions: h.subscriptions.filter((s) => s.id !== id) }))
  }

  const createApiKey = async () => {
    if (!canEdit) return
    const raw = generateInboundApiKey()
    const keyHash = await hashInboundApiKey(raw)
    setFreshApiKey(raw)
    setHub((h) => ({
      ...h,
      inboundApiKeys: [
        {
          keyPrefix: inboundApiKeyPrefix(raw),
          keyHash,
          createdAt: new Date().toISOString(),
          createdBy: profile?.email ?? profile?.id,
        },
        ...h.inboundApiKeys,
      ],
      connectors: {
        ...h.connectors,
        inbound_lead_api: { ...(h.connectors.inbound_lead_api ?? {}), enabled: 'true' },
      },
    }))
    setActiveConnectorId('inbound_lead_api')
    setMsg('Đã tạo API key — hãy copy ngay (chỉ hiện một lần), rồi bấm Lưu.')
  }

  const revokeApiKey = (keyHash: string) => {
    setHub((h) => ({
      ...h,
      inboundApiKeys: h.inboundApiKeys.filter((k) => k.keyHash !== keyHash),
    }))
  }

  const copyText = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setMsg('Đã copy.')
    } catch {
      setMsg('Không copy được — chọn và copy thủ công.')
    }
  }

  if (!loaded) {
    return <p className="text-sm text-slate-600">Đang tải hub kết nối…</p>
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-teal-100 bg-teal-50/70 px-4 py-3 text-sm text-teal-950">
        <p className="font-semibold">Hub kết nối — đầu mối sẵn cho ứng dụng ngoài</p>
        <p className="mt-1 text-teal-900/90">
          Trường <strong>{currentOrgLabel}</strong>: bật và điền cấu hình từng dịch vụ (Zalo, WhatsApp, Slack, API
          đối tác…). Phần <em>Đang dùng</em> đã chạy; <em>Sẵn sàng nối</em> lưu cấu hình + webhook ngay;{' '}
          <em>Sắp có</em> giữ chỗ cho adapter sau.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        <div className="space-y-4">
          {groups.map((g) => (
            <section key={g.group} className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
              <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">
                {CONNECTOR_GROUP_LABELS[g.group]}
              </h3>
              <ul className="mt-2 space-y-1.5">
                {g.items.map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => setActiveConnectorId(c.id)}
                      className={[
                        'flex w-full items-start justify-between gap-2 rounded-lg border px-3 py-2 text-left text-sm transition',
                        activeConnectorId === c.id
                          ? 'border-teal-300 bg-teal-50/80'
                          : 'border-transparent hover:border-slate-200 hover:bg-slate-50',
                      ].join(' ')}
                    >
                      <span>
                        <span className="block font-semibold text-slate-900">{c.name}</span>
                        <span className="mt-0.5 block text-xs text-slate-600 line-clamp-2">{c.summary}</span>
                      </span>
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${maturityClass(c.maturity)}`}
                      >
                        {maturityLabel(c.maturity)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>

        <div className="space-y-4">
          {activeDef ? (
            <ConnectorDetail
              def={activeDef}
              hub={hub}
              canEdit={canEdit}
              onPatchField={patchConnectorField}
              onCopy={copyText}
            />
          ) : null}

          {activeConnectorId === 'generic_webhooks' ? (
            <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">Đăng ký webhook theo sự kiện</h3>
                  <p className="mt-0.5 text-xs text-slate-600">
                    Mỗi dòng = một URL nhận JSON chuẩn (Zapier Catch Hook, Make, n8n Webhook…).
                  </p>
                </div>
                {canEdit ? (
                  <button
                    type="button"
                    onClick={addSubscription}
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-50"
                  >
                    <Plus className="h-3.5 w-3.5" aria-hidden />
                    Thêm URL
                  </button>
                ) : null}
              </div>
              <div className="mt-3 space-y-3">
                {hub.subscriptions.length === 0 ? (
                  <p className="text-sm text-slate-500">Chưa có URL — thêm để hệ thống gửi sự kiện khi có việc xảy ra.</p>
                ) : (
                  hub.subscriptions.map((s) => (
                    <div key={s.id} className="grid gap-2 rounded-lg border border-slate-100 bg-slate-50/80 p-3 sm:grid-cols-2">
                      <label className="text-xs font-semibold text-slate-700">
                        Sự kiện
                        <select
                          className={`mt-1 ${INPUT}`}
                          value={s.event}
                          disabled={!canEdit}
                          onChange={(e) => updateSub(s.id, { event: e.target.value as OutboundEventId })}
                        >
                          {OUTBOUND_EVENT_CATALOG.map((ev) => (
                            <option key={ev.id} value={ev.id}>
                              {ev.label} ({ev.id})
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="text-xs font-semibold text-slate-700">
                        Nhãn
                        <input
                          className={`mt-1 ${INPUT}`}
                          value={s.label ?? ''}
                          disabled={!canEdit}
                          onChange={(e) => updateSub(s.id, { label: e.target.value })}
                          placeholder="Zapier lead mới"
                        />
                      </label>
                      <label className="text-xs font-semibold text-slate-700 sm:col-span-2">
                        URL
                        <input
                          className={`mt-1 ${INPUT}`}
                          value={s.url}
                          disabled={!canEdit}
                          onChange={(e) => updateSub(s.id, { url: e.target.value })}
                          placeholder="https://…"
                        />
                      </label>
                      <label className="text-xs font-semibold text-slate-700">
                        Secret (tuỳ chọn)
                        <input
                          className={`mt-1 ${INPUT}`}
                          value={s.secret ?? ''}
                          disabled={!canEdit}
                          onChange={(e) => updateSub(s.id, { secret: e.target.value })}
                          placeholder="Header X-VietMy-Secret"
                        />
                      </label>
                      <div className="flex items-end justify-between gap-2">
                        <label className="flex items-center gap-2 text-xs font-semibold text-slate-700">
                          <input
                            type="checkbox"
                            checked={s.enabled}
                            disabled={!canEdit}
                            onChange={(e) => updateSub(s.id, { enabled: e.target.checked })}
                          />
                          Bật
                        </label>
                        {canEdit ? (
                          <button
                            type="button"
                            onClick={() => removeSub(s.id)}
                            className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-50"
                          >
                            <Trash2 className="h-3.5 w-3.5" aria-hidden />
                            Xóa
                          </button>
                        ) : null}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>
          ) : null}

          {activeConnectorId === 'inbound_lead_api' ? (
            <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm space-y-3">
              <h3 className="text-sm font-semibold text-slate-900">API key đối tác</h3>
              <p className="text-xs text-slate-600">
                Tạo khóa để landing / form / hệ CTV đẩy hồ sơ. Endpoint Cloud Function hoàn thiện ở Phase 2 — hợp đồng
                JSON bên dưới dùng thống nhất.
              </p>
              {freshApiKey ? (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
                  <p className="font-semibold">Key mới (chỉ hiện một lần)</p>
                  <code className="mt-1 block break-all text-xs">{freshApiKey}</code>
                  <button
                    type="button"
                    className="mt-2 inline-flex items-center gap-1 text-xs font-semibold underline"
                    onClick={() => void copyText(freshApiKey)}
                  >
                    <Copy className="h-3.5 w-3.5" aria-hidden />
                    Copy key
                  </button>
                </div>
              ) : null}
              <div className="flex flex-wrap gap-2">
                {canEdit ? (
                  <button
                    type="button"
                    onClick={() => void createApiKey()}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-teal-200 bg-teal-50 px-3 py-2 text-xs font-semibold text-teal-900 hover:bg-teal-100"
                  >
                    <KeyRound className="h-3.5 w-3.5" aria-hidden />
                    Tạo API key
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() =>
                    void copyText(buildInboundLeadContractExample(effectiveOrgId))
                  }
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50"
                >
                  <Copy className="h-3.5 w-3.5" aria-hidden />
                  Copy hợp đồng JSON
                </button>
              </div>
              <ul className="space-y-1 text-xs text-slate-700">
                {hub.inboundApiKeys.map((k) => (
                  <li
                    key={k.keyHash}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2"
                  >
                    <span>
                      <code className="font-mono">{k.keyPrefix}</code>
                      <span className="ml-2 text-slate-500">{k.createdAt?.slice(0, 10)}</span>
                    </span>
                    {canEdit ? (
                      <button
                        type="button"
                        className="text-rose-700 font-semibold hover:underline"
                        onClick={() => revokeApiKey(k.keyHash)}
                      >
                        Thu hồi
                      </button>
                    ) : null}
                  </li>
                ))}
                {!hub.inboundApiKeys.length ? (
                  <li className="text-slate-500">Chưa có key nào.</li>
                ) : null}
              </ul>
              <pre className="max-h-48 overflow-auto rounded-lg bg-slate-900 p-3 text-[11px] text-slate-100">
                {buildInboundLeadContractExample(effectiveOrgId)}
              </pre>
            </section>
          ) : null}

          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h3 className="text-sm font-semibold text-slate-900">Sự kiện chuẩn (tham chiếu)</h3>
            <ul className="mt-2 grid gap-1 sm:grid-cols-2">
              {OUTBOUND_EVENT_CATALOG.map((ev) => (
                <li key={ev.id} className="rounded-lg bg-slate-50 px-2.5 py-1.5 text-xs text-slate-700">
                  <span className="font-semibold text-slate-900">{ev.label}</span>
                  <code className="ml-1 text-[10px] text-teal-800">{ev.id}</code>
                  <span className="mt-0.5 block text-slate-500">{ev.description}</span>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>

      {canEdit ? (
        <div className="flex flex-wrap items-center gap-3 sticky bottom-2 z-10 rounded-xl border border-slate-200 bg-white/95 px-3 py-2 shadow-sm backdrop-blur">
          <button
            type="button"
            disabled={busy}
            onClick={() => void onSave()}
            className="inline-flex items-center gap-2 rounded-xl bg-teal-700 px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-teal-800 disabled:opacity-60"
          >
            <Save className="h-4 w-4" aria-hidden />
            {busy ? 'Đang lưu…' : 'Lưu hub kết nối'}
          </button>
          {msg ? <p className="text-sm text-slate-700">{msg}</p> : null}
        </div>
      ) : (
        <p className="text-sm text-amber-800">Bạn chỉ xem — cần quyền cấu hình để lưu.</p>
      )}
    </div>
  )
}

function ConnectorDetail({
  def,
  hub,
  canEdit,
  onPatchField,
  onCopy,
}: {
  def: ConnectorDef
  hub: OrgIntegrationHubConfig
  canEdit: boolean
  onPatchField: (connectorId: string, key: string, value: string) => void
  onCopy: (text: string) => void
}) {
  const fields = hub.connectors[def.id] ?? {}
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-base font-semibold text-slate-900">{def.name}</h3>
          <p className="mt-1 text-sm text-slate-600">{def.summary}</p>
        </div>
        <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${maturityClass(def.maturity)}`}>
          {maturityLabel(def.maturity)}
        </span>
      </div>
      {def.settingsHref ? (
        <Link
          to={def.settingsHref}
          className="mt-3 inline-flex text-sm font-semibold text-teal-800 underline-offset-2 hover:underline"
        >
          Mở cấu hình chi tiết →
        </Link>
      ) : null}
      {def.maturity === 'planned' ? (
        <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
          Đầu nối đã đặt chỗ trong hub. Điền sẵn URL/key nếu có — adapter gửi/nhận thật sẽ gắn ở phiên sau mà không
          đổi chỗ cấu hình.
        </p>
      ) : null}
      {def.fields.length > 0 ? (
        <div className="mt-4 grid gap-3">
          {def.fields.map((f) => {
            if (f.kind === 'toggle') {
              return (
                <label key={f.key} className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    className="mt-1 h-4 w-4 rounded border-slate-300 text-teal-700"
                    checked={fields[f.key] === 'true'}
                    disabled={!canEdit}
                    onChange={(e) => onPatchField(def.id, f.key, e.target.checked ? 'true' : 'false')}
                  />
                  <span>
                    <span className="block text-sm font-semibold text-slate-800">{f.label}</span>
                    {f.hint ? <span className="mt-0.5 block text-xs text-slate-500">{f.hint}</span> : null}
                  </span>
                </label>
              )
            }
            if (f.kind === 'select') {
              return (
                <label key={f.key} className="block text-sm font-semibold text-slate-800">
                  {f.label}
                  <select
                    className={`mt-1 ${INPUT}`}
                    value={fields[f.key] ?? f.options?.[0]?.value ?? ''}
                    disabled={!canEdit}
                    onChange={(e) => onPatchField(def.id, f.key, e.target.value)}
                  >
                    {(f.options ?? []).map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </label>
              )
            }
            return (
              <label key={f.key} className="block text-sm font-semibold text-slate-800">
                {f.label}
                {f.hint ? <span className="mt-0.5 block text-xs font-normal text-slate-500">{f.hint}</span> : null}
                <input
                  className={`mt-1 ${INPUT}`}
                  type={f.kind === 'secret' ? 'password' : 'text'}
                  value={fields[f.key] ?? ''}
                  disabled={!canEdit}
                  placeholder={f.placeholder}
                  onChange={(e) => onPatchField(def.id, f.key, e.target.value)}
                  autoComplete="off"
                />
              </label>
            )
          })}
        </div>
      ) : null}
      {def.suggestedEvents?.length ? (
        <p className="mt-3 text-xs text-slate-500">
          Sự kiện gợi ý:{' '}
          {def.suggestedEvents.map((e) => (
            <code key={e} className="mr-1 rounded bg-slate-100 px-1">
              {e}
            </code>
          ))}
          <button
            type="button"
            className="ml-1 font-semibold text-teal-800 underline"
            onClick={() => onCopy(def.suggestedEvents!.join('\n'))}
          >
            Copy
          </button>
        </p>
      ) : null}
    </section>
  )
}
