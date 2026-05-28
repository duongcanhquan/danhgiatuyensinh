import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { useFloatingDropdownPosition } from '../hooks/useFloatingDropdownPosition'
import type { LeadCoreDraft } from '../utils/leadProfileEdit'
import type { LeadSourceRecord, MasterDataEntry, OmicallCallTarget, ScholarshipApplySlot, ScholarshipCategoryId, ScholarshipRecord } from '../types'
import { OmicallCallButton } from './OmicallCallButton'
import { SCHOLARSHIP_CATEGORY_LABELS } from '../types'
import { scholarshipSelectLabel } from '../utils/leadProfileCatalog'
import { activeScholarshipsForSlot } from '../utils/scholarshipEligibility'
import { CatalogCombobox } from './CatalogCombobox'
import { DEFAULT_ETHNICITY_LABELS } from '../utils/ethnicityOptions'
import { labelsFromEntries, majorsForTrainingProgram, resolveTrainingProgramId } from '../utils/masterDataCatalogOps'
import { mergedStudyFormatLabels, studyFormatFromParts } from '../utils/studyFormatMerge'

const INPUT_CLS =
  'w-full max-w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm text-slate-900 outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-500/25 disabled:bg-slate-50 disabled:text-slate-500'

export type LeadProfileCatalogBundle = {
  trainingPrograms?: readonly MasterDataEntry[]
  majors?: readonly MasterDataEntry[]
  provinces?: readonly string[]
  hanoiAreas?: readonly string[]
  highSchools?: readonly string[]
  academicPerformance?: readonly string[]
  studyIntentions?: readonly string[]
  schoolTypes?: readonly string[]
  financialProfiles?: readonly string[]
}

export type LeadProfileCatalogEnsure = (
  catalogId: string,
  label: string,
  extra?: Partial<MasterDataEntry>,
) => void | Promise<void>

export type LeadProfileFormTabId =
  | 'contact'
  | 'family'
  | 'scholarship'
  | 'geo'
  | 'study'
  | 'notes'
  | 'finance'
  | 'invite'

const PROFILE_TABS: { id: LeadProfileFormTabId; label: string; short: string }[] = [
  { id: 'contact', label: 'Thông tin chung', short: 'Thông tin chung' },
  { id: 'family', label: 'Gia đình', short: 'Gia đình' },
  { id: 'scholarship', label: 'Học Bổng', short: 'Học Bổng' },
  { id: 'geo', label: 'Hồ sơ học tập', short: 'Học tập' },
  { id: 'study', label: 'Nguyện vọng', short: 'Nguyện vọng' },
  { id: 'notes', label: 'Ghi chú', short: 'Ghi chú' },
  { id: 'finance', label: 'Tài chính', short: 'Tài chính' },
  { id: 'invite', label: 'Giấy mời', short: 'Giấy mời' },
]

const FIXED_ACADEMIC_PERFORMANCE_OPTIONS = ['Yếu', 'Trung Bình', 'Khá', 'Giỏi'] as const

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
  const rootRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const [open, setOpen] = useState(false)
  const viewportCap = typeof window !== 'undefined' ? Math.min(400, window.innerHeight * 0.55) : 360
  const { style: listStyle } = useFloatingDropdownPosition(rootRef, open, { maxHeight: viewportCap })

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node
      if (!rootRef.current?.contains(t) && !listRef.current?.contains(t)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  const display = value.trim() || '— Chọn —'

  const listPanel =
    open && !disabled ? (
      <ul
        ref={listRef}
        style={listStyle}
        className="overflow-y-auto rounded-xl border border-slate-200 bg-white py-1 text-sm shadow-xl ring-1 ring-slate-900/10 [scrollbar-width:thin]"
        role="listbox"
      >
        <li>
          <button
            type="button"
            role="option"
            aria-selected={!value.trim()}
            className={[
              'block w-full px-3 py-2 text-left text-slate-600 hover:bg-emerald-50',
              !value.trim() ? 'bg-sky-50 font-semibold text-sky-950' : '',
            ].join(' ')}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              onChange('')
              setOpen(false)
            }}
          >
            — Chọn —
          </button>
        </li>
        {options.map((s) => (
          <li key={s.id}>
            <button
              type="button"
              role="option"
              aria-selected={s.label === value}
              className={[
                'block w-full px-3 py-2 text-left text-slate-800 hover:bg-emerald-50',
                s.label === value ? 'bg-sky-50 font-semibold text-sky-950' : '',
              ].join(' ')}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onChange(s.label)
                setOpen(false)
              }}
            >
              {s.label}
            </button>
          </li>
        ))}
      </ul>
    ) : null

  return (
    <Field label={label}>
      <div ref={rootRef} className="relative min-w-0">
        <button
          type="button"
          disabled={disabled}
          aria-expanded={open}
          aria-haspopup="listbox"
          onClick={() => setOpen((o) => !o)}
          className={`${INPUT_CLS} flex w-full items-center justify-between gap-2 text-left`}
        >
          <span className={value.trim() ? 'text-slate-900' : 'text-slate-500'}>{display}</span>
          <ChevronDown className={`h-4 w-4 shrink-0 text-slate-500 transition ${open ? 'rotate-180' : ''}`} />
        </button>
        {typeof document !== 'undefined' && listPanel ? createPortal(listPanel, document.body) : null}
      </div>
    </Field>
  )
}

