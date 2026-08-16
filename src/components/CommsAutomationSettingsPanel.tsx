import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { Mail, MessageSquare, Plus, Save, Trash2 } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { useOrg } from '../contexts/OrgProvider'
import { getFirestoreDb } from '../services/firebase'
import {
  COMMS_CHANNEL_LABELS,
  COMMS_TEMPLATE_VARS,
  COMMS_TRIGGER_OPTIONS,
  defaultCommsAutomationConfig,
  loadCommsAutomationConfig,
  saveCommsAutomationConfig,
  type CommsAutomationRule,
  type CommsChannelId,
  type CommsTemplate,
  type OrgCommsAutomationConfig,
} from '../utils/commsAutomationConfig'

const INPUT =
  'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100'
const LABEL = 'block text-xs font-semibold text-slate-600'

function newId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
}

/** Email / SMS / Zalo / WhatsApp tự động — mẫu + luật theo từng trường. */
export function CommsAutomationSettingsPanel({ hideTitle = false }: { hideTitle?: boolean }) {
  const { can, profile } = useAuth()
  const { effectiveOrgId, currentOrgLabel } = useOrg()
  const canEdit = can('config:master_data') || can('config:omicall')
  const db = getFirestoreDb()
  const [draft, setDraft] = useState<OrgCommsAutomationConfig>(defaultCommsAutomationConfig())
  const [loaded, setLoaded] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [section, setSection] = useState<'channels' | 'templates' | 'rules' | 'policy'>('channels')

  useEffect(() => {
    if (!db) return
    let cancelled = false
    setLoaded(false)
    void loadCommsAutomationConfig(db, effectiveOrgId).then((cfg) => {
      if (cancelled) return
      setDraft(cfg)
      setLoaded(true)
    })
    return () => {
      cancelled = true
    }
  }, [db, effectiveOrgId])

  const onSave = async () => {
    if (!db || !canEdit) return
    setBusy(true)
    setMsg(null)
    try {
      const saved = await saveCommsAutomationConfig(
        db,
        effectiveOrgId,
        draft,
        profile?.email ?? profile?.id ?? 'admin',
      )
      setDraft(saved)
      setMsg('Đã lưu — luật bật sẽ chạy khi có sự kiện tương ứng.')
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Không lưu được.')
    } finally {
      setBusy(false)
    }
  }

  const patchEmail = useCallback((patch: Partial<OrgCommsAutomationConfig['email']>) => {
    setDraft((d) => ({ ...d, email: { ...d.email, ...patch } }))
  }, [])
  const patchSms = useCallback((patch: Partial<OrgCommsAutomationConfig['sms']>) => {
    setDraft((d) => ({ ...d, sms: { ...d.sms, ...patch } }))
  }, [])
  const patchZalo = useCallback((patch: Partial<OrgCommsAutomationConfig['zalo']>) => {
    setDraft((d) => ({ ...d, zalo: { ...d.zalo, ...patch } }))
  }, [])
  const patchWa = useCallback((patch: Partial<OrgCommsAutomationConfig['whatsapp']>) => {
    setDraft((d) => ({ ...d, whatsapp: { ...d.whatsapp, ...patch } }))
  }, [])

  const addTemplate = (channel: CommsChannelId) => {
    const t: CommsTemplate = {
      id: newId('tpl'),
      channel,
      name: `Mẫu ${COMMS_CHANNEL_LABELS[channel]} mới`,
      subject: channel === 'email' ? '{{schoolName}} — thông báo' : '',
      body: 'Chào {{fullName}}, …',
      enabled: true,
      intent: 'transactional',
    }
    setDraft((d) => ({ ...d, templates: [...d.templates, t] }))
  }

  const patchTemplate = (id: string, patch: Partial<CommsTemplate>) => {
    setDraft((d) => ({
      ...d,
      templates: d.templates.map((t) => (t.id === id ? { ...t, ...patch } : t)),
    }))
  }

  const removeTemplate = (id: string) => {
    setDraft((d) => ({
      ...d,
      templates: d.templates.filter((t) => t.id !== id),
      rules: d.rules.map((r) => (r.templateId === id ? { ...r, enabled: false, templateId: '' } : r)),
    }))
  }

  const addRule = () => {
    const r: CommsAutomationRule = {
      id: newId('rule'),
      name: 'Luật mới',
      enabled: false,
      trigger: 'lead.created',
      channel: 'email',
      templateId: draft.templates.find((t) => t.channel === 'email')?.id ?? '',
      delayMinutes: 0,
    }
    setDraft((d) => ({ ...d, rules: [...d.rules, r] }))
  }

  const patchRule = (id: string, patch: Partial<CommsAutomationRule>) => {
    setDraft((d) => ({
      ...d,
      rules: d.rules.map((r) => (r.id === id ? { ...r, ...patch } : r)),
    }))
  }

  const removeRule = (id: string) => {
    setDraft((d) => ({ ...d, rules: d.rules.filter((r) => r.id !== id) }))
  }

  if (!loaded) return <p className="text-sm text-slate-600">Đang tải…</p>

  const tabs: Array<{ id: typeof section; label: string }> = [
    { id: 'channels', label: 'Kênh gửi' },
    { id: 'templates', label: 'Mẫu tin' },
    { id: 'rules', label: 'Khi nào gửi' },
    { id: 'policy', label: 'Đồng ý & giờ im lặng' },
  ]

  return (
    <div className="space-y-4">
      {!hideTitle ? (
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900">
            <Mail className="h-4 w-4 text-indigo-800" aria-hidden />
            Email &amp; tin nhắn tự động
          </h2>
          <span className="truncate text-xs text-slate-500">{currentOrgLabel}</span>
        </div>
      ) : (
        <p className="truncate text-xs text-slate-500">{currentOrgLabel}</p>
      )}
      <p className="text-sm text-slate-600">
        Soạn mẫu và chọn khi gửi email / SMS / Zalo / WhatsApp. Hệ thống đẩy tới URL webhook để n8n hoặc Make gửi thật.
      </p>

      <div className="flex flex-wrap gap-1 border-b border-slate-200 pb-2">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
              section === t.id ? 'bg-indigo-800 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
            onClick={() => setSection(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {section === 'channels' ? (
        <div className="space-y-4">
          <ChannelCard
            title="Email"
            enabled={draft.email.enabled}
            onEnabled={(v) => patchEmail({ enabled: v })}
            canEdit={canEdit}
            webhook={draft.email.sendWebhookUrl}
            onWebhook={(v) => patchEmail({ sendWebhookUrl: v })}
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <label className={LABEL}>
                Nhà cung cấp
                <select
                  className={`mt-1 ${INPUT}`}
                  disabled={!canEdit}
                  value={draft.email.provider}
                  onChange={(e) =>
                    patchEmail({ provider: e.target.value as OrgCommsAutomationConfig['email']['provider'] })
                  }
                >
                  <option value="n8n">Chỉ webhook / n8n</option>
                  <option value="resend">Resend</option>
                  <option value="sendgrid">SendGrid</option>
                  <option value="smtp">SMTP tùy chỉnh</option>
                </select>
              </label>
              <label className={LABEL}>
                Email gửi đi
                <input
                  className={`mt-1 ${INPUT}`}
                  disabled={!canEdit}
                  value={draft.email.fromEmail}
                  onChange={(e) => patchEmail({ fromEmail: e.target.value })}
                  placeholder="tuyensinh@truong.edu.vn"
                />
              </label>
              <label className={LABEL}>
                Tên hiển thị
                <input
                  className={`mt-1 ${INPUT}`}
                  disabled={!canEdit}
                  value={draft.email.fromName}
                  onChange={(e) => patchEmail({ fromName: e.target.value })}
                />
              </label>
              <label className={LABEL}>
                Reply-To
                <input
                  className={`mt-1 ${INPUT}`}
                  disabled={!canEdit}
                  value={draft.email.replyTo}
                  onChange={(e) => patchEmail({ replyTo: e.target.value })}
                />
              </label>
              <label className={LABEL}>
                API key (Resend / SendGrid / mật khẩu SMTP)
                <input
                  className={`mt-1 ${INPUT}`}
                  type="password"
                  autoComplete="off"
                  disabled={!canEdit}
                  value={draft.email.apiKey}
                  onChange={(e) => patchEmail({ apiKey: e.target.value })}
                />
              </label>
            </div>
            {draft.email.provider === 'smtp' ? (
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <label className={LABEL}>
                  SMTP host
                  <input
                    className={`mt-1 ${INPUT} font-mono`}
                    disabled={!canEdit}
                    value={draft.email.smtpHost}
                    onChange={(e) => patchEmail({ smtpHost: e.target.value })}
                    placeholder="smtp.gmail.com"
                  />
                </label>
                <label className={LABEL}>
                  Port
                  <input
                    className={`mt-1 ${INPUT}`}
                    disabled={!canEdit}
                    value={draft.email.smtpPort}
                    onChange={(e) => patchEmail({ smtpPort: e.target.value })}
                  />
                </label>
                <label className={LABEL}>
                  User SMTP
                  <input
                    className={`mt-1 ${INPUT}`}
                    disabled={!canEdit}
                    value={draft.email.smtpUser}
                    onChange={(e) => patchEmail({ smtpUser: e.target.value })}
                  />
                </label>
                <label className="flex items-center gap-2 self-end text-sm text-slate-800">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-slate-300 text-indigo-700"
                    checked={draft.email.smtpSecure}
                    disabled={!canEdit}
                    onChange={(e) => patchEmail({ smtpSecure: e.target.checked })}
                  />
                  TLS / SSL
                </label>
              </div>
            ) : null}
          </ChannelCard>

          <ChannelCard
            title="SMS"
            enabled={draft.sms.enabled}
            onEnabled={(v) => patchSms({ enabled: v })}
            canEdit={canEdit}
            webhook={draft.sms.sendWebhookUrl}
            onWebhook={(v) => patchSms({ sendWebhookUrl: v })}
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <label className={LABEL}>
                Nhà cung cấp
                <select
                  className={`mt-1 ${INPUT}`}
                  disabled={!canEdit}
                  value={draft.sms.provider}
                  onChange={(e) =>
                    patchSms({ provider: e.target.value as OrgCommsAutomationConfig['sms']['provider'] })
                  }
                >
                  <option value="esms">eSMS</option>
                  <option value="vietguys">Vietguys</option>
                  <option value="twilio">Twilio</option>
                  <option value="custom">Webhook tùy chỉnh</option>
                </select>
              </label>
              <label className={LABEL}>
                Brandname / Sender
                <input
                  className={`mt-1 ${INPUT}`}
                  disabled={!canEdit}
                  value={draft.sms.senderId}
                  onChange={(e) => patchSms({ senderId: e.target.value })}
                />
              </label>
              <label className={LABEL}>
                API key
                <input
                  className={`mt-1 ${INPUT}`}
                  type="password"
                  autoComplete="off"
                  disabled={!canEdit}
                  value={draft.sms.apiKey}
                  onChange={(e) => patchSms({ apiKey: e.target.value })}
                />
              </label>
              <label className={LABEL}>
                API secret (nếu có)
                <input
                  className={`mt-1 ${INPUT}`}
                  type="password"
                  autoComplete="off"
                  disabled={!canEdit}
                  value={draft.sms.apiSecret}
                  onChange={(e) => patchSms({ apiSecret: e.target.value })}
                />
              </label>
            </div>
          </ChannelCard>

          <ChannelCard
            title="Zalo OA"
            enabled={draft.zalo.enabled}
            onEnabled={(v) => patchZalo({ enabled: v })}
            canEdit={canEdit}
            webhook={draft.zalo.sendWebhookUrl}
            onWebhook={(v) => patchZalo({ sendWebhookUrl: v })}
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <label className={LABEL}>
                Chế độ
                <select
                  className={`mt-1 ${INPUT}`}
                  disabled={!canEdit}
                  value={draft.zalo.mode}
                  onChange={(e) =>
                    patchZalo({ mode: e.target.value as OrgCommsAutomationConfig['zalo']['mode'] })
                  }
                >
                  <option value="n8n">Gửi qua n8n</option>
                  <option value="zns">ZNS (tin Zalo Official)</option>
                  <option value="oa_message">Tin nhắn OA</option>
                </select>
              </label>
              <label className={LABEL}>
                OA ID
                <input
                  className={`mt-1 ${INPUT}`}
                  disabled={!canEdit}
                  value={draft.zalo.oaId}
                  onChange={(e) => patchZalo({ oaId: e.target.value })}
                />
              </label>
              <label className={LABEL}>
                App ID
                <input
                  className={`mt-1 ${INPUT}`}
                  disabled={!canEdit}
                  value={draft.zalo.appId}
                  onChange={(e) => patchZalo({ appId: e.target.value })}
                />
              </label>
              <label className={LABEL}>
                Access token
                <input
                  className={`mt-1 ${INPUT}`}
                  type="password"
                  autoComplete="off"
                  disabled={!canEdit}
                  value={draft.zalo.accessToken}
                  onChange={(e) => patchZalo({ accessToken: e.target.value })}
                />
              </label>
              <label className={`${LABEL} sm:col-span-2`}>
                Secret key
                <input
                  className={`mt-1 ${INPUT}`}
                  type="password"
                  autoComplete="off"
                  disabled={!canEdit}
                  value={draft.zalo.secretKey}
                  onChange={(e) => patchZalo({ secretKey: e.target.value })}
                />
              </label>
            </div>
          </ChannelCard>

          <ChannelCard
            title="WhatsApp Cloud API"
            enabled={draft.whatsapp.enabled}
            onEnabled={(v) => patchWa({ enabled: v })}
            canEdit={canEdit}
            webhook={draft.whatsapp.sendWebhookUrl}
            onWebhook={(v) => patchWa({ sendWebhookUrl: v })}
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <label className={LABEL}>
                Phone number ID
                <input
                  className={`mt-1 ${INPUT} font-mono`}
                  disabled={!canEdit}
                  value={draft.whatsapp.phoneNumberId}
                  onChange={(e) => patchWa({ phoneNumberId: e.target.value })}
                />
              </label>
              <label className={LABEL}>
                Business account ID
                <input
                  className={`mt-1 ${INPUT} font-mono`}
                  disabled={!canEdit}
                  value={draft.whatsapp.businessAccountId}
                  onChange={(e) => patchWa({ businessAccountId: e.target.value })}
                />
              </label>
              <label className={LABEL}>
                Access token
                <input
                  className={`mt-1 ${INPUT}`}
                  type="password"
                  autoComplete="off"
                  disabled={!canEdit}
                  value={draft.whatsapp.accessToken}
                  onChange={(e) => patchWa({ accessToken: e.target.value })}
                />
              </label>
              <label className={LABEL}>
                Verify token webhook
                <input
                  className={`mt-1 ${INPUT}`}
                  type="password"
                  autoComplete="off"
                  disabled={!canEdit}
                  value={draft.whatsapp.webhookVerifyToken}
                  onChange={(e) => patchWa({ webhookVerifyToken: e.target.value })}
                />
              </label>
            </div>
          </ChannelCard>
        </div>
      ) : null}

      {section === 'templates' ? (
        <div className="space-y-3">
          <p className="text-xs text-slate-500">
            Biến dùng được:{' '}
            {COMMS_TEMPLATE_VARS.map((v) => (
              <code key={v} className="mr-1 rounded bg-slate-100 px-1">
                {`{{${v}}}`}
              </code>
            ))}
          </p>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(COMMS_CHANNEL_LABELS) as CommsChannelId[]).map((ch) => (
              <button
                key={ch}
                type="button"
                disabled={!canEdit}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                onClick={() => addTemplate(ch)}
              >
                <Plus className="h-3.5 w-3.5" aria-hidden />
                Mẫu {COMMS_CHANNEL_LABELS[ch]}
              </button>
            ))}
          </div>
          <ul className="space-y-3">
            {draft.templates.map((t) => (
              <li key={t.id} className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                    <input
                      type="checkbox"
                      checked={t.enabled}
                      disabled={!canEdit}
                      onChange={(e) => patchTemplate(t.id, { enabled: e.target.checked })}
                    />
                    Bật
                  </label>
                  <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-semibold text-indigo-900">
                    {COMMS_CHANNEL_LABELS[t.channel]}
                  </span>
                  <select
                    className={`${INPUT} max-w-[10rem]`}
                    disabled={!canEdit}
                    value={t.intent}
                    onChange={(e) =>
                      patchTemplate(t.id, {
                        intent: e.target.value === 'marketing' ? 'marketing' : 'transactional',
                      })
                    }
                  >
                    <option value="transactional">Giao dịch</option>
                    <option value="marketing">Marketing</option>
                  </select>
                  <button
                    type="button"
                    disabled={!canEdit}
                    className="ml-auto rounded-lg p-1.5 text-slate-500 hover:bg-rose-50 hover:text-rose-700 disabled:opacity-40"
                    onClick={() => removeTemplate(t.id)}
                    aria-label="Xóa mẫu"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                <label className={`${LABEL} mt-2`}>
                  Tên mẫu
                  <input
                    className={`mt-1 ${INPUT}`}
                    disabled={!canEdit}
                    value={t.name}
                    onChange={(e) => patchTemplate(t.id, { name: e.target.value })}
                  />
                </label>
                {t.channel === 'email' ? (
                  <label className={`${LABEL} mt-2`}>
                    Tiêu đề
                    <input
                      className={`mt-1 ${INPUT}`}
                      disabled={!canEdit}
                      value={t.subject}
                      onChange={(e) => patchTemplate(t.id, { subject: e.target.value })}
                    />
                  </label>
                ) : null}
                <label className={`${LABEL} mt-2`}>
                  Nội dung
                  <textarea
                    className={`mt-1 ${INPUT} min-h-[5rem]`}
                    disabled={!canEdit}
                    value={t.body}
                    onChange={(e) => patchTemplate(t.id, { body: e.target.value })}
                  />
                </label>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {section === 'rules' ? (
        <div className="space-y-3">
          <p className="text-sm text-slate-600">
            Mỗi luật: sự kiện CRM → kênh → mẫu. Bật luật + bật kênh + có URL webhook thì CRM tự đẩy tin.
          </p>
          <button
            type="button"
            disabled={!canEdit}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            onClick={addRule}
          >
            <Plus className="h-3.5 w-3.5" aria-hidden />
            Thêm luật
          </button>
          <ul className="space-y-3">
            {draft.rules.map((r) => {
              const tpls = draft.templates.filter((t) => t.channel === r.channel)
              return (
                <li key={r.id} className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                      <input
                        type="checkbox"
                        checked={r.enabled}
                        disabled={!canEdit}
                        onChange={(e) => patchRule(r.id, { enabled: e.target.checked })}
                      />
                      Bật
                    </label>
                    <button
                      type="button"
                      disabled={!canEdit}
                      className="ml-auto rounded-lg p-1.5 text-slate-500 hover:bg-rose-50 hover:text-rose-700 disabled:opacity-40"
                      onClick={() => removeRule(r.id)}
                      aria-label="Xóa luật"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    <label className={LABEL}>
                      Tên luật
                      <input
                        className={`mt-1 ${INPUT}`}
                        disabled={!canEdit}
                        value={r.name}
                        onChange={(e) => patchRule(r.id, { name: e.target.value })}
                      />
                    </label>
                    <label className={LABEL}>
                      Khi nào
                      <select
                        className={`mt-1 ${INPUT}`}
                        disabled={!canEdit}
                        value={r.trigger}
                        onChange={(e) =>
                          patchRule(r.id, {
                            trigger: e.target.value as CommsAutomationRule['trigger'],
                          })
                        }
                      >
                        {COMMS_TRIGGER_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className={LABEL}>
                      Kênh
                      <select
                        className={`mt-1 ${INPUT}`}
                        disabled={!canEdit}
                        value={r.channel}
                        onChange={(e) => {
                          const channel = e.target.value as CommsChannelId
                          const nextTpl =
                            draft.templates.find((t) => t.channel === channel)?.id ?? ''
                          patchRule(r.id, { channel, templateId: nextTpl })
                        }}
                      >
                        {(Object.keys(COMMS_CHANNEL_LABELS) as CommsChannelId[]).map((ch) => (
                          <option key={ch} value={ch}>
                            {COMMS_CHANNEL_LABELS[ch]}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className={LABEL}>
                      Mẫu
                      <select
                        className={`mt-1 ${INPUT}`}
                        disabled={!canEdit}
                        value={r.templateId}
                        onChange={(e) => patchRule(r.id, { templateId: e.target.value })}
                      >
                        <option value="">— Chọn mẫu —</option>
                        {tpls.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className={LABEL}>
                      Trễ (phút) — n8n Delay
                      <input
                        className={`mt-1 ${INPUT}`}
                        type="number"
                        min={0}
                        max={10080}
                        disabled={!canEdit}
                        value={r.delayMinutes}
                        onChange={(e) =>
                          patchRule(r.id, { delayMinutes: Math.max(0, Number(e.target.value) || 0) })
                        }
                      />
                    </label>
                  </div>
                </li>
              )
            })}
          </ul>
        </div>
      ) : null}

      {section === 'policy' ? (
        <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <MessageSquare className="h-4 w-4 text-indigo-800" aria-hidden />
            Đồng ý liên hệ &amp; giờ im lặng
          </h3>
          <label className="flex items-start gap-2 text-sm text-slate-800">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 rounded border-slate-300 text-indigo-700"
              checked={draft.consent.requireOptInBeforeMarketing}
              disabled={!canEdit}
              onChange={(e) =>
                setDraft((d) => ({
                  ...d,
                  consent: { ...d.consent, requireOptInBeforeMarketing: e.target.checked },
                }))
              }
            />
            Tin marketing chỉ gửi khi hồ sơ đã đồng ý nhận thông tin
          </label>
          <label className="flex items-start gap-2 text-sm text-slate-800">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 rounded border-slate-300 text-indigo-700"
              checked={draft.consent.honorDoNotContact}
              disabled={!canEdit}
              onChange={(e) =>
                setDraft((d) => ({
                  ...d,
                  consent: { ...d.consent, honorDoNotContact: e.target.checked },
                }))
              }
            />
            Tôn trọng «Không liên hệ» trên hồ sơ
          </label>
          <label className="flex items-start gap-2 text-sm text-slate-800">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 rounded border-slate-300 text-indigo-700"
              checked={draft.consent.allowTransactionalByDefault}
              disabled={!canEdit}
              onChange={(e) =>
                setDraft((d) => ({
                  ...d,
                  consent: { ...d.consent, allowTransactionalByDefault: e.target.checked },
                }))
              }
            />
            Cho phép tin giao dịch (xác nhận, giấy tờ, follow-up) mặc định
          </label>
          <hr className="border-slate-100" />
          <label className="flex items-start gap-2 text-sm text-slate-800">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 rounded border-slate-300 text-indigo-700"
              checked={draft.quietHours.enabled}
              disabled={!canEdit}
              onChange={(e) =>
                setDraft((d) => ({
                  ...d,
                  quietHours: { ...d.quietHours, enabled: e.target.checked },
                }))
              }
            />
            Bật giờ không gọi / nhắn (mọi kênh)
          </label>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className={LABEL}>
              Từ giờ
              <input
                className={`mt-1 ${INPUT}`}
                type="number"
                min={0}
                max={23}
                disabled={!canEdit}
                value={draft.quietHours.startHour}
                onChange={(e) =>
                  setDraft((d) => ({
                    ...d,
                    quietHours: {
                      ...d.quietHours,
                      startHour: Math.min(23, Math.max(0, Number(e.target.value) || 0)),
                    },
                  }))
                }
              />
            </label>
            <label className={LABEL}>
              Đến giờ
              <input
                className={`mt-1 ${INPUT}`}
                type="number"
                min={0}
                max={23}
                disabled={!canEdit}
                value={draft.quietHours.endHour}
                onChange={(e) =>
                  setDraft((d) => ({
                    ...d,
                    quietHours: {
                      ...d.quietHours,
                      endHour: Math.min(23, Math.max(0, Number(e.target.value) || 0)),
                    },
                  }))
                }
              />
            </label>
            <label className={LABEL}>
              Múi giờ (ghi chú)
              <input
                className={`mt-1 ${INPUT}`}
                disabled={!canEdit}
                value={draft.quietHours.timezone}
                onChange={(e) =>
                  setDraft((d) => ({
                    ...d,
                    quietHours: { ...d.quietHours, timezone: e.target.value },
                  }))
                }
              />
            </label>
          </div>
          <p className="text-xs text-slate-500">
            Ví dụ 21 → 8: không gửi từ 21h đến trước 8h sáng (theo giờ máy người dùng).
          </p>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={!canEdit || busy}
          onClick={() => void onSave()}
          className="inline-flex items-center gap-2 rounded-xl bg-indigo-800 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-900 disabled:opacity-50"
        >
          <Save className="h-4 w-4" aria-hidden />
          {busy ? 'Đang lưu…' : 'Lưu'}
        </button>
        {msg ? <p className="text-sm text-slate-600">{msg}</p> : null}
        {!canEdit ? (
          <p className="text-xs text-amber-800">Bạn không có quyền sửa cấu hình tích hợp.</p>
        ) : null}
      </div>
    </div>
  )
}

function ChannelCard({
  title,
  enabled,
  onEnabled,
  canEdit,
  webhook,
  onWebhook,
  children,
}: {
  title: string
  enabled: boolean
  onEnabled: (v: boolean) => void
  canEdit: boolean
  webhook: string
  onWebhook: (v: string) => void
  children: ReactNode
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
        <label className="flex items-center gap-2 text-sm text-slate-800">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-slate-300 text-indigo-700"
            checked={enabled}
            disabled={!canEdit}
            onChange={(e) => onEnabled(e.target.checked)}
          />
          Bật kênh
        </label>
      </div>
      {children}
      <label className={`${LABEL} mt-3`}>
        URL webhook gửi tin (n8n / Make / worker)
        <input
          className={`mt-1 ${INPUT} font-mono`}
          disabled={!canEdit}
          value={webhook}
          onChange={(e) => onWebhook(e.target.value)}
          placeholder="https://…/webhook/…"
          autoComplete="off"
        />
      </label>
    </div>
  )
}
