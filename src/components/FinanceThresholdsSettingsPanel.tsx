import { useEffect, useState } from 'react'
import { Save } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { useOrg } from '../contexts/OrgProvider'
import { getFirestoreDb } from '../services/firebase'
import {
  defaultFinanceDepositThresholds,
  loadFinanceDepositThresholds,
  saveFinanceDepositThresholds,
  type FinanceDepositThresholds,
} from '../utils/financeThresholds'

const INPUT =
  'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100'

/** Ngưỡng LPXT / cọc theo trường — mặc định giống hệ Apps Script. */
export function FinanceThresholdsSettingsPanel() {
  const { can, profile } = useAuth()
  const { effectiveOrgId, currentOrgLabel } = useOrg()
  const canEdit = can('config:master_data') || can('config:omicall')
  const db = getFirestoreDb()
  const [draft, setDraft] = useState<FinanceDepositThresholds>(defaultFinanceDepositThresholds())
  const [loaded, setLoaded] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  useEffect(() => {
    if (!db) return
    let cancelled = false
    setLoaded(false)
    void loadFinanceDepositThresholds(db, effectiveOrgId).then((t) => {
      if (cancelled) return
      setDraft(t)
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
      const saved = await saveFinanceDepositThresholds(
        db,
        effectiveOrgId,
        draft,
        profile?.email ?? profile?.id ?? 'admin',
      )
      setDraft(saved)
      setMsg('Đã lưu — áp dụng ngay cho duyệt cọc và báo cáo trên máy này.')
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Không lưu được.')
    } finally {
      setBusy(false)
    }
  }

  if (!loaded) {
    return <p className="text-sm text-slate-600">Đang tải ngưỡng tiền…</p>
  }

  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-sm font-semibold text-slate-900">Ngưỡng tiền cọc / LPXT</h3>
        <p className="mt-0.5 text-xs text-slate-600">
          Dùng khi kế toán duyệt và khi chạy báo cáo tuyển sinh / báo cáo ngày. Mặc định như hệ cũ: 150.000đ LPXT,
          1.000.000đ cọc, 2.000.000đ hệ 9+. Trường: {currentOrgLabel || effectiveOrgId}.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="text-xs font-medium text-slate-600">
          LPXT tối thiểu (đ)
          <input
            type="number"
            min={1}
            className={INPUT}
            disabled={!canEdit}
            value={draft.lpxtMinVnd}
            onChange={(e) => setDraft((d) => ({ ...d, lpxtMinVnd: Number(e.target.value) || 0 }))}
          />
        </label>
        <label className="text-xs font-medium text-slate-600">
          Cọc hệ thường (đ)
          <input
            type="number"
            min={1}
            className={INPUT}
            disabled={!canEdit}
            value={draft.depositStandardVnd}
            onChange={(e) =>
              setDraft((d) => ({ ...d, depositStandardVnd: Number(e.target.value) || 0 }))
            }
          />
        </label>
        <label className="text-xs font-medium text-slate-600">
          Cọc hệ 9+ (đ)
          <input
            type="number"
            min={1}
            className={INPUT}
            disabled={!canEdit}
            value={draft.depositNinePlusVnd}
            onChange={(e) =>
              setDraft((d) => ({ ...d, depositNinePlusVnd: Number(e.target.value) || 0 }))
            }
          />
        </label>
      </div>
      {canEdit ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => void onSave()}
          className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
        >
          <Save className="h-4 w-4" />
          {busy ? 'Đang lưu…' : 'Lưu ngưỡng'}
        </button>
      ) : (
        <p className="text-xs text-slate-500">Chỉ quản lý mới sửa được các mức này.</p>
      )}
      {msg ? <p className="text-xs text-slate-600">{msg}</p> : null}
    </div>
  )
}
