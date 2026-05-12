import type { MouseEvent, ReactNode } from 'react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { motion } from 'motion/react'
import { Download, Info as InfoIcon, Sparkles, Upload, Wand2 } from 'lucide-react'
import { addDoc, collection, deleteField, doc, setDoc, Timestamp, updateDoc } from 'firebase/firestore'
import type {
  Lead,
  LeadCounselorStatus,
  LeadPipelineStatus,
  PriorityTag,
  ScoringProfile,
  VietMyUserProfile,
} from '../types'
import {
  FS_COLLECTIONS,
  LEAD_COUNSELOR_STATUS_LABELS,
  LEAD_COUNSELOR_STATUS_ORDER,
  RULE_CATEGORY_LABELS,
} from '../types'
import { getFirestoreDb, isFirebaseConfigured } from '../services/firebase'
import { LEADS_PAGE_SIZE, useLeads } from '../hooks/useLeads'
import { LEAD_AI_INSIGHT_AGGREGATE_ID, useLeadAiInsightTasks } from '../hooks/useLeadAiInsightTasks'
import { useInteractions } from '../hooks/useInteractions'
import { useConsultingPlaybooks } from '../hooks/useConsultingPlaybooks'
import { useAuth } from '../hooks/useAuth'
import { useLeadScoring } from '../hooks/useLeadScoring'
import { TagBadge } from '../components/TagBadge'
import { playbooksMatchingLead } from '../utils/playbookMatch'
import { evaluateLead, leadToEvaluationRecord } from '../utils/scoring'
import {
  exportEvaluatedLeadsToXlsx,
  exportSelectedEvaluatedLeadsToXlsx,
} from '../utils/exportEvaluatedLeads'
import { loadAIConfigFromStorage, runAIAnalysis } from '../utils/aiEngine'
import { buildInstitutionalRagBlock } from '../utils/knowledgeRag'
import { resolveMlWinDisplay } from '../utils/mlWinMock'
import { useKnowledgeDocuments } from '../hooks/useKnowledgeDocuments'
import { useAITasks } from '../hooks/useAITasks'
import { MlWinGauge } from '../components/MlWinGauge'
import { useScriptSnippets } from '../hooks/useScriptSnippets'
import { ConsultingAssistantPanel } from '../components/ConsultingAssistantPanel'
import { BulkLeadActionBar } from '../components/bulk/BulkLeadActionBar'
import { LeadAuditTimeline } from '../components/LeadAuditTimeline'
import { useAuditLogs } from '../hooks/useAuditLogs'
import { useCounselorDirectory } from '../hooks/useCounselorDirectory'
import { commitAuditLog } from '../services/auditLog'
import { leadTouchPatch } from '../utils/leadTouch'
import { counselorStatusToPipeline } from '../utils/leadIdentity'
import { formatStaffDirectoryLabel } from '../utils/counselorDisplay'
import { VietMyAccentHeading } from '../components/VietMyAccentHeading'

const PIPELINE_LABEL: Record<LeadPipelineStatus, string> = {
  NEW: 'Mới',
  CONTACTED: 'Đã liên hệ',
  QUALIFIED: 'Đủ điều kiện',
  APPLIED: 'Đã nộp hồ sơ',
  ENROLLED: 'Đã ghi danh',
  LOST: 'Không còn tiềm năng',
  ARCHIVED: 'Lưu trữ',
}

const TAG_OPTIONS: PriorityTag[] = ['HOT', 'WARM', 'COLD', 'LOSS']

const EVALUATION_TAGS = [
  'Tích cực',
  'Cần follow-up',
  'Vấn đề tài chính',
  'Chưa quyết định',
  'Quan tâm cao',
] as const

function isElevatedForAdminFilters(role: string | undefined): boolean {
  return role === 'admin' || role === 'head_of_department' || role === 'head_of_profession'
}

type AdminDateField = 'created' | 'updated' | 'imported'

function parseIsoDayStartMs(iso: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso.trim())) return null
  const t = new Date(`${iso.trim()}T00:00:00`).getTime()
  return Number.isFinite(t) ? t : null
}

function parseIsoDayEndMs(iso: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso.trim())) return null
  const t = new Date(`${iso.trim()}T23:59:59.999`).getTime()
  return Number.isFinite(t) ? t : null
}

function leadMillisForDateFilter(l: Lead, field: AdminDateField): number {
  const ts =
    field === 'imported' ? (l.importedAt ?? l.createdAt) : field === 'updated' ? l.updatedAt : l.createdAt
  return ts.toMillis()
}

function formatAssignedCounselorLabel(l: Lead, names: Map<string, string>): string {
  const uid = l.assignedTo ?? l.assignedCounselorId
  if (!uid) return '—'
  return names.get(uid) ?? `${uid.slice(0, 8)}…`
}

/** Rút gọn ghi chú / mô tả trên bảng — bản đầy đủ trong `title` ô hoặc trong panel chi tiết. */
function formatDescPreview(raw: string, max = 52): string {
  const t = raw.replace(/\s+/g, ' ').trim()
  if (!t) return '—'
  return t.length <= max ? t : `${t.slice(0, max).trim()}…`
}

