import { useCallback, useEffect, useMemo, useState, type MouseEvent } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { addDoc, collection, doc, Timestamp, updateDoc } from 'firebase/firestore'
import {
  CalendarClock,
  ChevronDown,
  Filter,
  Flame,
  FolderOpen,
  MessageSquare,
  Phone,
  Search,
  ThermometerSun,
} from 'lucide-react'
import type { Lead, LeadCounselorStatus, LeadPipelineStatus, PriorityTag } from '../types'
import {
  FS_COLLECTIONS,
  LEAD_COUNSELOR_STATUS_LABELS,
  LEAD_COUNSELOR_STATUS_ORDER,
} from '../types'
import { Link, useSearchParams } from 'react-router-dom'
import { getFirestoreDb, isFirebaseConfigured } from '../services/firebase'
import { useAuth } from '../hooks/useAuth'
import { isAdminLikeRole } from '../auth/roleUtils'
import {
  leadMatchesClientSearch,
  LEADS_UI_FULL_SCOPE_MAX,
  useLeads,
} from '../hooks/useLeads'
import { useLeadScoring, type LeadScorePreview } from '../hooks/useLeadScoring'
import { useCounselorDirectory } from '../hooks/useCounselorDirectory'
import { useMasterData } from '../hooks/useMasterData'
import { BulkLeadActionBar } from '../components/bulk/BulkLeadActionBar'
import { commitAuditLog } from '../services/auditLog'
import { leadTouchPatch } from '../utils/leadTouch'
import { assigneeFirestoreMirror, counselorStatusToPipeline } from '../utils/leadIdentity'
import { formatStaffDirectoryLabel } from '../utils/counselorDisplay'
import { exportSelectedEvaluatedLeadsToXlsx } from '../utils/exportEvaluatedLeads'
import { evaluateLead, leadToEvaluationRecord, persistedLeadScoringFields } from '../utils/scoring'
import {
  counselorListFilterSignature,
  LWF,
  mergeLeadFiltersIntoSearchParams,
  parseCrmFromUrl,
  parseDateAxisFromUrl,
  parseMyDayFromUrl,
  parsePipelineFromUrl,
  parsePriorityTagStrict,
} from '../utils/leadWorkspaceUrlFilters'
import { isFollowUpTodayLocal, isHotStaleNewSla, isStaleNewSla } from '../utils/slaLead'
import { VietMyAccentHeading } from '../components/VietMyAccentHeading'

const TAG_BADGE: Record<PriorityTag, string> = {
  HOT: 'bg-rose-100 text-rose-900 ring-1 ring-rose-300/80',
  WARM: 'bg-amber-100 text-amber-900 ring-1 ring-amber-300/80',
  COLD: 'bg-sky-100 text-sky-900 ring-1 ring-sky-300/80',
  LOSS: 'bg-slate-700 text-slate-200 ring-1 ring-slate-500/70',
}

const PIPELINE_LABEL: Record<LeadPipelineStatus, string> = {
  NEW: 'Mới',
  CONTACTED: 'Đã liên hệ',
  QUALIFIED: 'Đủ điều kiện',
  APPLIED: 'Đã nộp hồ sơ',
  ENROLLED: 'Đã ghi danh',
  LOST: 'Không còn tiềm năng',
  ARCHIVED: 'Lưu trữ',
}

const LIST_PAGE_SIZE = 40

type Toast = { id: string; text: string }

function formatFollowUp(next: Timestamp | null | undefined): string {
  if (!next) return '—'
  try {
    const d = next.toDate()
    return d.toLocaleDateString('vi-VN', { day: '2-digit', month: 'short' })
  } catch {
    return '—'
  }
}

function isDueTodayOrOverdue(next: Timestamp | null | undefined): boolean {
  if (!next) return false
  const now = new Date()
  const eod = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999)
  return next.toMillis() <= eod.getTime()
}

type DateAxisFilter = 'updated' | 'created' | 'followup'

function parseDayStartMs(ymd: string): number | null {
  const t = ymd.trim()
  if (!t) return null
  const ms = Date.parse(`${t}T00:00:00`)
  return Number.isNaN(ms) ? null : ms
}

function parseDayEndMs(ymd: string): number | null {
  const t = ymd.trim()
  if (!t) return null
  const ms = Date.parse(`${t}T23:59:59.999`)
  return Number.isNaN(ms) ? null : ms
}

function leadTimestampForAxis(l: Lead, axis: DateAxisFilter): Timestamp | null | undefined {
  if (axis === 'updated') return l.updatedAt
  if (axis === 'created') return l.createdAt
  return l.nextFollowUpDate ?? null
}

function leadMatchesDateRange(l: Lead, axis: DateAxisFilter, dateFrom: string, dateTo: string): boolean {
  const fromMs = parseDayStartMs(dateFrom)
  const toMs = parseDayEndMs(dateTo)
  if (fromMs === null && toMs === null) return true
  const ts = leadTimestampForAxis(l, axis)
  if (!ts) return false
  const ms = ts.toMillis()
  if (fromMs !== null && ms < fromMs) return false
  if (toMs !== null && ms > toMs) return false
  return true
}

function effectiveAssigneeUid(l: Lead): string {
  const u = l.assignedTo ?? l.assignedCounselorId
  return u ? String(u).trim() : ''
}

function isElevatedForBulk(role: string | undefined): boolean {
  return role === 'admin' || role === 'super_admin' || role === 'team_lead'
}

