import { useCallback, useMemo, useState, type MouseEvent, type ReactNode } from 'react'
import {
  DndContext,
  type DragEndEvent,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import { AnimatePresence, motion } from 'motion/react'
import { addDoc, collection, doc, Timestamp, updateDoc } from 'firebase/firestore'
import {
  CalendarClock,
  ChevronDown,
  Filter,
  Flame,
  GripVertical,
  MessageSquare,
  Phone,
  Search,
  ThermometerSun,
} from 'lucide-react'
import type { Lead, LeadCounselorStatus, PriorityTag } from '../types'
import {
  FS_COLLECTIONS,
  LEAD_COUNSELOR_STATUS_LABELS,
  LEAD_COUNSELOR_STATUS_ORDER,
  USER_ROLE_LABELS,
} from '../types'
import { getFirestoreDb, isFirebaseConfigured } from '../services/firebase'
import { useAuth } from '../hooks/useAuth'
import { LEADS_PAGE_SIZE, useLeads } from '../hooks/useLeads'
import { useLeadScoring } from '../hooks/useLeadScoring'
import { useCounselorDirectory } from '../hooks/useCounselorDirectory'
import { BulkLeadActionBar } from '../components/bulk/BulkLeadActionBar'
import { commitAuditLog } from '../services/auditLog'
import { leadTouchPatch } from '../utils/leadTouch'
import { counselorStatusToPipeline } from '../utils/leadIdentity'
import { formatStaffDirectoryLabel } from '../utils/counselorDisplay'
import { exportSelectedEvaluatedLeadsToXlsx } from '../utils/exportEvaluatedLeads'
import { evaluateLead, leadToEvaluationRecord } from '../utils/scoring'
import { isFollowUpTodayLocal, isHotStaleNewSla, isStaleNewSla } from '../utils/slaLead'
import { VietMyAccentHeading } from '../components/VietMyAccentHeading'

const COL_SURFACE: Record<LeadCounselorStatus, string> = {
  NEW: 'border-amber-200/90 bg-gradient-to-b from-amber-50/95 via-white/85 to-white/45',
  INTERESTED: 'border-violet-200/90 bg-gradient-to-b from-violet-50/95 via-white/85 to-white/45',
  DEPOSIT_PAID:
    'border-emerald-200/90 bg-gradient-to-b from-emerald-50/95 via-white/85 to-white/45',
  ENROLLED: 'border-teal-200/90 bg-gradient-to-b from-teal-50/95 via-white/85 to-white/45',
  SUMMER_MELT: 'border-orange-300/90 bg-gradient-to-b from-orange-50/95 via-white/85 to-white/45',
  DEAD: 'border-rose-200/90 bg-gradient-to-b from-rose-50/95 via-white/85 to-white/45',
}

const TAG_BADGE: Record<PriorityTag, string> = {
  HOT: 'bg-rose-100 text-rose-900 ring-1 ring-rose-300/80',
  WARM: 'bg-amber-100 text-amber-900 ring-1 ring-amber-300/80',
  COLD: 'bg-sky-100 text-sky-900 ring-1 ring-sky-300/80',
  LOSS: 'bg-slate-700 text-slate-200 ring-1 ring-slate-500/70',
}

type Toast = { id: string; text: string }

function colId(s: LeadCounselorStatus) {
  return `col-${s}`
}

function parseColId(overId: string | undefined): LeadCounselorStatus | null {
  if (!overId?.startsWith('col-')) return null
  const s = overId.slice(4) as LeadCounselorStatus
  return LEAD_COUNSELOR_STATUS_ORDER.includes(s) ? s : null
}

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
  return role === 'admin' || role === 'head_of_department' || role === 'head_of_profession'
}