function ScholarshipSelect({
  label,
  value,
  scholarships,
  slot,
  disabled,
  onChange,
}: {
  label: string
  value: string
  scholarships: readonly ScholarshipRecord[]
  slot: ScholarshipApplySlot
  disabled: boolean
  onChange: (v: string) => void
}) {
  const rootRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const [open, setOpen] = useState(false)
  const viewportCap = typeof window !== 'undefined' ? Math.min(400, window.innerHeight * 0.55) : 360
  const { style: listStyle } = useFloatingDropdownPosition(rootRef, open, { maxHeight: viewportCap })

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node
      if (!rootRef.current?.contains(t) && !listRef.current?.contains(t)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  const cats = Object.keys(SCHOLARSHIP_CATEGORY_LABELS) as ScholarshipCategoryId[]
  const options = activeScholarshipsForSlot(scholarships, slot, new Date(), value ? [value] : [])
  const selected = options.find((s) => s.id === value) ?? scholarships.find((s) => s.id === value)
  const display = selected ? scholarshipSelectLabel(selected) : '— Không có học bổng —'

  const listPanel =
    open && !disabled ? (
      <ul
        ref={listRef}
        style={listStyle}
        className="overflow-y-auto rounded-xl border border-slate-200 bg-white py-1 text-sm shadow-xl ring-1 ring-slate-900/10 [scrollbar-width:thin]"
        role="listbox"
      >
        <li>
          <button
            type="button"
            role="option"
            aria-selected={!value}
            className={[
              'block w-full px-3 py-2 text-left text-slate-600 hover:bg-emerald-50',
              !value ? 'bg-sky-50 font-semibold text-sky-950' : '',
            ].join(' ')}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              onChange('')
              setOpen(false)
            }}
          >
            — Không có học bổng —
          </button>
        </li>
        {cats.map((cat) => {
          const rows = options.filter((s) => s.category === cat)
          if (!rows.length) return null
          return (
            <li key={cat}>
              <div className="px-3 pb-0.5 pt-2 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                {SCHOLARSHIP_CATEGORY_LABELS[cat]}
              </div>
              {rows.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  role="option"
                  aria-selected={s.id === value}
                  title={[s.targetAudience, s.applicationMethod].filter(Boolean).join(' · ')}
                  className={[
                    'block w-full px-3 py-2 text-left text-slate-800 hover:bg-emerald-50',
                    s.id === value ? 'bg-sky-50 font-semibold text-sky-950' : '',
                  ].join(' ')}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    onChange(s.id)
                    setOpen(false)
                  }}
                >
                  {scholarshipSelectLabel(s)}
                </button>
              ))}
            </li>
          )
        })}
      </ul>
    ) : null

  return (
    <Field label={label}>
      <div ref={rootRef} className="relative min-w-0">
        <button
          type="button"
          disabled={disabled}
          aria-expanded={open}
          aria-haspopup="listbox"
          onClick={() => setOpen((o) => !o)}
          className={`${INPUT_CLS} flex w-full items-center justify-between gap-2 text-left`}
        >
          <span className={value ? 'text-slate-900' : 'text-slate-500'}>{display}</span>
          <ChevronDown className={`h-4 w-4 shrink-0 text-slate-500 transition ${open ? 'rotate-180' : ''}`} />
        </button>
        {typeof document !== 'undefined' && listPanel ? createPortal(listPanel, document.body) : null}
      </div>
    </Field>
  )
}

/** Hai cột trên một hàng (SĐT, nguồn…). */
function TwoColRow({ children }: { children: ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:col-span-2 sm:grid-cols-2 lg:col-span-3">
      {children}
    </div>
  )
}