export function LeadManagement() {
  const db = getFirestoreDb()
  const configured = isFirebaseConfigured()
  const { leads, loading, loadingMore, hasMore, loadMore, error } = useLeads()
  const { profile, can } = useAuth()
  const { users: directoryUsers, counselors: counselorUsers, loading: counselorsLoading } = useCounselorDirectory()
  const { documents: knowledgeDocuments } = useKnowledgeDocuments()
  const institutionalRagBlock = useMemo(
    () => buildInstitutionalRagBlock(knowledgeDocuments),
    [knowledgeDocuments],
  )
  const {
    scoringProfiles,
    profilesLoading,
    setScoringProfileId,
    resolvedScoringProfileId,
    activeScoringProfile,
    scoreByLeadId,
  } = useLeadScoring(leads)
  const {
    snippets: scriptSnippets,
    loading: scriptSnippetsLoading,
    error: scriptSnippetsErr,
  } = useScriptSnippets()

  const [searchParams, setSearchParams] = useSearchParams()
  const urlQuery = (searchParams.get('q') ?? '').trim().toLowerCase()

  const [sortKey, setSortKey] = useState<
    | 'none'
    | 'fullName'
    | 'phone'
    | 'educationLevel'
    | 'province'
    | 'score'
    | 'mlWin'
    | 'priorityTag'
    | 'pipelineStatus'
  >('none')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')

  const showAdminGlobalFilters = isElevatedForAdminFilters(profile?.role)
  const [adminUploaderIds, setAdminUploaderIds] = useState<string[]>([])
  const [adminRegions, setAdminRegions] = useState<string[]>([])
  const [adminTags, setAdminTags] = useState<PriorityTag[]>([])
  const [adminSchools, setAdminSchools] = useState<string[]>([])
  const [adminDateField, setAdminDateField] = useState<AdminDateField>('created')
  const [adminDateFrom, setAdminDateFrom] = useState('')
  const [adminDateTo, setAdminDateTo] = useState('')
  const [adminAssignedCounselorIds, setAdminAssignedCounselorIds] = useState<string[]>([])
  const [inspectProfileOpen, setInspectProfileOpen] = useState(false)

  const uploaderOptions = useMemo(() => {
    const m = new Map<string, string>()
    for (const l of leads) {
      if (l.uploadedBy) m.set(l.uploadedBy, (l.uploaderName || l.uploadedBy).trim())
    }
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1], 'vi'))
  }, [leads])

  const schoolOptions = useMemo(() => {
    const s = new Set<string>()
    for (const l of leads) {
      const n = (l.highSchool ?? '').trim()
      if (n) s.add(n)
    }
    return [...s].sort((a, b) => a.localeCompare(b, 'vi'))
  }, [leads])

  const regionOptionsAdmin = useMemo(() => {
    const s = new Set<string>()
    for (const l of leads) {
      if (l.province.trim()) s.add(l.province.trim())
    }
    return [...s].sort((a, b) => a.localeCompare(b, 'vi'))
  }, [leads])

  const counselorDirectoryLabelById = useMemo(() => {
    const m = new Map<string, string>()
    for (const c of directoryUsers) {
      if (c.isActive) m.set(c.id, formatStaffDirectoryLabel(c))
    }
    return m
  }, [directoryUsers])

  const reassignPickList = useMemo(() => {
    const base = counselorUsers
    const elevated = isElevatedForAdminFilters(profile?.role)
    if (!elevated) return base
    const extras = directoryUsers.filter(
      (u) => u.isActive && u.role === 'admin' && !base.some((c) => c.id === u.id),
    )
    return [...base, ...extras].sort((a, b) =>
      formatStaffDirectoryLabel(a).localeCompare(formatStaffDirectoryLabel(b), 'vi'),
    )
  }, [counselorUsers, directoryUsers, profile?.role])

  const leadsAfterAdmin = useMemo(() => {
    if (!showAdminGlobalFilters) return leads
    let xs = leads
    if (adminUploaderIds.length) {
      xs = xs.filter((l) => Boolean(l.uploadedBy && adminUploaderIds.includes(l.uploadedBy)))
    }
    if (adminRegions.length) {
      xs = xs.filter((l) => {
        const r = l.province.trim()
        return adminRegions.some((reg) => reg === r)
      })
    }
    if (adminTags.length) {
      xs = xs.filter((l) => {
        const tag = activeScoringProfile
          ? (scoreByLeadId.get(l.id)?.priorityTag ?? l.priorityTag)
          : l.priorityTag
        return adminTags.includes(tag)
      })
    }
    if (adminSchools.length) {
      xs = xs.filter((l) => {
        const sc = (l.highSchool ?? '').trim()
        return Boolean(sc && adminSchools.includes(sc))
      })
    }
    if (adminAssignedCounselorIds.length) {
      xs = xs.filter((l) => {
        const uid = l.assignedTo ?? l.assignedCounselorId
        return Boolean(uid && adminAssignedCounselorIds.includes(uid))
      })
    }
    const fromMs = adminDateFrom ? parseIsoDayStartMs(adminDateFrom) : null
    const toMs = adminDateTo ? parseIsoDayEndMs(adminDateTo) : null
    if (fromMs != null || toMs != null) {
      xs = xs.filter((l) => {
        const ms = leadMillisForDateFilter(l, adminDateField)
        if (fromMs != null && ms < fromMs) return false
        if (toMs != null && ms > toMs) return false
        return true
      })
    }
    return xs
  }, [
    leads,
    showAdminGlobalFilters,
    adminUploaderIds,
    adminRegions,
    adminTags,
    adminSchools,
    adminAssignedCounselorIds,
    adminDateField,
    adminDateFrom,
    adminDateTo,
    activeScoringProfile,
    scoreByLeadId,
  ])

  const [tagFilter, setTagFilter] = useState<string>('ALL')
  const [regionFilter, setRegionFilter] = useState<string>('ALL')
  const [majorFilter, setMajorFilter] = useState<string>('ALL')
  const [statusFilter, setStatusFilter] = useState<string>('ALL')
  const [crmStatusFilter, setCrmStatusFilter] = useState<string>('ALL')
  const [sourceFilter, setSourceFilter] = useState<string>('ALL')
  const [scoreMinInput, setScoreMinInput] = useState('')
  const [scoreMaxInput, setScoreMaxInput] = useState('')
  const [tablePage, setTablePage] = useState(1)
  const [selected, setSelected] = useState<Lead | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())
  const [bulkModal, setBulkModal] = useState<null | 'reassign' | 'crm'>(null)
  const [bulkReassignUid, setBulkReassignUid] = useState<string>('')
  const [bulkCrmStatus, setBulkCrmStatus] = useState<LeadCounselorStatus>('NEW')
  const [bulkBusy, setBulkBusy] = useState(false)

  const isElevatedLeadScope = isElevatedForAdminFilters(profile?.role)
  const canPeerReassignLeads = Boolean(can('leads:reassign:peer'))
  const showBulkReassign = isElevatedLeadScope || canPeerReassignLeads
  const canBulkWrite = Boolean(can('leads:write:self_assigned') || showBulkReassign)

  const regions = useMemo(() => {
    const s = new Set<string>()
    for (const l of leadsAfterAdmin) {
      if (l.province.trim()) s.add(l.province.trim())
    }
    return [...s].sort()
  }, [leadsAfterAdmin])

  const majors = useMemo(() => {
    const s = new Set<string>()
    for (const l of leadsAfterAdmin) {
      if (l.educationLevel.trim()) s.add(l.educationLevel.trim())
    }
    return [...s].sort()
  }, [leadsAfterAdmin])

  const sources = useMemo(() => {
    const s = new Set<string>()
    for (const l of leadsAfterAdmin) {
      const src = (l.source ?? '').trim()
      if (src) s.add(src)
    }
    return [...s].sort((a, b) => a.localeCompare(b, 'vi'))
  }, [leadsAfterAdmin])

  const filtered = useMemo(() => {
    const minScore =
      scoreMinInput.trim() === '' || Number.isNaN(Number(scoreMinInput)) ? null : Number(scoreMinInput)
    const maxScore =
      scoreMaxInput.trim() === '' || Number.isNaN(Number(scoreMaxInput)) ? null : Number(scoreMaxInput)
    return leadsAfterAdmin.filter((l) => {
      const displayTag = activeScoringProfile
        ? (scoreByLeadId.get(l.id)?.priorityTag ?? l.priorityTag)
        : l.priorityTag
      const displayScore = activeScoringProfile
        ? (scoreByLeadId.get(l.id)?.calculatedScore ?? l.calculatedScore)
        : l.calculatedScore
      if (tagFilter !== 'ALL' && displayTag !== tagFilter) return false
      if (statusFilter !== 'ALL' && l.pipelineStatus !== statusFilter) return false
      if (crmStatusFilter !== 'ALL' && l.status !== crmStatusFilter) return false
      if (regionFilter !== 'ALL' && l.province.trim() !== regionFilter) return false
      if (majorFilter !== 'ALL' && l.educationLevel.trim() !== majorFilter) return false
      if (sourceFilter !== 'ALL' && (l.source ?? '').trim() !== sourceFilter) return false
      if (minScore != null && displayScore < minScore) return false
      if (maxScore != null && displayScore > maxScore) return false
      if (urlQuery) {
        const q = urlQuery
        const name = (l.fullName ?? '').toLowerCase()
        const phone = (l.phone ?? '').toLowerCase()
        const email = (l.customerId ?? '').toLowerCase()
        const parent = (l.parentPhone ?? '').toLowerCase()
        const major = (l.educationLevel ?? '').toLowerCase()
        const reg = (l.province ?? '').toLowerCase()
        const school = (l.highSchool ?? '').toLowerCase()
        const addr = (l.address ?? '').toLowerCase()
        const src = (l.source ?? '').toLowerCase()
        const desc = (l.description ?? '').toLowerCase()
        const uid = l.assignedTo ?? l.assignedCounselorId
        const tv = uid ? (counselorDirectoryLabelById.get(uid) ?? '').toLowerCase() : ''
        const uploadLbl = l.uploadedBy
          ? (counselorDirectoryLabelById.get(l.uploadedBy) ?? (l.uploaderName ?? '')).toLowerCase()
          : (l.uploaderName ?? '').toLowerCase()
        const hay = `${name} ${phone} ${email} ${parent} ${major} ${reg} ${school} ${addr} ${src} ${desc} ${tv} ${uploadLbl}`
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [
    leadsAfterAdmin,
    tagFilter,
    statusFilter,
    crmStatusFilter,
    regionFilter,
    majorFilter,
    sourceFilter,
    scoreMinInput,
    scoreMaxInput,
    activeScoringProfile,
    scoreByLeadId,
    urlQuery,
    counselorDirectoryLabelById,
  ])

  const sortedFiltered = useMemo(() => {
    const rows = [...filtered]
    if (sortKey === 'none') return rows
    const dir = sortDir === 'asc' ? 1 : -1
    const scoreOf = (l: Lead) =>
      activeScoringProfile
        ? (scoreByLeadId.get(l.id)?.calculatedScore ?? l.calculatedScore)
        : l.calculatedScore
    const tagOf = (l: Lead) =>
      activeScoringProfile ? (scoreByLeadId.get(l.id)?.priorityTag ?? l.priorityTag) : l.priorityTag
    const mlOf = (l: Lead) => resolveMlWinDisplay(l).mlWinProbability
    rows.sort((a, b) => {
      switch (sortKey) {
        case 'fullName':
          return (a.fullName || '').localeCompare(b.fullName || '', 'vi') * dir
        case 'phone':
          return (a.phone || '').localeCompare(b.phone || '', 'vi') * dir
        case 'educationLevel':
          return (a.educationLevel || '').localeCompare(b.educationLevel || '', 'vi') * dir
        case 'province':
          return (a.province || '').localeCompare(b.province || '', 'vi') * dir
        case 'score':
          return (scoreOf(a) - scoreOf(b)) * dir
        case 'mlWin':
          return (mlOf(a) - mlOf(b)) * dir
        case 'priorityTag':
          return String(tagOf(a)).localeCompare(String(tagOf(b))) * dir
        case 'pipelineStatus':
          return String(a.pipelineStatus).localeCompare(String(b.pipelineStatus)) * dir
        default:
          return 0
      }
    })
    return rows
  }, [filtered, sortKey, sortDir, activeScoringProfile, scoreByLeadId])

  const totalTablePages = Math.max(1, Math.ceil(sortedFiltered.length / LEADS_PAGE_SIZE))

  useEffect(() => {
    setTablePage(1)
  }, [
    tagFilter,
    regionFilter,
    majorFilter,
    statusFilter,
    crmStatusFilter,
    sourceFilter,
    scoreMinInput,
    scoreMaxInput,
    urlQuery,
    sortKey,
    sortDir,
    adminUploaderIds,
    adminRegions,
    adminTags,
    adminSchools,
    adminAssignedCounselorIds,
    adminDateFrom,
    adminDateTo,
    adminDateField,
  ])

  useEffect(() => {
    setTablePage((p) => Math.min(p, totalTablePages))
  }, [totalTablePages])

  const pagedRows = useMemo(
    () => sortedFiltered.slice((tablePage - 1) * LEADS_PAGE_SIZE, tablePage * LEADS_PAGE_SIZE),
    [sortedFiltered, tablePage],
  )

  const listStats = useMemo(() => {
    let hot = 0
    let warm = 0
    let cold = 0
    let loss = 0
    for (const l of sortedFiltered) {
      const tag = activeScoringProfile
        ? (scoreByLeadId.get(l.id)?.priorityTag ?? l.priorityTag)
        : l.priorityTag
      if (tag === 'HOT') hot++
      else if (tag === 'WARM') warm++
      else if (tag === 'COLD') cold++
      else if (tag === 'LOSS') loss++
    }
    return { hot, warm, cold, loss }
  }, [sortedFiltered, activeScoringProfile, scoreByLeadId])

  const toggleSort = (k: typeof sortKey) => {
    if (k === 'none') return
    if (sortKey !== k) {
      setSortKey(k)
      setSortDir('asc')
    } else {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    }
  }

  const setUrlQuery = (raw: string) => {
    const next = new URLSearchParams(searchParams)
    const t = raw.trim()
    if (t) next.set('q', t)
    else next.delete('q')
    setSearchParams(next, { replace: true })
  }

  const clearQuickFilters = useCallback(() => {
    setTagFilter('ALL')
    setRegionFilter('ALL')
    setMajorFilter('ALL')
    setStatusFilter('ALL')
    setCrmStatusFilter('ALL')
    setSourceFilter('ALL')
    setScoreMinInput('')
    setScoreMaxInput('')
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        next.delete('q')
        return next
      },
      { replace: true },
    )
    setTablePage(1)
  }, [setSearchParams])

  const handleExportEvaluated = () => {
    const m = new Map<string, { calculatedScore: number; priorityTag: PriorityTag }>()
    for (const l of sortedFiltered) {
      const ev = activeScoringProfile
        ? scoreByLeadId.get(l.id) ?? evaluateLead(leadToEvaluationRecord(l), activeScoringProfile)
        : { calculatedScore: l.calculatedScore, priorityTag: l.priorityTag }
      m.set(l.id, ev)
    }
    exportEvaluatedLeadsToXlsx(sortedFiltered, m, {
      profileName: activeScoringProfile?.profileName ?? 'Mặc định',
    })
  }

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

  const toggleSelectId = useCallback((id: string, e?: MouseEvent) => {
    e?.stopPropagation()
    setSelectedIds((prev) => {
      const n = new Set(prev)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  }, [])

  const allVisibleSelected =
    pagedRows.length > 0 && pagedRows.every((l) => selectedIds.has(l.id))
  const toggleSelectAllVisible = useCallback(() => {
    setSelectedIds((prev) => {
      const allPage = pagedRows.length > 0 && pagedRows.every((l) => prev.has(l.id))
      if (allPage) {
        const n = new Set(prev)
        for (const l of pagedRows) n.delete(l.id)
        return n
      }
      const n = new Set(prev)
      for (const l of pagedRows) n.add(l.id)
      return n
    })
  }, [pagedRows])

  const applyBulkReassign = useCallback(async () => {
    if (!db || !profile || !bulkReassignUid || !selectedIds.size) return
    if (!isElevatedLeadScope && canPeerReassignLeads) {
      for (const id of selectedIds) {
        const row = leads.find((x) => x.id === id)
        const owner = row?.assignedTo ?? row?.assignedCounselorId
        if (owner !== profile.id) {
          window.alert(
            'Chỉ có thể «Giao việc hàng loạt» cho các hồ sơ đang gán cho bạn. Bỏ chọn hồ sơ của đồng nghiệp hoặc liên hệ Admin/Trưởng.',
          )
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
        await updateDoc(ref, {
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
    } catch (e) {
      console.error(e)
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
        const ref = doc(db, FS_COLLECTIONS.leads, id)
        await updateDoc(ref, {
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
    } catch (e) {
      console.error(e)
    } finally {
      setBulkBusy(false)
    }
  }, [db, profile, selectedIds, leads, bulkCrmStatus])

  const exportBulkSelection = useCallback(() => {
    const rows = leads.filter((l) => selectedIds.has(l.id))
    exportSelectedEvaluatedLeadsToXlsx(rows, selectedIds, evalMapForExport(rows), {
      profileName: activeScoringProfile?.profileName ?? 'Mặc định',
    })
  }, [leads, selectedIds, evalMapForExport, activeScoringProfile])

  return (
    <div className="space-y-3">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <VietMyAccentHeading as="h1" tone="onLight" size="xl" className="block">
            Quản lý hồ sơ
          </VietMyAccentHeading>
          {canBulkWrite ? (
            <p className="mt-1 max-w-3xl text-sm text-slate-600">
              Điều chuyển phụ trách: chọn một hoặc nhiều hồ sơ (ô đầu dòng trong bảng), bấm «Giao việc hàng loạt»; hoặc
              mở chi tiết hồ sơ và dùng khối «Phân công &amp; CRM».
            </p>
          ) : null}
        </div>
        {!configured || !db ? (
          <span className="rounded-full border border-amber-300/70 bg-amber-50 px-3 py-1 text-xs text-amber-900">
            Firebase chưa cấu hình.
          </span>
        ) : null}
      </header>

      {error ? (
        <div className="rounded-xl border border-rose-300 bg-rose-50 px-3 py-2 text-base text-rose-900 shadow-sm backdrop-blur-xl">
          {error}
        </div>
      ) : null}

      {showAdminGlobalFilters ? (
        <details className="app-card-glass group shadow-md open:shadow-lg">
          <summary className="cursor-pointer list-none px-3 py-2 md:px-4 [&::-webkit-details-marker]:hidden">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="rounded-md bg-amber-100 px-2 py-0.5 text-xs font-bold uppercase tracking-wider text-amber-900">
                  Admin
                </span>
                <span className="text-sm font-semibold text-slate-800">Lọc theo ngày, TVV, người tải, vùng…</span>
                <span className="text-slate-400 transition group-open:rotate-90">›</span>
              </div>
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault()
                  setAdminUploaderIds([])
                  setAdminRegions([])
                  setAdminTags([])
                  setAdminSchools([])
                  setAdminAssignedCounselorIds([])
                  setAdminDateFrom('')
                  setAdminDateTo('')
                  setAdminDateField('created')
                }}
                className="rounded-full border border-slate-200 bg-white/90 px-3 py-1 text-xs font-medium text-slate-700 shadow-sm transition hover:border-amber-300 hover:bg-amber-50"
              >
                Xóa lọc admin
              </button>
            </div>
          </summary>
          <div className="border-t border-slate-200/80 px-4 pb-4 pt-2 md:px-5 md:pb-5">
            <div className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200/60 bg-white/40 p-3">
              <label className="flex flex-col text-xs font-medium text-slate-600">
                Mốc thời gian
                <select
                  value={adminDateField}
                  onChange={(e) => setAdminDateField(e.target.value as AdminDateField)}
                  className="mt-1 min-w-[9rem] rounded-lg border border-slate-200/95 bg-white px-2 py-1.5 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-amber-200"
                >
                  <option value="created">Ngày tạo</option>
                  <option value="updated">Cập nhật gần nhất</option>
                  <option value="imported">Ngày nhập (import)</option>
                </select>
              </label>
              <label className="flex flex-col text-xs font-medium text-slate-600">
                Từ ngày
                <input
                  type="date"
                  value={adminDateFrom}
                  onChange={(e) => setAdminDateFrom(e.target.value)}
                  className="mt-1 rounded-lg border border-slate-200/95 bg-white px-2 py-1.5 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-amber-200"
                />
              </label>
              <label className="flex flex-col text-xs font-medium text-slate-600">
                Đến ngày
                <input
                  type="date"
                  value={adminDateTo}
                  onChange={(e) => setAdminDateTo(e.target.value)}
                  className="mt-1 rounded-lg border border-slate-200/95 bg-white px-2 py-1.5 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-amber-200"
                />
              </label>
            </div>
            <div className="mt-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Tư vấn viên được gán</p>
              <div className="mt-1.5 flex max-h-24 flex-wrap gap-1.5 overflow-y-auto pr-1">
                {counselorUsers.length ? (
                  counselorUsers.map((c) => {
                    const on = adminAssignedCounselorIds.includes(c.id)
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() =>
                          setAdminAssignedCounselorIds((prev) =>
                            prev.includes(c.id) ? prev.filter((x) => x !== c.id) : [...prev, c.id],
                          )
                        }
                        className={[
                          'max-w-[11rem] truncate rounded-full border px-2.5 py-1 text-xs transition',
                          on
                            ? 'border-violet-400 bg-violet-100 text-violet-950 shadow-sm'
                            : 'border-slate-200 bg-white/90 text-slate-700 hover:border-violet-200',
                        ].join(' ')}
                        title={formatStaffDirectoryLabel(c)}
                      >
                        {formatStaffDirectoryLabel(c)}
                      </button>
                    )
                  })
                ) : (
                  <p className="text-xs text-slate-500">
                    {counselorsLoading ? 'Đang tải danh bạ TVV…' : 'Chưa có tài khoản counselor trong hệ thống.'}
                  </p>
                )}
              </div>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Người tải</p>
                <div className="mt-1.5 flex max-h-24 flex-wrap gap-1.5 overflow-y-auto">
                  {uploaderOptions.length ? (
                    uploaderOptions.map(([uid, label]) => {
                      const on = adminUploaderIds.includes(uid)
                      return (
                        <button
                          key={uid}
                          type="button"
                          onClick={() =>
                            setAdminUploaderIds((prev) =>
                              prev.includes(uid) ? prev.filter((x) => x !== uid) : [...prev, uid],
                            )
                          }
                          className={[
                            'max-w-[10rem] truncate rounded-full border px-2 py-1 text-xs transition',
                            on
                              ? 'border-amber-400 bg-amber-100 text-amber-900'
                              : 'border-slate-200 bg-white/90 text-slate-700 hover:border-amber-200',
                          ].join(' ')}
                        >
                          {label}
                        </button>
                      )
                    })
                  ) : (
                    <p className="text-xs text-slate-500">Chưa có dữ liệu người tải.</p>
                  )}
                </div>
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Vùng / tỉnh</p>
                <div className="mt-1.5 flex max-h-24 flex-wrap gap-1.5 overflow-y-auto">
                  {regionOptionsAdmin.map((reg) => {
                    const on = adminRegions.includes(reg)
                    return (
                      <button
                        key={reg}
                        type="button"
                        onClick={() =>
                          setAdminRegions((prev) =>
                            prev.includes(reg) ? prev.filter((x) => x !== reg) : [...prev, reg],
                          )
                        }
                        className={[
                          'max-w-[8rem] truncate rounded-full border px-2 py-1 text-xs transition',
                          on
                            ? 'border-fuchsia-400 bg-fuchsia-100 text-fuchsia-900'
                            : 'border-slate-200 bg-white/90 text-slate-600 hover:border-fuchsia-200',
                        ].join(' ')}
                        title={reg}
                      >
                        {reg}
                      </button>
                    )
                  })}
                </div>
              </div>
              <div className="min-w-0 sm:col-span-2 xl:col-span-1">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Nhãn (profile)</p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {TAG_OPTIONS.map((tg) => {
                    const on = adminTags.includes(tg)
                    return (
                      <button
                        key={tg}
                        type="button"
                        onClick={() =>
                          setAdminTags((prev) => (prev.includes(tg) ? prev.filter((x) => x !== tg) : [...prev, tg]))
                        }
                        className={[
                          'rounded-full border px-2.5 py-1 text-xs font-semibold transition',
                          on
                            ? 'border-amber-400 bg-amber-100 text-amber-900'
                            : 'border-slate-200 bg-white/90 text-slate-600 hover:border-amber-200',
                        ].join(' ')}
                      >
                        {tg}
                      </button>
                    )
                  })}
                </div>
              </div>
              <div className="min-w-0 sm:col-span-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Trường THPT</p>
                <div className="mt-1.5 flex max-h-24 flex-wrap gap-1.5 overflow-y-auto">
                  {schoolOptions.slice(0, 36).map((sc) => {
                    const on = adminSchools.includes(sc)
                    return (
                      <button
                        key={sc}
                        type="button"
                        onClick={() =>
                          setAdminSchools((prev) =>
                            prev.includes(sc) ? prev.filter((x) => x !== sc) : [...prev, sc],
                          )
                        }
                        className={[
                          'max-w-[10rem] truncate rounded-full border px-2 py-1 text-xs transition',
                          on
                            ? 'border-emerald-400 bg-emerald-100 text-emerald-900'
                            : 'border-slate-200 bg-white/90 text-slate-600 hover:border-emerald-200',
                        ].join(' ')}
                        title={sc}
                      >
                        {sc}
                      </button>
                    )
                  })}
                  {schoolOptions.length > 36 ? (
                    <span className="self-center text-xs text-slate-500">+{schoolOptions.length - 36}…</span>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        </details>
      ) : null}

      <section className="app-card-glass-strong space-y-2 p-2 shadow-md sm:p-3">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-end lg:gap-3">
          <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-end">
            <label className="min-w-0 flex-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">
              Bộ chấm điểm
              <div className="relative mt-0.5">
                <select
                  value={resolvedScoringProfileId ?? ''}
                  disabled={!scoringProfiles.length || profilesLoading}
                  onChange={(e) => setScoringProfileId(e.target.value || null)}
                  className="w-full appearance-none rounded-lg border border-slate-200/95 bg-white/95 py-1.5 pl-2 pr-7 text-xs font-medium text-slate-900 shadow-inner outline-none transition focus:border-amber-400 focus:ring-1 focus:ring-amber-100 disabled:opacity-50 sm:min-w-[12rem]"
                >
                  {!scoringProfiles.length ? (
                    <option value="">Chưa có profile — Cấu hình</option>
                  ) : null}
                  {scoringProfiles.map((p) => (
                    <option key={p.id} value={p.id} className="bg-white text-slate-900">
                      {p.profileName} · HOT≥{p.thresholds?.hotMinScore ?? '—'} · WARM≥{p.thresholds?.warmMinScore ?? '—'}
                    </option>
                  ))}
                </select>
                <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-slate-500">
                  ▾
                </span>
              </div>
            </label>
            <div className="flex shrink-0 flex-wrap items-center gap-1.5">
              <button
                type="button"
                disabled={!activeScoringProfile}
                onClick={() => setInspectProfileOpen(true)}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200/95 bg-white px-2 py-1.5 text-[11px] font-medium text-slate-800 shadow-sm transition hover:border-amber-300 hover:bg-amber-50/80 disabled:opacity-40"
              >
                <InfoIcon className="h-3.5 w-3.5 shrink-0" aria-hidden />
                Quy tắc
              </button>
              <button
                type="button"
                disabled={!sortedFiltered.length}
                onClick={handleExportEvaluated}
                className="inline-flex items-center gap-1 rounded-lg border border-emerald-300 bg-emerald-50 px-2 py-1.5 text-[11px] font-semibold text-emerald-900 shadow-sm transition hover:border-emerald-400 hover:bg-emerald-100 disabled:opacity-40"
              >
                <Download className="h-3.5 w-3.5 shrink-0" aria-hidden />
                Xuất Excel
              </button>
              {can('data:intake') ? (
                <Link
                  to="/import"
                  className="inline-flex items-center gap-1 rounded-lg border border-violet-500 bg-violet-600 px-2.5 py-1.5 text-[11px] font-semibold text-white shadow-sm transition hover:bg-violet-700"
                >
                  <Upload className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  Nhập Excel
                </Link>
              ) : null}
            </div>
          </div>
          <label className="min-w-0 w-full text-[10px] font-bold uppercase tracking-wide text-slate-500 lg:max-w-md lg:flex-1">
            Tìm kiếm
            <input
              value={searchParams.get('q') ?? ''}
              onChange={(e) => setUrlQuery(e.target.value)}
              placeholder="Tên, SĐT, email, TVV…"
              className="mt-0.5 w-full rounded-lg border border-slate-200/95 bg-white px-2.5 py-1.5 text-sm text-slate-900 outline-none transition focus:border-amber-400 focus:ring-1 focus:ring-amber-100"
            />
          </label>
        </div>

        <div className="flex flex-nowrap items-end gap-1.5 overflow-x-auto pb-0.5 pt-1 [scrollbar-width:thin]">
          <FilterSelect
            compact
            label="Nhãn"
            value={tagFilter}
            onChange={setTagFilter}
            options={[
              { v: 'ALL', t: 'Tất cả' },
              ...TAG_OPTIONS.map((t) => ({ v: t, t })),
            ]}
          />
          <FilterSelect
            compact
            label="Vùng"
            value={regionFilter}
            onChange={setRegionFilter}
            options={[
              { v: 'ALL', t: 'Tất cả' },
              ...regions.map((p) => ({ v: p, t: p })),
            ]}
          />
          <FilterSelect
            compact
            label="Hệ ĐT"
            value={majorFilter}
            onChange={setMajorFilter}
            options={[
              { v: 'ALL', t: 'Tất cả' },
              ...majors.map((p) => ({ v: p, t: p })),
            ]}
          />
          <FilterSelect
            compact
            label="Pipeline"
            value={statusFilter}
            onChange={setStatusFilter}
            options={[
              { v: 'ALL', t: 'Tất cả' },
              ...(Object.keys(PIPELINE_LABEL) as LeadPipelineStatus[]).map((k) => ({
                v: k,
                t: PIPELINE_LABEL[k],
              })),
            ]}
          />
          <FilterSelect
            compact
            label="CRM"
            value={crmStatusFilter}
            onChange={setCrmStatusFilter}
            options={[
              { v: 'ALL', t: 'Tất cả' },
              ...LEAD_COUNSELOR_STATUS_ORDER.map((k) => ({ v: k, t: LEAD_COUNSELOR_STATUS_LABELS[k] })),
            ]}
          />
        </div>

        <div className="flex flex-wrap items-end gap-2 border-t border-slate-200/70 pt-2">
          <FilterSelect
            compact
            label="Nguồn"
            value={sourceFilter}
            onChange={setSourceFilter}
            options={[{ v: 'ALL', t: 'Tất cả' }, ...sources.map((s) => ({ v: s, t: s }))]}
          />
          <label className="flex flex-col text-[10px] font-bold uppercase tracking-wide text-slate-500">
            Điểm từ
            <input
              type="number"
              inputMode="numeric"
              placeholder="—"
              value={scoreMinInput}
              onChange={(e) => setScoreMinInput(e.target.value)}
              className="mt-0.5 w-[5.5rem] rounded-lg border border-slate-200/95 bg-white px-2 py-1.5 text-sm text-slate-900 outline-none transition focus:border-amber-400 focus:ring-1 focus:ring-amber-100"
            />
          </label>
          <label className="flex flex-col text-[10px] font-bold uppercase tracking-wide text-slate-500">
            Điểm đến
            <input
              type="number"
              inputMode="numeric"
              placeholder="—"
              value={scoreMaxInput}
              onChange={(e) => setScoreMaxInput(e.target.value)}
              className="mt-0.5 w-[5.5rem] rounded-lg border border-slate-200/95 bg-white px-2 py-1.5 text-sm text-slate-900 outline-none transition focus:border-amber-400 focus:ring-1 focus:ring-amber-100"
            />
          </label>
          <button
            type="button"
            onClick={clearQuickFilters}
            className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 shadow-sm transition hover:border-rose-300 hover:bg-rose-50 hover:text-rose-900"
          >
            Xóa lọc nhanh
          </button>
        </div>

        <div className="flex flex-col gap-1.5 rounded-md border border-slate-200/70 bg-white/60 px-2 py-1.5 text-[11px] leading-snug text-slate-600 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-0.5">
            <span>
              <span className="font-semibold text-slate-800">{leads.length}</span> đã tải
              {hasMore ? <span className="text-slate-500"> · tối đa {LEADS_PAGE_SIZE}/lần</span> : null}
            </span>
            {showAdminGlobalFilters ? (
              <span className="text-slate-500">
                Admin: <span className="font-semibold text-slate-800">{leadsAfterAdmin.length}</span>
              </span>
            ) : null}
            <span>
              Sau lọc: <span className="font-semibold text-slate-800">{sortedFiltered.length}</span>
              {sortedFiltered.length > 0 ? (
                <>
                  {' '}
                  · Trang <span className="font-semibold text-slate-800">{tablePage}</span>/
                  <span className="font-semibold text-slate-800">{totalTablePages}</span> (
                  {LEADS_PAGE_SIZE}/trang)
                </>
              ) : null}
            </span>
            <span className="text-rose-700">HOT {listStats.hot}</span>
            <span className="text-amber-800">WARM {listStats.warm}</span>
            <span className="text-slate-500">COLD {listStats.cold}</span>
            <span className="text-slate-600">LOSS {listStats.loss}</span>
          </div>
          {hasMore ? (
            <button
              type="button"
              disabled={loadingMore}
              onClick={() => void loadMore()}
              className="shrink-0 self-start rounded-md border border-amber-300 bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-900 transition hover:bg-amber-100 disabled:opacity-50 sm:self-center"
            >
              {loadingMore ? 'Đang tải…' : `Tải thêm ${LEADS_PAGE_SIZE}`}
            </button>
          ) : null}
        </div>
      </section>

      {inspectProfileOpen && activeScoringProfile ? (
        <ScoringProfileInspectModal profile={activeScoringProfile} onClose={() => setInspectProfileOpen(false)} />
      ) : null}

      <div className="app-card-glass-strong overflow-hidden transition-all duration-300">
        <p className="border-b border-slate-200/80 bg-amber-50/50 px-3 py-2 text-center text-[11px] leading-snug text-amber-950 sm:px-4 sm:text-xs">
          <span className="font-semibold text-amber-900">Mẹo:</span> bấm vào <strong>một dòng hồ sơ</strong> để mở panel
          chi tiết — xem đủ thông tin sinh viên, <strong>ghi chú &amp; lịch sử tương tác</strong>,{' '}
          <strong>đánh giá / nhãn tương tác</strong>, playbook gợi ý, phân tích AI (nếu bật) và nhật ký thao tác hệ
          thống. Danh sách chia <strong>{LEADS_PAGE_SIZE} hồ sơ/trang</strong>; ô đầu dòng chỉ chọn hồ sơ{' '}
          <strong>trên trang hiện tại</strong>.
        </p>
        {sortedFiltered.length > 0 ? (
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/80 bg-slate-50/90 px-3 py-2 text-xs text-slate-700 sm:px-4">
            <span className="text-slate-600">
              Đang xem <span className="font-semibold text-slate-900">{pagedRows.length}</span> hồ sơ (trang{' '}
              {tablePage}/{totalTablePages})
              {tablePage >= totalTablePages && hasMore ? (
                <span className="ml-2 text-amber-800">· Còn trên máy chủ — bấm «Tải thêm» phía trên.</span>
              ) : null}
            </span>
            <div className="flex flex-wrap items-center gap-1">
              <button
                type="button"
                disabled={tablePage <= 1}
                onClick={() => setTablePage(1)}
                className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-800 transition hover:bg-slate-50 disabled:opacity-40"
              >
                « Đầu
              </button>
              <button
                type="button"
                disabled={tablePage <= 1}
                onClick={() => setTablePage((p) => Math.max(1, p - 1))}
                className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-800 transition hover:bg-slate-50 disabled:opacity-40"
              >
                Trước
              </button>
              <button
                type="button"
                disabled={tablePage >= totalTablePages}
                onClick={() => setTablePage((p) => Math.min(totalTablePages, p + 1))}
                className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-800 transition hover:bg-slate-50 disabled:opacity-40"
              >
                Sau
              </button>
              <button
                type="button"
                disabled={tablePage >= totalTablePages}
                onClick={() => setTablePage(totalTablePages)}
                className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-800 transition hover:bg-slate-50 disabled:opacity-40"
              >
                Cuối »
              </button>
            </div>
          </div>
        ) : null}
        <div className="scroll-touch max-h-[min(calc(100dvh-200px),78vh)] overflow-auto overscroll-contain">
          <table className="min-w-[1280px] w-full border-collapse text-left text-base">
            <thead className="sticky top-0 z-10 border-b border-slate-200/90 bg-white/85 backdrop-blur-xl">
              <tr className="text-xs uppercase tracking-wide text-slate-600">
                <th className="w-10 px-2 py-3">
                  {canBulkWrite ? (
                    <input
                      type="checkbox"
                      checked={allVisibleSelected}
                      onChange={toggleSelectAllVisible}
                      disabled={!pagedRows.length}
                      className="h-4 w-4 rounded border-slate-300 bg-white accent-amber-500"
                      title="Chọn tất cả hồ sơ trên trang này"
                    />
                  ) : null}
                </th>
                <th className="px-4 py-3 font-medium">
                  <button
                    type="button"
                    onClick={() => toggleSort('fullName')}
                    className="flex items-center gap-1 text-left transition hover:text-amber-700"
                  >
                    Họ tên
                    {sortKey === 'fullName' ? <span className="text-amber-600">{sortDir === 'asc' ? '↑' : '↓'}</span> : null}
                  </button>
                </th>
                <th className="max-w-[6.5rem] px-2 py-3 text-xs font-medium normal-case">Mã KH</th>
                <th className="px-4 py-3 font-medium">
                  <button
                    type="button"
                    onClick={() => toggleSort('phone')}
                    className="flex items-center gap-1 text-left transition hover:text-amber-700"
                  >
                    SĐT
                    {sortKey === 'phone' ? <span className="text-amber-600">{sortDir === 'asc' ? '↑' : '↓'}</span> : null}
                  </button>
                </th>
                <th className="max-w-[6.5rem] px-2 py-3 text-xs font-medium normal-case">SĐT PH</th>
                <th className="px-4 py-3 font-medium">
                  <button
                    type="button"
                    onClick={() => toggleSort('educationLevel')}
                    className="flex items-center gap-1 text-left transition hover:text-amber-700"
                  >
                    Hệ đào tạo
                    {sortKey === 'educationLevel' ? (
                      <span className="text-amber-600">{sortDir === 'asc' ? '↑' : '↓'}</span>
                    ) : null}
                  </button>
                </th>
                <th className="px-4 py-3 font-medium">
                  <button
                    type="button"
                    onClick={() => toggleSort('province')}
                    className="flex items-center gap-1 text-left transition hover:text-amber-700"
                  >
                    Tỉnh / TP
                    {sortKey === 'province' ? <span className="text-amber-600">{sortDir === 'asc' ? '↑' : '↓'}</span> : null}
                  </button>
                </th>
                <th className="max-w-[13rem] px-2 py-3 text-xs font-medium normal-case" title="Mô tả & ghi chú trên hồ sơ (rút gọn)">
                  Ghi chú
                </th>
                <th className="px-4 py-3 font-medium">
                  <button
                    type="button"
                    onClick={() => toggleSort('score')}
                    className="flex flex-col items-start gap-0.5 text-left transition hover:text-amber-700"
                  >
                    <span className="flex items-center gap-1">
                      Điểm
                      {sortKey === 'score' ? (
                        <span className="text-amber-600">{sortDir === 'asc' ? '↑' : '↓'}</span>
                      ) : null}
                    </span>
                    {activeScoringProfile ? (
                      <span className="text-xs font-normal normal-case text-violet-700">theo profile</span>
                    ) : null}
                  </button>
                </th>
                <th className="w-14 px-1 py-3 text-center text-xs font-medium normal-case">
                  <button
                    type="button"
                    onClick={() => toggleSort('mlWin')}
                    className="inline-flex flex-col items-center gap-0.5 text-violet-900 transition hover:text-violet-700"
                    title="Win probability (ML-ready / MVP mock)"
                  >
                    Win%
                    {sortKey === 'mlWin' ? (
                      <span className="text-amber-600">{sortDir === 'asc' ? '↑' : '↓'}</span>
                    ) : null}
                  </button>
                </th>
                <th className="px-4 py-3 font-medium">
                  <button
                    type="button"
                    onClick={() => toggleSort('priorityTag')}
                    className="flex items-center gap-1 text-left transition hover:text-amber-700"
                  >
                    Nhãn
                    {sortKey === 'priorityTag' ? (
                      <span className="text-amber-600">{sortDir === 'asc' ? '↑' : '↓'}</span>
                    ) : null}
                  </button>
                </th>
                <th className="px-4 py-3 font-medium">
                  <button
                    type="button"
                    onClick={() => toggleSort('pipelineStatus')}
                    className="flex items-center gap-1 text-left transition hover:text-amber-700"
                  >
                    Pipeline
                    {sortKey === 'pipelineStatus' ? (
                      <span className="text-amber-600">{sortDir === 'asc' ? '↑' : '↓'}</span>
                    ) : null}
                  </button>
                </th>
                <th className="max-w-[7rem] px-2 py-3 text-xs font-medium normal-case">CRM</th>
                <th className="min-w-[6rem] max-w-[9rem] px-2 py-3 text-xs font-medium normal-case">TVV</th>
              </tr>
            </thead>
            <tbody>
              {loading
                ? Array.from({ length: 8 }).map((_, i) => (
                    <tr key={i} className="border-b border-slate-100">
                      {Array.from({ length: 14 }).map((__, j) => (
                        <td key={j} className="px-4 py-3">
                          <div className="h-4 rounded-md bg-gradient-to-r from-slate-200 via-slate-100 to-slate-200 ai-skeleton-shimmer" />
                        </td>
                      ))}
                    </tr>
                  ))
                : null}
              {!loading && !sortedFiltered.length ? (
                <tr>
                  <td colSpan={14} className="px-4 py-12 text-center text-slate-500">
                    Không có hồ sơ khớp bộ lọc.
                  </td>
                </tr>
              ) : null}
              {pagedRows.map((l) => {
                const ev = activeScoringProfile ? scoreByLeadId.get(l.id) : undefined
                const displayScore = ev?.calculatedScore ?? l.calculatedScore
                const displayTag = ev?.priorityTag ?? l.priorityTag
                const ml = resolveMlWinDisplay(l)
                return (
                <motion.tr
                  key={`${l.id}-${resolvedScoringProfileId ?? 'persisted'}`}
                  layout
                  transition={{ type: 'spring', stiffness: 380, damping: 28 }}
                  onClick={() => setSelected(l)}
                  title="Bấm để xem chi tiết: hồ sơ sinh viên, ghi chú, đánh giá, lịch sử tương tác, AI…"
                  className="cursor-pointer border-b border-slate-100 transition-all duration-300 hover:bg-amber-50/50"
                >
                  <td className="px-2 py-3" onClick={(e) => e.stopPropagation()}>
                    {canBulkWrite ? (
                      <input
                        type="checkbox"
                        checked={selectedIds.has(l.id)}
                        onChange={() => toggleSelectId(l.id)}
                        className="h-4 w-4 rounded border-slate-300 bg-white accent-amber-500"
                        aria-label={`Chọn ${l.fullName}`}
                      />
                    ) : null}
                  </td>
                  <td className="px-4 py-3 font-medium text-slate-900">{l.fullName || '—'}</td>
                  <td className="max-w-[6.5rem] truncate px-2 py-3 text-xs text-slate-600" title={l.customerId || undefined}>
                    {l.customerId || '—'}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{l.phone || '—'}</td>
                  <td className="max-w-[6.5rem] truncate px-2 py-3 text-xs text-slate-600" title={l.parentPhone || undefined}>
                    {l.parentPhone || '—'}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{l.educationLevel || '—'}</td>
                  <td className="px-4 py-3 text-slate-600">{l.province || '—'}</td>
                  <td
                    className="max-w-[13rem] truncate px-2 py-3 text-xs leading-snug text-slate-600"
                    title={l.description?.trim() ? l.description : undefined}
                  >
                    {formatDescPreview(l.description)}
                  </td>
                  <td className="px-4 py-3 font-medium text-violet-700 transition-colors duration-300">{displayScore}</td>
                  <td className="px-1 py-2 text-center" title={ml.mlExplanation}>
                    <MlWinGauge value={ml.mlWinProbability} />
                  </td>
                  <td className="px-4 py-3 transition-all duration-300">
                    <motion.span layout key={`${l.id}-${displayTag}`}>
                      <TagBadge tag={displayTag} />
                    </motion.span>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{PIPELINE_LABEL[l.pipelineStatus]}</td>
                  <td className="max-w-[7rem] truncate px-2 py-3 text-xs text-slate-600" title={LEAD_COUNSELOR_STATUS_LABELS[l.status]}>
                    {LEAD_COUNSELOR_STATUS_LABELS[l.status]}
                  </td>
                  <td
                    className="max-w-[9rem] truncate px-2 py-3 text-xs text-slate-600"
                    title={formatAssignedCounselorLabel(l, counselorDirectoryLabelById)}
                  >
                    {formatAssignedCounselorLabel(l, counselorDirectoryLabelById)}
                  </td>
                </motion.tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

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
              Gán tư vấn viên mới cho {selectedIds.size} hồ sơ đã chọn.
              {!isElevatedLeadScope && canPeerReassignLeads ? (
                <span className="mt-1 block font-medium text-amber-800">
                  Bạn chỉ có thể chuyển các hồ sơ đang gán cho chính bạn sang đồng nghiệp (theo quyền TVV).
                </span>
              ) : null}
            </p>
            <label className="mt-4 block text-sm font-medium text-slate-700">
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
                className="rounded-xl border border-violet-400 bg-violet-600 px-4 py-2 text-sm font-semibold text-white shadow-sm disabled:opacity-40"
              >
                {bulkBusy ? 'Đang xử lý…' : 'Áp dụng'}
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
            <h3 className="app-section-heading">Đổi trạng thái CRM (Kanban)</h3>
            <p className="mt-1 text-sm text-slate-600">Áp dụng cho {selectedIds.size} hồ sơ đã chọn.</p>
            <label className="mt-4 block text-sm font-medium text-slate-700">
              Trạng thái mới
              <select
                value={bulkCrmStatus}
                onChange={(e) => setBulkCrmStatus(e.target.value as LeadCounselorStatus)}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-base text-slate-900 outline-none focus:ring-2 focus:ring-amber-200"
              >
                {LEAD_COUNSELOR_STATUS_ORDER.map((s) => (
                  <option key={s} value={s} className="bg-white">
                    {LEAD_COUNSELOR_STATUS_LABELS[s]}
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
                disabled={bulkBusy}
                onClick={() => void applyBulkCrmStatus()}
                className="rounded-xl border border-amber-500 bg-amber-600 px-4 py-2 text-sm font-semibold text-white shadow-sm disabled:opacity-40"
              >
                {bulkBusy ? 'Đang xử lý…' : 'Áp dụng'}
              </button>
            </div>
          </div>
        </>
      ) : null}

      {selected ? (
        <>
          <LeadDetailPanel
            key={selected.id}
            lead={selected}
            scoringPreview={
              activeScoringProfile
                ? scoreByLeadId.get(selected.id) ??
                  evaluateLead(leadToEvaluationRecord(selected), activeScoringProfile)
                : undefined
            }
            db={db}
            institutionalRagBlock={institutionalRagBlock}
            counselorUsers={counselorUsers}
            pickListUsers={reassignPickList}
            counselorsLoading={counselorsLoading}
            canReassignLead={showBulkReassign}
            reassignElevated={isElevatedLeadScope}
            reserveRightRail
            dynamicAssistantSlot={
              <ConsultingAssistantPanel
                variant="embedded"
                lead={selected}
                snippets={scriptSnippets}
                loading={scriptSnippetsLoading}
                error={scriptSnippetsErr}
              />
            }
            onClose={() => setSelected(null)}
            onUpdated={(patch) => setSelected({ ...selected, ...patch })}
          />
          <ConsultingAssistantPanel
            variant="rail"
            lead={selected}
            snippets={scriptSnippets}
            loading={scriptSnippetsLoading}
            error={scriptSnippetsErr}
          />
        </>
      ) : null}
    </div>
  )
}

function ScoringProfileInspectModal({
  profile,
  onClose,
}: {
  profile: ScoringProfile
  onClose: () => void
}) {
  const blocks = profile.ruleBlocks ?? []
  const flatRules = profile.rules ?? []

  return (
    <>
      <button
        type="button"
        className="fixed inset-0 z-50 bg-slate-900/30 backdrop-blur-md"
        aria-label="Đóng"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="inspect-profile-title"
        className="app-glass-panel fixed left-1/2 top-1/2 z-[60] max-h-[min(82vh,680px)] w-[min(94vw,560px)] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-3xl shadow-xl"
      >
        <div className="scroll-touch max-h-[min(82vh,680px)] overflow-y-auto overscroll-contain p-6">
          <div className="flex items-start justify-between gap-3 border-b border-slate-200/90 pb-4">
            <div>
              <p id="inspect-profile-title" className="text-xl font-bold text-slate-900">
                {profile.profileName}
              </p>
              <p className="mt-1 text-sm text-slate-600">
                HOT ≥ {profile.thresholds?.hotMinScore ?? '—'} · WARM ≥ {profile.thresholds?.warmMinScore ?? '—'}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 shadow-sm transition hover:border-amber-300 hover:bg-amber-50"
            >
              Đóng
            </button>
          </div>
          <p className="mt-4 text-base leading-relaxed text-slate-700">
            {profile.description || 'Không có mô tả.'}
          </p>

          <h3 className="app-section-heading mt-6">Cấu hình quy tắc</h3>
          {blocks.length ? (
            <ul className="mt-3 space-y-3">
              {blocks.map((b) => (
                <li
                  key={b.id}
                  className="rounded-2xl border border-slate-200/90 bg-white/80 p-3 text-sm text-slate-700 shadow-sm"
                >
                  <p className="font-semibold text-slate-900">
                    {b.label}{' '}
                    <span className="font-normal text-slate-500">
                      ({RULE_CATEGORY_LABELS[b.category]} · max {b.maxWeight} điểm)
                    </span>
                  </p>
                  <p className="mt-1 text-xs text-slate-500">Trường: {String(b.targetField)}</p>
                  <ul className="mt-2 list-inside list-disc space-y-1 text-xs text-slate-400">
                    {b.rows.map((r) => (
                      <li key={r.id}>
                        {r.condition}{' '}
                        {Array.isArray(r.value) ? r.value.join(', ') : String(r.value) || '—'} →{' '}
                        {r.allocationKind === 'percent_of_max'
                          ? `${r.allocationValue}% max khối`
                          : `${r.allocationValue} điểm`}
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          ) : flatRules.length ? (
            <ul className="mt-3 space-y-2">
              {flatRules.map((r) => (
                <li
                  key={r.id}
                  className="rounded-xl border border-slate-200/90 bg-white/80 px-3 py-2 text-sm text-slate-600 shadow-sm"
                >
                  {String(r.targetField)} · {r.condition} ·{' '}
                  {Array.isArray(r.value) ? r.value.join(', ') : String(r.value)} → {r.points} điểm
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-xs text-slate-500">Chưa có quy tắc trong profile này.</p>
          )}
        </div>
      </div>
    </>
  )
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
  compact,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  options: { v: string; t: string }[]
  compact?: boolean
}) {
  return (
    <label
      className={
        compact
          ? 'flex min-w-0 flex-col text-xs font-semibold uppercase tracking-wide text-slate-500'
          : 'flex flex-col text-xs font-medium text-slate-600'
      }
    >
      {label}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={
          compact
            ? 'mt-0.5 max-w-[8.5rem] min-w-[4.25rem] shrink-0 truncate rounded-md border border-slate-200/95 bg-white px-1 py-1 text-[11px] font-medium text-slate-900 outline-none transition focus:ring-2 focus:ring-amber-200'
            : 'mt-1 min-w-[140px] rounded-xl border border-slate-200/95 bg-white px-2 py-2 text-base text-slate-900 outline-none transition focus:ring-2 focus:ring-amber-200'
        }
      >
        {options.map((o) => (
          <option key={o.v} value={o.v} className="bg-white">
            {o.t}
          </option>
        ))}
      </select>
    </label>
  )
}

function AiValueBadge({ text }: { text: string }) {
  const t = text.trim()
  const lower = t.toLowerCase()
  const cls =
    lower.includes('tốt') || lower === 'hot'
      ? 'border-emerald-400/60 bg-emerald-500/25 text-emerald-50 shadow-[0_0_14px_rgba(52,211,153,0.35)]'
      : lower.includes('trung') || lower.includes('warm')
        ? 'border-amber-400/55 bg-amber-500/20 text-amber-50'
        : lower.includes('kém') || lower.includes('cold') || lower.includes('yếu')
          ? 'border-rose-400/55 bg-rose-500/25 text-rose-50'
          : 'border-slate-200 bg-slate-100 text-slate-800'
  return (
    <span
      className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold tracking-wide ${cls}`}
    >
      {t}
    </span>
  )
}

function AiOutputValue({ value }: { value: unknown }) {
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    return (
      <pre className="scroll-touch max-h-48 overflow-auto overscroll-contain rounded-lg border border-slate-200 bg-slate-50 p-2 text-xs leading-relaxed text-slate-800">
        {JSON.stringify(value, null, 2)}
      </pre>
    )
  }
  if (Array.isArray(value)) {
    return <span className="text-sm text-slate-700">{JSON.stringify(value)}</span>
  }
  if (typeof value === 'boolean') {
    return <span className="text-sm text-slate-800">{value ? 'Có' : 'Không'}</span>
  }
  if (typeof value === 'string') {
    return <AiValueBadge text={value} />
  }
  if (value === null || value === undefined) {
    return <span className="text-sm text-slate-500">—</span>
  }
  return <span className="text-sm text-slate-800">{String(value)}</span>
}

function AiInsightsGrid({ data }: { data: Record<string, unknown> }) {
  return (
    <dl className="mt-3 grid gap-2 sm:grid-cols-2">
      {Object.entries(data).map(([k, v]) => (
        <div
          key={k}
          className="rounded-xl border border-slate-200/90 bg-white/90 px-3 py-2 shadow-sm backdrop-blur-sm"
        >
          <dt className="text-xs font-medium uppercase tracking-wider text-slate-400">{k}</dt>
          <dd className="mt-1 break-words">
            <AiOutputValue value={v} />
          </dd>
        </div>
      ))}
    </dl>
  )
}

function formatAiRunAt(runAt: unknown): string {
  if (
    runAt &&
    typeof runAt === 'object' &&
    'toDate' in runAt &&
    typeof (runAt as { toDate: () => Date }).toDate === 'function'
  ) {
    try {
      return (runAt as { toDate: () => Date }).toDate().toLocaleString('vi-VN')
    } catch {
      /* ignore */
    }
  }
  return ''
}

function CounselorLeadProgressForm({
  lead,
  db,
  onUpdated,
}: {
  lead: Lead
  db: NonNullable<ReturnType<typeof getFirestoreDb>>
  onUpdated: (patch: Partial<Lead>) => void
}) {
  const { profile, can } = useAuth()
  const [crmStatus, setCrmStatus] = useState<LeadCounselorStatus>(() => lead.status)
  const [noteLine, setNoteLine] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  useEffect(() => {
    setCrmStatus(lead.status)
  }, [lead.id, lead.status])

  const canEdit =
    profile?.role === 'admin' ||
    (Boolean(can('leads:write:self_assigned')) &&
      (lead.assignedTo ?? lead.assignedCounselorId) === profile?.id)

  if (!canEdit) return null

  const save = async () => {
    if (!profile) return
    const statusChanged = crmStatus !== lead.status
    const note = noteLine.trim()
    if (!statusChanged && !note) {
      setMsg('Không có thay đổi.')
      return
    }
    setBusy(true)
    setMsg(null)
    try {
      const touch = leadTouchPatch()
      const performer = profile.displayName?.trim() || profile.email || profile.id
      const stamp = new Date().toLocaleString('vi-VN')
      const append = note ? `\n\n[${stamp}] ${performer}:\n${note}` : ''
      const nextDesc = note ? `${lead.description ?? ''}${append}`.trim() : lead.description
      const patch: Record<string, unknown> = { ...touch }
      if (statusChanged) {
        patch.status = crmStatus
        patch.pipelineStatus = counselorStatusToPipeline(crmStatus)
      }
      if (note) patch.description = nextDesc
      await updateDoc(doc(db, FS_COLLECTIONS.leads, lead.id), patch)
      if (statusChanged) {
        await commitAuditLog(db, {
          leadId: lead.id,
          actionType: 'STATUS_CHANGE',
          description: `CRM/Kanban: ${LEAD_COUNSELOR_STATUS_LABELS[lead.status]} → ${LEAD_COUNSELOR_STATUS_LABELS[crmStatus]}`,
          performedBy: profile.id,
          performedByName: performer,
        })
      }
      if (note) {
        await commitAuditLog(db, {
          leadId: lead.id,
          actionType: 'NOTE_ADDED',
          description: `Mô tả (nối ghi chú): ${note.slice(0, 280)}${note.length > 280 ? '…' : ''}`,
          performedBy: profile.id,
          performedByName: performer,
        })
      }
      onUpdated({
        ...(statusChanged ? { status: crmStatus, pipelineStatus: counselorStatusToPipeline(crmStatus) } : {}),
        ...(note ? { description: nextDesc } : {}),
        updatedAt: touch.updatedAt,
        lastTouchedAt: touch.lastTouchedAt,
      })
      setNoteLine('')
      setMsg('Đã lưu lên Firestore.')
    } catch (e) {
      console.error(e)
      setMsg('Không lưu được — kiểm tra quyền.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="rounded-2xl border border-white/12 bg-gradient-to-br from-slate-950/55 via-indigo-950/35 to-slate-950/50 p-4 shadow-2xl shadow-black/30 ring-1 ring-amber-400/20 backdrop-blur-xl">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-200/80">Tiến độ tư vấn</p>
      <p className="mt-1 text-sm text-slate-300/90">
        Chọn tình trạng CRM, thêm ghi chú (tùy), rồi bấm lưu — có thể chỉ đổi CRM, chỉ thêm ghi chú, hoặc cả hai. Mọi
        thay đổi ghi vào Firestore và nhật ký kiểm tra.
      </p>
      <label className="mt-4 block text-sm font-medium text-slate-200">
        Tình trạng (CRM)
        <select
          value={crmStatus}
          onChange={(e) => setCrmStatus(e.target.value as LeadCounselorStatus)}
          className="mt-1.5 w-full rounded-xl border border-white/15 bg-white/[0.07] px-3 py-2.5 text-sm text-white outline-none focus:border-amber-400/50 focus:ring-2 focus:ring-amber-400/25"
        >
          {LEAD_COUNSELOR_STATUS_ORDER.map((s) => (
            <option key={s} value={s} className="bg-slate-900 text-slate-100">
              {LEAD_COUNSELOR_STATUS_LABELS[s]}
            </option>
          ))}
        </select>
      </label>
      <label className="mt-3 block text-sm font-medium text-slate-200">
        Ghi chú nối thêm vào «Mô tả»
        <textarea
          value={noteLine}
          onChange={(e) => setNoteLine(e.target.value)}
          rows={3}
          placeholder="VD: Đã gọi phụ huynh, hẹn campus tour…"
          className="mt-1.5 w-full resize-y rounded-xl border border-white/12 bg-white/[0.05] px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 outline-none focus:border-violet-400/40 focus:ring-2 focus:ring-violet-500/20"
        />
      </label>
      {msg ? <p className="mt-2 text-sm text-amber-100/90">{msg}</p> : null}
      <button
        type="button"
        disabled={busy}
        onClick={() => void save()}
        className="mt-4 w-full rounded-xl border border-amber-400/40 bg-gradient-to-r from-amber-500/90 via-amber-400/85 to-amber-600/90 py-2.5 text-sm font-semibold text-slate-950 shadow-lg shadow-amber-950/30 transition hover:brightness-110 disabled:opacity-50"
      >
        {busy ? 'Đang lưu…' : 'Lưu lên Firestore'}
      </button>
    </section>
  )
}

function LeadCrmQuickBlock({
  lead,
  db,
  counselorUsers,
  pickListUsers,
  counselorsLoading,
  reassignElevated,
  onUpdated,
}: {
  lead: Lead
  db: NonNullable<ReturnType<typeof getFirestoreDb>>
  counselorUsers: VietMyUserProfile[]
  /** Danh sách chọn trong dropdown (Admin/Trưởng: TVV + Admin; TVV: chỉ TVV). */
  pickListUsers: VietMyUserProfile[]
  counselorsLoading: boolean
  /** Admin / Trưởng khoa / Trưởng ngành: mọi TVV + có thể bỏ gán. TVV chỉ đổi trong phạm vi quyền đồng nghiệp. */
  reassignElevated: boolean
  onUpdated: (patch: Partial<Lead>) => void
}) {
  const { profile, can } = useAuth()
  const peerMode = !reassignElevated && can('leads:reassign:peer')
  const mine = (lead.assignedTo ?? lead.assignedCounselorId) === profile?.id
  const assignableCounselors = useMemo(() => {
    if (!peerMode || !profile?.id) return pickListUsers
    const me = counselorUsers.find((c) => c.id === profile.id)
    const others = counselorUsers.filter((c) => c.id !== profile.id)
    return me ? [me, ...others] : others
  }, [pickListUsers, counselorUsers, peerMode, profile?.id])

  const [crmAssignUid, setCrmAssignUid] = useState(() => lead.assignedTo ?? lead.assignedCounselorId ?? '')
  const [crmKanbanStatus, setCrmKanbanStatus] = useState<LeadCounselorStatus>(() => lead.status)
  const [crmBusy, setCrmBusy] = useState(false)
  const [crmMsg, setCrmMsg] = useState<string | null>(null)

  useEffect(() => {
    setCrmAssignUid(lead.assignedTo ?? lead.assignedCounselorId ?? '')
    setCrmKanbanStatus(lead.status)
  }, [lead.id, lead.assignedTo, lead.assignedCounselorId, lead.status])

  const labelForUid = (uid: string | null) => {
    if (!uid) return '—'
    const u = pickListUsers.find((c) => c.id === uid) ?? counselorUsers.find((c) => c.id === uid)
    return u ? formatStaffDirectoryLabel(u) : uid
  }

  if (peerMode && !mine) return null

  const save = async () => {
    if (!profile) return
    const nextUid = crmAssignUid.trim() || null
    const prevAssign = lead.assignedTo ?? lead.assignedCounselorId ?? null
    const prevStatus = lead.status
    const sameAssign = (prevAssign ?? '') === (nextUid ?? '')
    const sameStatus = prevStatus === crmKanbanStatus
    if (sameAssign && sameStatus) {
      setCrmMsg('Không có thay đổi.')
      return
    }
    if (peerMode && !nextUid) {
      setCrmMsg('Không thể bỏ gán — chọn đồng nghiệp nhận hồ sơ hoặc liên hệ Admin.')
      return
    }
    setCrmBusy(true)
    setCrmMsg(null)
    try {
      const touch = leadTouchPatch()
      await updateDoc(doc(db, FS_COLLECTIONS.leads, lead.id), {
        assignedCounselorId: nextUid,
        assignedTo: nextUid,
        status: crmKanbanStatus,
        pipelineStatus: counselorStatusToPipeline(crmKanbanStatus),
        ...touch,
      })
      const performer = profile.displayName?.trim() || profile.email || profile.id
      if (!sameAssign) {
        await commitAuditLog(db, {
          leadId: lead.id,
          actionType: 'REASSIGNMENT',
          description: `Cập nhật phân công: ${labelForUid(prevAssign)} → ${labelForUid(nextUid)}`,
          performedBy: profile.id,
          performedByName: performer,
        })
      }
      if (!sameStatus) {
        await commitAuditLog(db, {
          leadId: lead.id,
          actionType: 'STATUS_CHANGE',
          description: `CRM/Kanban: ${LEAD_COUNSELOR_STATUS_LABELS[prevStatus]} → ${LEAD_COUNSELOR_STATUS_LABELS[crmKanbanStatus]}`,
          performedBy: profile.id,
          performedByName: performer,
        })
      }
      onUpdated({
        assignedCounselorId: nextUid,
        assignedTo: nextUid,
        status: crmKanbanStatus,
        pipelineStatus: counselorStatusToPipeline(crmKanbanStatus),
        updatedAt: touch.updatedAt,
        lastTouchedAt: touch.lastTouchedAt,
      })
      setCrmMsg('Đã cập nhật phân công & CRM.')
    } catch (e) {
      console.error(e)
      setCrmMsg('Không lưu được. Kiểm tra quyền Firestore.')
    } finally {
      setCrmBusy(false)
    }
  }

  return (
    <section className="rounded-xl border border-violet-200/80 bg-violet-50/50 p-3 shadow-sm">
      <h3 className="app-section-heading">Phân công &amp; CRM</h3>
      <p className="mt-0.5 text-sm leading-snug text-slate-600">
        {peerMode
          ? 'Chuyển hồ sơ của bạn cho đồng nghiệp (danh sách: tên hiển thị · email). Không thể bỏ gán trống — chọn người nhận.'
          : 'Gán tư vấn viên / quản trị và giai đoạn Kanban — lưu trực tiếp, có ghi nhật ký thao tác (tên · email trong danh sách).'}
      </p>
      <label className="mt-2 block text-sm font-medium text-slate-700">
        {reassignElevated ? 'Phụ trách (TVV / Admin)' : 'Tư vấn viên'}
        <select
          value={crmAssignUid}
          onChange={(e) => setCrmAssignUid(e.target.value)}
          disabled={counselorsLoading}
          className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-2 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-violet-200 disabled:opacity-50"
        >
          {reassignElevated ? <option value="">— Chưa gán —</option> : null}
          {assignableCounselors.map((c) => (
            <option key={c.id} value={c.id} className="bg-white">
              {formatStaffDirectoryLabel(c)}
            </option>
          ))}
        </select>
      </label>
      <label className="mt-2 block text-sm font-medium text-slate-700">
        Trạng thái CRM (Kanban)
        <select
          value={crmKanbanStatus}
          onChange={(e) => setCrmKanbanStatus(e.target.value as LeadCounselorStatus)}
          className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-2 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-violet-200"
        >
          {LEAD_COUNSELOR_STATUS_ORDER.map((s) => (
            <option key={s} value={s} className="bg-white">
              {LEAD_COUNSELOR_STATUS_LABELS[s]}
            </option>
          ))}
        </select>
      </label>
      {crmMsg ? <p className="mt-2 text-sm text-violet-900">{crmMsg}</p> : null}
      <button
        type="button"
        disabled={crmBusy}
        onClick={() => void save()}
        className="mt-3 w-full rounded-lg border border-violet-500 bg-violet-600 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-violet-700 disabled:opacity-50"
      >
        {crmBusy ? 'Đang lưu…' : 'Lưu phân công &amp; CRM'}
      </button>
    </section>
  )
}

function LeadDetailPanel({
  lead,
  scoringPreview,
  db,
  institutionalRagBlock,
  counselorUsers,
  pickListUsers,
  counselorsLoading,
  canReassignLead,
  reassignElevated,
  onClose,
  onUpdated,
  reserveRightRail,
  dynamicAssistantSlot,
}: {
  lead: Lead
  scoringPreview?: { calculatedScore: number; priorityTag: PriorityTag }
  db: ReturnType<typeof getFirestoreDb>
  /** Nội dung RAG từ Knowledge Base (có thể rỗng). */
  institutionalRagBlock: string
  counselorUsers: VietMyUserProfile[]
  pickListUsers: VietMyUserProfile[]
  counselorsLoading: boolean
  /** Có hiển thị khối phân công nhanh (Admin/Trưởng hoặc TVV có quyền chuyển đồng nghiệp). */
  canReassignLead: boolean
  /** Admin / Trưởng khoa / Trưởng ngành: toàn quyền gán; TVV: chỉ chuyển trong team với quyền peer. */
  reassignElevated: boolean
  onClose: () => void
  onUpdated: (patch: Partial<Lead>) => void
  /** Bố trí chỗ cho rail trợ lý kịch bản (desktop) */
  reserveRightRail?: boolean
  /** Bản mobile: panel trợ lý nhúng dưới tiêu đề */
  dynamicAssistantSlot?: ReactNode
}) {
  const { profile, can } = useAuth()
  const { tasksById: aiInsightTasksById } = useLeadAiInsightTasks(lead.id)
  const { interactions, loading: intLoading } = useInteractions(lead.id)
  const { playbooks } = useConsultingPlaybooks()
  const matched = useMemo(() => playbooksMatchingLead(lead, playbooks).slice(0, 3), [lead, playbooks])

  const [note, setNote] = useState('')
  const [evalTag, setEvalTag] = useState<string>(EVALUATION_TAGS[0])
  const [statusDirty, setStatusDirty] = useState<LeadPipelineStatus | null>(null)
  const statusForForm = statusDirty ?? lead.pipelineStatus
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [detailTab, setDetailTab] = useState<'workspace' | 'audit'>('workspace')
  const { entries: auditEntries, loading: auditLoading, error: auditError } = useAuditLogs(lead.id)

  const { tasks: aiTasks, loading: aiTasksLoading, error: aiTasksErr } = useAITasks()
  const notesAgg = useMemo(
    () =>
      interactions
        .map((i) => i.counselorNote)
        .filter((x): x is string => Boolean(x?.trim()))
        .join('\n---\n'),
    [interactions],
  )

  const assigneeHeaderLabel = useMemo(() => {
    const uid = lead.assignedTo ?? lead.assignedCounselorId
    if (!uid) return '—'
    const u = pickListUsers.find((c) => c.id === uid) ?? counselorUsers.find((c) => c.id === uid)
    return u ? formatStaffDirectoryLabel(u) : `${uid.slice(0, 8)}…`
  }, [lead.assignedTo, lead.assignedCounselorId, pickListUsers, counselorUsers])

  const [aiSelTaskId, setAiSelTaskId] = useState('')
  const [aiRunning, setAiRunning] = useState(false)
  const [aiErr, setAiErr] = useState<string | null>(null)
  const [aiPreview, setAiPreview] = useState<Record<string, unknown> | null>(null)

  const resolvedAiTaskId = useMemo(() => {
    if (!aiTasks.length) return ''
    if (aiSelTaskId && aiTasks.some((t) => t.id === aiSelTaskId)) return aiSelTaskId
    return aiTasks[0].id
  }, [aiTasks, aiSelTaskId])

  const selectedAITask = useMemo(
    () => aiTasks.find((t) => t.id === resolvedAiTaskId),
    [aiTasks, resolvedAiTaskId],
  )

  const storedAiInsight = useMemo(() => {
    if (!selectedAITask) return null
    const raw = aiInsightTasksById[selectedAITask.id]
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
    return raw as { taskName?: string; runAt?: unknown; result?: unknown }
  }, [aiInsightTasksById, selectedAITask])

  const displayAiResult = useMemo(() => {
    if (aiPreview) return aiPreview
    const r = storedAiInsight?.result
    if (r && typeof r === 'object' && !Array.isArray(r)) return r as Record<string, unknown>
    return null
  }, [aiPreview, storedAiInsight])

  const canSaveInteraction = can('interactions:create:self_assigned')
  const canRunAi = can('ai:use')

  const save = async () => {
    if (!db || !profile) {
      setMsg('Chưa có kết nối hoặc chưa đăng nhập.')
      return
    }
    if (!canSaveInteraction) {
      setMsg('Bạn không có quyền ghi tương tác.')
      return
    }
    if (!note.trim()) {
      setMsg('Vui lòng nhập ghi chú.')
      return
    }
    setSaving(true)
    setMsg(null)
    try {
      const sub = collection(db, FS_COLLECTIONS.leads, lead.id, FS_COLLECTIONS.interactions)
      await addDoc(sub, {
        leadId: lead.id,
        channel: 'NOTE',
        authorUid: profile.id,
        authorRole: profile.role,
        counselorNote: note.trim(),
        evaluationTag: evalTag,
        timestamp: Timestamp.now(),
      })
      const touch = leadTouchPatch()
      const performer = profile.displayName?.trim() || profile.email || profile.id
      await commitAuditLog(db, {
        leadId: lead.id,
        actionType: 'NOTE_ADDED',
        description: `Ghi chú tương tác (${evalTag}): ${note.trim().slice(0, 280)}`,
        performedBy: profile.id,
        performedByName: performer,
      })
      if (statusForForm !== lead.pipelineStatus) {
        await updateDoc(doc(db, FS_COLLECTIONS.leads, lead.id), {
          pipelineStatus: statusForForm,
          ...touch,
        })
        await commitAuditLog(db, {
          leadId: lead.id,
          actionType: 'STATUS_CHANGE',
          description: `Pipeline funnel: ${PIPELINE_LABEL[lead.pipelineStatus]} → ${PIPELINE_LABEL[statusForForm]}`,
          performedBy: profile.id,
          performedByName: performer,
        })
        onUpdated({
          pipelineStatus: statusForForm,
          updatedAt: touch.updatedAt,
          lastTouchedAt: touch.lastTouchedAt,
        })
      } else {
        await updateDoc(doc(db, FS_COLLECTIONS.leads, lead.id), touch)
        onUpdated({ updatedAt: touch.updatedAt, lastTouchedAt: touch.lastTouchedAt })
      }
      setNote('')
      setStatusDirty(null)
      setMsg('Đã lưu tương tác.')
    } catch (e) {
      console.error(e)
      setMsg('Không lưu được. Kiểm tra Firestore Rules.')
    } finally {
      setSaving(false)
    }
  }

  const runAiLlmAnalysis = async () => {
    const config = loadAIConfigFromStorage()
    if (!config?.apiKey?.trim()) {
      setAiErr('Chưa cấu hình Gemini hoặc ChatGPT: Cấu hình dữ liệu → Tích hợp LLM.')
      return
    }
    if (!selectedAITask) {
      setAiErr('Chọn một tác vụ AI.')
      return
    }
    if (!db) {
      setAiErr('Chưa kết nối Firestore.')
      return
    }
    setAiRunning(true)
    setAiErr(null)
    try {
      const extras: Record<string, unknown> = {}
      if (selectedAITask.targetFields.includes('counselorNote')) {
        extras.counselorNote = notesAgg || '(Chưa có ghi chú tương tác.)'
      }
      const parsed = await runAIAnalysis(lead, selectedAITask, config, extras, {
        institutionalRagBlock: institutionalRagBlock.trim() || undefined,
      })
      setAiPreview(parsed)
      const prevInsights = { ...aiInsightTasksById }
      const runAt = Timestamp.now()
      const nextInsight = {
        taskName: selectedAITask.name,
        runAt,
        result: parsed,
      }
      const touch = leadTouchPatch()
      const aggRef = doc(
        db,
        FS_COLLECTIONS.leads,
        lead.id,
        FS_COLLECTIONS.leadAiInsightTasks,
        LEAD_AI_INSIGHT_AGGREGATE_ID,
      )
      await setDoc(
        aggRef,
        {
          tasks: {
            ...prevInsights,
            [selectedAITask.id]: nextInsight,
          },
          updatedAt: runAt,
        },
        { merge: true },
      )
      await updateDoc(doc(db, FS_COLLECTIONS.leads, lead.id), {
        ...touch,
        aiInsights: deleteField(),
      })
      if (profile) {
        const performer = profile.displayName?.trim() || profile.email || profile.id
        await commitAuditLog(db, {
          leadId: lead.id,
          actionType: 'AI_RUN',
          description: `Chạy phân tích LLM: «${selectedAITask.name}»`,
          performedBy: profile.id,
          performedByName: performer,
        })
      }
      onUpdated({
        updatedAt: touch.updatedAt,
        lastTouchedAt: touch.lastTouchedAt,
      })
    } catch (e) {
      console.error(e)
      setAiErr(e instanceof Error ? e.message : 'Không chạy được phân tích AI.')
    } finally {
      setAiRunning(false)
    }
  }

  return (
    <>
      <button
        type="button"
        aria-label="Đóng panel"
        className="fixed inset-0 z-40 bg-slate-900/25 backdrop-blur-sm"
        onClick={onClose}
      />
      <aside
        className={`fixed inset-y-0 z-50 flex w-full flex-col border-l border-slate-200/80 app-glass-panel bg-white/80 shadow-2xl shadow-slate-400/25 backdrop-blur-2xl max-lg:right-0 max-lg:max-w-3xl ${
          reserveRightRail
            ? 'lg:right-96 lg:max-w-[min(48rem,calc(100vw-24rem))]'
            : 'right-0 max-w-3xl'
        }`}
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-200/80 p-5">
          <div className="min-w-0 flex-1">
            <p className="app-page-kicker">Chi tiết hồ sơ</p>
            <h2 className="font-display text-lg font-semibold normal-case tracking-normal text-slate-900 md:text-xl">
              {lead.fullName || 'Chưa rõ tên'}
            </h2>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
              <span>
                <span className="text-slate-500">SĐT:</span> {lead.phone || '—'}
              </span>
              <span>
                <span className="text-slate-500">SĐT PH:</span> {lead.parentPhone || '—'}
              </span>
              <span>
                <span className="text-slate-500">Mã KH:</span> {lead.customerId || '—'}
              </span>
              <span className="min-w-0 max-w-full truncate" title={lead.source || undefined}>
                <span className="text-slate-500">Nguồn:</span> {lead.source || '—'}
              </span>
              <span>
                <span className="text-slate-500">CRM:</span> {LEAD_COUNSELOR_STATUS_LABELS[lead.status]}
              </span>
              <span>
                <span className="text-slate-500">Pipeline:</span> {PIPELINE_LABEL[lead.pipelineStatus]}
              </span>
              <span className="max-w-[14rem] truncate" title={assigneeHeaderLabel}>
                <span className="text-slate-500">TVV:</span> {assigneeHeaderLabel}
              </span>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-slate-500">
              Tab <strong>Công việc &amp; tương tác</strong>: ghi chú mới, đánh giá, pipeline; khối{' '}
              <strong>Lịch sử</strong> liệt kê note &amp; nhãn đã lưu. Tab <strong>Nhật ký thao tác</strong>: thay đổi CRM,
              phân công, AI trên hệ thống.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-200/80 px-2 py-1 text-xs text-slate-600 hover:bg-slate-100"
          >
            Đóng
          </button>
        </div>

        {dynamicAssistantSlot ? (
          <div className="shrink-0 overflow-hidden border-b border-slate-200/80 lg:hidden">
            {dynamicAssistantSlot}
          </div>
        ) : null}

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="flex shrink-0 gap-1 border-b border-slate-200/80 px-5">
            <button
              type="button"
              onClick={() => setDetailTab('workspace')}
              className={[
                'rounded-t-lg px-3 py-2 text-xs font-semibold transition',
                detailTab === 'workspace'
                  ? 'border border-amber-300/80 bg-amber-50 text-amber-950 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900',
              ].join(' ')}
            >
              Công việc & tương tác
            </button>
            <button
              type="button"
              onClick={() => setDetailTab('audit')}
              className={[
                'rounded-t-lg px-3 py-2 text-xs font-semibold transition',
                detailTab === 'audit'
                  ? 'border border-amber-300/80 bg-amber-50 text-amber-950 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900',
              ].join(' ')}
            >
              Nhật ký thao tác
            </button>
          </div>
          {detailTab === 'workspace' ? (
          <div className="grid min-h-0 flex-1 grid-cols-1 gap-0 overflow-hidden lg:grid-cols-2">
          <div className="scroll-touch min-h-0 space-y-6 overflow-y-auto overscroll-contain border-b border-slate-200/80 p-5 lg:border-b-0 lg:border-r">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <Info label="Mã KH" value={lead.customerId} />
              <Info label="Nguồn" value={lead.source} />
              <Info label="Hệ đào tạo" value={lead.educationLevel} />
              <Info label="Tỉnh / TP" value={lead.province} />
              <Info label="Địa chỉ" value={lead.address} />
              <Info label="Trường học" value={lead.highSchool} />
              <Info label="Lớp" value={lead.gradeClass} />
              <Info label="Điện thoại SV" value={lead.phone} />
              <Info label="ĐT người liên hệ" value={lead.parentPhone} />
              <div className="col-span-2">
                <p className="text-xs text-slate-500">Ghi chú / mô tả (trên hồ sơ)</p>
                <p className="mt-0.5 whitespace-pre-wrap break-words text-slate-700">{lead.description?.trim() || '—'}</p>
              </div>
              <Info
                label="Điểm (profile đang chọn)"
                value={String(scoringPreview?.calculatedScore ?? lead.calculatedScore)}
              />
              <div>
                <p className="text-xs text-slate-500">Nhãn (profile)</p>
                <div className="mt-1">
                  <TagBadge tag={scoringPreview?.priorityTag ?? lead.priorityTag} />
                </div>
              </div>
            </div>

            {db ? (
              <CounselorLeadProgressForm
                key={`cprog-${lead.id}`}
                lead={lead}
                db={db}
                onUpdated={onUpdated}
              />
            ) : null}

            {canReassignLead && db ? (
              <LeadCrmQuickBlock
                key={`${lead.id}-${lead.updatedAt.toMillis()}`}
                lead={lead}
                db={db}
                counselorUsers={counselorUsers}
                pickListUsers={pickListUsers}
                counselorsLoading={counselorsLoading}
                reassignElevated={reassignElevated}
                onUpdated={onUpdated}
              />
            ) : null}

            <section className="rounded-2xl border border-slate-200/80 bg-white/50 p-4 shadow-inner">
              <h3 className="app-section-heading">Ghi chú và tương tác</h3>
              <p className="mt-1 text-sm text-slate-500">
                Lưu vào Firestore (<code className="text-emerald-700">interactions</code>) — mỗi lần lưu gồm ghi chú
                text, <strong>nhãn đánh giá</strong> và (tuỳ chọn) pipeline. Dưới đây là <strong>lịch sử</strong> các lần
                đã lưu (đọc lại để nắm tiến độ tư vấn).
              </p>
              <label className="mt-3 block text-sm font-medium text-slate-600">
                Ghi chú
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={3}
                  className="mt-1 w-full rounded-xl border border-slate-200/80 bg-white/90 px-3 py-2 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-emerald-400/30"
                />
              </label>
              <label className="mt-3 block text-sm font-medium text-slate-600">
                Nhãn đánh giá (lưu kèm ghi chú)
                <select
                  value={evalTag}
                  onChange={(e) => setEvalTag(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-200/80 bg-white/90 px-3 py-2 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-emerald-400/30"
                >
                  {EVALUATION_TAGS.map((t) => (
                    <option key={t} value={t} className="bg-white">
                      {t}
                    </option>
                  ))}
                </select>
              </label>
              <label className="mt-3 block text-xs text-slate-600">
                Pipeline
                <select
                  value={statusForForm}
                  onChange={(e) => setStatusDirty(e.target.value as LeadPipelineStatus)}
                  className="mt-1 w-full rounded-xl border border-slate-200/80 bg-white/90 px-3 py-2 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-emerald-400/30"
                >
                  {(Object.keys(PIPELINE_LABEL) as LeadPipelineStatus[]).map((k) => (
                    <option key={k} value={k} className="bg-white">
                      {PIPELINE_LABEL[k]}
                    </option>
                  ))}
                </select>
              </label>
              {msg ? <p className="mt-2 text-xs text-emerald-200">{msg}</p> : null}
              <button
                type="button"
                disabled={saving || !db || !canSaveInteraction}
                onClick={() => void save()}
                className="mt-4 w-full rounded-xl border border-emerald-400/40 bg-emerald-500/25 py-2.5 text-sm font-medium text-emerald-50 shadow-lg shadow-emerald-900/30 hover:bg-emerald-500/35 disabled:opacity-50"
              >
                {saving ? 'Đang lưu…' : 'Lưu tương tác'}
              </button>
            </section>

            <section>
              <h3 className="app-section-heading">Lịch sử ghi chú &amp; đánh giá</h3>
              <p className="mt-1 text-xs text-slate-500">Các lần tương tác đã lưu — đọc từ cũ đến mới trong danh sách.</p>
              {intLoading ? <p className="mt-2 text-sm text-slate-500">Đang tải…</p> : null}
              <ul className="scroll-touch mt-3 max-h-72 space-y-2 overflow-y-auto overscroll-contain">
                {interactions.map((it) => (
                  <li
                    key={it.id}
                    className="rounded-xl border border-slate-200/70 bg-white/70 p-2 text-xs text-slate-600"
                  >
                    <p className="font-medium text-slate-800">
                      {it.channel} {it.evaluationTag ? `· ${it.evaluationTag}` : ''}
                    </p>
                    {it.counselorNote ? (
                      <p className="mt-1 whitespace-pre-wrap">{it.counselorNote}</p>
                    ) : null}
                    {it.aiSentiment ? (
                      <p className="mt-1 text-violet-200">
                        AI: {it.aiSentiment.label} ({it.aiSentiment.score}) — {it.aiSentiment.summary}
                      </p>
                    ) : null}
                    <p className="mt-1 text-xs text-slate-500">
                      {it.timestamp?.toDate?.().toLocaleString?.('vi-VN') ?? ''}
                    </p>
                  </li>
                ))}
                {!intLoading && !interactions.length ? (
                  <li className="text-xs text-slate-500">Chưa có tương tác.</li>
                ) : null}
              </ul>
            </section>
          </div>

          <div className="scroll-touch min-h-0 overflow-y-auto overscroll-contain p-5">
            <h3 className="app-section-heading">Playbook tư vấn</h3>
            <p className="mt-1 text-sm text-slate-500">
              Gợi ý chiến lược theo điều kiện hồ sơ (cấu hình trong mục Cài đặt).
            </p>
            <div className="mt-4 space-y-4">
              {matched.length ? (
                matched.map((pb) => (
                  <div
                    key={pb.id}
                    className="rounded-2xl border border-amber-200/80 bg-amber-50/90 p-4 shadow-inner"
                  >
                    <p className="text-xs font-semibold uppercase tracking-wide text-amber-800">
                      {pb.title}
                    </p>
                    {pb.keySellingPoints?.length ? (
                      <ul className="mt-2 list-inside list-disc text-xs text-slate-700">
                        {pb.keySellingPoints.map((x) => (
                          <li key={x}>{x}</li>
                        ))}
                      </ul>
                    ) : null}
                    <p className="mt-2 text-sm leading-relaxed text-slate-800">{pb.strategy}</p>
                    {pb.objectionHandling?.length ? (
                      <div className="mt-3 border-t border-slate-200/80 pt-2">
                        <p className="text-xs font-medium text-amber-800">Phản đối dự kiến</p>
                        <ul className="mt-1 list-inside list-decimal text-xs text-slate-600">
                          {pb.objectionHandling.map((x) => (
                            <li key={x}>{x}</li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                  </div>
                ))
              ) : (
                <p className="text-xs text-slate-500">Không có playbook khớp điều kiện hiện tại.</p>
              )}
            </div>
          </div>
        </div>
          ) : (
            <div className="scroll-touch min-h-0 flex-1 overflow-y-auto overscroll-contain border-t border-slate-200/80 bg-gradient-to-b from-slate-50/95 to-sky-50/40 p-5">
              <h2 className="app-section-heading text-left normal-case">Dòng thời gian nhật ký</h2>
              <p className="mt-1 text-sm text-slate-600">
                Lịch sử thao tác hệ thống — trạng thái, phân công, ghi chú, AI.
              </p>
              <div className="mt-4">
                <LeadAuditTimeline entries={auditEntries} loading={auditLoading} error={auditError} />
              </div>
            </div>
          )}

          {canRunAi ? (
            <section
              className={`app-card-glass relative shrink-0 border-t border-amber-200/80 p-4 text-slate-900 shadow-md backdrop-blur-2xl ${
                aiRunning ? 'ring-2 ring-amber-400/40 ring-inset animate-pulse' : ''
              }`}
            >
              <div className="pointer-events-none absolute inset-0 rounded-[inherit] bg-[radial-gradient(ellipse_at_top_right,rgba(168,85,247,0.08),transparent_50%),radial-gradient(ellipse_at_bottom_left,rgba(245,158,11,0.1),transparent_45%)]" />
              <div className="relative">
                <div className="flex items-center gap-2">
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-amber-200/80 bg-white/90 shadow-md shadow-amber-500/15">
                    <Sparkles className="h-4 w-4 text-amber-600" strokeWidth={1.75} />
                  </span>
                  <div>
                    <VietMyAccentHeading as="h3" tone="onLight" size="md" className="block">
                      Phân tích LLM
                    </VietMyAccentHeading>
                    <p className="mt-1 text-sm text-slate-600">
                      Gọi API Google Gemini hoặc OpenAI (ChatGPT) đã lưu trong trình duyệt — kết quả ghi vào hồ sơ
                      (Firestore).
                    </p>
                  </div>
                </div>

                {aiTasksErr ? (
                  <p className="mt-2 text-sm text-rose-700">{aiTasksErr}</p>
                ) : null}

                <label className="mt-3 block text-sm font-medium text-slate-600">
                  Tác vụ phân tích
                  <select
                    value={resolvedAiTaskId}
                    onChange={(e) => {
                      setAiSelTaskId(e.target.value)
                      setAiErr(null)
                      setAiPreview(null)
                    }}
                    disabled={aiTasksLoading || !aiTasks.length}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-base text-slate-900 outline-none focus:ring-2 focus:ring-amber-200 disabled:opacity-50"
                  >
                    {!aiTasks.length ? (
                      <option value="">Chưa có tác vụ — tạo trong Cài đặt</option>
                    ) : (
                      aiTasks.map((t) => (
                        <option key={t.id} value={t.id} className="bg-white">
                          {t.name}
                        </option>
                      ))
                    )}
                  </select>
                </label>

                {storedAiInsight && formatAiRunAt(storedAiInsight.runAt) ? (
                  <p className="mt-2 text-xs text-slate-500">
                    Lần chạy gần nhất: {formatAiRunAt(storedAiInsight.runAt)}
                  </p>
                ) : null}

                <button
                  type="button"
                  disabled={
                    aiRunning || aiTasksLoading || !selectedAITask || !aiTasks.length || !db
                  }
                  onClick={() => void runAiLlmAnalysis()}
                  className="group relative mt-3 flex w-full items-center justify-center gap-2 overflow-hidden rounded-xl border border-amber-400/45 bg-gradient-to-r from-violet-600/95 via-fuchsia-600/90 to-amber-600/95 px-4 py-2.5 text-sm font-semibold text-white shadow-[0_0_24px_rgba(245,158,11,0.22)] transition hover:brightness-110 disabled:opacity-45"
                >
                  <span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/15 to-transparent opacity-0 transition group-hover:translate-x-full group-hover:opacity-100 group-hover:duration-700" />
                  <Wand2 className="relative h-4 w-4 shrink-0 text-amber-100" strokeWidth={1.75} />
                  <span className="relative">
                    {aiRunning ? 'Đang phân tích…' : 'Chạy phân tích AI'}
                  </span>
                </button>

                {aiErr ? <p className="mt-2 text-sm text-rose-700">{aiErr}</p> : null}

                {aiRunning ? (
                  <div className="mt-4 space-y-2">
                    <p className="text-xs text-slate-400">Đang suy luận…</p>
                    <div className="h-10 rounded-xl ai-skeleton-shimmer" />
                    <div
                      className="h-10 rounded-xl ai-skeleton-shimmer"
                      style={{ animationDelay: '0.15s' }}
                    />
                    <div
                      className="h-24 rounded-xl ai-skeleton-shimmer"
                      style={{ animationDelay: '0.3s' }}
                    />
                  </div>
                ) : displayAiResult ? (
                  <div className="mt-4 rounded-2xl border border-rose-200/60 bg-gradient-to-br from-white/95 to-rose-50/40 p-3 shadow-inner backdrop-blur-md">
                    <VietMyAccentHeading as="p" tone="onLight" size="sm" className="mb-2 block">
                      Kết quả
                    </VietMyAccentHeading>
                    <AiInsightsGrid data={displayAiResult} />
                  </div>
                ) : (
                  <p className="mt-3 text-xs text-slate-500">
                    Chọn tác vụ và bấm chạy. API key lưu cục bộ trên trình duyệt (localStorage).
                  </p>
                )}
              </div>
            </section>
          ) : null}
        </div>
      </aside>
    </>
  )
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-0.5 text-slate-700">{value || '—'}</p>
    </div>
  )
}
