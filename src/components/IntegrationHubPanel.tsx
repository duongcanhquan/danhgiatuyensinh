import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  CheckCircle2,
  ChevronRight,
  Copy,
  ExternalLink,
  KeyRound,
  Plus,
  Save,
  Trash2,
} from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useOrg } from '../contexts/OrgProvider'
import { getFirestoreDb } from '../services/firebase'
import {
  connectorsByGroup,
  maturityLabel,
  type ConnectorDef,
  type ConnectorMaturity,
} from '../integrations/connectorCatalog'
import { connectorIcon, GROUP_ICONS } from '../integrations/connectorIcons'
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

const INPUT =
  'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100'

function maturityDot(m: ConnectorMaturity): string {
  switch (m) {
    case 'live':
      return 'bg-emerald-500'
    case 'ready':
      return 'bg-sky-500'
    case 'planned':
      return 'bg-slate-300'
  }
}

function newSubId(): string {
  return `sub_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`
}

function isConnectorConfigured(hub: OrgIntegrationHubConfig, def: ConnectorDef): boolean {
  if (def.id === 'generic_webhooks') return hub.subscriptions.some((s) => s.url.startsWith('http'))
  if (def.id === 'inbound_lead_api') return hub.inboundApiKeys.length > 0
  if (def.settingsHref && def.fields.length === 0) return def.maturity === 'live'
  const fields = hub.connectors[def.id] ?? {}
  if (fields.enabled === 'true') return true
  return Object.values(fields).some((v) => String(v).trim().length > 0)
}

