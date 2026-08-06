import { useCallback, useEffect, useState } from 'react'
import { FileText, Save, ScrollText, CalendarDays, CalendarRange } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { useOrg } from '../contexts/OrgProvider'
import { getFirestoreDb } from '../services/firebase'
import {
  emptyOrgN8nWebhooks,
  loadOrgN8nWebhooks,
  saveOrgN8nWebhooks,
  type OrgN8nWebhooks,
} from '../utils/n8nWebhooksConfig'

const INPUT =
  'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-teal-400 focus:outline-none focus:ring-2 focus:ring-teal-100'

const FIELDS: Array<{
  key: keyof Pick<OrgN8nWebhooks, 'giayMoi' | 'ctsv' | 'daily' | 'monthly'>
  label: string
  icon: typeof FileText
}> = [
  { key: 'giayMoi', label: 'Giấy mời', icon: FileText },
  { key: 'ctsv', label: 'CTSV / tài chính', icon: ScrollText },
  { key: 'daily', label: 'Báo cáo ngày', icon: CalendarDays },
  { key: 'monthly', label: 'Báo cáo tháng', icon: CalendarRange },
]

/** Webhook n8n — form gọn icon + URL. */
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
      setMsg('Đã lưu')
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Không lưu được.')
    } finally {
      setBusy(false)
    }
  }

  if (!loaded) {
    return <p className="text-sm text-slate-600">Đang tải…</p>
  }

  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-base font-semibold text-slate-900">Webhook n8n</h2>
        <span className="truncate text-xs text-slate-500">{currentOrgLabel}</span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {FIELDS.map((f) => {
          const Icon = f.icon
          const ok = String(draft[f.key] ?? '').trim().startsWith('http')
          return (
            <label key={f.key} className="block rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
              <span className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-50 text-teal-800">
                  <Icon className="h-4 w-4" aria-hidden />
                </span>
                {f.label}
                {ok ? (
                  <span className="ml-auto h-2 w-2 rounded-full bg-emerald-500" title="Có URL" />
                ) : (
                  <span className="ml-auto h-2 w-2 rounded-full bg-slate-300" title="Trống" />
                )}
              </span>
              <input
                className={`mt-2 ${INPUT}`}
                value={draft[f.key] ?? ''}
                disabled={!canEdit}
                onChange={(e) => patch(f.key, e.target.value)}
                placeholder="https://…/webhook/…"
                inputMode="url"
                autoComplete="off"
              />
            </label>
          )
        })}
      </div>

      {canEdit ? (
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={busy}
            onClick={() => void onSave()}
            className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-teal-700 px-4 py-2.5 text-sm font-bold text-white hover:bg-teal-800 disabled:opacity-60"
          >
            <Save className="h-4 w-4" aria-hidden />
            {busy ? '…' : 'Lưu'}
          </button>
          {msg ? <p className="text-sm text-slate-600">{msg}</p> : null}
        </div>
      ) : (
        <p className="text-sm text-amber-800">Chỉ xem</p>
      )}
    </div>
  )
}
