import { useState, type ReactNode } from 'react'
import { ChevronRight } from 'lucide-react'
import type { LeadCoreDraft } from '../utils/leadProfileEdit'
import type { LeadSourceRecord, ScholarshipCategoryId, ScholarshipRecord } from '../types'
import { SCHOLARSHIP_CATEGORY_LABELS } from '../types'
import { scholarshipSelectLabel } from '../utils/leadProfileCatalog'

const INPUT_CLS =
  'w-full max-w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm text-slate-900 outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-500/25 disabled:bg-slate-50 disabled:text-slate-500'

export type LeadProfileFormTabId = 'contact' | 'family' | 'scholarship' | 'geo' | 'study' | 'notes'

const PROFILE_TABS: { id: LeadProfileFormTabId; label: string; short: string }[] = [
  { id: 'contact', label: 'Liên hệ & nguồn', short: 'Liên hệ' },
  { id: 'family', label: 'Gia đình', short: 'Gia đình' },
  { id: 'scholarship', label: 'Học bổng', short: 'Học bổng' },
  { id: 'geo', label: 'Địa lý & trường', short: 'Địa lý' },
  { id: 'study', label: 'Học tập', short: 'Học tập' },
  { id: 'notes', label: 'Ghi chú', short: 'Ghi chú' },
]

function Field({ label, span = 1, children }: { label: string; span?: 1 | 2 | 3; children: ReactNode }) {
  const spanCls =
    span === 3 ? 'lg:col-span-3' : span === 2 ? 'sm:col-span-2 lg:col-span-2' : ''
  return (
    <label className={['block min-w-0', spanCls].filter(Boolean).join(' ')}>
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
        <ChevronRight className="h-4 w-4 shrink-0 text-slate-500 transition group-open:rotate-90" aria-hidden />
        <span className="min-w-0 flex-1">{title}</span>
      </summary>
      <div className="border-t border-slate-100 px-3 pb-3 pt-2">{children}</div>
    </details>
  )
}

function ProfileTabBar({
  active,
  onChange,
  compact,
}: {
  active: LeadProfileFormTabId
  onChange: (id: LeadProfileFormTabId) => void
  compact?: boolean
}) {
  return (
    <nav
      className="flex shrink-0 gap-1 overflow-x-auto overscroll-x-contain rounded-xl border border-slate-200/90 bg-slate-50/90 p-1 [scrollbar-width:thin]"
      role="tablist"
      aria-label="Nhóm thông tin hồ sơ"
    >
      {PROFILE_TABS.map((t) => {
        const selected = active === t.id
        return (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(t.id)}
            className={[
              'shrink-0 rounded-lg border px-3 py-2 text-xs font-semibold transition sm:text-sm',
              selected
                ? 'border-emerald-600/40 bg-emerald-600 text-white shadow-sm'
                : 'border-transparent bg-white text-slate-700 hover:border-slate-200',
            ].join(' ')}
          >
            {compact ? t.short : t.label}
          </button>
        )
      })}
    </nav>
  )
}

function FormSection({
  tabMode,
  visible,
  defaultOpen,
  title,
  children,
}: {
  tabMode: boolean
  visible: boolean
  defaultOpen?: boolean
  title: string
  children: ReactNode
}) {
  if (tabMode) {
    if (!visible) return null
    return <div className="min-w-0">{children}</div>
  }
  return (
    <CollapsibleBlock defaultOpen={defaultOpen} title={title}>
      {children}
    </CollapsibleBlock>
  )
}

function SourceSelect({
  label,
  value,
  options,
  disabled,
  onChange,
}: {
  label: string
  value: string
  options: readonly LeadSourceRecord[]
  disabled: boolean
  onChange: (v: string) => void
}) {
  return (
    <Field label={label}>
      <select className={INPUT_CLS} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
        <option value="">— Chọn —</option>
        {options.map((s) => (
          <option key={s.id} value={s.label}>
            {s.label}
          </option>
        ))}
      </select>
    </Field>
  )
}

function ScholarshipSelect({
  label,
  value,
  scholarships,
  disabled,
  onChange,
}: {
  label: string
  value: string
  scholarships: readonly ScholarshipRecord[]
  disabled: boolean
  onChange: (v: string) => void
}) {
  const cats = Object.keys(SCHOLARSHIP_CATEGORY_LABELS) as ScholarshipCategoryId[]
  return (
    <Field label={label}>
      <select className={INPUT_CLS} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
        <option value="">— Không có học bổng —</option>
        {cats.map((cat) => {
          const rows = scholarships.filter((s) => s.category === cat)
          if (!rows.length) return null
          return (
            <optgroup key={cat} label={SCHOLARSHIP_CATEGORY_LABELS[cat]}>
              {rows.map((s) => (
                <option key={s.id} value={s.id}>
                  {scholarshipSelectLabel(s)}
                </option>
              ))}
            </optgroup>
          )
        })}
      </select>
    </Field>
  )
}

