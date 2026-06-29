import { useMemo, useState } from 'react'
import { FolderOpen, Loader2 } from 'lucide-react'
import type { InviteDocumentType, Lead, ScholarshipRecord } from '../types'
import { INVITE_DOCUMENT_GROUPS } from '../utils/n8nIntegration'
import { scholarshipSelectLabel } from '../utils/leadProfileCatalog'

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
  const [scholarshipId, setScholarshipId] = useState(lead.scholarship1Id ?? '')

  const scholarshipOptions = useMemo(() => scholarships, [scholarships])

  return (
    <div className="space-y-4 text-sm text-slate-800">
      {inviteFolderUrl ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2">
          <span className="font-semibold text-emerald-900">
            <FolderOpen className="mr-1.5 inline h-4 w-4" aria-hidden />
            Thư mục hồ sơ
          </span>
          <a
            href={inviteFolderUrl}
            target="_blank"
            rel="noreferrer"
            className="text-sm font-bold text-emerald-800 underline"
          >
            Mở ngay
          </a>
        </div>
      ) : (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
          Chưa có link thư mục — khi tạo giấy tờ lần đầu, n8n / Drive có thể trả link (lưu vào hồ sơ).
        </p>
      )}

      <div className="rounded-xl border border-violet-100 bg-violet-50/50 p-3">
        <h4 className="text-sm font-extrabold text-violet-900">Học bổng áp dụng cho giấy mời</h4>
        <label className="mt-2 block">
          <span className="text-xs font-semibold text-slate-700">Chọn học bổng</span>
          <select
            className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm font-semibold text-violet-900 outline-none focus:border-violet-400"
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

      <h4 className="text-xs font-bold uppercase tracking-wide text-slate-500">Chọn loại giấy tờ cần tạo</h4>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {INVITE_DOCUMENT_GROUPS.map((group) => (
          <div key={group.title} className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
            <p className={`mb-2 text-sm font-bold ${group.tone}`}>{group.title}</p>
            <div className="grid gap-2">
              {group.options.map((opt) => (
                <button
                  key={opt.docType}
                  type="button"
                  disabled={disabled || busy}
                  onClick={() => void onGenerate(opt.docType, scholarshipId)}
                  className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-800 transition hover:border-slate-300 hover:bg-white disabled:opacity-40"
                >
                  {busy ? <Loader2 className="mr-1 inline h-3.5 w-3.5 animate-spin" /> : null}
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