function CounselorLeadListRow({
  lead,
  priorityTag,
  onToast,
  canWrite,
  canInteract,
  selected,
  onToggleSelect,
  rowCrmBusy,
  onCrmChange,
  onLeadLocallyPatched,
}: {
  lead: Lead
  priorityTag: PriorityTag
  onToast: (text: string) => void
  canWrite: boolean
  canInteract: boolean
  selected: boolean
  onToggleSelect: (id: string, e?: MouseEvent) => void
  rowCrmBusy: boolean
  onCrmChange: (lead: Lead, next: LeadCounselorStatus) => void
  /** Đồng bộ bảng sau gọi/ghi chú/follow-up (cùng cách LeadManagement). */
  onLeadLocallyPatched?: (leadId: string, patch: Partial<Lead>) => void
}) {
  const db = getFirestoreDb()
  const { profile } = useAuth()
  const slaNewStale = isStaleNewSla(lead)
  const followToday = isFollowUpTodayLocal(lead.nextFollowUpDate)
  const performerName = profile?.displayName?.trim() || profile?.email || profile?.id || ''
  const logCall = async (e: MouseEvent) => {
    e.stopPropagation()
    if (!db || !profile || !canInteract) return
    try {
      await addDoc(collection(db, FS_COLLECTIONS.leads, lead.id, FS_COLLECTIONS.interactions), {
        leadId: lead.id,
        channel: 'CALL',
        authorUid: profile.id,
        authorRole: profile.role,
        timestamp: Timestamp.now(),
        counselorNote: 'Ghi nhanh: Cuộc gọi (danh sách TVV)',
        callOutcome: 'CONNECTED',
      })
      const touch = leadTouchPatch()
      await updateDoc(doc(db, FS_COLLECTIONS.leads, lead.id), touch)
      onLeadLocallyPatched?.(lead.id, touch)
      await commitAuditLog(db, {
        leadId: lead.id,
        actionType: 'NOTE_ADDED',
        description: 'Ghi nhận cuộc gọi nhanh (kênh CALL).',
        performedBy: profile.id,
        performedByName: performerName,
      })
      onToast('Đã ghi nhận cuộc gọi.')
    } catch (err) {
      console.error(err)
      onToast('Không thể ghi cuộc gọi.')
    }
  }

  const addNote = async (e: MouseEvent) => {
    e.stopPropagation()
    if (!db || !profile || !canInteract) return
    const text = window.prompt('Ghi chú nhanh cho hồ sơ này?')
    if (!text?.trim()) return
    try {
      await addDoc(collection(db, FS_COLLECTIONS.leads, lead.id, FS_COLLECTIONS.interactions), {
        leadId: lead.id,
        channel: 'NOTE',
        authorUid: profile.id,
        authorRole: profile.role,
        timestamp: Timestamp.now(),
        counselorNote: text.trim(),
      })
      const touch = leadTouchPatch()
      await updateDoc(doc(db, FS_COLLECTIONS.leads, lead.id), touch)
      onLeadLocallyPatched?.(lead.id, touch)
      await commitAuditLog(db, {
        leadId: lead.id,
        actionType: 'NOTE_ADDED',
        description: `Ghi chú nhanh: ${text.trim().slice(0, 240)}`,
        performedBy: profile.id,
        performedByName: performerName,
      })
      onToast('Đã lưu ghi chú.')
    } catch (err) {
      console.error(err)
      onToast('Không thể lưu ghi chú.')
    }
  }

  const setFollowUp = async (e: MouseEvent) => {
    e.stopPropagation()
    if (!db || !canWrite || !profile) return
    const raw = window.prompt('Ngày follow-up (YYYY-MM-DD)?', '')
    if (!raw?.trim()) return
    const ms = Date.parse(`${raw.trim()}T12:00:00`)
    if (Number.isNaN(ms)) {
      onToast('Định dạng ngày không hợp lệ.')
      return
    }
    try {
      const touch = leadTouchPatch()
      const nextFu = Timestamp.fromMillis(ms)
      const patch: Partial<Lead> = { nextFollowUpDate: nextFu, ...touch }
      await updateDoc(doc(db, FS_COLLECTIONS.leads, lead.id), patch)
      onLeadLocallyPatched?.(lead.id, patch)
      await commitAuditLog(db, {
        leadId: lead.id,
        actionType: 'SYSTEM_UPDATE',
        description: `Cập nhật ngày follow-up: ${raw.trim()}`,
        performedBy: profile.id,
        performedByName: performerName,
      })
      onToast('Đã cập nhật ngày follow-up.')
    } catch (err) {
      console.error(err)
      onToast('Không thể cập nhật lịch.')
    }
  }

  return (
    <tr
      className={[
        'border-b border-slate-100/90 transition-colors',
        selected ? 'bg-amber-50/95' : 'bg-white/70 hover:bg-slate-50/90',
        followToday ? 'ring-1 ring-inset ring-amber-300/60' : '',
      ].join(' ')}
    >
      <td className="px-2 py-2 align-middle">
        <input
          type="checkbox"
          checked={selected}
          onChange={() => onToggleSelect(lead.id)}
          className="h-4 w-4 rounded border-slate-300 bg-white accent-amber-500"
          aria-label={`Chọn ${lead.fullName}`}
        />
      </td>
      <td className="max-w-[14rem] px-2 py-2 align-middle">
        <div className="relative min-w-0">
          {slaNewStale && lead.status === 'NEW' ? (
            <span
              className="absolute -left-1 -top-1 flex h-2.5 w-2.5"
              title="SLA: giai đoạn Mới chưa được chạm trên 24 giờ"
            >
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-500 opacity-60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-rose-500" />
            </span>
          ) : null}
          <p className="truncate pl-1 text-sm font-semibold text-slate-900">{lead.fullName || '—'}</p>
          <p className="truncate text-xs text-slate-500">{lead.province?.trim() || '—'} · {lead.highSchool?.trim() || '—'}</p>
        </div>
      </td>
      <td className="whitespace-nowrap px-2 py-2 align-middle text-xs text-slate-700">{lead.phone || lead.parentPhone || '—'}</td>
      <td className="px-2 py-2 align-middle">
        <select
          value={lead.status}
          disabled={!canWrite || rowCrmBusy}
          onChange={(e) => onCrmChange(lead, e.target.value as LeadCounselorStatus)}
          className="max-w-[11rem] rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-medium text-slate-900 outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-200 disabled:opacity-45"
          aria-label={`Tình trạng CRM — ${lead.fullName}`}
        >
          {LEAD_COUNSELOR_STATUS_ORDER.map((s) => (
            <option key={s} value={s}>
              {LEAD_COUNSELOR_STATUS_LABELS[s]}
            </option>
          ))}
        </select>
      </td>
      <td className="hidden px-2 py-2 align-middle text-xs text-slate-600 lg:table-cell">{PIPELINE_LABEL[lead.pipelineStatus]}</td>
      <td className="px-2 py-2 align-middle">
        <span className={`inline-block rounded-md px-2 py-0.5 text-xs font-bold uppercase ${TAG_BADGE[priorityTag]}`}>
          {priorityTag}
        </span>
      </td>
      <td className="hidden whitespace-nowrap px-2 py-2 align-middle text-xs text-slate-600 sm:table-cell">
        <span className="inline-flex items-center gap-1">
          <CalendarClock className="h-3 w-3 shrink-0 text-slate-400" aria-hidden />
          {formatFollowUp(lead.nextFollowUpDate)}
        </span>
      </td>
      <td className="px-2 py-2 align-middle">
        <div className="flex flex-wrap items-center gap-1">
          <button
            type="button"
            disabled={!canInteract}
            onClick={(e) => void logCall(e)}
            title="Ghi cuộc gọi"
            className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-500 transition hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-800 disabled:opacity-30"
          >
            <Phone className="h-3.5 w-3.5" strokeWidth={1.75} />
          </button>
          <button
            type="button"
            disabled={!canInteract}
            onClick={(e) => void addNote(e)}
            title="Ghi chú nhanh"
            className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-500 transition hover:border-violet-300 hover:bg-violet-50 hover:text-violet-800 disabled:opacity-30"
          >
            <MessageSquare className="h-3.5 w-3.5" strokeWidth={1.75} />
          </button>
          <button
            type="button"
            disabled={!canWrite}
            onClick={(e) => void setFollowUp(e)}
            title="Đặt follow-up"
            className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-500 transition hover:border-amber-300 hover:bg-amber-50 hover:text-amber-800 disabled:opacity-30"
          >
            <CalendarClock className="h-3.5 w-3.5" strokeWidth={1.75} />
          </button>
          <Link
            to={`/leads?open=${encodeURIComponent(lead.id)}`}
            className="inline-flex items-center gap-0.5 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-medium text-slate-700 transition hover:border-teal-300 hover:bg-teal-50 hover:text-teal-900"
            title="Mở đầy đủ thông tin trên màn Hồ sơ"
          >
            <FolderOpen className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} />
            <span className="hidden xl:inline">Hồ sơ</span>
          </Link>
        </div>
      </td>
    </tr>
  )
}