/** Các kênh — lưới icon; đầu có màn riêng thì bấm là mở luôn. */
export function IntegrationHubPanel() {
  const navigate = useNavigate()
  const { can, profile } = useAuth()
  const { effectiveOrgId, currentOrgLabel } = useOrg()
  const canEdit = can('config:master_data') || can('config:omicall')
  const db = getFirestoreDb()
  const [hub, setHub] = useState<OrgIntegrationHubConfig>(emptyOrgIntegrationHub())
  const [loaded, setLoaded] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [activeConnectorId, setActiveConnectorId] = useState<string | null>(null)
  const [freshApiKey, setFreshApiKey] = useState<string | null>(null)
  const [showPlanned, setShowPlanned] = useState(false)

  const openConnector = useCallback(
    (c: ConnectorDef) => {
      // Có màn cấu hình chuyên sâu → mở thẳng (tránh chỉ bung panel trống dưới fold).
      if (c.settingsHref) {
        navigate(c.settingsHref)
        return
      }
      setActiveConnectorId((prev) => (prev === c.id ? null : c.id))
    },
    [navigate],
  )

  const groups = useMemo(() => connectorsByGroup({ includePlanned: showPlanned }), [showPlanned])
  const activeDef = useMemo(
    () => groups.flatMap((g) => g.items).find((c) => c.id === activeConnectorId) ?? null,
    [groups, activeConnectorId],
  )
  const showSaveBar =
    canEdit &&
    activeDef &&
    (activeDef.fields.length > 0 ||
      activeDef.id === 'generic_webhooks' ||
      activeDef.id === 'inbound_lead_api')

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

  useEffect(() => {
    if (!activeConnectorId) return
    queueMicrotask(() => {
      document.getElementById('hub-connector-detail')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    })
  }, [activeConnectorId])

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
      setMsg('Đã lưu')
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
      label: '',
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
    setMsg('Copy key ngay — chỉ hiện một lần')
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
      setMsg('Đã copy')
    } catch {
      setMsg('Copy thủ công')
    }
  }

  if (!loaded) {
    return <p className="text-sm text-slate-600">Đang tải…</p>
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm text-slate-600">
            Bấm ô có màn riêng (Gọi điện, n8n, AI…) để mở cấu hình. Ô còn lại chỉnh ngay bên dưới.
          </p>
          <p className="truncate text-xs text-slate-500">{currentOrgLabel}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-500">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-emerald-500" aria-hidden />
            Đang dùng
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-sky-500" aria-hidden />
            Sẵn sàng
          </span>
          <button
            type="button"
            onClick={() => setShowPlanned((v) => !v)}
            className="inline-flex items-center gap-1.5 rounded-md px-1.5 py-0.5 hover:bg-slate-100"
          >
            <span className="h-2 w-2 rounded-full bg-slate-300" aria-hidden />
            {showPlanned ? 'Ẩn sắp có' : 'Hiện sắp có'}
          </button>
        </div>
      </div>

      {groups.map((g) => {
        const GroupIcon = GROUP_ICONS[g.group] ?? connectorIcon('generic_webhooks')
        return (
          <section key={g.group}>
            <h3 className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-500">
              <GroupIcon className="h-3.5 w-3.5 text-indigo-700" aria-hidden />
              {g.label}
            </h3>
            <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {g.items.map((c) => {
                const Icon = connectorIcon(c.id)
                const active = activeConnectorId === c.id
                const configured = isConnectorConfigured(hub, c)
                return (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => openConnector(c)}
                      title={
                        c.settingsHref
                          ? `Mở cấu hình «${c.name}»`
                          : c.maturity === 'planned'
                            ? `${c.name} — sắp có`
                            : `Cấu hình «${c.name}» tại đây`
                      }
                      className={[
                        'group flex h-full w-full cursor-pointer flex-col items-center gap-2 rounded-2xl border px-2 py-3 text-center transition duration-200',
                        active
                          ? 'border-indigo-400 bg-indigo-50 shadow-sm ring-2 ring-indigo-200/60'
                          : 'border-slate-200/90 bg-white hover:border-indigo-200 hover:bg-slate-50',
                        c.settingsHref ? 'hover:ring-2 hover:ring-indigo-200/50' : '',
                      ].join(' ')}
                    >
                      <span className="relative flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-50 to-cyan-50 text-indigo-800 ring-1 ring-indigo-100">
                        <Icon className="h-5 w-5" aria-hidden />
                        <span
                          className={`absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-white ${maturityDot(c.maturity)}`}
                          title={maturityLabel(c.maturity)}
                        />
                        {configured ? (
                          <CheckCircle2
                            className="absolute -bottom-1 -left-1 h-4 w-4 text-indigo-600"
                            aria-label="Đã cấu hình"
                          />
                        ) : null}
                      </span>
                      <span className="line-clamp-2 text-xs font-semibold leading-snug text-slate-800">
                        {c.name}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </section>
        )
      })}

      {activeDef ? (
        <div
          id="hub-connector-detail"
          className="scroll-mt-4 rounded-2xl border border-indigo-200/80 bg-white p-4 shadow-sm"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
            <div className="flex items-center gap-3">
              {(() => {
                const Icon = connectorIcon(activeDef.id)
                return (
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-800">
                    <Icon className="h-5 w-5" aria-hidden />
                  </span>
                )
              })()}
              <div>
                <h3 className="text-sm font-semibold text-slate-900">{activeDef.name}</h3>
                <p className="text-[11px] text-slate-500">{maturityLabel(activeDef.maturity)}</p>
                <p className="mt-1 max-w-xl text-xs leading-snug text-slate-600">{activeDef.summary}</p>
              </div>
            </div>
            {activeDef.settingsHref ? (
              <Link
                to={activeDef.settingsHref}
                className="inline-flex items-center gap-1 rounded-lg bg-indigo-700 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-800"
              >
                Mở cấu hình
                <ExternalLink className="h-3.5 w-3.5" aria-hidden />
              </Link>
            ) : null}
          </div>
          {activeDef.maturity === 'planned' && activeDef.fields.length === 0 ? (
            <p className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
              Đầu nối này đang ở trạng thái «Sắp có» — chưa cấu hình được trong app.
            </p>
          ) : null}

          {activeDef.fields.length > 0 ? (
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {activeDef.fields.map((f) => {
                const fields = hub.connectors[activeDef.id] ?? {}
                if (f.kind === 'toggle') {
                  return (
                    <label key={f.key} className="flex items-center gap-2 sm:col-span-2">
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-slate-300 text-indigo-700"
                        checked={fields[f.key] === 'true'}
                        disabled={!canEdit}
                        onChange={(e) =>
                          patchConnectorField(activeDef.id, f.key, e.target.checked ? 'true' : 'false')
                        }
                      />
                      <span className="text-sm font-medium text-slate-800">{f.label}</span>
                    </label>
                  )
                }
                if (f.kind === 'select') {
                  return (
                    <label key={f.key} className="block text-xs font-semibold text-slate-700">
                      {f.label}
                      <select
                        className={`mt-1 ${INPUT}`}
                        value={fields[f.key] ?? f.options?.[0]?.value ?? ''}
                        disabled={!canEdit}
                        onChange={(e) => patchConnectorField(activeDef.id, f.key, e.target.value)}
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
                  <label key={f.key} className="block text-xs font-semibold text-slate-700">
                    {f.label}
                    <input
                      className={`mt-1 ${INPUT}`}
                      type={f.kind === 'secret' ? 'password' : 'text'}
                      value={fields[f.key] ?? ''}
                      disabled={!canEdit}
                      placeholder={f.placeholder}
                      onChange={(e) => patchConnectorField(activeDef.id, f.key, e.target.value)}
                      autoComplete="off"
                    />
                  </label>
                )
              })}
            </div>
          ) : null}

          {activeConnectorId === 'generic_webhooks' ? (
            <div className="mt-4 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Webhook theo sự kiện</p>
                {canEdit ? (
                  <button
                    type="button"
                    onClick={addSubscription}
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-50"
                  >
                    <Plus className="h-3.5 w-3.5" aria-hidden />
                    Thêm
                  </button>
                ) : null}
              </div>
              {hub.subscriptions.map((s) => (
                <div key={s.id} className="grid gap-2 rounded-xl border border-slate-100 bg-slate-50/80 p-2.5 sm:grid-cols-[1fr_1.4fr_auto]">
                  <select
                    className={INPUT}
                    value={s.event}
                    disabled={!canEdit}
                    onChange={(e) => updateSub(s.id, { event: e.target.value as OutboundEventId })}
                  >
                    {OUTBOUND_EVENT_CATALOG.map((ev) => (
                      <option key={ev.id} value={ev.id}>
                        {ev.label}
                      </option>
                    ))}
                  </select>
                  <input
                    className={INPUT}
                    value={s.url}
                    disabled={!canEdit}
                    onChange={(e) => updateSub(s.id, { url: e.target.value })}
                    placeholder="https://…"
                  />
                  <div className="flex items-center gap-2">
                    <label className="flex items-center gap-1 text-xs text-slate-600">
                      <input
                        type="checkbox"
                        checked={s.enabled}
                        disabled={!canEdit}
                        onChange={(e) => updateSub(s.id, { enabled: e.target.checked })}
                      />
                      Bật
                    </label>
                    {canEdit ? (
                      <button type="button" onClick={() => removeSub(s.id)} className="rounded p-1.5 text-rose-600 hover:bg-rose-50" aria-label="Xóa">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          ) : null}

          {activeConnectorId === 'inbound_lead_api' ? (
            <div className="mt-4 space-y-2">
              <div className="flex flex-wrap gap-2">
                {canEdit ? (
                  <button
                    type="button"
                    onClick={() => void createApiKey()}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-700 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-800"
                  >
                    <KeyRound className="h-3.5 w-3.5" aria-hidden />
                    Tạo key
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => void copyText(buildInboundLeadContractExample(effectiveOrgId))}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50"
                >
                  <Copy className="h-3.5 w-3.5" aria-hidden />
                  Copy mẫu API
                </button>
              </div>
              {freshApiKey ? (
                <div className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs">
                  <code className="break-all font-mono text-amber-950">{freshApiKey}</code>
                  <button type="button" className="font-semibold text-amber-900 underline" onClick={() => void copyText(freshApiKey)}>
                    Copy
                  </button>
                </div>
              ) : null}
              <ul className="space-y-1">
                {hub.inboundApiKeys.map((k) => (
                  <li key={k.keyHash} className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs">
                    <code>{k.keyPrefix}</code>
                    {canEdit ? (
                      <button type="button" className="font-semibold text-rose-700" onClick={() => revokeApiKey(k.keyHash)}>
                        Thu hồi
                      </button>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {activeDef.suggestedEvents?.length && activeConnectorId !== 'generic_webhooks' ? (
            <p className="mt-3 flex flex-wrap items-center gap-1 text-[11px] text-slate-500">
              <ChevronRight className="h-3 w-3" aria-hidden />
              Sự kiện:
              {activeDef.suggestedEvents.map((e) => (
                <code key={e} className="rounded bg-slate-100 px-1">
                  {e}
                </code>
              ))}
            </p>
          ) : null}
        </div>
      ) : (
        <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50/80 px-4 py-5 text-center text-sm text-slate-500">
          Bấm ô có màn riêng để mở cấu hình; ô còn lại (token, webhook…) chỉnh tại đây rồi Lưu.
        </p>
      )}

      {showSaveBar ? (
        <div className="sticky bottom-2 z-10 flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white/95 px-3 py-2 shadow-sm backdrop-blur">
          <button
            type="button"
            disabled={busy}
            onClick={() => void onSave()}
            className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-indigo-700 px-4 py-2.5 text-sm font-bold text-white hover:bg-indigo-800 disabled:opacity-60"
          >
            <Save className="h-4 w-4" aria-hidden />
            {busy ? '…' : 'Lưu'}
          </button>
          {msg ? <span className="text-sm text-slate-600">{msg}</span> : null}
        </div>
      ) : msg ? (
        <p className="text-sm text-slate-600">{msg}</p>
      ) : null}
    </div>
  )
}
