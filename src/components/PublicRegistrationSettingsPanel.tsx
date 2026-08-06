import { useCallback, useEffect, useMemo, useState } from 'react'
import { doc, onSnapshot, setDoc, Timestamp } from 'firebase/firestore'
import { Copy, ExternalLink, Save } from 'lucide-react'
import {
  defaultPublicRegistrationConfig,
  FS_COLLECTIONS,
  type PublicRegistrationConfig,
} from '../types'
import { useAuth } from '../hooks/useAuth'
import { useOrg } from '../contexts/OrgProvider'
import { getFirestoreDb } from '../services/firebase'
import { orgSettingsDocSegments } from '../tenancy/orgSettingsPaths'
import { DEFAULT_ORG_ID } from '../tenancy/orgConstants'

const PUBLIC_REGISTRATION_DOC_ID = 'publicRegistrationConfig'

const INPUT =
  'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-100'

function parseConfig(data: Record<string, unknown> | undefined): PublicRegistrationConfig {
  const base = defaultPublicRegistrationConfig()
  if (!data) return base
  return {
    schemaVersion: 1,
    enabled: data.enabled === true,
    portalTitle: String(data.portalTitle ?? base.portalTitle).trim() || base.portalTitle,
    introText: String(data.introText ?? base.introText).trim() || base.introText,
    successMessage: String(data.successMessage ?? base.successMessage).trim() || base.successMessage,
    defaultSource1: String(data.defaultSource1 ?? base.defaultSource1).trim() || base.defaultSource1,
    autoAssignCounselor: data.autoAssignCounselor !== false,
    n8nEnabled: data.n8nEnabled !== false,
    n8nWebhookUrl: String(data.n8nWebhookUrl ?? '').trim(),
    portalPublicUrl: String(data.portalPublicUrl ?? '').trim(),
    updatedAt: String(data.updatedAt ?? ''),
    updatedBy: String(data.updatedBy ?? ''),
  }
}