function CounselorLeadWorklist({
  rows,
  total,
  page,
  pageSize,
  onPageChange,
  scoreByLeadId,
  selectedIds,
  toggleSelectId,
  toggleSelectAllOnPage,
  allOnPageSelected,
  canWrite,
  canInteract,
  pushToast,
  onRowCrmChange,
  rowCrmBusyId,
  onLeadLocallyPatched,
}: {
  rows: Lead[]
  total: number
  page: number
  pageSize: number
  onPageChange: (p: number) => void
  scoreByLeadId: Map<string, LeadScorePreview>
  selectedIds: Set<string>
  toggleSelectId: (id: string, e?: MouseEvent) => void
  toggleSelectAllOnPage: () => void
  allOnPageSelected: boolean
  canWrite: boolean
  canInteract: boolean
  pushToast: (text: string) => void
  onRowCrmChange: (lead: Lead, next: LeadCounselorStatus) => void
  rowCrmBusyId: string | null
  onLeadLocallyPatched?: (leadId: string, patch: Partial<Lead>) => void
}) {
  const maxPage = Math.max(1, Math.ceil(total / pageSize))
  return (
    <section className="rounded-2xl border border-slate-200/90 bg-white/35 shadow-md backdrop-blur-xl">
      <div className="scroll-touch overflow-x-auto">
        <table className="w-full min-w-[52rem] border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200/90 bg-slate-50/90 text-xs font-semibold uppercase tracking-wide text-slate-600">
              <th className="w-10 px-2 py-2.5">
                <input
                  type="checkbox"
                  checked={allOnPageSelected}
                  onChange={() => toggleSelectAllOnPage()}
                  disabled={!rows.length}
                  className="h-4 w-4 rounded border-slate-300 bg-white accent-amber-500"
                  aria-label="Chọn tất cả trên trang"
                />
              </th>
              <th className="px-2 py-2.5">Hồ sơ</th>
              <th className="px-2 py-2.5">Liên hệ</th>
              <th className="px-2 py-2.5">Tình trạng CRM</th>
              <th className="hidden px-2 py-2.5 lg:table-cell">Funnel</th>
              <th className="px-2 py-2.5">Nhãn</th>
              <th className="hidden px-2 py-2.5 sm:table-cell">Hẹn</th>
              <th className="px-2 py-2.5">Tiến độ nhanh</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-sm text-slate-600">
                  Không có hồ sơ khớp bộ lọc. Thử đổi từ khóa hoặc xóa bộ lọc mở rộng.
                </td>
              </tr>
            ) : (
              rows.map((lead) => (
                <CounselorLeadListRow
                  key={lead.id}
                  lead={lead}
                  priorityTag={scoreByLeadId.get(lead.id)?.priorityTag ?? lead.priorityTag}
                  onToast={pushToast}
                  canWrite={canWrite}
                  canInteract={canInteract}
                  selected={selectedIds.has(lead.id)}
                  onToggleSelect={toggleSelectId}
                  rowCrmBusy={rowCrmBusyId === lead.id}
                  onCrmChange={onRowCrmChange}
                  onLeadLocallyPatched={onLeadLocallyPatched}
                />
              ))
            )}
          </tbody>
        </table>
      </div>
      {total > pageSize ? (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200/80 bg-white/60 px-3 py-2.5 text-xs text-slate-700">
          <span className="tabular-nums">
            {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} / {total.toLocaleString('vi-VN')}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => onPageChange(page - 1)}
              className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-40"
            >
              ← Trước
            </button>
            <span className="tabular-nums text-slate-600">
              Trang {page}/{maxPage}
            </span>
            <button
              type="button"
              disabled={page >= maxPage}
              onClick={() => onPageChange(page + 1)}
              className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-40"
            >
              Sau →
            </button>
          </div>
        </div>
      ) : null}
    </section>
  )
}

