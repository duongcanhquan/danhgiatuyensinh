import type { ReactNode } from 'react'
import { ChevronRight } from 'lucide-react'
import type { LeadCoreDraft } from '../utils/leadProfileEdit'

const INPUT_CLS =
  'w-full max-w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm text-slate-900 outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-500/25 disabled:bg-slate-50 disabled:text-slate-500'

function Field({
  label,
  span = 1,
  children,
}: {
  label: string
  /** 1 = một cột; 2 = trải full hàng (ô dài). */
  span?: 1 | 2
  children: ReactNode
}) {
  return (
    <label className={['block min-w-0', span === 2 ? 'sm:col-span-2' : ''].filter(Boolean).join(' ')}>
      <span className="text-sm font-semibold text-slate-800">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  )
}

function CollapsibleBlock({
  defaultOpen,
  title,
  children,
}: {
  defaultOpen?: boolean
  title: string
  children: ReactNode
}) {
  return (
    <details
      open={defaultOpen}
      className="group rounded-xl border border-slate-200/90 bg-white shadow-sm open:shadow-md"
    >
      <summary className="flex cursor-pointer list-none items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-bold text-slate-800 marker:content-none hover:bg-slate-50/80 [&::-webkit-details-marker]:hidden">
        <ChevronRight
          className="h-4 w-4 shrink-0 text-slate-500 transition group-open:rotate-90"
          aria-hidden
        />
        <span className="min-w-0 flex-1">{title}</span>
      </summary>
      <div className="border-t border-slate-100 px-3 pb-3 pt-2">{children}</div>
    </details>
  )
}