function PhoneFieldWithCall({
  label,
  value,
  disabled,
  onChange,
  callContext,
  target,
}: {
  label: string
  value: string
  disabled: boolean
  onChange: (v: string) => void
  callContext?: { leadId: string; leadName: string }
  target: OmicallCallTarget
}) {
  return (
    <Field label={label}>
      <div className="flex min-w-0 flex-col items-stretch gap-2 sm:flex-row sm:items-start sm:gap-1.5">
        <input
          className={`${INPUT_CLS} min-w-0 flex-1`}
          inputMode="tel"
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
        />
        {callContext ? (
          <OmicallCallButton
            leadId={callContext.leadId}
            leadName={callContext.leadName}
            phone={value}
            target={target}
            disabled={disabled}
          />
        ) : null}
      </div>
    </Field>
  )
}

export function LeadProfileCoreForm({
  draft,
  onChange,
  disabled,
  leadSources = [],
  scholarships = [],
  catalogs,
  onEnsureCatalogEntry,
  layout = 'accordion',
  defaultTab = 'contact',
  wideGrid = false,
  financePanel,
  invitePanel,
  callContext,
  isNewLead = false,
}: {
  draft: LeadCoreDraft
  onChange: (next: LeadCoreDraft) => void
  disabled: boolean
  /** Tạo hồ sơ mới — mã hệ thống sinh khi lưu. */
  isNewLead?: boolean
  leadSources?: readonly LeadSourceRecord[]
  scholarships?: readonly ScholarshipRecord[]
  catalogs?: LeadProfileCatalogBundle
  onEnsureCatalogEntry?: LeadProfileCatalogEnsure
  layout?: 'accordion' | 'tabs'
  defaultTab?: LeadProfileFormTabId
  wideGrid?: boolean
  financePanel?: ReactNode
  invitePanel?: ReactNode
  /** Khi có — hiện nút gọi OMICall cạnh các ô SĐT */
  callContext?: { leadId: string; leadName: string }
}) {
  const [activeTab, setActiveTab] = useState<LeadProfileFormTabId>(defaultTab)
  const patch = <K extends keyof LeadCoreDraft>(k: K, v: LeadCoreDraft[K]) => onChange({ ...draft, [k]: v })
  const tabMode = layout === 'tabs'
  const grid = wideGrid
    ? 'grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2 lg:grid-cols-3'
    : 'grid grid-cols-1 gap-x-3 gap-y-2.5 sm:grid-cols-2'
  const noteSpan = wideGrid ? 3 : 2

  const studyFormatValue = studyFormatFromParts(draft.studyIntention, draft.educationLevel)

  const studyFormatOptions = useMemo(
    () => mergedStudyFormatLabels(catalogs?.trainingPrograms, catalogs?.studyIntentions),
    [catalogs?.trainingPrograms, catalogs?.studyIntentions],
  )

  const trainingProgramId = useMemo(
    () => resolveTrainingProgramId(catalogs?.trainingPrograms, studyFormatValue),
    [catalogs?.trainingPrograms, studyFormatValue],
  )

  const majorOptions = useMemo(() => {
    const filtered = majorsForTrainingProgram(catalogs?.majors, trainingProgramId)
    return labelsFromEntries(filtered)
  }, [catalogs?.majors, trainingProgramId])

  const ensure =
    (catalogId: string, extra?: Partial<MasterDataEntry>) =>
    (label: string) =>
      onEnsureCatalogEntry?.(catalogId, label, extra)

  const setStudyFormat = (v: string) => {
    const nextProgramId = resolveTrainingProgramId(catalogs?.trainingPrograms, v)
    const allowedMajors = labelsFromEntries(
      majorsForTrainingProgram(catalogs?.majors, nextProgramId),
    )
    const keepMajor =
      !draft.majorInterest.trim() ||
      allowedMajors.some((m) => m.toLowerCase() === draft.majorInterest.trim().toLowerCase())
    onChange({
      ...draft,
      studyIntention: v,
      educationLevel: v,
      majorInterest: keepMajor ? draft.majorInterest : '',
    })
  }

  const body = (
    <>
      <FormSection
        tabMode={tabMode}
        visible={!tabMode || activeTab === 'contact'}
        defaultOpen
        title="Thông tin chung"
      >
        <div className={grid}>
          <Field label="Họ tên">
            <input className={INPUT_CLS} value={draft.fullName} disabled={disabled} onChange={(e) => patch('fullName', e.target.value)} />
          </Field>
          <Field label="Mã hệ thống">
            <input
              className={`${INPUT_CLS} bg-slate-50 text-slate-700`}
              value={draft.systemCode}
              readOnly
              disabled
              placeholder={isNewLead ? 'Tự sinh khi lưu (YYMMDD + 0001…)' : '—'}
              title="Mã cố định do hệ thống cấp khi tạo hồ sơ"
            />
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
          <TwoColRow>
            <PhoneFieldWithCall
              label="Điện thoại sinh viên"
              value={draft.phone}
              disabled={disabled}
              onChange={(v) => patch('phone', v)}
              callContext={callContext}
              target="student"
            />
            <PhoneFieldWithCall
              label="Điện thoại người liên hệ"
              value={draft.parentPhone}
              disabled={disabled}
              onChange={(v) => patch('parentPhone', v)}
              callContext={callContext}
              target="parent"
            />
          </TwoColRow>
          <Field label="Dân tộc">
            <CatalogCombobox
              value={draft.ethnicity}
              options={DEFAULT_ETHNICITY_LABELS}
              disabled={disabled}
              onChange={(v) => patch('ethnicity', v)}
              onEnsureOption={onEnsureCatalogEntry ? ensure('ethnicities') : undefined}
              placeholder="Chọn hoặc gõ dân tộc…"
            />
          </Field>
          <Field label="Địa chỉ thường trú" span={noteSpan}>
            <input
              className={INPUT_CLS}
              value={draft.permanentAddress}
              disabled={disabled}
              onChange={(e) => {
                const v = e.target.value
                onChange({ ...draft, permanentAddress: v, address: v })
              }}
            />
          </Field>
          <Field label="Nơi ở hiện tại" span={noteSpan}>
            <input
              className={INPUT_CLS}
              value={draft.currentResidence}
              disabled={disabled}
              onChange={(e) => patch('currentResidence', e.target.value)}
            />
          </Field>
          <TwoColRow>
            <SourceSelect label="Nguồn 1" value={draft.source1} options={leadSources} disabled={disabled} onChange={(v) => patch('source1', v)} />
            <SourceSelect label="Nguồn 2" value={draft.source2} options={leadSources} disabled={disabled} onChange={(v) => patch('source2', v)} />
          </TwoColRow>
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
          <PhoneFieldWithCall
            label="SĐT Bố"
            value={draft.fatherPhone}
            disabled={disabled}
            onChange={(v) => patch('fatherPhone', v)}
            callContext={callContext}
            target="father"
          />
          <Field label="Họ tên Mẹ">
            <input className={INPUT_CLS} value={draft.motherName} disabled={disabled} onChange={(e) => patch('motherName', e.target.value)} />
          </Field>
          <PhoneFieldWithCall
            label="SĐT Mẹ"
            value={draft.motherPhone}
            disabled={disabled}
            onChange={(v) => patch('motherPhone', v)}
            callContext={callContext}
            target="mother"
          />
          <Field label="Người giám hộ" span={noteSpan}>
            <input className={INPUT_CLS} value={draft.guardian} disabled={disabled} onChange={(e) => patch('guardian', e.target.value)} />
          </Field>
        </div>
      </FormSection>

      <FormSection tabMode={tabMode} visible={!tabMode || activeTab === 'scholarship'} title="Học Bổng">
        <div className={grid}>
          <ScholarshipSelect
            label="Học bổng 1"
            slot="slot1"
            value={draft.scholarship1Id}
            scholarships={scholarships}
            disabled={disabled}
            onChange={(v) => patch('scholarship1Id', v)}
          />
          <ScholarshipSelect
            label="Học bổng 2"
            slot="slot2"
            value={draft.scholarship2Id}
            scholarships={scholarships}
            disabled={disabled}
            onChange={(v) => patch('scholarship2Id', v)}
          />
        </div>
      </FormSection>

      <FormSection tabMode={tabMode} visible={!tabMode || activeTab === 'geo'} title="Hồ sơ học tập">
        <div className={grid}>
          <Field label="Tỉnh / TP">
            <CatalogCombobox
              value={draft.province}
              options={catalogs?.provinces ?? []}
              disabled={disabled}
              onChange={(v) => patch('province', v)}
              onEnsureOption={onEnsureCatalogEntry ? ensure('regions') : undefined}
            />
          </Field>
          <Field label="Quận / huyện">
            <CatalogCombobox
              value={draft.hanoiArea}
              options={catalogs?.hanoiAreas ?? []}
              disabled={disabled}
              onChange={(v) => patch('hanoiArea', v)}
              onEnsureOption={onEnsureCatalogEntry ? ensure('hanoi_areas') : undefined}
            />
          </Field>
          <Field label="Trường THPT">
            <CatalogCombobox
              value={draft.highSchool}
              options={catalogs?.highSchools ?? []}
              disabled={disabled}
              onChange={(v) => patch('highSchool', v)}
              onEnsureOption={onEnsureCatalogEntry ? ensure('high_schools') : undefined}
            />
          </Field>
          <Field label="Lớp hiện đang học">
            <input className={INPUT_CLS} value={draft.gradeClass} disabled={disabled} onChange={(e) => patch('gradeClass', e.target.value)} />
          </Field>
          <Field label="Loại hình trường">
            <CatalogCombobox
              value={draft.schoolType}
              options={catalogs?.schoolTypes ?? []}
              disabled={disabled}
              onChange={(v) => patch('schoolType', v)}
              onEnsureOption={onEnsureCatalogEntry ? ensure('school_types') : undefined}
            />
          </Field>
          <Field label="Học lực / xếp loại">
            <select
              className={INPUT_CLS}
              value={draft.academicPerformance}
              disabled={disabled}
              onChange={(e) => patch('academicPerformance', e.target.value)}
            >
              <option value="">— Chọn học lực —</option>
              {FIXED_ACADEMIC_PERFORMANCE_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </Field>
        </div>
      </FormSection>

      <FormSection tabMode={tabMode} visible={!tabMode || activeTab === 'study'} title="Nguyện vọng">
        <div className="space-y-4">
          <div className={grid}>
            <Field label="Hình thức học quan tâm">
              <CatalogCombobox
                value={studyFormatValue}
                options={studyFormatOptions}
                disabled={disabled}
                onChange={setStudyFormat}
                onEnsureOption={
                  onEnsureCatalogEntry
                    ? async (label) => {
                        await onEnsureCatalogEntry('study_intentions', label)
                        await onEnsureCatalogEntry('training_programs', label)
                      }
                    : undefined
                }
                placeholder="Chọn hoặc thêm hình thức…"
              />
            </Field>
            <Field label="Chuyên ngành / ngành quan tâm">
              <CatalogCombobox
                value={draft.majorInterest}
                options={majorOptions}
                disabled={disabled}
                onChange={(v) => patch('majorInterest', v)}
                onEnsureOption={
                  onEnsureCatalogEntry
                    ? ensure('majors', trainingProgramId ? { departmentId: trainingProgramId } : undefined)
                    : undefined
                }
                placeholder={studyFormatValue.trim() ? 'Chọn ngành thuộc hình thức đã chọn…' : 'Chọn hình thức học trước'}
              />
            </Field>
            <Field label="Nhóm tài chính">
              <CatalogCombobox
                value={draft.financialStatus}
                options={catalogs?.financialProfiles ?? []}
                disabled={disabled}
                onChange={(v) => patch('financialStatus', v)}
                onEnsureOption={onEnsureCatalogEntry ? ensure('financial_profiles') : undefined}
              />
            </Field>
          </div>
          <Field label="Nguyện vọng & mong muốn khác" span={noteSpan}>
            <textarea
              rows={6}
              className={`${INPUT_CLS} min-h-[8.5rem] resize-y leading-relaxed`}
              value={draft.aspirations}
              disabled={disabled}
              placeholder="Ghi rõ nguyện vọng, mong muốn học tập, thời gian dự kiến…"
              onChange={(e) => patch('aspirations', e.target.value)}
            />
          </Field>
        </div>
      </FormSection>

      <FormSection tabMode={tabMode} visible={!tabMode || activeTab === 'notes'} title="Mô tả & ghi chú">
        <div className="space-y-2.5">
          <details open className="rounded-lg border border-slate-200/80 bg-slate-50/60">
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
    const tabPanel =
      activeTab === 'finance' ? financePanel : activeTab === 'invite' ? invitePanel : body

    return (
      <div className="flex min-h-0 flex-col gap-3 text-sm text-slate-800">
        <ProfileTabBar active={activeTab} onChange={setActiveTab} compact={!wideGrid} />
        <div
          role="tabpanel"
          className="min-h-[18rem] flex-1 overflow-y-auto overscroll-y-contain rounded-xl border border-slate-200/90 bg-white p-3 sm:p-4 [scrollbar-width:thin]"
        >
          {tabPanel}
        </div>
      </div>
    )
  }

  return <div className="space-y-2 text-sm text-slate-800">{body}</div>
}