export function PublicRegistrationSettingsPanel() {
  const { can, profile } = useAuth()
  const { effectiveOrgId, currentOrgLabel, organizations } = useOrg()
  const canEdit = can('config:master_data')
  const db = getFirestoreDb()
  const [draft, setDraft] = useState<PublicRegistrationConfig>(defaultPublicRegistrationConfig())
  const [remoteLoaded, setRemoteLoaded] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  const orgSlug = useMemo(() => {
    const hit = organizations.find((o) => o.id === effectiveOrgId)
    return (hit?.slug || effectiveOrgId || DEFAULT_ORG_ID).trim() || DEFAULT_ORG_ID
  }, [organizations, effectiveOrgId])

  useEffect(() => {
    if (!db) return
    let cancelled = false
    setRemoteLoaded(false)
    const ref = doc(db, ...orgSettingsDocSegments(effectiveOrgId, PUBLIC_REGISTRATION_DOC_ID))
    const unsub = onSnapshot(
      ref,
      (snap) => {
        if (cancelled) return
        setDraft(parseConfig(snap.exists() ? (snap.data() as Record<string, unknown>) : undefined))
        setRemoteLoaded(true)
      },
      (err) => {
        console.error(err)
        if (!cancelled) {
          setMsg('Không đọc được cấu hình cổng đăng ký.')
          setRemoteLoaded(true)
        }
      },
    )
    return () => {
      cancelled = true
      unsub()
    }
  }, [db, effectiveOrgId])

  const patch = useCallback((partial: Partial<PublicRegistrationConfig>) => {
    setDraft((d) => ({ ...d, ...partial }))
  }, [])

  const portalPath = useMemo(() => {
    const base = `${window.location.origin}${import.meta.env.BASE_URL.replace(/\/$/, '')}`
    return `${base}/dang-ky/${orgSlug}`
  }, [orgSlug])

  const onSave = async () => {
    if (!db || !canEdit) return
    setBusy(true)
    setMsg(null)
    try {
      const ref = doc(db, ...orgSettingsDocSegments(effectiveOrgId, PUBLIC_REGISTRATION_DOC_ID))
      const payload: PublicRegistrationConfig = {
        ...draft,
        portalPublicUrl: draft.portalPublicUrl?.trim() || portalPath,
        updatedAt: new Date().toISOString(),
        updatedBy: profile?.email ?? profile?.id ?? 'admin',
      }
      await setDoc(
        ref,
        { ...payload, orgId: effectiveOrgId, updatedAtServer: Timestamp.now() },
        { merge: true },
      )
      await setDoc(
        doc(db, FS_COLLECTIONS.orgSettings, effectiveOrgId),
        { orgId: effectiveOrgId, updatedAt: Timestamp.now() },
        { merge: true },
      )
      // Mirror VietMy → scoringAux để tương thích Function/legacy
      if (effectiveOrgId === DEFAULT_ORG_ID) {
        await setDoc(
          doc(db, FS_COLLECTIONS.scoringAux, PUBLIC_REGISTRATION_DOC_ID),
          { ...payload, updatedAtServer: Timestamp.now() },
          { merge: true },
        )
      }
      setDraft(payload)
      setMsg(`Đã lưu — áp dụng ngay cho /dang-ky/${orgSlug}.`)
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Không lưu được cấu hình.')
    } finally {
      setBusy(false)
    }
  }

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(portalPath)
      setMsg('Đã copy link cổng đăng ký.')
    } catch {
      setMsg('Không copy được — hãy chọn link và copy thủ công.')
    }
  }

  if (!remoteLoaded) {
    return <p className="text-sm text-slate-600">Đang tải cấu hình cổng đăng ký…</p>
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-emerald-100 bg-emerald-50/60 px-4 py-3 text-sm text-emerald-950">
        <p className="font-semibold">Cổng đăng ký sinh viên (công khai)</p>
        <p className="mt-1 text-emerald-900/90">
          Đang cấu hình cho <strong>{currentOrgLabel}</strong>. Sinh viên điền form → hồ sơ vào trường này → n8n gửi
          email (nếu bật).
        </p>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <p className="text-sm font-semibold text-slate-900">Link cổng công khai</p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <code className="max-w-full flex-1 break-all rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-800">
            {portalPath}
          </code>
          <button
            type="button"
            onClick={() => void copyLink()}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            <Copy className="h-3.5 w-3.5" aria-hidden />
            Copy
          </button>
          <a
            href={portalPath}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800 hover:bg-emerald-100"
          >
            <ExternalLink className="h-3.5 w-3.5" aria-hidden />
            Mở thử
          </a>
        </div>
      </div>

      <label className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <input
          type="checkbox"
          className="mt-1 h-4 w-4 rounded border-slate-300 text-emerald-600"
          checked={draft.enabled}
          disabled={!canEdit}
          onChange={(e) => patch({ enabled: e.target.checked })}
        />
        <span>
          <span className="block text-sm font-semibold text-slate-900">Bật cổng đăng ký</span>
          <span className="mt-0.5 block text-xs text-slate-600">Khi tắt, sinh viên thấy thông báo «cổng đang đóng».</span>
        </span>
      </label>

      <div className="grid gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-2">
        <label className="sm:col-span-2">
          <span className="text-sm font-semibold text-slate-800">Tiêu đề trang</span>
          <input
            className={`mt-1 ${INPUT}`}
            value={draft.portalTitle}
            disabled={!canEdit}
            onChange={(e) => patch({ portalTitle: e.target.value })}
          />
        </label>
        <label className="sm:col-span-2">
          <span className="text-sm font-semibold text-slate-800">Giới thiệu (đầu form)</span>
          <textarea
            className={`mt-1 min-h-[72px] ${INPUT}`}
            value={draft.introText}
            disabled={!canEdit}
            onChange={(e) => patch({ introText: e.target.value })}
            rows={3}
          />
        </label>
        <label className="sm:col-span-2">
          <span className="text-sm font-semibold text-slate-800">Thông báo sau khi đăng ký thành công</span>
          <textarea
            className={`mt-1 min-h-[72px] ${INPUT}`}
            value={draft.successMessage}
            disabled={!canEdit}
            onChange={(e) => patch({ successMessage: e.target.value })}
            rows={3}
          />
        </label>
        <label>
          <span className="text-sm font-semibold text-slate-800">Nguồn hồ sơ (source1)</span>
          <input
            className={`mt-1 ${INPUT}`}
            value={draft.defaultSource1}
            disabled={!canEdit}
            onChange={(e) => patch({ defaultSource1: e.target.value })}
            placeholder="Web đăng ký"
          />
        </label>
        <label>
          <span className="text-sm font-semibold text-slate-800">URL cổng (gửi kèm n8n)</span>
          <input
            className={`mt-1 ${INPUT}`}
            value={draft.portalPublicUrl}
            disabled={!canEdit}
            onChange={(e) => patch({ portalPublicUrl: e.target.value })}
            placeholder={portalPath}
          />
        </label>
      </div>

      <label className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <input
          type="checkbox"
          className="mt-1 h-4 w-4 rounded border-slate-300 text-emerald-600"
          checked={draft.autoAssignCounselor}
          disabled={!canEdit}
          onChange={(e) => patch({ autoAssignCounselor: e.target.checked })}
        />
        <span>
          <span className="block text-sm font-semibold text-slate-900">Tự gán tư vấn viên</span>
          <span className="mt-0.5 block text-xs text-slate-600">Chọn TVV ít hồ sơ nhất trong trường.</span>
        </span>
      </label>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm space-y-3">
        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            className="mt-1 h-4 w-4 rounded border-slate-300 text-emerald-600"
            checked={draft.n8nEnabled}
            disabled={!canEdit}
            onChange={(e) => patch({ n8nEnabled: e.target.checked })}
          />
          <span>
            <span className="block text-sm font-semibold text-slate-900">Gửi thông báo n8n (email)</span>
            <span className="mt-0.5 block text-xs text-slate-600">Webhook riêng cho cổng đăng ký — không dùng 4 ô CTSV/giấy mời.</span>
          </span>
        </label>
        <label>
          <span className="text-sm font-semibold text-slate-800">URL webhook n8n</span>
          <input
            className={`mt-1 ${INPUT} font-mono`}
            value={draft.n8nWebhookUrl}
            disabled={!canEdit}
            onChange={(e) => patch({ n8nWebhookUrl: e.target.value })}
            placeholder="https://…/webhook/…"
            autoComplete="off"
          />
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={!canEdit || busy}
          onClick={() => void onSave()}
          className="inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-800 disabled:opacity-50"
        >
          <Save className="h-4 w-4" aria-hidden />
          {busy ? 'Đang lưu…' : 'Lưu'}
        </button>
        {msg ? <p className="text-sm text-slate-600">{msg}</p> : null}
      </div>
    </div>
  )
}