export function CounselorDashboard() {
  const db = getFirestoreDb()
  const { profile, can } = useAuth()
  const { highSchoolLabels, majorLabels, regionLabels, byKind, academicPerformanceLabels, catalogs } = useMasterData()
  const { users: directoryUsers, counselors: counselorUsers, loading: counselorsLoading } = useCounselorDirectory()

  const counselorDirectoryLabelById = useMemo(() => {
    const m = new Map<string, string>()
    for (const c of directoryUsers) {
      if (c.isActive) m.set(c.id, formatStaffDirectoryLabel(c))
    }
    return m
  }, [directoryUsers])

  const { leads, loading, error, scopeFetchTruncated, applyLocalLeadPatch, refetchLeads } = useLeads({
    dataMode: 'fullScope',
    maxFullScopeLeads: LEADS_UI_FULL_SCOPE_MAX,
    directoryLabels: counselorDirectoryLabelById,
  })
  const scoringMasterBuckets = useMemo(
    () => ({
      regionLabels,
      highSchoolLabels,
      majorLabels,
      academicPerformanceLabels,
      regionEntries: byKind.regions,
      majorEntries: byKind.majors,
      catalogs,
      entriesByCatalogId: byKind,
    }),
    [regionLabels, highSchoolLabels, majorLabels, academicPerformanceLabels, byKind, catalogs],
  )
  const { scoreByLeadId, activeScoringProfile, schoolTvvSignalDefs } = useLeadScoring(leads)

  const [searchParams, setSearchParams] = useSearchParams()
  const patchListUrl = useCallback(
    (patch: Partial<Record<(typeof LWF)[keyof typeof LWF], string | null | undefined>>) => {
      setSearchParams((prev) => mergeLeadFiltersIntoSearchParams(prev, patch), { replace: true })
    },
    [setSearchParams],
  )

  const urlQRaw = searchParams.get(LWF.Q) ?? ''
  const qLower = urlQRaw.trim().toLowerCase()
  const dueOnly = searchParams.get(LWF.DUE) === '1'
  const tagFilter = parsePriorityTagStrict(searchParams.get(LWF.TAG))
  const myDayFilter = parseMyDayFromUrl(searchParams.get(LWF.MYDAY))
  const regionFilter = (searchParams.get(LWF.REGION) ?? 'ALL') as 'ALL' | string
  const schoolFilter = (searchParams.get(LWF.SCHOOL) ?? 'ALL') as 'ALL' | string
  const majorFilter = (searchParams.get(LWF.MAJOR) ?? 'ALL') as 'ALL' | string
  const dateAxis = parseDateAxisFromUrl(searchParams.get(LWF.DATE_AXIS))
  const dateFrom = searchParams.get(LWF.DATE_FROM) ?? ''
  const dateTo = searchParams.get(LWF.DATE_TO) ?? ''
  const counselorFilterUid = searchParams.get(LWF.ASSIGN) ?? ''
  const crmStageFilter = parseCrmFromUrl(searchParams.get(LWF.CRM))
  const pipelineUrlFilter = parsePipelineFromUrl(searchParams.get(LWF.PIPE))
  const sourceUrlRaw = (searchParams.get(LWF.SOURCE) ?? '').trim()
  const sourceUrlFilter: 'ALL' | string =
    !sourceUrlRaw || sourceUrlRaw.toUpperCase() === 'ALL' ? 'ALL' : sourceUrlRaw

  const [toasts, setToasts] = useState<Toast[]>([])
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())
  const [bulkModal, setBulkModal] = useState<null | 'reassign' | 'crm'>(null)
  const [bulkReassignUid, setBulkReassignUid] = useState('')
  const [bulkCrmStatus, setBulkCrmStatus] = useState<LeadCounselorStatus>('NEW')
  const [bulkBusy, setBulkBusy] = useState(false)
  const [filtersExpanded, setFiltersExpanded] = useState(false)
  const [listPage, setListPage] = useState(1)
  const [rowCrmBusyId, setRowCrmBusyId] = useState<string | null>(null)

  const pushToast = useCallback((text: string) => {
    const id = crypto.randomUUID()
    setToasts((t) => [...t, { id, text }])
    window.setTimeout(() => {
      setToasts((t) => t.filter((x) => x.id !== id))
    }, 3200)
  }, [])

  const canBoard = can('dashboard:counselor') || can('dashboard:team_lead')
  const canWrite = can('leads:write:self_assigned')
  const canInteract = can('interactions:create:self_assigned')
  const isElevatedLeadScope = isElevatedForBulk(profile?.role)
  const canPeerReassignLeads = Boolean(can('leads:reassign:peer'))
  const showBulkReassign = isElevatedLeadScope || canPeerReassignLeads
  const canBulkWrite = Boolean(canWrite || showBulkReassign)

  const reassignPickList = useMemo(() => {
    const base = counselorUsers
    if (!isElevatedLeadScope) return base
    const extras = directoryUsers.filter(
      (u) => u.isActive && isAdminLikeRole(u.role) && !base.some((c) => c.id === u.id),
    )
    return [...base, ...extras].sort((a, b) =>
      formatStaffDirectoryLabel(a).localeCompare(formatStaffDirectoryLabel(b), 'vi'),
    )
  }, [counselorUsers, directoryUsers, isElevatedLeadScope])

  const followUpCount = useMemo(
    () => leads.filter((l) => isDueTodayOrOverdue(l.nextFollowUpDate)).length,
    [leads],
  )
  const hotSlaCount = useMemo(
    () =>
      leads.filter((l) =>
        isHotStaleNewSla(l, scoreByLeadId.get(l.id)?.priorityTag ?? l.priorityTag),
      ).length,
    [leads, scoreByLeadId],
  )

  const regionOptions = useMemo(() => {
    const s = new Set<string>()
    for (const l of leads) {
      const r = l.province?.trim()
      if (r) s.add(r)
    }
    return [...s].sort((a, b) => a.localeCompare(b, 'vi'))
  }, [leads])

  const schoolOptions = useMemo(() => {
    const s = new Set<string>(highSchoolLabels)
    for (const l of leads) {
      const n = (l.highSchool ?? '').trim()
      if (n) s.add(n)
    }
    return [...s].sort((a, b) => a.localeCompare(b, 'vi'))
  }, [leads, highSchoolLabels])

  const majorOptions = useMemo(() => {
    const s = new Set<string>(majorLabels)
    for (const l of leads) {
      const n = (l.educationLevel ?? '').trim()
      if (n) s.add(n)
    }
    return [...s].sort((a, b) => a.localeCompare(b, 'vi'))
  }, [leads, majorLabels])

  const sourceOptions = useMemo(() => {
    const s = new Set<string>()
    for (const l of leads) {
      const src = (l.source ?? '').trim()
      if (src) s.add(src)
    }
    return [...s].sort((a, b) => a.localeCompare(b, 'vi'))
  }, [leads])

  const listFilterSig = useMemo(() => counselorListFilterSignature(searchParams), [searchParams])

  useEffect(() => {
    setListPage(1)
  }, [listFilterSig])

  const filtered = useMemo(() => {
    const q = qLower
    return leads.filter((l) => {
      if (regionFilter !== 'ALL' && l.province.trim() !== regionFilter) return false
      if (schoolFilter !== 'ALL' && (l.highSchool ?? '').trim() !== schoolFilter) return false
      if (majorFilter !== 'ALL' && l.educationLevel.trim() !== majorFilter) return false
      if (counselorFilterUid === '__UNASSIGNED__') {
        if (effectiveAssigneeUid(l)) return false
      } else if (counselorFilterUid) {
        if (effectiveAssigneeUid(l) !== counselorFilterUid) return false
      }
      if (!leadMatchesDateRange(l, dateAxis, dateFrom, dateTo)) return false
      if (myDayFilter === 'followup' && !isDueTodayOrOverdue(l.nextFollowUpDate)) return false
      if (myDayFilter === 'hot_sla') {
        const tag = scoreByLeadId.get(l.id)?.priorityTag ?? l.priorityTag
        if (!isHotStaleNewSla(l, tag)) return false
      }
      if (dueOnly && !isDueTodayOrOverdue(l.nextFollowUpDate)) return false
      const tag = scoreByLeadId.get(l.id)?.priorityTag ?? l.priorityTag
      if (tagFilter !== 'ALL' && tag !== tagFilter) return false
      if (pipelineUrlFilter !== 'ALL' && l.pipelineStatus !== pipelineUrlFilter) return false
      if (sourceUrlFilter !== 'ALL' && (l.source ?? '').trim() !== sourceUrlFilter) return false
      if (!q) return true
      return leadMatchesClientSearch(l, q, counselorDirectoryLabelById)
    })
  }, [
    leads,
    qLower,
    dueOnly,
    tagFilter,
    scoreByLeadId,
    myDayFilter,
    regionFilter,
    schoolFilter,
    majorFilter,
    counselorFilterUid,
    counselorDirectoryLabelById,
    dateAxis,
    dateFrom,
    dateTo,
    pipelineUrlFilter,
    sourceUrlFilter,
  ])

  const listRows = useMemo(() => {
    let rows = filtered
    if (crmStageFilter !== 'ALL') rows = rows.filter((l) => l.status === crmStageFilter)
    return [...rows].sort((a, b) => b.updatedAt.toMillis() - a.updatedAt.toMillis())
  }, [filtered, crmStageFilter])

  const maxListPage = Math.max(1, Math.ceil(listRows.length / LIST_PAGE_SIZE))
  const effectiveListPage = Math.min(Math.max(1, listPage), maxListPage)
  const pageSlice = useMemo(() => {
    const start = (effectiveListPage - 1) * LIST_PAGE_SIZE
    return listRows.slice(start, start + LIST_PAGE_SIZE)
  }, [listRows, effectiveListPage])

  useEffect(() => {
    setListPage((p) => Math.min(Math.max(1, p), Math.max(1, Math.ceil(listRows.length / LIST_PAGE_SIZE))))
  }, [listRows.length])

  const allOnPageSelected =
    pageSlice.length > 0 && pageSlice.every((l) => selectedIds.has(l.id))

  const toggleSelectAllOnPage = useCallback(() => {
    setSelectedIds((prev) => {
      const n = new Set(prev)
      const all = pageSlice.length > 0 && pageSlice.every((l) => n.has(l.id))
      if (all) for (const l of pageSlice) n.delete(l.id)
      else for (const l of pageSlice) n.add(l.id)
      return n
    })
  }, [pageSlice])

  const toggleSelectId = useCallback((id: string, e?: MouseEvent) => {
    e?.stopPropagation()
    setSelectedIds((prev) => {
      const n = new Set(prev)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  }, [])

  const evalMapForExport = useCallback(
    (rows: Lead[]) => {
      const m = new Map<string, { calculatedScore: number; priorityTag: PriorityTag }>()
      for (const l of rows) {
        const ev = activeScoringProfile
          ? scoreByLeadId.get(l.id) ??
            evaluateLead(leadToEvaluationRecord(l), activeScoringProfile, scoringMasterBuckets, schoolTvvSignalDefs)
          : { calculatedScore: l.calculatedScore, priorityTag: l.priorityTag }
        m.set(l.id, ev)
      }
      return m
    },
    [activeScoringProfile, scoreByLeadId, scoringMasterBuckets, schoolTvvSignalDefs],
  )

  const applyBulkReassign = useCallback(async () => {
    if (!db || !profile || !bulkReassignUid || !selectedIds.size) return
    if (!isElevatedLeadScope && canPeerReassignLeads) {
      for (const id of selectedIds) {
        const row = leads.find((x) => x.id === id)
        const owner = row?.assignedTo ?? row?.assignedCounselorId
        if (owner !== profile.id) {
          pushToast('Chỉ chuyển được hồ sơ đang gán cho bạn.')
          return
        }
      }
    }
    setBulkBusy(true)
    try {
      const performer = profile.displayName?.trim() || profile.email || profile.id
      const targetLabel =
        reassignPickList.find((c) => c.id === bulkReassignUid)?.displayName?.trim() ||
        reassignPickList.find((c) => c.id === bulkReassignUid)?.email ||
        bulkReassignUid
      for (const id of selectedIds) {
        const ref = doc(db, FS_COLLECTIONS.leads, id)
        const prev = leads.find((x) => x.id === id)
        const assignPatch = assigneeFirestoreMirror(bulkReassignUid) as Partial<Lead>
        const scoreFields = prev
          ? persistedLeadScoringFields(
              prev,
              assignPatch,
              activeScoringProfile,
              scoringMasterBuckets,
              schoolTvvSignalDefs,
            )
          : {}
        const touch = leadTouchPatch()
        const localPatch = { ...assignPatch, ...scoreFields, ...touch } as Partial<Lead>
        await updateDoc(ref, localPatch)
        applyLocalLeadPatch(id, localPatch)
        await commitAuditLog(db, {
          leadId: id,
          actionType: 'REASSIGNMENT',
          description: `Phân công hàng loạt → ${targetLabel}${prev ? ` (trước: ${prev.assignedTo ?? prev.assignedCounselorId ?? '—'})` : ''}`,
          performedBy: profile.id,
          performedByName: performer,
        })
      }
      setBulkModal(null)
      setSelectedIds(new Set())
      refetchLeads()
      pushToast('Đã phân công hàng loạt.')
    } catch (e) {
      console.error(e)
      pushToast('Lỗi khi phân công.')
    } finally {
      setBulkBusy(false)
    }
  }, [
    db,
    profile,
    bulkReassignUid,
    selectedIds,
    leads,
    reassignPickList,
    pushToast,
    isElevatedLeadScope,
    canPeerReassignLeads,
    activeScoringProfile,
    scoringMasterBuckets,
    schoolTvvSignalDefs,
    applyLocalLeadPatch,
    refetchLeads,
  ])

  const applyBulkCrmStatus = useCallback(async () => {
    if (!db || !profile || !selectedIds.size) return
    setBulkBusy(true)
    try {
      const performer = profile.displayName?.trim() || profile.email || profile.id
      for (const id of selectedIds) {
        const prev = leads.find((x) => x.id === id)
        const dataPatch: Partial<Lead> = {
          status: bulkCrmStatus,
          pipelineStatus: counselorStatusToPipeline(bulkCrmStatus),
        }
        const scoreFields = prev
          ? persistedLeadScoringFields(
              prev,
              dataPatch,
              activeScoringProfile,
              scoringMasterBuckets,
              schoolTvvSignalDefs,
            )
          : {}
        const touch = leadTouchPatch()
        const localPatch = { ...dataPatch, ...scoreFields, ...touch } as Partial<Lead>
        await updateDoc(doc(db, FS_COLLECTIONS.leads, id), localPatch)
        applyLocalLeadPatch(id, localPatch)
        await commitAuditLog(db, {
          leadId: id,
          actionType: 'STATUS_CHANGE',
          description: `CRM (hàng loạt, danh sách TVV): ${prev ? LEAD_COUNSELOR_STATUS_LABELS[prev.status] : '—'} → ${LEAD_COUNSELOR_STATUS_LABELS[bulkCrmStatus]}`,
          performedBy: profile.id,
          performedByName: performer,
        })
      }
      setBulkModal(null)
      setSelectedIds(new Set())
      refetchLeads()
      pushToast('Đã cập nhật trạng thái CRM.')
    } catch (e) {
      console.error(e)
      pushToast('Lỗi khi đổi trạng thái.')
    } finally {
      setBulkBusy(false)
    }
  }, [db, profile, selectedIds, leads, bulkCrmStatus, pushToast, activeScoringProfile, scoringMasterBuckets, schoolTvvSignalDefs, applyLocalLeadPatch, refetchLeads])

  const exportBulkSelection = useCallback(() => {
    const rows = leads.filter((l) => selectedIds.has(l.id))
    exportSelectedEvaluatedLeadsToXlsx(rows, selectedIds, evalMapForExport(rows), {
      profileName: activeScoringProfile?.profileName ?? 'Mặc định',
    })
  }, [leads, selectedIds, evalMapForExport, activeScoringProfile])

  const applyRowCrmChange = useCallback(
    async (lead: Lead, next: LeadCounselorStatus) => {
      if (!db || !canWrite || !profile) return
      if (lead.status === next) return
      setRowCrmBusyId(lead.id)
      try {
        const touch = leadTouchPatch()
        const dataPatch: Partial<Lead> = {
          status: next,
          pipelineStatus: counselorStatusToPipeline(next),
        }
        const scoreFields = persistedLeadScoringFields(
          lead,
          dataPatch,
          activeScoringProfile,
          scoringMasterBuckets,
          schoolTvvSignalDefs,
        )
        await updateDoc(doc(db, FS_COLLECTIONS.leads, lead.id), {
          ...dataPatch,
          ...scoreFields,
          ...touch,
        })
        const localPatch = { ...dataPatch, ...scoreFields, ...touch } as Partial<Lead>
        applyLocalLeadPatch(lead.id, localPatch)
        const performer = profile.displayName?.trim() || profile.email || profile.id
        await commitAuditLog(db, {
          leadId: lead.id,
          actionType: 'STATUS_CHANGE',
          description: `CRM (danh sách TVV): ${LEAD_COUNSELOR_STATUS_LABELS[lead.status]} → ${LEAD_COUNSELOR_STATUS_LABELS[next]}`,
          performedBy: profile.id,
          performedByName: performer,
        })
        pushToast(`Đã cập nhật «${LEAD_COUNSELOR_STATUS_LABELS[next]}».`)
      } catch (e) {
        console.error(e)
        pushToast('Không thể cập nhật trạng thái.')
      } finally {
        setRowCrmBusyId(null)
      }
    },
    [
      db,
      canWrite,
      profile,
      activeScoringProfile,
      scoringMasterBuckets,
      schoolTvvSignalDefs,
      pushToast,
      applyLocalLeadPatch,
    ],
  )

  if (!canBoard) {
    return (
      <div className="mx-auto max-w-lg rounded-2xl border border-amber-300 bg-amber-50 px-5 py-6 text-base text-amber-950 shadow-sm backdrop-blur-xl">
        Bạn không có quyền <code className="rounded bg-amber-100 px-1 text-amber-900">dashboard:counselor</code> — liên hệ quản trị để được gán
        vai trò Tư vấn viên.
      </div>
    )
  }

  return (
    <div className="relative space-y-4">
      <div className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(ellipse_at_80%_0%,rgba(56,189,248,0.08),transparent_50%)]" />

      <header className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div className="max-w-3xl">
          <VietMyAccentHeading as="h1" tone="onLight" size="xl" className="block">
            Tư vấn
          </VietMyAccentHeading>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">
            Làm việc trên <strong>danh sách hồ sơ</strong> có bộ lọc — đổi <strong>tình trạng CRM</strong>, ghi chú / gọi /
            follow-up nhanh, rồi mở{' '}
            <Link to="/leads" className="font-semibold text-teal-800 underline underline-offset-2 hover:text-teal-950">
              Hồ sơ đầy đủ
            </Link>{' '}
          </p>
        </div>
      </header>

      <section className="app-card-glass overflow-hidden p-3 shadow-md md:p-4">
        <div className="grid gap-3 md:grid-cols-3 md:items-end md:gap-4">
          <div className="min-w-0 md:col-span-2">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <label className="min-w-0 flex-1 text-xs font-medium text-slate-600">
                Tìm kiếm hồ sơ
                <div className="relative mt-1">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                  <input
                    type="search"
                    value={urlQRaw}
                    onChange={(e) => {
                      const raw = e.target.value
                      const t = raw.trim()
                      patchListUrl({ [LWF.Q]: t ? raw : null })
                      setListPage(1)
                    }}
                    onFocus={() => setFiltersExpanded(true)}
                    placeholder="Tên, SĐT, tỉnh, trường, ngành… (đồng bộ với Hồ sơ đầy đủ — tham số q)"
                    className="w-full rounded-xl border border-slate-200/95 bg-white py-2 pl-10 pr-3 text-sm text-slate-900 outline-none transition focus:border-amber-400 focus:ring-2 focus:ring-amber-100 placeholder:text-slate-500"
                  />
                </div>
              </label>
              <button
                type="button"
                onClick={() => setFiltersExpanded((x) => !x)}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-slate-200/95 bg-white px-3 py-2 text-xs font-semibold text-slate-800 shadow-sm transition hover:border-amber-300 hover:bg-amber-50/80"
                aria-expanded={filtersExpanded}
              >
                <Filter className="h-3.5 w-3.5 text-amber-700" strokeWidth={2} />
                Lọc nâng cao (CRM · khu vực · …)
                <ChevronDown
                  className={[
                    'h-3.5 w-3.5 text-slate-500 transition-transform',
                    filtersExpanded ? 'rotate-180' : '',
                  ].join(' ')}
                  strokeWidth={2}
                />
              </button>
            </div>
            {filtersExpanded ? (
              <div className="mt-3 grid gap-3 border-t border-slate-200/80 pt-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-8">
                <label className="block text-xs font-medium text-slate-600">
                  Giai đoạn tư vấn (CRM)
                  <select
                    value={crmStageFilter}
                    onChange={(e) => {
                      setListPage(1)
                      const v = e.target.value as 'ALL' | LeadCounselorStatus
                      patchListUrl({ [LWF.CRM]: v === 'ALL' ? null : v })
                    }}
                    className="mt-1 w-full rounded-xl border border-slate-200/95 bg-white px-2.5 py-2 text-xs font-medium text-slate-900 outline-none transition focus:border-amber-400 focus:ring-2 focus:ring-amber-100"
                  >
                    <option value="ALL">Tất cả giai đoạn</option>
                    {LEAD_COUNSELOR_STATUS_ORDER.map((s) => (
                      <option key={s} value={s}>
                        {LEAD_COUNSELOR_STATUS_LABELS[s]}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-xs font-medium text-slate-600">
                  Khu vực
                  <select
                    value={regionFilter}
                    onChange={(e) => {
                      setListPage(1)
                      const v = e.target.value === 'ALL' ? 'ALL' : e.target.value
                      patchListUrl({ [LWF.REGION]: v === 'ALL' ? null : v })
                    }}
                    className="mt-1 w-full rounded-xl border border-slate-200/95 bg-white px-2.5 py-2 text-xs font-medium text-slate-900 outline-none transition focus:border-amber-400 focus:ring-2 focus:ring-amber-100"
                  >
                    <option value="ALL">Tất cả khu vực</option>
                    {regionOptions.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-xs font-medium text-slate-600">
                  Trường THPT
                  <select
                    value={schoolFilter}
                    onChange={(e) => {
                      setListPage(1)
                      const v = e.target.value === 'ALL' ? 'ALL' : e.target.value
                      patchListUrl({ [LWF.SCHOOL]: v === 'ALL' ? null : v })
                    }}
                    className="mt-1 w-full rounded-xl border border-slate-200/95 bg-white px-2.5 py-2 text-xs font-medium text-slate-900 outline-none transition focus:border-amber-400 focus:ring-2 focus:ring-amber-100"
                  >
                    <option value="ALL">Tất cả trường</option>
                    {schoolOptions.slice(0, 80).map((sc) => (
                      <option key={sc} value={sc}>
                        {sc.length > 48 ? `${sc.slice(0, 48)}…` : sc}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-xs font-medium text-slate-600">
                  Ngành / cấp (educationLevel)
                  <select
                    value={majorFilter}
                    onChange={(e) => {
                      setListPage(1)
                      const v = e.target.value === 'ALL' ? 'ALL' : e.target.value
                      patchListUrl({ [LWF.MAJOR]: v === 'ALL' ? null : v })
                    }}
                    className="mt-1 w-full rounded-xl border border-slate-200/95 bg-white px-2.5 py-2 text-xs font-medium text-slate-900 outline-none transition focus:border-amber-400 focus:ring-2 focus:ring-amber-100"
                  >
                    <option value="ALL">Tất cả ngành</option>
                    {majorOptions.slice(0, 80).map((m) => (
                      <option key={m} value={m}>
                        {m.length > 48 ? `${m.slice(0, 48)}…` : m}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-xs font-medium text-slate-600">
                  Funnel tuyển sinh
                  <select
                    value={pipelineUrlFilter}
                    onChange={(e) => {
                      setListPage(1)
                      const v = e.target.value
                      patchListUrl({ [LWF.PIPE]: v === 'ALL' ? null : v })
                    }}
                    className="mt-1 w-full rounded-xl border border-slate-200/95 bg-white px-2.5 py-2 text-xs font-medium text-slate-900 outline-none transition focus:border-amber-400 focus:ring-2 focus:ring-amber-100"
                    title="Cùng bộ lọc với màn Hồ sơ khi chia sẻ link."
                  >
                    <option value="ALL">Tất cả giai đoạn funnel</option>
                    {(Object.keys(PIPELINE_LABEL) as LeadPipelineStatus[]).map((k) => (
                      <option key={k} value={k}>
                        {PIPELINE_LABEL[k]}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-xs font-medium text-slate-600">
                  Nguồn
                  <select
                    value={sourceUrlFilter}
                    onChange={(e) => {
                      setListPage(1)
                      const v = e.target.value === 'ALL' ? 'ALL' : e.target.value
                      patchListUrl({ [LWF.SOURCE]: v === 'ALL' ? null : v })
                    }}
                    className="mt-1 w-full rounded-xl border border-slate-200/95 bg-white px-2.5 py-2 text-xs font-medium text-slate-900 outline-none transition focus:border-amber-400 focus:ring-2 focus:ring-amber-100"
                    title="Cùng bộ lọc với màn Hồ sơ khi chia sẻ link."
                  >
                    <option value="ALL">Mọi nguồn</option>
                    {sourceUrlFilter !== 'ALL' && !sourceOptions.includes(sourceUrlFilter) ? (
                      <option value={sourceUrlFilter}>{sourceUrlFilter}</option>
                    ) : null}
                    {sourceOptions.slice(0, 80).map((src) => (
                      <option key={src} value={src}>
                        {src.length > 48 ? `${src.slice(0, 48)}…` : src}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-xs font-medium text-slate-600">
                  Thời điểm theo
                  <select
                    value={dateAxis}
                    onChange={(e) => {
                      setListPage(1)
                      const v = e.target.value as DateAxisFilter
                      patchListUrl({ [LWF.DATE_AXIS]: v === 'updated' ? null : v })
                    }}
                    className="mt-1 w-full rounded-xl border border-slate-200/95 bg-white px-2.5 py-2 text-xs font-medium text-slate-900 outline-none transition focus:border-amber-400 focus:ring-2 focus:ring-amber-100"
                  >
                    <option value="updated">Ngày cập nhật hồ sơ</option>
                    <option value="created">Ngày tạo hồ sơ</option>
                    <option value="followup">Ngày follow-up đã hẹn</option>
                  </select>
                </label>
                <label className="block text-xs font-medium text-slate-600">
                  Từ ngày
                  <input
                    type="date"
                    value={dateFrom}
                    onChange={(e) => {
                      setListPage(1)
                      const v = e.target.value
                      patchListUrl({ [LWF.DATE_FROM]: v ? v : null })
                    }}
                    className="mt-1 w-full rounded-xl border border-slate-200/95 bg-white px-2.5 py-2 text-xs text-slate-900 outline-none transition focus:border-amber-400 focus:ring-2 focus:ring-amber-100"
                  />
                </label>
                <label className="block text-xs font-medium text-slate-600">
                  Đến ngày
                  <input
                    type="date"
                    value={dateTo}
                    onChange={(e) => {
                      setListPage(1)
                      const v = e.target.value
                      patchListUrl({ [LWF.DATE_TO]: v ? v : null })
                    }}
                    className="mt-1 w-full rounded-xl border border-slate-200/95 bg-white px-2.5 py-2 text-xs text-slate-900 outline-none transition focus:border-amber-400 focus:ring-2 focus:ring-amber-100"
                  />
                </label>
                <label className="block text-xs font-medium text-slate-600 sm:col-span-2 lg:col-span-2">
                  Tư vấn viên phụ trách
                  <select
                    value={counselorFilterUid}
                    onChange={(e) => {
                      setListPage(1)
                      const v = e.target.value
                      patchListUrl({ [LWF.ASSIGN]: v ? v : null })
                    }}
                    disabled={counselorsLoading && counselorUsers.length === 0}
                    className="mt-1 w-full rounded-xl border border-slate-200/95 bg-white px-2.5 py-2 text-xs font-medium text-slate-900 outline-none transition focus:border-amber-400 focus:ring-2 focus:ring-amber-100 disabled:opacity-50"
                  >
                    <option value="">Mọi TVV (theo dữ liệu đã tải)</option>
                    <option value="__UNASSIGNED__">Chưa gán TVV</option>
                    {counselorUsers.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.displayName || c.email || c.id}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="flex items-end sm:col-span-2 lg:col-span-2">
                  <button
                    type="button"
                    onClick={() => {
                      setListPage(1)
                      patchListUrl({
                        [LWF.REGION]: null,
                        [LWF.SCHOOL]: null,
                        [LWF.MAJOR]: null,
                        [LWF.PIPE]: null,
                        [LWF.SOURCE]: null,
                        [LWF.DATE_AXIS]: null,
                        [LWF.DATE_FROM]: null,
                        [LWF.DATE_TO]: null,
                        [LWF.ASSIGN]: null,
                        [LWF.CRM]: null,
                      })
                    }}
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
                  >
                    Xóa bộ lọc mở rộng
                  </button>
                </div>
              </div>
            ) : null}
          </div>
          <div className="flex min-w-0 flex-col gap-2 md:col-span-1">
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200/95 bg-white/90 px-2.5 py-2 text-xs font-medium text-slate-800 shadow-sm transition hover:border-amber-300">
              <input
                type="checkbox"
                checked={dueOnly}
                onChange={(e) => {
                  setListPage(1)
                  patchListUrl({ [LWF.DUE]: e.target.checked ? '1' : null })
                }}
                className="accent-amber-400"
              />
              Hạn hôm nay / quá hạn
            </label>
            <div className="flex items-center gap-2">
              <ThermometerSun className="h-3.5 w-3.5 shrink-0 text-slate-500" aria-hidden />
              <select
                value={tagFilter}
                onChange={(e) => {
                  setListPage(1)
                  const v = e.target.value as typeof tagFilter
                  patchListUrl({ [LWF.TAG]: v === 'ALL' ? null : v })
                }}
                className="min-w-0 flex-1 rounded-xl border border-slate-200/95 bg-white px-2.5 py-2 text-xs font-medium text-slate-900 outline-none transition focus:border-amber-400 focus:ring-2 focus:ring-amber-100"
              >
                <option value="ALL">Mọi mức độ</option>
                <option value="HOT">Chỉ HOT</option>
                <option value="WARM">Chỉ WARM</option>
                <option value="COLD">Chỉ COLD</option>
                <option value="LOSS">Chỉ LOSS</option>
              </select>
            </div>
          </div>
        </div>

        <div className="mt-3 border-t border-slate-200/80 pt-3">
          <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-500">
            <Flame className="h-3.5 w-3.5 text-amber-400" aria-hidden />
            Việc ưu tiên trong ngày
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                setListPage(1)
                patchListUrl({ [LWF.MYDAY]: myDayFilter === 'followup' ? null : 'followup' })
              }}
              className={[
                'min-w-0 flex-1 rounded-xl border px-3 py-2 text-left text-xs font-medium transition sm:min-w-[12rem] sm:flex-none',
                myDayFilter === 'followup'
                  ? 'border-amber-400 bg-amber-100 text-amber-950 shadow-sm'
                  : 'border-slate-200/95 bg-white/90 text-slate-800 hover:border-amber-300',
              ].join(' ')}
            >
              <span aria-hidden>🔥</span>{' '}
              <span className="font-semibold">{followUpCount}</span> follow-up hôm nay / quá hạn
            </button>
            <button
              type="button"
              onClick={() => {
                setListPage(1)
                patchListUrl({ [LWF.MYDAY]: myDayFilter === 'hot_sla' ? null : 'hotsla' })
              }}
              className={[
                'min-w-0 flex-1 rounded-xl border px-3 py-2 text-left text-xs font-medium transition sm:min-w-[12rem] sm:flex-none',
                myDayFilter === 'hot_sla'
                  ? 'border-rose-400 bg-rose-100 text-rose-950 shadow-sm'
                  : 'border-slate-200/95 bg-white/90 text-slate-800 hover:border-rose-300',
              ].join(' ')}
            >
              <span aria-hidden>⚠️</span>{' '}
              <span className="font-semibold">{hotSlaCount}</span> HOT giai đoạn Mới &gt;24h chưa chạm
            </button>
          </div>
        </div>
      </section>

      {error ? (
        <div className="rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-base text-rose-900 shadow-sm">
          {error}
        </div>
      ) : null}

      {scopeFetchTruncated ? (
        <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-950 shadow-sm">
          Danh sách này chỉ tải tối đa <strong>{LEADS_UI_FULL_SCOPE_MAX.toLocaleString('vi-VN')}</strong> hồ sơ trong phạm vi
          quyền — có thể còn trên server. Dùng{' '}
          <Link to="/leads" className="font-semibold text-amber-900 underline underline-offset-2 hover:text-amber-950">
            Hồ sơ đầy đủ
          </Link>{' '}
          để xem toàn bộ nếu được phép.
        </div>
      ) : null}

      {!isFirebaseConfigured() || !db ? (
        <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-base text-amber-950 shadow-sm">
          Cấu hình Firebase để dùng pipeline.
        </div>
      ) : null}

      {loading ? (
        <div className="space-y-2 rounded-2xl border border-slate-200/80 bg-white/50 p-4 shadow-inner">
          <div className="h-8 w-48 animate-pulse rounded-lg bg-slate-200/80" />
          <div className="h-10 w-full animate-pulse rounded-lg bg-slate-200/60" />
          <div className="h-10 w-full animate-pulse rounded-lg bg-slate-200/60" />
          <div className="h-10 w-full animate-pulse rounded-lg bg-slate-200/60" />
        </div>
      ) : (
        <CounselorLeadWorklist
          key={listFilterSig}
          rows={pageSlice}
          total={listRows.length}
          page={effectiveListPage}
          pageSize={LIST_PAGE_SIZE}
          onPageChange={setListPage}
          scoreByLeadId={scoreByLeadId}
          selectedIds={selectedIds}
          toggleSelectId={toggleSelectId}
          toggleSelectAllOnPage={toggleSelectAllOnPage}
          allOnPageSelected={allOnPageSelected}
          canWrite={canWrite}
          canInteract={canInteract}
          pushToast={pushToast}
          onRowCrmChange={applyRowCrmChange}
          rowCrmBusyId={rowCrmBusyId}
          onLeadLocallyPatched={applyLocalLeadPatch}
        />
      )}

      {canBulkWrite && selectedIds.size > 0 ? (
        <BulkLeadActionBar
          count={selectedIds.size}
          onClear={() => setSelectedIds(new Set())}
          onReassign={() => {
            const others = reassignPickList.filter((c) => c.id !== profile?.id)
            setBulkReassignUid(others[0]?.id ?? reassignPickList[0]?.id ?? '')
            setBulkModal('reassign')
          }}
          onBulkStatus={() => {
            setBulkCrmStatus('NEW')
            setBulkModal('crm')
          }}
          onExport={() => exportBulkSelection()}
          showReassign={showBulkReassign}
        />
      ) : null}

      {bulkModal === 'reassign' && db ? (
        <>
          <button
            type="button"
            className="fixed inset-0 z-[55] bg-slate-900/25 backdrop-blur-md"
            aria-label="Đóng"
            onClick={() => !bulkBusy && setBulkModal(null)}
          />
          <div className="app-glass-panel fixed left-1/2 top-1/2 z-[60] w-[min(92vw,400px)] -translate-x-1/2 -translate-y-1/2 rounded-2xl p-5 shadow-xl">
            <h3 className="app-section-heading">Giao việc hàng loạt</h3>
            <p className="mt-1 text-sm text-slate-600">
              {selectedIds.size} hồ sơ đã chọn.
              {!isElevatedLeadScope && canPeerReassignLeads ? (
                <span className="mt-1 block font-medium text-amber-800">
                  Chỉ áp dụng cho hồ sơ đang gán cho bạn.
                </span>
              ) : null}
            </p>
            <label className="mt-4 block text-xs font-medium text-slate-600">
              Phụ trách (TVV / Admin)
              <select
                value={bulkReassignUid}
                onChange={(e) => setBulkReassignUid(e.target.value)}
                disabled={counselorsLoading}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-base text-slate-900 outline-none focus:ring-2 focus:ring-violet-200"
              >
                {reassignPickList.map((c) => (
                  <option key={c.id} value={c.id} className="bg-white">
                    {formatStaffDirectoryLabel(c)}
                  </option>
                ))}
              </select>
            </label>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                disabled={bulkBusy}
                onClick={() => setBulkModal(null)}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
              >
                Hủy
              </button>
              <button
                type="button"
                disabled={bulkBusy || !bulkReassignUid}
                onClick={() => void applyBulkReassign()}
                className="rounded-xl border border-violet-500 bg-violet-600 px-4 py-2 text-sm font-semibold text-white shadow-sm disabled:opacity-40"
              >
                {bulkBusy ? '…' : 'Áp dụng'}
              </button>
            </div>
          </div>
        </>
      ) : null}

      {bulkModal === 'crm' && db ? (
        <>
          <button
            type="button"
            className="fixed inset-0 z-[55] bg-slate-900/25 backdrop-blur-md"
            aria-label="Đóng"
            onClick={() => !bulkBusy && setBulkModal(null)}
          />
          <div className="app-glass-panel fixed left-1/2 top-1/2 z-[60] w-[min(92vw,400px)] -translate-x-1/2 -translate-y-1/2 rounded-2xl p-5 shadow-xl">
            <h3 className="app-section-heading">Đổi giai đoạn CRM</h3>
            <p className="mt-1 text-sm text-slate-600">Áp dụng cho {selectedIds.size} hồ sơ đã chọn.</p>
            <select
              value={bulkCrmStatus}
              onChange={(e) => setBulkCrmStatus(e.target.value as LeadCounselorStatus)}
              className="mt-3 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-base text-slate-900 outline-none focus:ring-2 focus:ring-amber-200"
            >
              {LEAD_COUNSELOR_STATUS_ORDER.map((s) => (
                <option key={s} value={s} className="bg-white">
                  {LEAD_COUNSELOR_STATUS_LABELS[s]}
                </option>
              ))}
            </select>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                disabled={bulkBusy}
                onClick={() => setBulkModal(null)}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
              >
                Hủy
              </button>
              <button
                type="button"
                disabled={bulkBusy}
                onClick={() => void applyBulkCrmStatus()}
                className="rounded-xl border border-amber-500 bg-amber-600 px-4 py-2 text-sm font-semibold text-white shadow-sm disabled:opacity-40"
              >
                Áp dụng
              </button>
            </div>
          </div>
        </>
      ) : null}

      <div className="pointer-events-none fixed bottom-[max(1.25rem,env(safe-area-inset-bottom,0px))] right-4 z-50 flex max-w-[min(100vw-2rem,320px)] flex-col gap-2 sm:right-6">
        <AnimatePresence>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, y: 12, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8 }}
              className="app-glass-panel pointer-events-auto rounded-xl border border-emerald-200/90 px-4 py-3 text-base text-emerald-950 shadow-lg"
            >
              {t.text}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  )
}