export function LeadProfileCoreForm({
  draft,
  onChange,
  disabled,
  leadSources = [],
  scholarships = [],
  layout = 'accordion',
  defaultTab = 'contact',
  wideGrid = false,
}: {
  draft: LeadCoreDraft
  onChange: (next: LeadCoreDraft) => void
  disabled: boolean
  leadSources?: readonly LeadSourceRecord[]
  scholarships?: readonly ScholarshipRecord[]
  layout?: 'accordion' | 'tabs'
  defaultTab?: LeadProfileFormTabId
  wideGrid?: boolean
}) {
  const [activeTab, setActiveTab] = useState<LeadProfileFormTabId>(defaultTab)
  const patch = <K extends keyof LeadCoreDraft>(k: K, v: LeadCoreDraft[K]) => onChange({ ...draft, [k]: v })
  const tabMode = layout === 'tabs'
  const grid = wideGrid
    ? 'grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2 lg:grid-cols-3'
    : 'grid grid-cols-1 gap-x-3 gap-y-2.5 sm:grid-cols-2'
  const noteSpan = wideGrid ? 3 : 2

  const body = (
    <>
      <FormSection
        tabMode={tabMode}
        visible={!tabMode || activeTab === 'contact'}
        defaultOpen
        title="Liên hệ & nguồn"
      >
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
          <Field label="CCCD">
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-xs font-medium text-slate-700">
                <input
                  type="checkbox"
                  checked={draft.nationalIdNotAvailable}
                  disabled={disabled}
                  onChange={(e) =>
                    onChange({
                      ...draft,
                      nationalIdNotAvailable: e.target.checked,
                      nationalId: e.target.checked ? '' : draft.nationalId,
                    })
                  }
                />
                Chưa có CCCD
              </label>
              {!draft.nationalIdNotAvailable ? (
                <input
                  className={INPUT_CLS}
                  inputMode="numeric"
                  maxLength={10}
                  placeholder="10 chữ số"
                  value={draft.nationalId}
                  disabled={disabled}
                  onChange={(e) => patch('nationalId', e.target.value.replace(/\D/g, '').slice(0, 10))}
                />
              ) : null}
            </div>
          </Field>
          <Field label="Email sinh viên">
            <input
              type="email"
              className={INPUT_CLS}
              value={draft.studentEmail}
              disabled={disabled}
              onChange={(e) => patch('studentEmail', e.target.value)}
            />
          </Field>
          <Field label="Điện thoại SV">
            <input className={INPUT_CLS} inputMode="tel" value={draft.phone} disabled={disabled} onChange={(e) => patch('phone', e.target.value)} />
          </Field>
          <Field label="ĐT người liên hệ">
            <input className={INPUT_CLS} inputMode="tel" value={draft.parentPhone} disabled={disabled} onChange={(e) => patch('parentPhone', e.target.value)} />
          </Field>
          <SourceSelect label="Nguồn 1" value={draft.source1} options={leadSources} disabled={disabled} onChange={(v) => patch('source1', v)} />
          <SourceSelect label="Nguồn 2" value={draft.source2} options={leadSources} disabled={disabled} onChange={(v) => patch('source2', v)} />
          <Field label="Nguồn tiếp nhận (ghi chú)" span={noteSpan}>
            <input className={INPUT_CLS} value={draft.source} disabled={disabled} onChange={(e) => patch('source', e.target.value)} />
          </Field>
        </div>
      </FormSection>

      <FormSection tabMode={tabMode} visible={!tabMode || activeTab === 'family'} title="Gia đình & giám hộ">
        <div className={grid}>
          <Field label="Họ tên Bố">
            <input className={INPUT_CLS} value={draft.fatherName} disabled={disabled} onChange={(e) => patch('fatherName', e.target.value)} />
          </Field>
          <Field label="SĐT Bố">
            <input className={INPUT_CLS} inputMode="tel" value={draft.fatherPhone} disabled={disabled} onChange={(e) => patch('fatherPhone', e.target.value)} />
          </Field>
          <Field label="Họ tên Mẹ">
            <input className={INPUT_CLS} value={draft.motherName} disabled={disabled} onChange={(e) => patch('motherName', e.target.value)} />
          </Field>
          <Field label="SĐT Mẹ">
            <input className={INPUT_CLS} inputMode="tel" value={draft.motherPhone} disabled={disabled} onChange={(e) => patch('motherPhone', e.target.value)} />
          </Field>
          <Field label="Người giám hộ" span={noteSpan}>
            <input className={INPUT_CLS} value={draft.guardian} disabled={disabled} onChange={(e) => patch('guardian', e.target.value)} />
          </Field>
        </div>
      </FormSection>

      <FormSection tabMode={tabMode} visible={!tabMode || activeTab === 'scholarship'} title="Học bổng">
        <div className={grid}>
          <ScholarshipSelect
            label="Học bổng 1"
            value={draft.scholarship1Id}
            scholarships={scholarships}
            disabled={disabled}
            onChange={(v) => patch('scholarship1Id', v)}
          />
          <ScholarshipSelect
            label="Học bổng 2"
            value={draft.scholarship2Id}
            scholarships={scholarships}
            disabled={disabled}
            onChange={(v) => patch('scholarship2Id', v)}
          />
        </div>
      </FormSection>

      <FormSection tabMode={tabMode} visible={!tabMode || activeTab === 'geo'} title="Địa lý & trường lớp">
        <div className={grid}>
          <Field label="Tỉnh / TP">
            <input className={INPUT_CLS} value={draft.province} disabled={disabled} onChange={(e) => patch('province', e.target.value)} />
          </Field>
          <Field label="Quận / huyện">
            <input className={INPUT_CLS} value={draft.hanoiArea} disabled={disabled} onChange={(e) => patch('hanoiArea', e.target.value)} />
          </Field>
          <Field label="Địa chỉ" span={noteSpan}>
            <input className={INPUT_CLS} value={draft.address} disabled={disabled} onChange={(e) => patch('address', e.target.value)} />
          </Field>
          <Field label="Trường THPT">
            <input className={INPUT_CLS} value={draft.highSchool} disabled={disabled} onChange={(e) => patch('highSchool', e.target.value)} />
          </Field>
          <Field label="Lớp hiện đang học">
            <input className={INPUT_CLS} value={draft.gradeClass} disabled={disabled} onChange={(e) => patch('gradeClass', e.target.value)} />
          </Field>
        </div>
      </FormSection>

      <FormSection tabMode={tabMode} visible={!tabMode || activeTab === 'study'} title="Học tập & định hướng">
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
      </FormSection>

      <FormSection tabMode={tabMode} visible={!tabMode || activeTab === 'notes'} title="Mô tả & ghi chú">
        <div className="space-y-2.5">
          <div className={grid}>
            <Field label="Mong muốn" span={noteSpan}>
              <textarea rows={2} className={`${INPUT_CLS} resize-y`} value={draft.aspirations} disabled={disabled} onChange={(e) => patch('aspirations', e.target.value)} />
            </Field>
          </div>
          <details className="rounded-lg border border-slate-200/80 bg-slate-50/60">
            <summary className="cursor-pointer px-2.5 py-2 text-sm font-semibold text-slate-700">Ghi chú bổ sung</summary>
            <div className={`${grid} p-2.5 pt-0`}>
              <Field label="Ghi chú 1" span={noteSpan}>
                <textarea rows={2} className={`${INPUT_CLS} resize-y`} value={draft.profileNote1} disabled={disabled} onChange={(e) => patch('profileNote1', e.target.value)} />
              </Field>
              <Field label="Ghi chú 2" span={noteSpan}>
                <textarea rows={2} className={`${INPUT_CLS} resize-y`} value={draft.profileNote2} disabled={disabled} onChange={(e) => patch('profileNote2', e.target.value)} />
              </Field>
              <Field label="Lưu ý khác" span={noteSpan}>
                <textarea rows={2} className={`${INPUT_CLS} resize-y`} value={draft.otherAttentionNotes} disabled={disabled} onChange={(e) => patch('otherAttentionNotes', e.target.value)} />
              </Field>
            </div>
          </details>
          <Field label="Mô tả tổng hợp" span={noteSpan}>
            <textarea rows={2} className={`${INPUT_CLS} resize-y`} value={draft.description} disabled={disabled} onChange={(e) => patch('description', e.target.value)} />
          </Field>
          <div className={grid}>
            <Field label="Sở thích" span={noteSpan}>
              <textarea rows={2} className={`${INPUT_CLS} resize-y`} value={draft.hobbies} disabled={disabled} onChange={(e) => patch('hobbies', e.target.value)} />
            </Field>
            <Field label="Ghi chú đi thực tế" span={noteSpan}>
              <textarea rows={2} className={`${INPUT_CLS} resize-y`} value={draft.fieldTripNotes} disabled={disabled} onChange={(e) => patch('fieldTripNotes', e.target.value)} />
            </Field>
          </div>
        </div>
      </FormSection>
    </>
  )

  if (tabMode) {
    return (
      <div className="flex min-h-0 flex-col gap-3 text-sm text-slate-800">
        <ProfileTabBar active={activeTab} onChange={setActiveTab} compact={!wideGrid} />
        <div
          role="tabpanel"
          className="min-h-[14rem] flex-1 overflow-y-auto overscroll-y-contain rounded-xl border border-slate-200/90 bg-white p-3 sm:p-4 [scrollbar-width:thin]"
        >
          {body}
        </div>
      </div>
    )
  }

  return <div className="space-y-2 text-sm text-slate-800">{body}</div>
}
