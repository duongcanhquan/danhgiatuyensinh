import { useCallback, useEffect, useState } from 'react'
import { FileStack, Save } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { useOrg } from '../contexts/OrgProvider'
import { getFirestoreDb } from '../services/firebase'
import {
  defaultInviteDocumentsConfig,
  loadInviteDocumentsConfig,
  saveInviteDocumentsConfig,
  type OrgInviteDocumentsConfig,
} from '../utils/inviteDocumentsConfig'

const INPUT =
  'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-teal-400 focus:outline-none focus:ring-2 focus:ring-teal-100'

/** Cài đặt giấy mời / mẫu Docs / thư mục Drive — theo từng trường. */
export function InviteDocumentsSettingsPanel() {
  const { can, profile } = useAuth()
  const { effectiveOrgId, currentOrgLabel } = useOrg()
  const canEdit = can('config:master_data') || can('config:omicall')
  const db = getFirestoreDb()
  const [draft, setDraft] = useState<OrgInviteDocumentsConfig>(defaultInviteDocumentsConfig())
  const [loaded, setLoaded] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  useEffect(() => {
    if (!db) return
    let cancelled = false
    setLoaded(false)
    void loadInviteDocumentsConfig(db, effectiveOrgId).then((cfg) => {
      if (cancelled) return
      setDraft(cfg)
      setLoaded(true)
    })
    return () => {
      cancelled = true
    }
  }, [db, effectiveOrgId])

  const patchRoot = useCallback((patch: Partial<OrgInviteDocumentsConfig>) => {
    setDraft((d) => ({ ...d, ...patch }))
  }, [])

  const patchOption = (gi: number, oi: number, patch: Partial<(typeof draft.groups)[0]['options'][0]>) => {
    setDraft((d) => {
      const groups = d.groups.map((g, i) => {
        if (i !== gi) return g
        return {
          ...g,
          options: g.options.map((o, j) => (j === oi ? { ...o, ...patch } : o)),
        }
      })
      return { ...d, groups }
    })
  }

  const patchGroupTitle = (gi: number, title: string) => {
    setDraft((d) => ({
      ...d,
      groups: d.groups.map((g, i) => (i === gi ? { ...g, title } : g)),
    }))
  }

  const onSave = async () => {
    if (!db || !canEdit) return
    setBusy(true)
    setMsg(null)
    try {
      const saved = await saveInviteDocumentsConfig(
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
          <FileStack className="h-4 w-4 text-teal-800" aria-hidden />
          Giấy mời &amp; mẫu
        </h2>
        <span className="truncate text-xs text-slate-500">{currentOrgLabel}</span>
      </div>
      <p className="text-sm text-slate-600">
        Bật/tắt loại giấy, đổi nhãn, gắn mã mẫu Google Docs và thư mục Drive gốc. Webhook tạo giấy nằm ở tab{' '}
        <strong>Webhook n8n</strong> (ô Giấy mời).
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-xs font-semibold text-slate-600">
          ID thư mục Drive gốc (giấy mời)
          <input
            className={`mt-1 ${INPUT} font-mono`}
            value={draft.driveRootFolderId}
            disabled={!canEdit}
            onChange={(e) => patchRoot({ driveRootFolderId: e.target.value })}
            placeholder="1AbC… (folder ID)"
            autoComplete="off"
          />
        </label>
        <label className="flex items-center gap-2 self-end rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-800">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-slate-300 text-teal-700"
            checked={draft.autoCreateFolder}
            disabled={!canEdit}
            onChange={(e) => patchRoot({ autoCreateFolder: e.target.checked })}
          />
          Tự tạo thư mục hồ sơ khi lần đầu tạo giấy (folderId trống)
        </label>
      </div>

      <div className="space-y-3">
        {draft.groups.map((g, gi) => (
          <div key={g.id} className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
            <label className="block text-xs font-semibold text-slate-600">
              Nhóm
              <input
                className={`mt-1 ${INPUT}`}
                value={g.title}
                disabled={!canEdit}
                onChange={(e) => patchGroupTitle(gi, e.target.value)}
              />
            </label>
            <ul className="mt-3 space-y-2">
              {g.options.map((o, oi) => (
                <li
                  key={o.docType}
                  className="grid gap-2 rounded-xl border border-slate-100 bg-slate-50/80 p-2 sm:grid-cols-[auto_1fr_1fr]"
                >
                  <label className="flex items-center gap-2 text-xs font-semibold text-slate-700">
                    <input
                      type="checkbox"
                      checked={o.enabled}
                      disabled={!canEdit}
                      onChange={(e) => patchOption(gi, oi, { enabled: e.target.checked })}
                    />
                    Bật
                  </label>
                  <label className="block text-xs font-semibold text-slate-600">
                    Nhãn nút
                    <input
                      className={`mt-1 ${INPUT}`}
                      value={o.label}
                      disabled={!canEdit}
                      onChange={(e) => patchOption(gi, oi, { label: e.target.value })}
                    />
                    <span className="mt-0.5 block font-mono text-[10px] font-normal text-slate-400">{o.docType}</span>
                  </label>
                  <label className="block text-xs font-semibold text-slate-600">
                    Mã mẫu Google Docs
                    <input
                      className={`mt-1 ${INPUT} font-mono`}
                      value={o.templateFileId}
                      disabled={!canEdit}
                      onChange={(e) => patchOption(gi, oi, { templateFileId: e.target.value })}
                      placeholder="fileId (tuỳ chọn)"
                      autoComplete="off"
                    />
                  </label>
                </li>
              ))}
            </ul>
          </div>
        ))}
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