function KanbanColumn({
  status,
  count,
  children,
}: {
  status: LeadCounselorStatus
  count: number
  children: ReactNode
}) {
  const { setNodeRef, isOver } = useDroppable({ id: colId(status), data: { status } })
  return (
    <div
      ref={setNodeRef}
      className={[
        'flex min-h-[min(70vh,520px)] min-w-[10.5rem] flex-1 basis-0 flex-col rounded-2xl border p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)] backdrop-blur-xl transition-all duration-300',
        COL_SURFACE[status],
        isOver ? 'ring-2 ring-amber-400/50 ring-offset-2 ring-offset-white/90' : '',
      ].join(' ')}
    >
      <div className="mb-3 flex items-center justify-between gap-2 border-b border-slate-200/70 pb-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-700">
          {LEAD_COUNSELOR_STATUS_LABELS[status]}
        </h3>
        <span className="rounded-full border border-slate-200/90 bg-white/90 px-2 py-0.5 text-xs font-medium text-slate-700 shadow-sm">
          {count}
        </span>
      </div>
      <div className="flex flex-1 flex-col gap-2 overflow-y-auto pr-0.5">{children}</div>
    </div>
  )
}

function KanbanLeadCard({
  lead,
  priorityTag,
  onToast,
  canWrite,
  canInteract,
  selected,
  onToggleSelect,
}: {
  lead: Lead
  priorityTag: PriorityTag
  onToast: (text: string) => void
  canWrite: boolean
  canInteract: boolean
  selected: boolean
  onToggleSelect: (id: string, e?: MouseEvent) => void
}) {
  const db = getFirestoreDb()
  const { profile } = useAuth()
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: lead.id,
    data: { lead },
  })

  const style = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.55 : 1,
  }

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
        counselorNote: 'Ghi nhanh: Cuộc gọi (Pipeline)',
        callOutcome: 'CONNECTED',
      })
      const touch = leadTouchPatch()
      await updateDoc(doc(db, FS_COLLECTIONS.leads, lead.id), touch)
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
      await updateDoc(doc(db, FS_COLLECTIONS.leads, lead.id), {
        nextFollowUpDate: Timestamp.fromMillis(ms),
        ...touch,
      })
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
    <div
      ref={setNodeRef}
      style={style}
      className={[
        'relative rounded-xl border bg-white/85 p-2.5 shadow-sm backdrop-blur-md transition-shadow duration-300',
        selected ? 'border-amber-400 ring-2 ring-amber-200/80' : 'border-slate-200/90',
        followToday ? 'shadow-[0_0_20px_rgba(251,191,36,0.35)] ring-1 ring-amber-400/50' : '',
      ].join(' ')}
    >
      {slaNewStale && lead.status === 'NEW' ? (
        <span
          className="absolute -right-0.5 -top-0.5 flex h-3 w-3 items-center justify-center"
          title="SLA: hồ sơ ở cột Mới chưa được chạm trên 24 giờ"
        >
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-500 opacity-60" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-rose-500 shadow-[0_0_10px_#f43f5e]" />
        </span>
      ) : null}
      <div className="flex items-start gap-2">
        <input
          type="checkbox"
          checked={selected}
          onClick={(e) => e.stopPropagation()}
          onChange={() => onToggleSelect(lead.id)}
          className="mt-2 h-4 w-4 shrink-0 rounded border-slate-300 bg-white accent-amber-500"
          aria-label={`Chọn ${lead.fullName}`}
        />
        <button
          type="button"
          className="mt-0.5 shrink-0 cursor-grab touch-none rounded-md border border-slate-200 bg-white p-1 text-slate-500 transition hover:border-amber-300 hover:text-amber-700"
          aria-label="Kéo thả thẻ hồ sơ"
          {...listeners}
          {...attributes}
        >
          <GripVertical className="h-4 w-4" strokeWidth={1.75} />
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-slate-900">{lead.fullName || '—'}</p>
          <p className="truncate text-xs text-slate-600">{lead.phone || lead.parentPhone || '—'}</p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <span className={`rounded-md px-2 py-0.5 text-xs font-bold uppercase ${TAG_BADGE[priorityTag]}`}>
              {priorityTag}
            </span>
            <span className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs text-slate-600">
              <CalendarClock className="h-3 w-3" />
              {formatFollowUp(lead.nextFollowUpDate)}
            </span>
          </div>
          <div className="mt-2 flex gap-1 border-t border-slate-100 pt-2">
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
              title="Thêm ghi chú"
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
          </div>
        </div>
      </div>
    </div>
  )
}

