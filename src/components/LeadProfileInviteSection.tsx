import { useEffect, useMemo, useState } from 'react'
import { FolderOpen, Loader2 } from 'lucide-react'
import type { InviteDocumentType, Lead, ScholarshipRecord } from '../types'
import { getInviteDocumentGroups } from '../utils/n8nIntegration'
import { loadInviteDocumentsConfig, resolveInviteDocumentGroups } from '../utils/inviteDocumentsConfig'
import { scholarshipSelectLabel } from '../utils/leadProfileCatalog'
import { useOrg } from '../hooks/useOrg'
import { getFirestoreDb } from '../services/firebase'

export function LeadProfileInviteSection({
  lead,
  scholarships,
  inviteFolderUrl,
  disabled,
  busy,
  onGenerate,
}: {
  lead: Lead
  scholarships: readonly ScholarshipRecord[]
  inviteFolderUrl?: string
  disabled: boolean
  busy: boolean
  onGenerate: (docType: InviteDocumentType, scholarshipId: string) => Promise<void>
}) {
  const { effectiveOrgId } = useOrg()
  const [scholarshipId, setScholarshipId] = useState(lead.scholarship1Id ?? '')
  const [inviteGroups, setInviteGroups] = useState(() => getInviteDocumentGroups())

  const scholarshipOptions = useMemo(() => scholarships, [scholarships])

  useEffect(() => {
    const db = getFirestoreDb()
    if (!db) {
      setInviteGroups(getInviteDocumentGroups())
      return
    }
    let cancelled = false
    void loadInviteDocumentsConfig(db, lead.orgId?.trim() || effectiveOrgId).then((cfg) => {
      if (cancelled) return
      setInviteGroups(resolveInviteDocumentGroups(cfg))
    })
    return () => {
      cancelled = true
    }
  }, [lead.orgId, effectiveOrgId])

  return (
    <div className="space-y-2 text-xs text-slate-800">
      {inviteFolderUrl ? (
        <div className="flex flex-wrap items-center justify-between gap-1.5 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1.5">
          <span className="text-[11px] font-semibold text-emerald-900">
            <FolderOpen className="mr-1 inline h-3.5 w-3.5" aria-hidden />
            Thư mục hồ sơ
          </span>
          <a
            href={inviteFolderUrl}
            target="_blank"
            rel="noreferrer"
            className="text-[11px] font-bold text-emerald-800 underline"
          >
            Mở ngay
          </a>
        </div>
      ) : (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5 text-[11px] text-amber-950">
          Chưa có link thư mục trên hồ sơ này. Lần đầu bấm tạo giấy tờ, hệ thống sẽ tạo folder Drive rồi hiện nút «Mở
          ngay». Cần sẵn: <strong>Cài đặt → Chứng từ</strong> (URL Apps Script + token) và{' '}
          <strong>Giấy mời &amp; mẫu</strong> (Điền folder VietMy → Lưu).
        </p>
      )}

      <div className="rounded-lg border border-violet-100 bg-violet-50/50 p-2">
        <h4 className="text-[11px] font-bold text-violet-900">Học bổng áp dụng cho giấy mời</h4>
        <label className="mt-1 block">
          <span className="text-[10px] font-semibold text-slate-700">Chọn học bổng</span>
          <select
            className="mt-0.5 w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-violet-900 outline-none focus:border-violet-400"
            value={scholarshipId}
            disabled={disabled || busy}
            onChange={(e) => setScholarshipId(e.target.value)}
          >
            <option value="">— Không áp dụng học bổng —</option>
            {scholarshipOptions.map((s) => (
              <option key={s.id} value={s.id}>
                {scholarshipSelectLabel(s)}
              </option>
            ))}
          </select>
        </label>
      </div>

      <h4 className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Chọn loại giấy tờ cần tạo</h4>
      <div className="grid grid-cols-1 gap-1.5 md:grid-cols-2">
        {inviteGroups.map((group) => (
          <div key={group.title} className="rounded-lg border border-slate-200 bg-white p-2 shadow-sm">
            <p className={`mb-1 text-[11px] font-bold ${group.tone}`}>{group.title}</p>
            <div className="grid gap-1">
              {group.options.map((opt) => (
                <button
                  key={opt.docType}
                  type="button"
                  disabled={disabled || busy}
                  onClick={() => void onGenerate(opt.docType, scholarshipId)}
                  className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-bold text-slate-800 transition hover:border-slate-300 hover:bg-white disabled:opacity-40"
                >
                  {busy ? <Loader2 className="mr-1 inline h-3 w-3 animate-spin" /> : null}
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
