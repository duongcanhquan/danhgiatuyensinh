import { useCallback, useEffect, useState } from 'react'
import { HardDrive, Save } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { useOrg } from '../contexts/OrgProvider'
import { getFirestoreDb } from '../services/firebase'
import {
  emptyReceiptStorageConfig,
  loadReceiptStorageConfig,
  saveReceiptStorageConfig,
  type OrgReceiptStorageConfig,
  type ReceiptStorageProvider,
} from '../utils/receiptStorageConfig'

const INPUT =
  'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-teal-400 focus:outline-none focus:ring-2 focus:ring-teal-100'

const PROVIDERS: { value: ReceiptStorageProvider; label: string; hint: string }[] = [
  { value: 'auto', label: 'Tự động', hint: 'R2 nếu có URL → Drive → Firebase Storage' },
  { value: 'r2', label: 'Cloudflare R2', hint: 'Ưu tiên worker upload' },
  { value: 'drive', label: 'Google Drive (Apps Script)', hint: 'Webhook script.google.com' },
  { value: 'firebase', label: 'Firebase Storage', hint: 'Bucket mặc định của project' },
]

/** Nơi lưu chứng từ thu — cấu hình theo trường (không chỉ .env). */
export function ReceiptStorageSettingsPanel() {
  const { can, profile } = useAuth()
  const { effectiveOrgId, currentOrgLabel } = useOrg()
  const canEdit = can('config:master_data') || can('config:omicall')
  const db = getFirestoreDb()
  const [draft, setDraft] = useState<OrgReceiptStorageConfig>(emptyReceiptStorageConfig())
  const [loaded, setLoaded] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  useEffect(() => {
    if (!db) return
    let cancelled = false
    setLoaded(false)
    void loadReceiptStorageConfig(db, effectiveOrgId).then((cfg) => {
      if (cancelled) return
      setDraft(cfg)
      setLoaded(true)
    })
    return () => {
      cancelled = true
    }
  }, [db, effectiveOrgId])

  const patch = useCallback((p: Partial<OrgReceiptStorageConfig>) => {
    setDraft((d) => ({ ...d, ...p }))
  }, [])

  const onSave = async () => {
    if (!db || !canEdit) return
    setBusy(true)
    setMsg(null)
    try {
      const saved = await saveReceiptStorageConfig(
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

  if (!loaded) return <p className="text-sm text-slate-600">Đang tải…</p>

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900">
          <HardDrive className="h-4 w-4 text-teal-800" aria-hidden />
          Chứng từ &amp; lưu trữ
        </h2>
        <span className="truncate text-xs text-slate-500">{currentOrgLabel}</span>
      </div>
      <p className="text-sm text-slate-600">
        Chọn nơi lưu bill khi TVV / kế toán tải chứng từ. Để trống URL sẽ dùng biến máy chủ (.env) nếu có.
      </p>

      <fieldset className="space-y-2">
        <legend className="text-xs font-semibold text-slate-600">Cách lưu</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {PROVIDERS.map((p) => (
            <label
              key={p.value}
              className={`flex cursor-pointer gap-2 rounded-xl border px-3 py-2 text-sm ${
                draft.provider === p.value
                  ? 'border-teal-400 bg-teal-50 text-teal-950'
                  : 'border-slate-200 bg-white text-slate-800'
              }`}
            >
              <input
                type="radio"
                name="receipt-provider"
                className="mt-1"
                checked={draft.provider === p.value}
                disabled={!canEdit}
                onChange={() => patch({ provider: p.value })}
              />
              <span>
                <span className="font-semibold">{p.label}</span>
                <span className="mt-0.5 block text-xs text-slate-500">{p.hint}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-xs font-semibold text-slate-600 sm:col-span-2">
          URL upload R2
          <input
            className={`mt-1 ${INPUT}`}
            value={draft.r2UploadUrl}
            disabled={!canEdit}
            onChange={(e) => patch({ r2UploadUrl: e.target.value })}
            placeholder="https://…/upload"
          />
        </label>
        <label className="block text-xs font-semibold text-slate-600">
          Token R2
          <input
            className={`mt-1 ${INPUT}`}
            value={draft.r2UploadToken}
            disabled={!canEdit}
            onChange={(e) => patch({ r2UploadToken: e.target.value })}
            autoComplete="off"
          />
        </label>
        <label className="block text-xs font-semibold text-slate-600">
          URL công khai R2
          <input
            className={`mt-1 ${INPUT}`}
            value={draft.r2PublicBaseUrl}
            disabled={!canEdit}
            onChange={(e) => patch({ r2PublicBaseUrl: e.target.value })}
            placeholder="https://…"
          />
        </label>
        <label className="block text-xs font-semibold text-slate-600 sm:col-span-2">
          URL Apps Script (Drive)
          <input
            className={`mt-1 ${INPUT}`}
            value={draft.driveWebhookUrl}
            disabled={!canEdit}
            onChange={(e) => patch({ driveWebhookUrl: e.target.value })}
            placeholder="https://script.google.com/macros/s/…/exec"
          />
        </label>
        <label className="block text-xs font-semibold text-slate-600 sm:col-span-2">
          Token Drive webhook
          <input
            className={`mt-1 ${INPUT}`}
            value={draft.driveWebhookToken}
            disabled={!canEdit}
            onChange={(e) => patch({ driveWebhookToken: e.target.value })}
            autoComplete="off"
          />
        </label>
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
