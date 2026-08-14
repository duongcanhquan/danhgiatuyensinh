import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown, ChevronRight, Info } from 'lucide-react'
import { useFloatingDropdownPosition } from '../hooks/useFloatingDropdownPosition'
import type { LeadCoreDraft } from '../utils/leadProfileEdit'
import type { LeadSourceRecord, LeadWorkMode, MasterDataEntry, OmicallCallTarget, ScholarshipApplySlot, ScholarshipCategoryId, ScholarshipRecord } from '../types'
import { OmicallCallButton } from './OmicallCallButton'
import { SCHOLARSHIP_CATEGORY_LABELS } from '../types'
import { scholarshipSelectLabel } from '../utils/leadProfileCatalog'
import { activeScholarshipsForSlot } from '../utils/scholarshipEligibility'
import { CatalogCombobox } from './CatalogCombobox'
import { DEFAULT_ETHNICITY_LABELS } from '../utils/ethnicityOptions'
import { labelsFromEntries, majorsForTrainingProgram, resolveTrainingProgramId } from '../utils/masterDataCatalogOps'
import { mergedStudyFormatLabels, studyFormatFromParts } from '../utils/studyFormatMerge'

const INPUT_CLS = 'vm-input'

export type LeadProfileCatalogBundle = {
  trainingPrograms?: readonly MasterDataEntry[]
  majors?: readonly MasterDataEntry[]
  applicantCategories?: readonly string[]
  provinces?: readonly string[]
  hanoiAreas?: readonly string[]
  highSchools?: readonly string[]
  academicPerformance?: readonly string[]
  studyIntentions?: readonly string[]
  schoolTypes?: readonly string[]
  financialProfiles?: readonly string[]
  campuses?: readonly string[]
  schoolYears?: readonly string[]
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

/** Màu tab nổi — mỗi nhóm một tone để không bị chìm trên nền xám. */
const PROFILE_TAB_TONE: Record<
  LeadProfileFormTabId,
  { idle: string; active: string }
> = {
  contact: {
    idle: 'border-sky-300/90 bg-sky-100 text-sky-950 hover:bg-sky-200/90',
    active: 'border-sky-700 bg-sky-600 text-white shadow-md ring-1 ring-sky-400/50',
  },
  family: {
    idle: 'border-rose-300/90 bg-rose-100 text-rose-950 hover:bg-rose-200/90',
    active: 'border-rose-700 bg-rose-600 text-white shadow-md ring-1 ring-rose-400/50',
  },
  scholarship: {
    idle: 'border-amber-300/90 bg-amber-100 text-amber-950 hover:bg-amber-200/90',
    active: 'border-amber-700 bg-amber-500 text-white shadow-md ring-1 ring-amber-400/50',
  },
  geo: {
    idle: 'border-emerald-300/90 bg-emerald-100 text-emerald-950 hover:bg-emerald-200/90',
    active: 'border-emerald-700 bg-emerald-600 text-white shadow-md ring-1 ring-emerald-400/50',
  },
  study: {
    idle: 'border-violet-300/90 bg-violet-100 text-violet-950 hover:bg-violet-200/90',
    active: 'border-violet-700 bg-violet-600 text-white shadow-md ring-1 ring-violet-400/50',
  },
  notes: {
    idle: 'border-slate-300 bg-slate-100 text-slate-900 hover:bg-slate-200',
    active: 'border-slate-700 bg-slate-700 text-white shadow-md ring-1 ring-slate-400/40',
  },
  finance: {
    idle: 'border-blue-300/90 bg-blue-100 text-blue-950 hover:bg-blue-200/90',
    active: 'border-blue-700 bg-blue-600 text-white shadow-md ring-1 ring-blue-400/50',
  },
  invite: {
    idle: 'border-indigo-300/90 bg-indigo-100 text-indigo-950 hover:bg-indigo-200/90',
    active: 'border-indigo-700 bg-indigo-600 text-white shadow-md ring-1 ring-indigo-400/50',
  },
}

const FIXED_ACADEMIC_PERFORMANCE_OPTIONS = ['Yếu', 'Trung Bình', 'Khá', 'Giỏi'] as const

function Field({ label, span = 1, children }: { label: string; span?: 1 | 2 | 3; children: ReactNode }) {
  const spanCls =
    span === 3 ? 'lg:col-span-3' : span === 2 ? 'sm:col-span-2 lg:col-span-2' : ''
  return (
    <label className={['block min-w-0', spanCls].filter(Boolean).join(' ')}>
      <span className="text-[11px] font-semibold leading-tight text-slate-700">{label}</span>
      <div className="mt-0.5">{children}</div>
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
      className="group rounded-lg border border-slate-200/90 bg-white shadow-sm open:shadow-md"
    >
      <summary className="flex cursor-pointer list-none items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-bold text-slate-800 marker:content-none hover:bg-slate-50/80 [&::-webkit-details-marker]:hidden">
        <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-500 transition group-open:rotate-90" aria-hidden />
        <span className="min-w-0 flex-1">{title}</span>
      </summary>
      <div className="border-t border-slate-100 px-2.5 pb-2 pt-1.5">{children}</div>
    </details>
  )
}

function ProfileTabBar({
  active,
  onChange,
  compact,
  tabs = PROFILE_TABS,
  panelId = 'lead-profile-tabpanel',
  sticky,
}: {
  active: LeadProfileFormTabId
  onChange: (id: LeadProfileFormTabId) => void
  compact?: boolean
  tabs?: readonly { id: LeadProfileFormTabId; label: string; short: string }[]
  panelId?: string
  /** Dính trên cùng khi vùng cha cuộn (modal tạo hồ sơ). */
  sticky?: boolean
}) {
  return (
    <nav
      className={[
        'flex shrink-0 gap-1 overflow-x-auto overscroll-x-contain rounded-lg border border-slate-200/90 bg-white p-1 shadow-sm [scrollbar-width:thin]',
        sticky ? 'sticky top-0 z-10 bg-white/95 shadow-md backdrop-blur-sm' : '',
      ].join(' ')}
      role="tablist"
      aria-label="Nhóm thông tin hồ sơ"
    >
      {tabs.map((t) => {
        const selected = active === t.id
        const tone = PROFILE_TAB_TONE[t.id]
        return (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`lead-tab-${t.id}`}
            aria-selected={selected}
            aria-controls={panelId}
            onClick={() => onChange(t.id)}
            className={[
              'min-h-8 shrink-0 rounded-md border px-2 py-1 text-[11px] font-bold tracking-tight transition duration-150 sm:min-h-9 sm:px-2.5 sm:text-xs',
              'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-indigo-500',
              selected ? tone.active : tone.idle,
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
              'block w-full px-3 py-2 text-left text-slate-600 hover:bg-indigo-50',
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
                'block w-full px-3 py-2 text-left text-slate-800 hover:bg-indigo-50',
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
              'block w-full px-3 py-2 text-left text-slate-600 hover:bg-indigo-50',
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
                    'block w-full px-3 py-2 text-left text-slate-800 hover:bg-indigo-50',
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

/** Hai cột trên một hàng (nguồn…). Ô SĐT dùng {@link PhoneFieldsRow} — tránh co input khi có nút gọi. */
function TwoColRow({ children }: { children: ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-1.5 sm:col-span-2 sm:grid-cols-2 lg:col-span-3">
      {children}
    </div>
  )
}

function PhoneFieldsRow({ children }: { children: ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-1.5 sm:col-span-2 sm:grid-cols-2 lg:col-span-3">{children}</div>
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
  callContext?: { leadId: string; leadName: string; workMode?: LeadWorkMode }
  target: OmicallCallTarget
}) {
  return (
    <Field label={label}>
      <div className="flex min-w-0 items-start gap-2">
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
            workMode={callContext.workMode}
            disabled={disabled}
            placement="beside"
          />
        ) : null}
      </div>
    </Field>
  )
}

function TabPlaceholder({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50/80 px-3 py-6 text-center">
      <span className="mb-2 flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-500">
        <Info className="h-4 w-4" aria-hidden />
      </span>
      <p className="text-xs font-semibold text-slate-800">{title}</p>
      <p className="mt-1 max-w-sm text-[11px] leading-snug text-slate-600">{hint}</p>
    </div>
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
  scrollContained = false,
  fillHeight = false,
}: {
  draft: LeadCoreDraft
  onChange: (next: LeadCoreDraft) => void
  disabled: boolean
  /** Tạo hồ sơ mới — mã hệ thống sinh khi lưu. */
  isNewLead?: boolean
  /** Modal tạo mới: vùng cha cuộn, tab dính trên; chi tiết hồ sơ: cuộn trong panel tab. */
  scrollContained?: boolean
  /** Chi tiết hồ sơ: form lấp chiều cao còn lại, cuộn trong panel tab. */
  fillHeight?: boolean
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
  callContext?: { leadId: string; leadName: string; workMode?: LeadWorkMode }
}) {
  const [activeTab, setActiveTab] = useState<LeadProfileFormTabId>(defaultTab)
  const tabPanelRef = useRef<HTMLDivElement>(null)
  const patch = <K extends keyof LeadCoreDraft>(k: K, v: LeadCoreDraft[K]) => onChange({ ...draft, [k]: v })
  const tabMode = layout === 'tabs'

  const visibleTabs = useMemo(() => {
    let tabs = PROFILE_TABS
    if (!financePanel) tabs = tabs.filter((t) => t.id !== 'finance')
    if (isNewLead || !invitePanel) tabs = tabs.filter((t) => t.id !== 'invite')
    return tabs
  }, [isNewLead, financePanel, invitePanel])

  useEffect(() => {
    if (!visibleTabs.some((t) => t.id === activeTab)) {
      setActiveTab('contact')
    }
  }, [visibleTabs, activeTab])

  useEffect(() => {
    if (scrollContained) {
      tabPanelRef.current?.scrollIntoView({ block: 'start' })
      return
    }
    tabPanelRef.current?.scrollTo(0, 0)
  }, [activeTab, scrollContained])
  const grid = wideGrid
    ? 'grid grid-cols-1 gap-x-2 gap-y-1.5 sm:grid-cols-2 lg:grid-cols-3'
    : 'grid grid-cols-1 gap-x-2 gap-y-1.5 sm:grid-cols-2'
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
          <Field label="Giới tính">
            {isNewLead ? (
              <select
                className={INPUT_CLS}
                value={draft.gender}
                disabled={disabled}
                onChange={(e) => patch('gender', e.target.value)}
              >
                <option value="">— Chọn —</option>
                <option value="Nam">Nam</option>
                <option value="Nữ">Nữ</option>
              </select>
            ) : (
              <input
                className={INPUT_CLS}
                value={draft.gender}
                disabled={disabled}
                placeholder="Nam / Nữ / …"
                onChange={(e) => patch('gender', e.target.value)}
              />
            )}
          </Field>
          <Field label="Nơi sinh">
            <input
              className={INPUT_CLS}
              value={draft.placeOfBirth}
              disabled={disabled}
              placeholder="VD: Hà Nội"
              onChange={(e) => patch('placeOfBirth', e.target.value)}
            />
          </Field>
          <Field label="CCCD / Hộ chiếu">
            <div className="space-y-1">
              <label className="flex items-center gap-1.5 text-[10px] font-medium text-slate-700">
                <input
                  type="checkbox"
                  className="h-3.5 w-3.5 rounded border-slate-300"
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
                  maxLength={15}
                  placeholder="9–12 số hoặc hộ chiếu"
                  value={draft.nationalId}
                  disabled={disabled}
                  onChange={(e) =>
                    patch('nationalId', e.target.value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 15))
                  }
                />
              ) : null}
            </div>
          </Field>
          <TwoColRow>
            <Field label="Email sinh viên">
              <input
                type="email"
                className={INPUT_CLS}
                value={draft.studentEmail}
                disabled={disabled}
                onChange={(e) => patch('studentEmail', e.target.value)}
              />
            </Field>
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
          </TwoColRow>
          <PhoneFieldsRow>
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
          </PhoneFieldsRow>
          <TwoColRow>
            <Field label="Địa chỉ thường trú">
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
            <Field label="Nơi ở hiện tại">
              <input
                className={INPUT_CLS}
                value={draft.currentResidence}
                disabled={disabled}
                onChange={(e) => patch('currentResidence', e.target.value)}
              />
            </Field>
          </TwoColRow>
          <TwoColRow>
            <SourceSelect label="Nguồn 1" value={draft.source1} options={leadSources} disabled={disabled} onChange={(v) => patch('source1', v)} />
            <SourceSelect label="Nguồn 2" value={draft.source2} options={leadSources} disabled={disabled} onChange={(v) => patch('source2', v)} />
          </TwoColRow>
          <Field label="Nguồn tiếp nhận (ghi chú)" span={noteSpan}>
            <input
              className={INPUT_CLS}
              value={draft.source}
              disabled={disabled}
              placeholder="Ghi chú nguồn / kênh tiếp nhận"
              onChange={(e) => patch('source', e.target.value)}
            />
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
          <Field label="Đối tượng dự tuyển">
            <CatalogCombobox
              value={draft.applicantCategory}
              options={catalogs?.applicantCategories ?? []}
              disabled={disabled}
              placeholder="VD: Học sinh lớp 12"
              onChange={(v) => patch('applicantCategory', v)}
              onEnsureOption={onEnsureCatalogEntry ? ensure('applicant_categories') : undefined}
            />
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
          <Field label="Cơ sở học">
            <CatalogCombobox
              value={draft.campus}
              options={catalogs?.campuses ?? []}
              disabled={disabled}
              onChange={(v) => patch('campus', v)}
              onEnsureOption={onEnsureCatalogEntry ? ensure('campuses') : undefined}
              placeholder="Chọn hoặc thêm cơ sở…"
            />
          </Field>
          <Field label="Niên khóa">
            <CatalogCombobox
              value={draft.schoolYear}
              options={catalogs?.schoolYears ?? []}
              disabled={disabled}
              onChange={(v) => patch('schoolYear', v)}
              onEnsureOption={onEnsureCatalogEntry ? ensure('school_years') : undefined}
              placeholder="Vd. 2025–2028"
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
              {draft.academicPerformance &&
              !(FIXED_ACADEMIC_PERFORMANCE_OPTIONS as readonly string[]).includes(draft.academicPerformance) ? (
                <option value={draft.academicPerformance}>{draft.academicPerformance}</option>
              ) : null}
              {FIXED_ACADEMIC_PERFORMANCE_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Điểm tốt nghiệp">
            <input
              className={INPUT_CLS}
              inputMode="decimal"
              placeholder="Vd. 8.5"
              value={draft.graduationScore}
              disabled={disabled}
              onChange={(e) => patch('graduationScore', e.target.value)}
            />
          </Field>
        </div>
      </FormSection>

      <FormSection tabMode={tabMode} visible={!tabMode || activeTab === 'study'} title="Nguyện vọng">
        <div className="space-y-2">
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
        <div className="space-y-1.5">
          <details open className="rounded-md border border-slate-200/80 bg-slate-50/60">
            <summary className="cursor-pointer px-2 py-1.5 text-[11px] font-semibold text-slate-700">Ghi chú bổ sung</summary>
            <div className={`${grid} p-2 pt-0`}>
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
    const tabPanel = (() => {
      if (activeTab === 'finance') {
        return (
          financePanel ?? (
            <TabPlaceholder
              title="Tài chính"
              hint="Lưu hồ sơ trước, sau đó mở lại để nhập cọc, học phí và Full NE."
            />
          )
        )
      }
      if (activeTab === 'invite') {
        return (
          invitePanel ?? (
            <TabPlaceholder
              title="Giấy mời"
              hint="Lưu hồ sơ trước, sau đó quay lại tab này để tạo giấy mời."
            />
          )
        )
      }
      return body
    })()

    const rootCls = [
      'lead-profile-form-dense flex flex-col gap-1.5 text-xs text-slate-800',
      '[&_.vm-input]:!min-h-8 [&_.vm-input]:!rounded-md [&_.vm-input]:!px-2 [&_.vm-input]:!py-1 [&_.vm-input]:!text-xs',
      '[&_textarea.vm-input]:!min-h-[2.5rem] [&_select]:text-xs',
      fillHeight ? 'min-h-0 flex-1 overflow-hidden' : '',
    ]
      .filter(Boolean)
      .join(' ')

    const panelCls = [
      'scroll-touch rounded-lg border border-slate-200/90 bg-white p-2 sm:p-2.5 [scrollbar-width:thin]',
      scrollContained
        ? ''
        : fillHeight
          ? 'min-h-0 flex-1 overflow-y-auto overscroll-contain pb-10'
          : 'min-h-[14rem] overflow-y-auto overscroll-y-contain',
    ]
      .filter(Boolean)
      .join(' ')

    return (
      <div className={rootCls}>
        <ProfileTabBar
          active={activeTab}
          onChange={setActiveTab}
          compact
          tabs={visibleTabs}
          sticky={scrollContained || fillHeight}
        />
        <div
          ref={tabPanelRef}
          id="lead-profile-tabpanel"
          role="tabpanel"
          aria-labelledby={`lead-tab-${activeTab}`}
          className={panelCls}
        >
          {tabPanel}
        </div>
      </div>
    )
  }

  return <div className="space-y-1.5 text-xs text-slate-800">{body}</div>
}