export function LeadProfileCoreForm({
  draft,
  onChange,
  disabled,
}: {
  draft: LeadCoreDraft
  onChange: (next: LeadCoreDraft) => void
  disabled: boolean
}) {
  const patch = <K extends keyof LeadCoreDraft>(k: K, v: string) => onChange({ ...draft, [k]: v })

  const grid = 'grid grid-cols-1 gap-x-3 gap-y-2.5 sm:grid-cols-2'

  return (
    <div className="space-y-2 text-sm text-slate-800">
      <CollapsibleBlock defaultOpen title="Liên hệ & nguồn">
        <div className={grid}>
          <Field label="Họ tên">
            <input className={INPUT_CLS} value={draft.fullName} disabled={disabled} onChange={(e) => patch('fullName', e.target.value)} />
          </Field>
          <Field label="Mã khách hàng">
            <input className={INPUT_CLS} value={draft.customerId} disabled={disabled} onChange={(e) => patch('customerId', e.target.value)} />
          </Field>
          <Field label="Ngày sinh">
            <input className={INPUT_CLS} value={draft.dateOfBirth} disabled={disabled} onChange={(e) => patch('dateOfBirth', e.target.value)} />
          </Field>
          <Field label="Điện thoại SV">
            <input className={INPUT_CLS} inputMode="tel" value={draft.phone} disabled={disabled} onChange={(e) => patch('phone', e.target.value)} />
          </Field>
          <Field label="ĐT người liên hệ">
            <input className={INPUT_CLS} inputMode="tel" value={draft.parentPhone} disabled={disabled} onChange={(e) => patch('parentPhone', e.target.value)} />
          </Field>
          <Field label="Nguồn tiếp nhận">
            <input className={INPUT_CLS} value={draft.source} disabled={disabled} onChange={(e) => patch('source', e.target.value)} />
          </Field>
        </div>
      </CollapsibleBlock>

      <CollapsibleBlock title="Địa lý & trường lớp">
        <div className={grid}>
          <Field label="Tỉnh / TP">
            <input className={INPUT_CLS} value={draft.province} disabled={disabled} onChange={(e) => patch('province', e.target.value)} />
          </Field>
          <Field label="Quận / huyện">
            <input className={INPUT_CLS} value={draft.hanoiArea} disabled={disabled} onChange={(e) => patch('hanoiArea', e.target.value)} />
          </Field>
          <Field label="Địa chỉ" span={2}>
            <input className={INPUT_CLS} value={draft.address} disabled={disabled} onChange={(e) => patch('address', e.target.value)} />
          </Field>
          <Field label="Trường THPT">
            <input className={INPUT_CLS} value={draft.highSchool} disabled={disabled} onChange={(e) => patch('highSchool', e.target.value)} />
          </Field>
          <Field label="Lớp hiện đang học">
            <input className={INPUT_CLS} value={draft.gradeClass} disabled={disabled} onChange={(e) => patch('gradeClass', e.target.value)} />
          </Field>
        </div>
      </CollapsibleBlock>

      <CollapsibleBlock title="Học tập & định hướng">
        <div className={grid}>
          <Field label="Hệ đào tạo">
            <input className={INPUT_CLS} value={draft.educationLevel} disabled={disabled} onChange={(e) => patch('educationLevel', e.target.value)} />
          </Field>
          <Field label="Ngành quan tâm">
            <input className={INPUT_CLS} value={draft.majorInterest} disabled={disabled} onChange={(e) => patch('majorInterest', e.target.value)} />
          </Field>
          <Field label="Học lực / xếp loại">
            <input className={INPUT_CLS} value={draft.academicPerformance} disabled={disabled} onChange={(e) => patch('academicPerformance', e.target.value)} />
          </Field>
          <Field label="Dự định (hình thức)">
            <input className={INPUT_CLS} value={draft.studyIntention} disabled={disabled} onChange={(e) => patch('studyIntention', e.target.value)} />
          </Field>
          <Field label="Loại hình trường">
            <input className={INPUT_CLS} value={draft.schoolType} disabled={disabled} onChange={(e) => patch('schoolType', e.target.value)} />
          </Field>
          <Field label="Nhóm tài chính">
            <input className={INPUT_CLS} value={draft.financialStatus} disabled={disabled} onChange={(e) => patch('financialStatus', e.target.value)} />
          </Field>
        </div>
      </CollapsibleBlock>

      <CollapsibleBlock title="Mô tả & ghi chú">
        <div className="space-y-2.5">
          <div className={grid}>
            <Field label="Mong muốn" span={2}>
              <textarea rows={2} className={`${INPUT_CLS} resize-y`} value={draft.aspirations} disabled={disabled} onChange={(e) => patch('aspirations', e.target.value)} />
            </Field>
          </div>
          <details className="rounded-lg border border-slate-200/80 bg-slate-50/60">
            <summary className="cursor-pointer px-2.5 py-2 text-sm font-semibold text-slate-700">
              Ghi chú bổ sung
            </summary>
            <div className={`${grid} p-2.5 pt-0`}>
              <Field label="Ghi chú 1" span={2}>
                <textarea rows={2} className={`${INPUT_CLS} resize-y`} value={draft.profileNote1} disabled={disabled} onChange={(e) => patch('profileNote1', e.target.value)} />
              </Field>
              <Field label="Ghi chú 2" span={2}>
                <textarea rows={2} className={`${INPUT_CLS} resize-y`} value={draft.profileNote2} disabled={disabled} onChange={(e) => patch('profileNote2', e.target.value)} />
              </Field>
              <Field label="Lưu ý khác" span={2}>
                <textarea rows={2} className={`${INPUT_CLS} resize-y`} value={draft.otherAttentionNotes} disabled={disabled} onChange={(e) => patch('otherAttentionNotes', e.target.value)} />
              </Field>
            </div>
          </details>
          <Field label="Mô tả tổng hợp" span={2}>
            <textarea rows={2} className={`${INPUT_CLS} resize-y`} value={draft.description} disabled={disabled} onChange={(e) => patch('description', e.target.value)} />
          </Field>
          <div className={grid}>
            <Field label="Sở thích" span={2}>
              <textarea rows={2} className={`${INPUT_CLS} resize-y`} value={draft.hobbies} disabled={disabled} onChange={(e) => patch('hobbies', e.target.value)} />
            </Field>
            <Field label="Ghi chú đi thực tế" span={2}>
              <textarea rows={2} className={`${INPUT_CLS} resize-y`} value={draft.fieldTripNotes} disabled={disabled} onChange={(e) => patch('fieldTripNotes', e.target.value)} />
            </Field>
          </div>
        </div>
      </CollapsibleBlock>
    </div>
  )
}