export function CounselorDashboard() {
  const db = getFirestoreDb()
  const { profile, can } = useAuth()
  const { leads, loading, loadingMore, hasMore, loadMore, error } = useLeads()
  const { scoreByLeadId, activeScoringProfile } = useLeadScoring(leads)
  const { users: directoryUsers, counselors: counselorUsers, loading: counselorsLoading } = useCounselorDirectory()

  const [needle, setNeedle] = useState('')
  const [dueOnly, setDueOnly] = useState(false)
  const [tagFilter, setTagFilter] = useState<'ALL' | PriorityTag>('ALL')
  const [toasts, setToasts] = useState<Toast[]>([])
  const [myDayFilter, setMyDayFilter] = useState<null | 'followup' | 'hot_sla'>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())
  const [bulkModal, setBulkModal] = useState<null | 'reassign' | 'crm'>(null)
  const [bulkReassignUid, setBulkReassignUid] = useState('')
  const [bulkCrmStatus, setBulkCrmStatus] = useState<LeadCounselorStatus>('NEW')
  const [bulkBusy, setBulkBusy] = useState(false)
  const [filtersExpanded, setFiltersExpanded] = useState(false)
  const [regionFilter, setRegionFilter] = useState<'ALL' | string>('ALL')
  const [dateAxis, setDateAxis] = useState<DateAxisFilter>('updated')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  /** '' = mọi TVV; '__UNASSIGNED__' = chưa gán */
  const [counselorFilterUid, setCounselorFilterUid] = useState('')

  const pushToast = useCallback((text: string) => {
    const id = crypto.randomUUID()
    setToasts((t) => [...t, { id, text }])
    window.setTimeout(() => {
      setToasts((t) => t.filter((x) => x.id !== id))
    }, 3200)
  }, [])

  const canBoard = can('dashboard:counselor')
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
      (u) => u.isActive && u.role === 'admin' && !base.some((c) => c.id === u.id),
    )
    return [...base, ...extras].sort((a, b) =>
      formatStaffDirectoryLabel(a).localeCompare(formatStaffDirectoryLabel(b), 'vi'),
    )
  }, [counselorUsers, directoryUsers, isElevatedLeadScope])

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    }),
  )

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

  const filtered = useMemo(() => {
    const q = needle.trim().toLowerCase()
    return leads.filter((l) => {
      if (regionFilter !== 'ALL' && l.province.trim() !== regionFilter) return false
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
      if (!q) return true
      const hay = `${l.fullName} ${l.phone} ${l.parentPhone ?? ''}`.toLowerCase()
      return hay.includes(q)
    })
  }, [
    leads,
    needle,
    dueOnly,
    tagFilter,
    scoreByLeadId,
    myDayFilter,
    regionFilter,
    counselorFilterUid,
    dateAxis,
    dateFrom,
    dateTo,
  ])

  const byStatus = useMemo(() => {
    const m = new Map<LeadCounselorStatus, Lead[]>()
    for (const s of LEAD_COUNSELOR_STATUS_ORDER) m.set(s, [])
    for (const l of filtered) {
      const list = m.get(l.status)
      if (list) list.push(l)
    }
    return m
  }, [filtered])

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
          ? scoreByLeadId.get(l.id) ?? evaluateLead(leadToEvaluationRecord(l), activeScoringProfile)
          : { calculatedScore: l.calculatedScore, priorityTag: l.priorityTag }
        m.set(l.id, ev)
      }
      return m
    },
    [activeScoringProfile, scoreByLeadId],
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
        const prev = leads.find((x) => x.id === id)
        await updateDoc(doc(db, FS_COLLECTIONS.leads, id), {
          assignedCounselorId: bulkReassignUid,
          assignedTo: bulkReassignUid,
          ...leadTouchPatch(),
        })
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
  ])

  const applyBulkCrmStatus = useCallback(async () => {
    if (!db || !profile || !selectedIds.size) return
    setBulkBusy(true)
    try {
      const performer = profile.displayName?.trim() || profile.email || profile.id
      for (const id of selectedIds) {
        const prev = leads.find((x) => x.id === id)
        await updateDoc(doc(db, FS_COLLECTIONS.leads, id), {
          status: bulkCrmStatus,
          pipelineStatus: counselorStatusToPipeline(bulkCrmStatus),
          ...leadTouchPatch(),
        })
        await commitAuditLog(db, {
          leadId: id,
          actionType: 'STATUS_CHANGE',
          description: `CRM/Kanban (hàng loạt): ${prev ? LEAD_COUNSELOR_STATUS_LABELS[prev.status] : '—'} → ${LEAD_COUNSELOR_STATUS_LABELS[bulkCrmStatus]}`,
          performedBy: profile.id,
          performedByName: performer,
        })
      }
      setBulkModal(null)
      setSelectedIds(new Set())
      pushToast('Đã cập nhật trạng thái CRM.')
    } catch (e) {
      console.error(e)
      pushToast('Lỗi khi đổi trạng thái.')
    } finally {
      setBulkBusy(false)
    }
  }, [db, profile, selectedIds, leads, bulkCrmStatus, pushToast])

  const exportBulkSelection = useCallback(() => {
    const rows = leads.filter((l) => selectedIds.has(l.id))
    exportSelectedEvaluatedLeadsToXlsx(rows, selectedIds, evalMapForExport(rows), {
      profileName: activeScoringProfile?.profileName ?? 'Mặc định',
    })
  }, [leads, selectedIds, evalMapForExport, activeScoringProfile])

  const onDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event
    if (!db || !canWrite || !profile) return
    const next = parseColId(over?.id as string | undefined)
    if (!next) return
    const leadId = String(active.id)
    const lead = leads.find((l) => l.id === leadId)
    if (!lead || lead.status === next) return
    try {
      const touch = leadTouchPatch()
      await updateDoc(doc(db, FS_COLLECTIONS.leads, leadId), {
        status: next,
        pipelineStatus: counselorStatusToPipeline(next),
        ...touch,
      })
      const performer = profile.displayName?.trim() || profile.email || profile.id
      await commitAuditLog(db, {
        leadId,
        actionType: 'STATUS_CHANGE',
        description: `Kanban: ${LEAD_COUNSELOR_STATUS_LABELS[lead.status]} → ${LEAD_COUNSELOR_STATUS_LABELS[next]}`,
        performedBy: profile.id,
        performedByName: performer,
      })
      pushToast(`Đã chuyển sang «${LEAD_COUNSELOR_STATUS_LABELS[next]}».`)
    } catch (e) {
      console.error(e)
      pushToast('Không thể cập nhật trạng thái.')
    }
  }

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
            Pipeline tư vấn
          </VietMyAccentHeading>
          <div className="mt-2 space-y-1 text-base leading-snug text-slate-600">
            <p>
              Bộ lọc khu vực / ngày / TVV (mở rộng dưới ô tìm) quyết định hồ sơ nào vào các cột CRM.
            </p>
            <p>
              Ô tìm kiếm chỉ thu hẹp thêm theo tên hoặc SĐT; kéo thả thẻ để đổi giai đoạn — đồng bộ Firestore.
            </p>
            {profile ? (
              <p className="text-sm text-slate-500">
                {USER_ROLE_LABELS[profile.role]} — {filtered.length}/{leads.length} sau lọc
                {hasMore ? ' · chưa tải hết danh sách' : ''}
              </p>
            ) : null}
          </div>
        </div>
        {hasMore ? (
          <button
            type="button"
            disabled={loadingMore}
            onClick={() => void loadMore()}
            className="shrink-0 rounded-xl border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-900 shadow-sm transition hover:bg-amber-100 disabled:opacity-50"
          >
            {loadingMore ? 'Đang tải…' : `Tải thêm (${LEADS_PAGE_SIZE} hồ sơ)`}
          </button>
        ) : null}
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
                    value={needle}
                    onChange={(e) => setNeedle(e.target.value)}
                    onFocus={() => setFiltersExpanded(true)}
                    placeholder="Tên hoặc SĐT…"
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
                Lọc khu vực · ngày · TVV
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
              <div className="mt-3 grid gap-3 border-t border-slate-200/80 pt-3 sm:grid-cols-2 lg:grid-cols-4">
                <label className="block text-xs font-medium text-slate-600">
                  Khu vực
                  <select
                    value={regionFilter}
                    onChange={(e) => setRegionFilter(e.target.value === 'ALL' ? 'ALL' : e.target.value)}
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
                  Thời điểm theo
                  <select
                    value={dateAxis}
                    onChange={(e) => setDateAxis(e.target.value as DateAxisFilter)}
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
                    onChange={(e) => setDateFrom(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-200/95 bg-white px-2.5 py-2 text-xs text-slate-900 outline-none transition focus:border-amber-400 focus:ring-2 focus:ring-amber-100"
                  />
                </label>
                <label className="block text-xs font-medium text-slate-600">
                  Đến ngày
                  <input
                    type="date"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-200/95 bg-white px-2.5 py-2 text-xs text-slate-900 outline-none transition focus:border-amber-400 focus:ring-2 focus:ring-amber-100"
                  />
                </label>
                <label className="block text-xs font-medium text-slate-600 sm:col-span-2 lg:col-span-2">
                  Tư vấn viên phụ trách
                  <select
                    value={counselorFilterUid}
                    onChange={(e) => setCounselorFilterUid(e.target.value)}
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
                      setRegionFilter('ALL')
                      setDateAxis('updated')
                      setDateFrom('')
                      setDateTo('')
                      setCounselorFilterUid('')
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
                onChange={(e) => setDueOnly(e.target.checked)}
                className="accent-amber-400"
              />
              Hạn hôm nay / quá hạn
            </label>
            <div className="flex items-center gap-2">
              <ThermometerSun className="h-3.5 w-3.5 shrink-0 text-slate-500" aria-hidden />
              <select
                value={tagFilter}
                onChange={(e) => setTagFilter(e.target.value as typeof tagFilter)}
                className="min-w-0 flex-1 rounded-xl border border-slate-200/95 bg-white px-2.5 py-2 text-xs font-medium text-slate-900 outline-none transition focus:border-amber-400 focus:ring-2 focus:ring-amber-100"
              >
                <option value="ALL">Mọi mức độ</option>
                <option value="HOT">Chỉ HOT</option>
                <option value="WARM">Chỉ WARM</option>
                <option value="COLD">Chỉ COLD</option>
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
              onClick={() => setMyDayFilter((f) => (f === 'followup' ? null : 'followup'))}
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
              onClick={() => setMyDayFilter((f) => (f === 'hot_sla' ? null : 'hot_sla'))}
              className={[
                'min-w-0 flex-1 rounded-xl border px-3 py-2 text-left text-xs font-medium transition sm:min-w-[12rem] sm:flex-none',
                myDayFilter === 'hot_sla'
                  ? 'border-rose-400 bg-rose-100 text-rose-950 shadow-sm'
                  : 'border-slate-200/95 bg-white/90 text-slate-800 hover:border-rose-300',
              ].join(' ')}
            >
              <span aria-hidden>⚠️</span>{' '}
              <span className="font-semibold">{hotSlaCount}</span> HOT cột Mới &gt;24h chưa chạm
            </button>
          </div>
        </div>
      </section>

      {error ? (
        <div className="rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-base text-rose-900 shadow-sm">
          {error}
        </div>
      ) : null}

      {!isFirebaseConfigured() || !db ? (
        <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-base text-amber-950 shadow-sm">
          Cấu hình Firebase để dùng pipeline.
        </div>
      ) : null}

      {loading ? (
        <div className="scroll-touch flex w-full min-w-0 gap-2 overflow-x-auto overscroll-x-contain pb-2 sm:gap-3">
          {LEAD_COUNSELOR_STATUS_ORDER.map((s) => (
            <div
              key={s}
              className="h-64 min-w-[10.5rem] flex-1 basis-0 animate-pulse rounded-2xl border border-slate-200/80 bg-white/60"
            />
          ))}
        </div>
      ) : (
        <DndContext sensors={sensors} onDragEnd={(e) => void onDragEnd(e)}>
          <div className="scroll-touch flex w-full min-w-0 gap-2 overflow-x-auto overscroll-x-contain pb-4 pt-1 sm:gap-3 md:gap-3">
            {LEAD_COUNSELOR_STATUS_ORDER.map((status) => (
              <KanbanColumn key={status} status={status} count={byStatus.get(status)?.length ?? 0}>
                {(byStatus.get(status) ?? []).map((lead) => (
                  <KanbanLeadCard
                    key={lead.id}
                    lead={lead}
                    priorityTag={scoreByLeadId.get(lead.id)?.priorityTag ?? lead.priorityTag}
                    onToast={pushToast}
                    canWrite={canWrite}
                    canInteract={canInteract}
                    selected={selectedIds.has(lead.id)}
                    onToggleSelect={toggleSelectId}
                  />
                ))}
              </KanbanColumn>
            ))}
          </div>
        </DndContext>
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
