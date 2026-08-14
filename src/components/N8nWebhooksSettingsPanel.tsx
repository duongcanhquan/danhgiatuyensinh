import { useCallback, useEffect, useState } from 'react'
import { FileText, Save, ScrollText, CalendarDays, CalendarRange, Sparkles } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { useOrg } from '../contexts/OrgProvider'
import { getFirestoreDb } from '../services/firebase'
import {
  emptyOrgN8nWebhooks,
  loadOrgN8nWebhooks,
  saveOrgN8nWebhooks,
  type OrgN8nWebhooks,
} from '../utils/n8nWebhooksConfig'
import {
  N8N_WEBHOOK_FIELD_HINTS,
  VIETMY_DEFAULT_N8N_WEBHOOKS,
} from '../utils/vietmyIntegrationDefaults'

const INPUT =
  'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100'

const FIELDS: Array<{
  key: keyof Pick<OrgN8nWebhooks, 'giayMoi' | 'ctsv' | 'daily' | 'monthly'>
  icon: typeof FileText
}> = [
  { key: 'giayMoi', icon: FileText },
  { key: 'ctsv', icon: ScrollText },
  { key: 'daily', icon: CalendarDays },
  { key: 'monthly', icon: CalendarRange },
]

/** Webhook n8n — form gọn. Đổi URL và Lưu là các luồng TVV/KT/báo cáo dùng ngay. */
export function N8nWebhooksSettingsPanel() {
  const { can, profile } = useAuth()
  const { effectiveOrgId, currentOrgLabel } = useOrg()
  const canEdit = can('config:master_data') || can('config:omicall')
  const db = getFirestoreDb()
  const [draft, setDraft] = useState<OrgN8nWebhooks>(emptyOrgN8nWebhooks())
  const [loaded, setLoaded] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  useEffect(() => {
    if (!db) return
    let cancelled = false
    setLoaded(false)
    void loadOrgN8nWebhooks(db, effectiveOrgId).then((hooks) => {
      if (cancelled) return
      setDraft(hooks)
      setLoaded(true)
    })
    return () => {
      cancelled = true
    }
  }, [db, effectiveOrgId])

  const patch = useCallback((key: keyof OrgN8nWebhooks, value: string) => {
    setDraft((d) => ({ ...d, [key]: value }))
  }, [])

  const fillVietMyDefaults = () => {
    setDraft((d) => ({
      ...d,
      giayMoi: d.giayMoi.trim() || VIETMY_DEFAULT_N8N_WEBHOOKS.giayMoi,
      ctsv: d.ctsv.trim() || VIETMY_DEFAULT_N8N_WEBHOOKS.ctsv,
      daily: d.daily.trim() || VIETMY_DEFAULT_N8N_WEBHOOKS.daily,
      monthly: d.monthly.trim() || VIETMY_DEFAULT_N8N_WEBHOOKS.monthly,
    }))
    setMsg('Đã điền URL mẫu VietMy vào ô trống — kiểm tra rồi bấm Lưu.')
  }

  const onSave = async () => {
    if (!db || !canEdit) return
    setBusy(true)
    setMsg(null)
    try {
      const saved = await saveOrgN8nWebhooks(
        db,
        effectiveOrgId,
        draft,
        profile?.email ?? profile?.id ?? 'admin',
      )
      setDraft(saved)
      setMsg('Đã lưu — TVV/KT/báo cáo dùng URL mới ngay (không cần deploy lại app).')
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Không lưu được.')
    } finally {
      setBusy(false)
    }
  }

  if (!loaded) {
    return <p className="text-sm text-slate-600">Đang tải…</p>
  }

  const filledCount = FIELDS.filter((f) => String(draft[f.key] ?? '').trim().startsWith('http')).length

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-base font-semibold text-slate-900">Webhook n8n</h2>
        <span className="truncate text-xs text-slate-500">
          {currentOrgLabel} · {filledCount}/4 URL
        </span>
      </div>
      <p className="text-xs text-slate-600">
        Dán URL workflow n8n (phải Active). Trên n8n map <code className="rounded bg-slate-100 px-1">message_vi</code> /{' '}
        <code className="rounded bg-slate-100 px-1">chat_text</code> → Google Chat. URL trống = tắt luồng đó.
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        {FIELDS.map((f) => {
          const Icon = f.icon
          const hint = N8N_WEBHOOK_FIELD_HINTS[f.key]
          const ok = String(draft[f.key] ?? '').trim().startsWith('http')
          return (
            <label key={f.key} className="block rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
              <span className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-50 text-indigo-800">
                  <Icon className="h-4 w-4" aria-hidden />
                </span>
                {hint.title}
                {ok ? (
                  <span className="ml-auto h-2 w-2 rounded-full bg-emerald-500" title="Có URL" />
                ) : (
                  <span className="ml-auto h-2 w-2 rounded-full bg-slate-300" title="Trống" />
                )}
              </span>
              <p className="mt-1 text-[11px] leading-snug text-slate-500">{hint.when}</p>
              <p className="mt-0.5 font-mono text-[10px] text-slate-400">{hint.events}</p>
              <input
                className={`mt-2 ${INPUT}`}
                value={draft[f.key] ?? ''}
                disabled={!canEdit}
                onChange={(e) => patch(f.key, e.target.value)}
                placeholder={VIETMY_DEFAULT_N8N_WEBHOOKS[f.key]}
                inputMode="url"
                autoComplete="off"
              />
            </label>
          )
        })}
      </div>

      <ol className="list-decimal space-y-1 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-700 pl-8">
        <li>n8n: bật 4 workflow (giấy mời, CTSV/Chat, báo cáo ngày, báo cáo tháng).</li>
        <li>Điền URL bên trên → Lưu.</li>
        <li>Smoke: TVV lưu tiền → Chat; KT duyệt → Chat; gửi báo cáo ngày tay.</li>
        <li>Cron tự động: deploy Cloud Functions một lần (`sendScheduledFinanceReports` 23:55 ICT).</li>
      </ol>

      {canEdit ? (
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={busy}
            onClick={() => void onSave()}
            className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-indigo-700 px-4 py-2.5 text-sm font-bold text-white hover:bg-indigo-800 disabled:opacity-60"
          >
            <Save className="h-4 w-4" aria-hidden />
            {busy ? '…' : 'Lưu'}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={fillVietMyDefaults}
            className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-indigo-200 bg-white px-4 py-2.5 text-sm font-bold text-indigo-900 hover:bg-indigo-50 disabled:opacity-60"
          >
            <Sparkles className="h-4 w-4" aria-hidden />
            Điền URL mẫu VietMy
          </button>
          {msg ? <p className="text-sm text-slate-600">{msg}</p> : null}
        </div>
      ) : (
        <p className="text-sm text-amber-800">Chỉ xem</p>
      )}
    </div>
  )
}
