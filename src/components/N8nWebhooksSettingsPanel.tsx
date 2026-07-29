import { useCallback, useEffect, useState } from 'react'
import { Save } from 'lucide-react'
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

const FIELDS: Array<{ key: keyof Pick<OrgN8nWebhooks, 'giayMoi' | 'ctsv' | 'daily' | 'monthly'>; label: string; hint: string }> =
  [
    {
      key: 'giayMoi',
      label: 'Giấy mời / trúng tuyển',
      hint: 'Tạo Docs giấy mời, giấy trúng tuyển từ hồ sơ.',
    },
    {
      key: 'ctsv',
      label: 'CTSV / cập nhật tài chính',
      hint: 'Thông báo Chat khi đổi tiền, bill, duyệt đợt thu.',
    },
    {
      key: 'daily',
      label: 'Báo cáo ngày',
      hint: 'Gửi tổng hợp ngày từ cổng kế toán / báo cáo.',
    },
    {
      key: 'monthly',
      label: 'Báo cáo tháng',
      hint: 'Gửi tổng hợp tháng.',
    },
  ]

/** Cài đặt webhook n8n theo từng trường — ưu tiên hơn biến môi trường VITE_N8N_*. */
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
      setMsg('Đã lưu — webhook trường áp dụng ngay cho giấy tờ / CTSV / báo cáo.')
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Không lưu được webhook.')
    } finally {
      setBusy(false)
    }
  }

  if (!loaded) {
    return <p className="text-sm text-slate-600">Đang tải webhook n8n…</p>
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-teal-100 bg-teal-50/70 px-4 py-3 text-sm text-teal-950">
        <p className="font-semibold">Kết nối n8n theo trường</p>
        <p className="mt-1 text-teal-900/90">
          Trường hiện tại: <strong>{currentOrgLabel}</strong>. URL lưu ở đây ưu tiên hơn cấu hình chung trên máy chủ.
          Để trống một ô thì hệ thống dùng giá trị mặc định / biến môi trường.
        </p>
      </div>

      <div className="grid gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-2">
        {FIELDS.map((f) => (
          <label key={f.key} className="block sm:col-span-2">
            <span className="text-sm font-semibold text-slate-800">{f.label}</span>
            <span className="mt-0.5 block text-xs text-slate-500">{f.hint}</span>
            <input
              className={`mt-1 ${INPUT}`}
              value={draft[f.key] ?? ''}
              disabled={!canEdit}
              onChange={(e) => patch(f.key, e.target.value)}
              placeholder="https://…/webhook/…"
              inputMode="url"
              autoComplete="off"
            />
          </label>
        ))}
      </div>

      {draft.updatedAt ? (
        <p className="text-xs text-slate-500">
          Lần lưu gần nhất: {draft.updatedAt}
          {draft.updatedBy ? ` · ${draft.updatedBy}` : ''}
        </p>
      ) : null}

      {canEdit ? (
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={busy}
            onClick={() => void onSave()}
            className="inline-flex items-center gap-2 rounded-xl bg-teal-700 px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-teal-800 disabled:opacity-60"
          >
            <Save className="h-4 w-4" aria-hidden />
            {busy ? 'Đang lưu…' : 'Lưu webhook'}
          </button>
          {msg ? <p className="text-sm text-slate-700">{msg}</p> : null}
        </div>
      ) : (
        <p className="text-sm text-amber-800">Bạn chỉ xem — cần quyền cấu hình danh mục hoặc gọi điện để lưu.</p>
      )}
    </div>
  )
}
