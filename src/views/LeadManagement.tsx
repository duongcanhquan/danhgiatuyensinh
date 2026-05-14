import type { MouseEvent, ReactNode } from 'react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useSearchParams } from 'react-router-dom'
import { motion } from 'motion/react'
import { BookOpen, Bot, ChevronDown, Download, Info as InfoIcon, Sparkles, Wand2, X, Zap } from 'lucide-react'
import { addDoc, collection, deleteField, doc, setDoc, Timestamp, updateDoc, writeBatch } from 'firebase/firestore'
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
import { useLeads, type LeadListServerFilters } from '../hooks/useLeads'
import { useMasterData } from '../hooks/useMasterData'
import { LEAD_AI_INSIGHT_AGGREGATE_ID, useLeadAiInsightTasks } from '../hooks/useLeadAiInsightTasks'
import { useInteractions } from '../hooks/useInteractions'
import { useConsultingPlaybooks } from '../hooks/useConsultingPlaybooks'
import { useAuth } from '../hooks/useAuth'
import { isAdminLikeRole } from '../auth/roleUtils'
import { useLeadScoring } from '../hooks/useLeadScoring'
import { TagBadge } from '../components/TagBadge'
import { playbooksMatchingLead } from '../utils/playbookMatch'
import { evaluateLead, leadToEvaluationRecord } from '../utils/scoring'
import {
  exportEvaluatedLeadsToXlsx,
  exportSelectedEvaluatedLeadsToXlsx,
} from '../utils/exportEvaluatedLeads'
import { loadAIConfigFromStorage, runAIAnalysis } from '../utils/aiEngine'
import { fetchLeadInteractionNotesBulk, runBatchAiMiner } from '../utils/aiMiner'
import {
  fetchInteractionsBulkForGatekeeper,
  filterLeadsForAI,
  loadAiGatekeeperFromStorage,
  mergeGatekeeperConfig,
} from '../utils/aiGatekeeper'
import { buildInstitutionalRagBlock } from '../utils/knowledgeRag'
import { buildMlWinHoverText, resolveMlWinDisplay } from '../utils/mlWinMock'
import { useKnowledgeDocuments } from '../hooks/useKnowledgeDocuments'
import { useAITasks } from '../hooks/useAITasks'
import { MlWinGauge } from '../components/MlWinGauge'
import { useScriptSnippets } from '../hooks/useScriptSnippets'
import { ConsultingAssistantPanel } from '../components/ConsultingAssistantPanel'
import { LeadScoringSignalsPanel } from '../components/LeadScoringSignalsPanel'
import { BulkLeadActionBar } from '../components/bulk/BulkLeadActionBar'
import { useCounselorDirectory } from '../hooks/useCounselorDirectory'
import { commitAuditLog } from '../services/auditLog'
import { leadTouchPatch } from '../utils/leadTouch'
import { counselorStatusToPipeline } from '../utils/leadIdentity'
import { formatStaffDirectoryLabel, formatStaffDisplayName } from '../utils/counselorDisplay'
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

/** Tooltip cột — ngắn; chi tiết công thức nằm trên từng ô (đặt chuột lên gauge). */
const ML_WIN_COLUMN_HINT =
  'Điểm thông tin = tỷ lệ thông tin có trên hồ sơ một người. MVP: app cộng theo các trường điền (kẹp 5–96%); Đã lưu: Firestore (mlWinProbability + mlExplanation). Đặt chuột lên vòng % để xem bảng điểm.'

function isElevatedForAdminFilters(role: string | undefined): boolean {
  return role === 'admin' || role === 'super_admin' || role === 'head_of_department' || role === 'head_of_profession'
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

function formatAssignedCounselorLabel(l: Lead, names: Map<string, string>): string {
  const uid = l.assignedTo ?? l.assignedCounselorId
  if (!uid) return '—'
  return names.get(uid) ?? `${uid.slice(0, 8)}…`
}

/** Bỏ dòng nhật ký nhập `[Import]…` khỏi mô tả — chỉ dùng khi hiển thị, không sửa dữ liệu gốc. */
function leadDescriptionForDisplay(raw: string | undefined): string {
  if (!raw?.trim()) return ''
  const kept = raw.split('\n').filter((line) => {
    const t = line.trim()
    return !(t && /^\[Import\]/i.test(t))
  })
  return kept.join('\n').replace(/^\s+|\s+$/g, '')
}

/** Rút gọn ghi chú / mô tả trên bảng — bản đầy đủ trong `title` ô hoặc trong panel chi tiết. */
function formatDescPreview(raw: string | undefined, max = 64): string {
  const cleaned = leadDescriptionForDisplay(raw)
  const t = cleaned.replace(/\s+/g, ' ').trim()
  if (!t) return '—'
  return t.length <= max ? t : `${t.slice(0, max).trim()}…`
}

export function LeadManagement() {
  const db = getFirestoreDb()
  const configured = isFirebaseConfigured()
  const {
    regionLabels,
    highSchoolLabels,
    majorLabels,
    byKind,
    academicPerformanceLabels,
    catalogs,
  } = useMasterData()
  const { profile, can, canRunLlmAnalysis } = useAuth()
  const { users: directoryUsers, counselors: counselorUsers, loading: counselorsLoading } = useCounselorDirectory()
  const { documents: knowledgeDocuments } = useKnowledgeDocuments()
  const institutionalRagBlock = useMemo(
    () => buildInstitutionalRagBlock(knowledgeDocuments),
    [knowledgeDocuments],
  )

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

  const [tagFilter, setTagFilter] = useState<string>('ALL')
  const [regionFilter, setRegionFilter] = useState<string>('ALL')
  const [majorFilter, setMajorFilter] = useState<string>('ALL')
  const [statusFilter, setStatusFilter] = useState<string>('ALL')
  const [crmStatusFilter, setCrmStatusFilter] = useState<string>('ALL')
  const [sourceFilter, setSourceFilter] = useState<string>('ALL')
  const [scoreMinInput, setScoreMinInput] = useState('')
  const [scoreMaxInput, setScoreMaxInput] = useState('')
  const [aiShortlistOnly, setAiShortlistOnly] = useState(false)

  const counselorDirectoryLabelById = useMemo(() => {
    const m = new Map<string, string>()
    for (const c of directoryUsers) {
      if (c.isActive) m.set(c.id, formatStaffDirectoryLabel(c))
    }
    return m
  }, [directoryUsers])

  const counselorDisplayNameById = useMemo(() => {
    const m = new Map<string, string>()
    for (const c of directoryUsers) {
      if (c.isActive) m.set(c.id, formatStaffDisplayName(c))
    }
    return m
  }, [directoryUsers])

  const leadServerFilters = useMemo((): LeadListServerFilters | undefined => {
    const o: LeadListServerFilters = {}
    const scoreMinParsed =
      scoreMinInput.trim() === '' || Number.isNaN(Number(scoreMinInput)) ? null : Number(scoreMinInput)
    const scoreMaxParsed =
      scoreMaxInput.trim() === '' || Number.isNaN(Number(scoreMaxInput)) ? null : Number(scoreMaxInput)
    if (scoreMinParsed != null) o.scoreMin = scoreMinParsed
    if (scoreMaxParsed != null) o.scoreMax = scoreMaxParsed
    if (statusFilter !== 'ALL') o.pipelineStatus = statusFilter as LeadPipelineStatus
    if (crmStatusFilter !== 'ALL') o.crmStatus = crmStatusFilter as LeadCounselorStatus
    if (tagFilter !== 'ALL') o.priorityTag = tagFilter as PriorityTag
    if (regionFilter !== 'ALL') o.province = regionFilter
    if (majorFilter !== 'ALL') o.educationLevel = majorFilter
    if (sourceFilter !== 'ALL') o.source = sourceFilter
    if (aiShortlistOnly) o.aiShortlistedOnly = true
    if (showAdminGlobalFilters) {
      if (adminUploaderIds.length) o.uploadedByIn = adminUploaderIds.slice(0, 10)
      if (adminRegions.length) o.provinceIn = adminRegions.slice(0, 10)
      if (adminTags.length === 1) {
        o.priorityTag = adminTags[0]
      } else if (adminTags.length > 1) {
        o.priorityTagsIn = adminTags.slice(0, 10) as PriorityTag[]
      }
      if (adminSchools.length) o.highSchoolIn = adminSchools.slice(0, 10)
      if (adminAssignedCounselorIds.length) o.assignedCounselorIn = adminAssignedCounselorIds.slice(0, 10)
      const fromMs = adminDateFrom ? parseIsoDayStartMs(adminDateFrom) : null
      const toMs = adminDateTo ? parseIsoDayEndMs(adminDateTo) : null
      if (fromMs != null || toMs != null) {
        o.adminDateField = adminDateField
        if (fromMs != null) o.adminDateFromMs = fromMs
        if (toMs != null) o.adminDateToMs = toMs
      }
    }
    return Object.keys(o).length ? o : undefined
  }, [
    statusFilter,
    crmStatusFilter,
    tagFilter,
    regionFilter,
    majorFilter,
    sourceFilter,
    showAdminGlobalFilters,
    adminUploaderIds,
    adminRegions,
    adminTags,
    adminSchools,
    adminAssignedCounselorIds,
    adminDateFrom,
    adminDateTo,
    adminDateField,
    scoreMinInput,
    scoreMaxInput,
    aiShortlistOnly,
  ])

  const {
    leads,
    loading,
    loadingPage,
    error,
    currentPage,
    totalPages: firestoreTotalPages,
    setPage,
  } = useLeads({
    serverFilters: leadServerFilters,
    searchText: urlQuery,
    directoryLabels: counselorDirectoryLabelById,
    dataMode: 'paged',
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

  const {
    scoringProfiles,
    profilesLoading,
    setScoringProfileId,
    resolvedScoringProfileId,
    activeScoringProfile,
    scoreByLeadId,
  } = useLeadScoring(leads)

  const effectiveLeadTag = useCallback(
    (l: Lead) => (activeScoringProfile ? (scoreByLeadId.get(l.id)?.priorityTag ?? l.priorityTag) : l.priorityTag),
    [activeScoringProfile, scoreByLeadId],
  )

  const {
    snippets: scriptSnippets,
    loading: scriptSnippetsLoading,
    error: scriptSnippetsErr,
  } = useScriptSnippets()

  const reassignPickList = useMemo(() => {
    const base = counselorUsers
    const elevated = isElevatedForAdminFilters(profile?.role)
    if (!elevated) return base
    const extras = directoryUsers.filter(
      (u) => u.isActive && isAdminLikeRole(u.role) && !base.some((c) => c.id === u.id),
    )
    return [...base, ...extras].sort((a, b) =>
      formatStaffDirectoryLabel(a).localeCompare(formatStaffDirectoryLabel(b), 'vi'),
    )
  }, [counselorUsers, directoryUsers, profile?.role])

  const uploaderOptions = useMemo(() => {
    if (showAdminGlobalFilters) {
      const out: [string, string][] = []
      for (const u of directoryUsers) {
        if (u.isActive && u.id) out.push([u.id, formatStaffDirectoryLabel(u)])
      }
      return out.sort((a, b) => a[1].localeCompare(b[1], 'vi'))
    }
    const m = new Map<string, string>()
    for (const l of leads) {
      if (l.uploadedBy) m.set(l.uploadedBy, (l.uploaderName || l.uploadedBy).trim())
    }
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1], 'vi'))
  }, [showAdminGlobalFilters, directoryUsers, leads])

  const schoolOptions = useMemo(() => {
    if (showAdminGlobalFilters && highSchoolLabels.length) {
      return [...highSchoolLabels].sort((a, b) => a.localeCompare(b, 'vi'))
    }
    const s = new Set<string>()
    for (const l of leads) {
      const n = (l.highSchool ?? '').trim()
      if (n) s.add(n)
    }
    return [...s].sort((a, b) => a.localeCompare(b, 'vi'))
  }, [showAdminGlobalFilters, highSchoolLabels, leads])

  const regionOptionsAdmin = useMemo(() => {
    if (showAdminGlobalFilters && regionLabels.length) {
      return [...regionLabels].sort((a, b) => a.localeCompare(b, 'vi'))
    }
    const s = new Set<string>()
    for (const l of leads) {
      if (l.province.trim()) s.add(l.province.trim())
    }
    return [...s].sort((a, b) => a.localeCompare(b, 'vi'))
  }, [showAdminGlobalFilters, regionLabels, leads])
  const [selected, setSelected] = useState<Lead | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())
  const [bulkModal, setBulkModal] = useState<null | 'reassign' | 'crm'>(null)
  const [bulkReassignUid, setBulkReassignUid] = useState<string>('')
  const [bulkCrmStatus, setBulkCrmStatus] = useState<LeadCounselorStatus>('NEW')
  const [bulkBusy, setBulkBusy] = useState(false)
  const [aiMinerProgress, setAiMinerProgress] = useState<null | { total: number; done: number }>(null)
  const [aiMinerError, setAiMinerError] = useState<string | null>(null)
  const [gatekeeperBusy, setGatekeeperBusy] = useState(false)
  const [gatekeeperModal, setGatekeeperModal] = useState<null | {
    totalSelected: number
    warmCount: number
    skipped: number
    passed: Lead[]
  }>(null)

  const isElevatedLeadScope = isElevatedForAdminFilters(profile?.role)
  const canPeerReassignLeads = Boolean(can('leads:reassign:peer'))
  const showBulkReassign = isElevatedLeadScope || canPeerReassignLeads
  const canBulkWrite = Boolean(can('leads:write:self_assigned') || showBulkReassign)

  const selectedWarmCount = useMemo(
    () => leads.filter((l) => selectedIds.has(l.id) && effectiveLeadTag(l) === 'WARM').length,
    [leads, selectedIds, effectiveLeadTag],
  )

  const regions = useMemo(() => {
    if (showAdminGlobalFilters && regionLabels.length) {
      return [...regionLabels].sort((a, b) => a.localeCompare(b, 'vi'))
    }
    const s = new Set<string>()
    for (const l of leads) {
      if (l.province.trim()) s.add(l.province.trim())
    }
    return [...s].sort()
  }, [showAdminGlobalFilters, regionLabels, leads])

  const majors = useMemo(() => {
    if (showAdminGlobalFilters && majorLabels.length) {
      return [...majorLabels].sort((a, b) => a.localeCompare(b, 'vi'))
    }
    const s = new Set<string>()
    for (const l of leads) {
      if (l.educationLevel.trim()) s.add(l.educationLevel.trim())
    }
    return [...s].sort()
  }, [showAdminGlobalFilters, majorLabels, leads])

  const sources = useMemo(() => {
    const s = new Set<string>()
    for (const l of leads) {
      const src = (l.source ?? '').trim()
      if (src) s.add(src)
    }
    return [...s].sort((a, b) => a.localeCompare(b, 'vi'))
  }, [leads])

  const filtered = useMemo(() => {
    const minScore =
      scoreMinInput.trim() === '' || Number.isNaN(Number(scoreMinInput)) ? null : Number(scoreMinInput)
    const maxScore =
      scoreMaxInput.trim() === '' || Number.isNaN(Number(scoreMaxInput)) ? null : Number(scoreMaxInput)
    if (minScore == null && maxScore == null) return leads
    return leads.filter((l) => {
      const displayScore = activeScoringProfile
        ? (scoreByLeadId.get(l.id)?.calculatedScore ?? l.calculatedScore)
        : l.calculatedScore
      if (minScore != null && displayScore < minScore) return false
      if (maxScore != null && displayScore > maxScore) return false
      return true
    })
  }, [leads, scoreMinInput, scoreMaxInput, activeScoringProfile, scoreByLeadId])

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

  /** Phân trang theo Firestore / bucket tìm kiếm — hook đã trả đúng một trang (≤30 dòng). */
  const displayTotalPages = Math.max(1, firestoreTotalPages)

  useEffect(() => {
    if (currentPage > displayTotalPages) setPage(displayTotalPages)
  }, [currentPage, displayTotalPages, setPage])

  const pagedRows = useMemo(() => sortedFiltered, [sortedFiltered])

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
    setAiShortlistOnly(false)
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        next.delete('q')
        return next
      },
      { replace: true },
    )
    setPage(1)
  }, [setSearchParams, setPage])

  const handleExportEvaluated = () => {
    const m = new Map<string, { calculatedScore: number; priorityTag: PriorityTag }>()
    for (const l of sortedFiltered) {
      const ev = activeScoringProfile
        ? scoreByLeadId.get(l.id) ?? evaluateLead(leadToEvaluationRecord(l), activeScoringProfile, scoringMasterBuckets)
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
          ? scoreByLeadId.get(l.id) ?? evaluateLead(leadToEvaluationRecord(l), activeScoringProfile, scoringMasterBuckets)
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

  const executeBulkAiMiner = useCallback(
    async (warmPassed: Lead[]) => {
      if (!db || !profile) return
      if (!canRunLlmAnalysis) {
        setAiMinerError(
          'Tác vụ LLM cần được Quản lý bật «Cho phép dùng LLM & tác vụ AI» trong Cài đặt → Quản lý nhân sự, hoặc dùng tài khoản Siêu quản trị.',
        )
        return
      }
      const cfg = loadAIConfigFromStorage()
      if (!cfg) {
        setAiMinerError('Chưa cấu hình LLM — mở Cài đặt và lưu API key (tab LLM).')
        return
      }
      if (!warmPassed.length) return
      setGatekeeperModal(null)
      setAiMinerError(null)
      setAiMinerProgress({ total: warmPassed.length, done: 0 })
      try {
        const notes = await fetchLeadInteractionNotesBulk(
          db,
          warmPassed.map((l) => l.id),
        )
        const results = await runBatchAiMiner(warmPassed, cfg, {
          notesByLeadId: notes,
          onChunkProgress: (done, total) => setAiMinerProgress({ total, done }),
        })
        let batch = writeBatch(db)
        let ops = 0
        for (const r of results) {
          batch.update(doc(db, FS_COLLECTIONS.leads, r.leadId), {
            isAiShortlisted: r.isShortlisted,
            aiShortlistReason:
              r.reasoning ||
              (r.isShortlisted ? 'Được AI đánh dấu shortlist — xem nhật ký tương tác.' : 'Không đủ tín hiệu shortlist.'),
            recommendedAction:
              r.nextBestAction ||
              (r.isShortlisted ? 'Liên hệ ngay theo kênh ưu tiên của phụ huynh.' : 'Tiếp tục nuôi lead trong nhóm WARM.'),
            aiProcessedAt: Timestamp.now(),
            ...leadTouchPatch(),
          })
          ops++
          if (ops >= 450) {
            await batch.commit()
            batch = writeBatch(db)
            ops = 0
          }
        }
        if (ops) await batch.commit()
        const performer = profile.displayName?.trim() || profile.email || profile.id
        const shorted = results.filter((x) => x.isShortlisted).length
        await commitAuditLog(db, {
          leadId: warmPassed[0]!.id,
          actionType: 'AI_RUN',
          description: `AI Lead Miner (shortlist, sau Gatekeeper): ${results.length} hồ sơ → ${shorted} shortlist`,
          performedBy: profile.id,
          performedByName: performer,
        })
      } catch (e) {
        console.error(e)
        setAiMinerError(e instanceof Error ? e.message : 'Không chạy được AI Lead Miner.')
      } finally {
        setAiMinerProgress(null)
        setSelectedIds(new Set())
      }
    },
    [db, profile, canRunLlmAnalysis],
  )

  const openAiMinerGatekeeper = useCallback(async () => {
    if (!db || !profile) return
    if (!canRunLlmAnalysis) {
      setAiMinerError(
        'Tác vụ LLM cần được Quản lý bật «Cho phép dùng LLM & tác vụ AI» trong Cài đặt → Quản lý nhân sự, hoặc dùng tài khoản Siêu quản trị.',
      )
      return
    }
    const cfg = loadAIConfigFromStorage()
    if (!cfg) {
      setAiMinerError('Chưa cấu hình LLM — mở Cài đặt và lưu API key (tab LLM).')
      return
    }
    const warmRows = leads.filter((l) => selectedIds.has(l.id) && effectiveLeadTag(l) === 'WARM')
    if (!warmRows.length) {
      setAiMinerError('Chọn ít nhất một hồ sơ có nhãn WARM (theo profile chấm điểm hiện tại).')
      return
    }
    setAiMinerError(null)
    setGatekeeperBusy(true)
    try {
      const interactions = await fetchInteractionsBulkForGatekeeper(
        db,
        warmRows.map((l) => l.id),
      )
      const rules = mergeGatekeeperConfig(loadAiGatekeeperFromStorage())
      const { passed, skipped } = filterLeadsForAI(warmRows, interactions, rules)
      setGatekeeperModal({
        totalSelected: selectedIds.size,
        warmCount: warmRows.length,
        skipped: skipped.length,
        passed,
      })
    } catch (e) {
      console.error(e)
      setAiMinerError(
        e instanceof Error ? e.message : 'Không tải được tương tác cho bộ lọc AI Gatekeeper.',
      )
    } finally {
      setGatekeeperBusy(false)
    }
  }, [db, profile, leads, selectedIds, effectiveLeadTag, canRunLlmAnalysis])

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
          <p className="app-page-kicker">VietMy Admissions OS</p>
          <VietMyAccentHeading as="h1" tone="onLight" size="xl" className="mt-1 block">
            Hồ sơ
          </VietMyAccentHeading>
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
        <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:gap-3">
          <details className="group min-w-0 flex-1 rounded-lg border border-slate-200/80 bg-white/50 px-2 py-1 shadow-sm open:bg-white/85 sm:px-2.5">
            <summary className="flex cursor-pointer list-none items-center gap-2 rounded-md py-1 text-[10px] font-bold uppercase tracking-wide text-slate-600 marker:content-none [&::-webkit-details-marker]:hidden">
              <ChevronDown
                className="h-4 w-4 shrink-0 text-slate-500 transition duration-200 group-open:rotate-180"
                strokeWidth={2}
                aria-hidden
              />
              <span className="shrink-0">Bộ chấm điểm</span>
              <span className="min-w-0 flex-1 truncate text-left text-[10px] font-semibold normal-case tracking-normal text-slate-800 group-open:hidden">
                {profilesLoading
                  ? 'Đang tải…'
                  : activeScoringProfile?.profileName?.trim() || (!scoringProfiles.length ? 'Chưa có profile' : '—')}
              </span>
            </summary>
            <div className="mt-2 flex flex-col gap-2 border-t border-slate-200/60 pt-2 sm:flex-row sm:items-end">
              <label className="min-w-0 flex-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                Chọn profile
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
                  Xuất Excel (trang hiện tại)
                </button>
              </div>
            </div>
          </details>
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

        <div className="flex flex-nowrap items-end gap-1.5 overflow-x-auto border-t border-slate-200/70 pb-0.5 pt-2 [scrollbar-width:thin]">
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
          <FilterSelect
            compact
            label="Nguồn"
            value={sourceFilter}
            onChange={setSourceFilter}
            options={[{ v: 'ALL', t: 'Tất cả' }, ...sources.map((s) => ({ v: s, t: s }))]}
          />
          <label className="flex shrink-0 flex-col text-[10px] font-bold uppercase tracking-wide text-slate-500">
            Điểm từ
            <input
              type="number"
              inputMode="numeric"
              placeholder="—"
              value={scoreMinInput}
              onChange={(e) => setScoreMinInput(e.target.value)}
              className="mt-0.5 w-[4.5rem] shrink-0 rounded-md border border-slate-200/95 bg-white px-1.5 py-1 text-[11px] tabular-nums text-slate-900 outline-none transition focus:border-amber-400 focus:ring-1 focus:ring-amber-100"
            />
          </label>
          <label className="flex shrink-0 flex-col text-[10px] font-bold uppercase tracking-wide text-slate-500">
            Điểm đến
            <input
              type="number"
              inputMode="numeric"
              placeholder="—"
              value={scoreMaxInput}
              onChange={(e) => setScoreMaxInput(e.target.value)}
              className="mt-0.5 w-[4.5rem] shrink-0 rounded-md border border-slate-200/95 bg-white px-1.5 py-1 text-[11px] tabular-nums text-slate-900 outline-none transition focus:border-amber-400 focus:ring-1 focus:ring-amber-100"
            />
          </label>
          <button
            type="button"
            onClick={clearQuickFilters}
            className="shrink-0 self-end rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-[11px] font-semibold whitespace-nowrap text-slate-700 shadow-sm transition hover:border-rose-300 hover:bg-rose-50 hover:text-rose-900"
          >
            Xóa lọc nhanh
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-slate-200/60 pt-2">
          <button
            type="button"
            onClick={() => {
              setAiShortlistOnly((v) => !v)
              setPage(1)
            }}
            className={[
              'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold uppercase tracking-wide transition',
              aiShortlistOnly
                ? 'border-amber-400 bg-gradient-to-r from-amber-500 to-yellow-400 text-amber-950 shadow-[0_0_22px_rgba(251,191,36,0.5)]'
                : 'border-slate-200/90 bg-white/90 text-slate-700 hover:border-amber-300 hover:bg-amber-50/80',
            ].join(' ')}
          >
            <Zap className="h-3.5 w-3.5 shrink-0 text-current" strokeWidth={2.5} aria-hidden />
            ⚡ AI Shortlist
          </button>
          {aiShortlistOnly ? (
            <span className="text-[11px] leading-snug text-slate-600">
              Chỉ hồ sơ có <span className="font-semibold text-amber-900">isAiShortlisted</span> trên Firestore.
            </span>
          ) : null}
        </div>
      </section>

      {inspectProfileOpen && activeScoringProfile ? (
        <ScoringProfileInspectModal profile={activeScoringProfile} onClose={() => setInspectProfileOpen(false)} />
      ) : null}

      <div className="app-card-glass-strong overflow-hidden transition-all duration-300">
        {aiMinerError ? (
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-rose-200/80 bg-rose-50/95 px-3 py-2 text-sm text-rose-900 sm:px-4">
            <span className="min-w-0 flex-1">{aiMinerError}</span>
            <button
              type="button"
              onClick={() => setAiMinerError(null)}
              className="shrink-0 rounded-lg border border-rose-300 bg-white px-2 py-1 text-xs font-semibold text-rose-800 hover:bg-rose-100"
            >
              Đóng
            </button>
          </div>
        ) : null}
        {sortedFiltered.length > 0 ? (
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/80 bg-slate-50/90 px-3 py-2 text-xs text-slate-700 sm:px-4">
            <span className="text-slate-600">
              Đang xem <span className="font-semibold text-slate-900">{pagedRows.length}</span> hồ sơ (trang{' '}
              {currentPage}/{displayTotalPages})
            </span>
            <div className="flex flex-wrap items-center gap-1">
              <button
                type="button"
                disabled={currentPage <= 1 || loadingPage}
                onClick={() => setPage(1)}
                className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-800 transition hover:bg-slate-50 disabled:opacity-40"
              >
                « Đầu
              </button>
              <button
                type="button"
                disabled={currentPage <= 1 || loadingPage}
                onClick={() => setPage(currentPage - 1)}
                className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-800 transition hover:bg-slate-50 disabled:opacity-40"
              >
                Trước
              </button>
              <button
                type="button"
                disabled={currentPage >= displayTotalPages || loadingPage}
                onClick={() => setPage(currentPage + 1)}
                className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-800 transition hover:bg-slate-50 disabled:opacity-40"
              >
                Sau
              </button>
              <button
                type="button"
                disabled={currentPage >= displayTotalPages || loadingPage}
                onClick={() => setPage(displayTotalPages)}
                className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-800 transition hover:bg-slate-50 disabled:opacity-40"
              >
                Cuối »
              </button>
            </div>
          </div>
        ) : null}
        <div className="scroll-touch max-h-[min(calc(100dvh-200px),78vh)] overflow-auto overscroll-contain">
          <table className="min-w-[1280px] w-full border-collapse text-left text-sm sm:text-[15px]">
            <thead className="sticky top-0 z-10 border-b border-slate-200/90 bg-white/85 backdrop-blur-xl">
              <tr className="text-xs font-medium uppercase tracking-wide text-slate-600 sm:text-sm">
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
                <th className="max-w-[6.5rem] px-2 py-3 text-sm font-medium normal-case">Mã KH</th>
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
                <th className="max-w-[6.5rem] px-2 py-3 text-sm font-medium normal-case">SĐT PH</th>
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
                <th className="max-w-[13rem] px-2 py-3 text-sm font-medium normal-case" title="Ghi chú / mô tả hồ sơ (ẩn dòng nhật ký nhập [Import])">
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
                <th className="w-16 min-w-[3.75rem] px-1 py-3 text-center text-xs font-medium normal-case">
                  <button
                    type="button"
                    onClick={() => toggleSort('mlWin')}
                    className="inline-flex flex-col items-center gap-0.5 text-violet-900 transition hover:text-violet-700"
                    title={ML_WIN_COLUMN_HINT}
                  >
                    <span className="leading-tight">Điểm</span>
                    <span className="leading-tight">thông tin</span>
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
                <th className="max-w-[7rem] px-2 py-3 text-sm font-medium normal-case">CRM</th>
                <th className="min-w-[6rem] max-w-[9rem] px-2 py-3 text-sm font-medium normal-case">TVV</th>
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
                const descForTable = leadDescriptionForDisplay(l.description)
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
                  <td className="px-4 py-3 font-medium text-slate-900">
                    <span className="inline-flex max-w-full items-center gap-1.5">
                      {l.isAiShortlisted ? (
                        <Zap
                          className="h-4 w-4 shrink-0 text-yellow-300 drop-shadow-[0_0_8px_rgba(250,204,21,0.95)]"
                          strokeWidth={2.5}
                          fill="currentColor"
                          aria-label="AI Shortlist"
                        />
                      ) : null}
                      <span className="min-w-0 truncate">{l.fullName || '—'}</span>
                    </span>
                  </td>
                  <td className="max-w-[6.5rem] truncate px-2 py-3 text-slate-600" title={l.customerId || undefined}>
                    {l.customerId || '—'}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{l.phone || '—'}</td>
                  <td className="max-w-[6.5rem] truncate px-2 py-3 text-slate-600" title={l.parentPhone || undefined}>
                    {l.parentPhone || '—'}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{l.educationLevel || '—'}</td>
                  <td className="px-4 py-3 text-slate-600">{l.province || '—'}</td>
                  <td
                    className="max-w-[13rem] truncate px-2 py-3 leading-snug text-slate-600"
                    title={descForTable.trim() ? descForTable : undefined}
                  >
                    {formatDescPreview(l.description)}
                  </td>
                  <td className="px-4 py-3 font-medium text-violet-700 transition-colors duration-300">{displayScore}</td>
                  <td className="cursor-help px-1 py-2 text-center" title={buildMlWinHoverText(ml)}>
                    <MlWinGauge value={ml.mlWinProbability} title={buildMlWinHoverText(ml)} />
                  </td>
                  <td className="px-4 py-3 transition-all duration-300">
                    <motion.span layout key={`${l.id}-${displayTag}`}>
                      <TagBadge tag={displayTag} />
                    </motion.span>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{PIPELINE_LABEL[l.pipelineStatus]}</td>
                  <td className="max-w-[7rem] truncate px-2 py-3 text-slate-600" title={LEAD_COUNSELOR_STATUS_LABELS[l.status]}>
                    {LEAD_COUNSELOR_STATUS_LABELS[l.status]}
                  </td>
                  <td
                    className="max-w-[9rem] truncate px-2 py-3 text-slate-600"
                    title={formatAssignedCounselorLabel(l, counselorDisplayNameById)}
                  >
                    {formatAssignedCounselorLabel(l, counselorDisplayNameById)}
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
          showAiMiner={tagFilter === 'WARM' && canRunLlmAnalysis}
          onAiMiner={() => void openAiMinerGatekeeper()}
          aiMinerDisabled={
            aiMinerProgress !== null ||
            gatekeeperBusy ||
            !loadAIConfigFromStorage() ||
            selectedWarmCount === 0
          }
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

      {gatekeeperModal && typeof document !== 'undefined'
        ? createPortal(
            <div className="fixed inset-0 z-[72] flex items-center justify-center px-4 py-8">
              <button
                type="button"
                className="absolute inset-0 bg-slate-950/40 backdrop-blur-md"
                aria-label="Đóng"
                onClick={() => setGatekeeperModal(null)}
              />
              <div className="pointer-events-none absolute inset-0 overflow-hidden">
                <div className="absolute -left-1/4 top-0 h-[120%] w-[70%] rounded-full bg-gradient-to-br from-violet-500/25 via-fuchsia-500/20 to-transparent blur-3xl" />
                <div className="absolute -right-1/4 bottom-0 h-[110%] w-[65%] rounded-full bg-gradient-to-tl from-cyan-400/20 via-teal-400/15 to-transparent blur-3xl" />
                <div className="absolute left-1/3 top-1/2 h-64 w-64 -translate-x-1/2 -translate-y-1/2 rounded-full bg-amber-300/10 blur-3xl" />
              </div>
              <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="gatekeeper-title"
                className="relative w-full max-w-lg overflow-hidden rounded-[22px] border border-white/45 bg-gradient-to-br from-white/35 via-violet-50/25 to-cyan-50/20 p-px shadow-[0_28px_90px_rgba(15,23,42,0.35)] backdrop-blur-2xl"
              >
                <div className="rounded-[20px] border border-white/30 bg-gradient-to-b from-white/50 to-white/15 px-6 py-6 sm:px-8 sm:py-7">
                  <p
                    id="gatekeeper-title"
                    className="text-center text-[11px] font-bold uppercase tracking-[0.2em] text-slate-600"
                  >
                    AI Gatekeeper · Tiết kiệm token
                  </p>
                  <p className="mt-4 text-center text-base font-semibold text-slate-900">
                    Bạn đã chọn {gatekeeperModal.totalSelected} hồ sơ
                    {gatekeeperModal.totalSelected !== gatekeeperModal.warmCount ? (
                      <span className="mt-1 block text-sm font-normal text-slate-600">
                        Trong đó {gatekeeperModal.warmCount} hồ sơ WARM được đưa vào bộ lọc tiền xử lý (chỉ nhóm này gọi
                        LLM).
                      </span>
                    ) : null}
                  </p>
                  {gatekeeperModal.warmCount > 0 ? (
                    <p className="mt-4 rounded-xl border border-emerald-400/35 bg-emerald-500/10 px-4 py-3 text-sm leading-relaxed text-emerald-950">
                      🛡️ Bộ lọc Tiền xử lý đã loại bỏ{' '}
                      <span className="font-bold tabular-nums">{gatekeeperModal.skipped}</span> hồ sơ (ghi chú quá ngắn,
                      không có tín hiệu ý định theo cấu hình, hoặc không có tương tác trong cửa sổ thời gian).
                    </p>
                  ) : null}
                  {gatekeeperModal.passed.length > 0 ? (
                    <>
                      <p className="mt-4 text-center text-[15px] font-medium text-slate-800">
                        🚀 Chỉ có{' '}
                        <span className="font-bold text-violet-800 tabular-nums">{gatekeeperModal.passed.length}</span>{' '}
                        hồ sơ đạt chuẩn. Bạn có muốn bắt đầu chạy AI cho{' '}
                        <span className="font-semibold tabular-nums">{gatekeeperModal.passed.length}</span> hồ sơ này
                        không?
                        {gatekeeperModal.warmCount > 0 ? (
                          <span className="mt-2 block text-sm font-normal text-slate-600">
                            (Ước tính tiết kiệm ~{Math.round((gatekeeperModal.skipped / gatekeeperModal.warmCount) * 100)}
                            % chi phí API so với gửi toàn bộ WARM đã chọn.)
                          </span>
                        ) : null}
                      </p>
                      <div className="mt-6 flex flex-wrap justify-center gap-3">
                        <button
                          type="button"
                          onClick={() => setGatekeeperModal(null)}
                          className="min-h-11 rounded-xl border border-slate-300/80 bg-white/70 px-5 py-2.5 text-sm font-semibold text-slate-800 shadow-sm backdrop-blur-sm transition hover:bg-white"
                        >
                          Hủy
                        </button>
                        <button
                          type="button"
                          onClick={() => void executeBulkAiMiner(gatekeeperModal.passed)}
                          className="min-h-11 rounded-xl border border-amber-400/90 bg-gradient-to-r from-amber-400 via-yellow-300 to-amber-500 px-5 py-2.5 text-sm font-bold text-amber-950 shadow-[0_0_24px_rgba(251,191,36,0.45)] transition hover:brightness-105"
                        >
                          Chạy AI ({gatekeeperModal.passed.length} hồ sơ)
                        </button>
                      </div>
                    </>
                  ) : (
                    <p className="mt-4 text-center text-sm text-slate-700">
                      Không có hồ sơ WARM nào vượt qua bộ lọc. Điều chỉnh quy tắc trong Cài đặt (tab LLM → AI Gatekeeper)
                      hoặc cập nhật ghi chú tương tác rồi thử lại.
                    </p>
                  )}
                  {gatekeeperModal.passed.length === 0 ? (
                    <div className="mt-6 flex justify-center">
                      <button
                        type="button"
                        onClick={() => setGatekeeperModal(null)}
                        className="min-h-11 rounded-xl border border-slate-300/80 bg-white/70 px-5 py-2.5 text-sm font-semibold text-slate-800 shadow-sm backdrop-blur-sm transition hover:bg-white"
                      >
                        Đóng
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}

      {aiMinerProgress && typeof document !== 'undefined'
        ? createPortal(
            <div
              className="fixed inset-0 z-[80] flex items-center justify-center px-4 py-8"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={aiMinerProgress.total}
              aria-valuenow={aiMinerProgress.done}
              aria-label="AI Lead Miner đang chạy"
            >
              <div className="absolute inset-0 bg-slate-950/35 backdrop-blur-[2px]" />
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_30%_20%,rgba(167,139,250,0.35),transparent_50%),radial-gradient(ellipse_at_70%_80%,rgba(45,212,191,0.25),transparent_45%),radial-gradient(ellipse_at_50%_50%,rgba(251,191,36,0.2),transparent_55%)]" />
              <div className="relative w-full max-w-sm overflow-hidden rounded-2xl border border-white/40 bg-gradient-to-br from-white/30 via-violet-100/25 to-teal-100/20 p-5 shadow-[0_24px_80px_rgba(15,23,42,0.25)] backdrop-blur-2xl">
                <p className="text-center text-[11px] font-bold uppercase tracking-wider text-slate-600">
                  AI Shortlist · theo lô
                </p>
                <p className="mt-2 text-center text-base font-semibold text-slate-900">
                  {aiMinerProgress.done}/{aiMinerProgress.total} hồ sơ
                </p>
                <p className="mt-1 text-center text-xs text-slate-600">
                  Xử lý theo lô — tối đa 12 hồ sơ / lần gọi LLM (tiết kiệm token).
                </p>
                <div className="relative mt-5 h-2.5 overflow-hidden rounded-full border border-white/50 bg-white/20 shadow-inner">
                  <div
                    className="ai-skeleton-shimmer absolute left-0 top-0 h-full rounded-full bg-gradient-to-r from-violet-500/90 via-teal-400/90 to-amber-400/90 transition-[width] duration-500 ease-out"
                    style={{
                      width: `${Math.max(6, (100 * aiMinerProgress.done) / Math.max(1, aiMinerProgress.total))}%`,
                    }}
                  />
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}

      {selected && typeof document !== 'undefined'
        ? createPortal(
            <LeadDetailPanel
              key={selected.id}
              lead={selected}
              activeScoringProfile={activeScoringProfile}
              scoringPreview={
                activeScoringProfile
                  ? scoreByLeadId.get(selected.id) ??
                    evaluateLead(leadToEvaluationRecord(selected), activeScoringProfile, scoringMasterBuckets)
                  : undefined
              }
              db={db}
              institutionalRagBlock={institutionalRagBlock}
              counselorUsers={counselorUsers}
              pickListUsers={reassignPickList}
              counselorsLoading={counselorsLoading}
              canReassignLead={showBulkReassign}
              reassignElevated={isElevatedLeadScope}
              dynamicAssistantSlot={
                <ConsultingAssistantPanel
                  variant="embedded"
                  showHeader={false}
                  lead={selected}
                  snippets={scriptSnippets}
                  loading={scriptSnippetsLoading}
                  error={scriptSnippetsErr}
                />
              }
              onClose={() => setSelected(null)}
              onUpdated={(patch) => setSelected({ ...selected, ...patch })}
            />,
            document.body,
          )
        : null}
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
          ? 'flex shrink-0 flex-col text-[10px] font-bold uppercase tracking-wide text-slate-500'
          : 'flex flex-col text-xs font-medium text-slate-600'
      }
    >
      {label}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={
          compact
            ? 'mt-0.5 max-w-[7.25rem] min-w-[3.75rem] shrink-0 truncate rounded-md border border-slate-200/95 bg-white px-1 py-1 text-[11px] font-medium text-slate-900 outline-none transition focus:ring-2 focus:ring-amber-200'
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
    isAdminLikeRole(profile?.role) ||
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
      setMsg('Đã lưu dữ liệu.')
    } catch (e) {
      console.error(e)
      setMsg('Không lưu được — kiểm tra quyền.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="rounded-2xl border border-amber-200/90 bg-gradient-to-br from-amber-50/95 via-white to-slate-50 p-4 shadow-md ring-1 ring-amber-100/80">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-900/90">Tiến độ tư vấn</p>
      <label className="mt-3 block text-sm font-medium text-slate-800">
        Tình trạng (CRM)
        <select
          value={crmStatus}
          onChange={(e) => setCrmStatus(e.target.value as LeadCounselorStatus)}
          className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-amber-400/70 focus:ring-2 focus:ring-amber-300/50"
        >
          {LEAD_COUNSELOR_STATUS_ORDER.map((s) => (
            <option key={s} value={s} className="bg-white text-slate-900">
              {LEAD_COUNSELOR_STATUS_LABELS[s]}
            </option>
          ))}
        </select>
      </label>
      <label className="mt-3 block text-sm font-medium text-slate-800">
        Ghi chú nối thêm vào «Mô tả»
        <textarea
          value={noteLine}
          onChange={(e) => setNoteLine(e.target.value)}
          rows={3}
          placeholder="VD: Đã gọi phụ huynh, hẹn campus tour…"
          className="mt-1.5 w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 outline-none focus:border-amber-400/60 focus:ring-2 focus:ring-amber-200/60"
        />
      </label>
      {msg ? <p className="mt-2 text-sm font-medium text-amber-950">{msg}</p> : null}
      <button
        type="button"
        disabled={busy}
        onClick={() => void save()}
        className="mt-4 w-full rounded-xl border border-amber-500/80 bg-gradient-to-r from-amber-500 to-amber-600 py-2.5 text-sm font-semibold text-white shadow-md shadow-amber-900/15 transition hover:brightness-105 disabled:opacity-50"
      >
        {busy ? 'Đang lưu…' : 'Lưu dữ liệu'}
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
    return u ? formatStaffDisplayName(u) : `${uid.slice(0, 8)}…`
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
      setCrmMsg('Đã cập nhật phân công.')
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
      {peerMode ? (
        <p className="mt-0.5 text-sm leading-snug text-slate-600">
          Chuyển hồ sơ của bạn cho đồng nghiệp (danh sách: tên hiển thị · email). Không thể bỏ gán trống — chọn người
          nhận.
        </p>
      ) : null}
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
        {crmBusy ? 'Đang lưu…' : 'Lưu phân công'}
      </button>
    </section>
  )
}

function LeadDetailPanel({
  lead,
  activeScoringProfile,
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
  dynamicAssistantSlot,
}: {
  lead: Lead
  activeScoringProfile: ScoringProfile | null
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
  /** Trợ lý kịch bản (nhúng trong layout fullscreen). */
  dynamicAssistantSlot?: ReactNode
}) {
  const { profile, can, canRunLlmAnalysis } = useAuth()
  const canEditScoringSignals = can('leads:write:self_assigned')
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
  const [llmPopupOpen, setLlmPopupOpen] = useState(false)
  const [assistantPopupOpen, setAssistantPopupOpen] = useState(false)
  const [playbookPopupOpen, setPlaybookPopupOpen] = useState(false)

  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [])

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
    return u ? formatStaffDisplayName(u) : `${uid.slice(0, 8)}…`
  }, [lead.assignedTo, lead.assignedCounselorId, pickListUsers, counselorUsers])

  const leadMl = useMemo(() => resolveMlWinDisplay(lead), [lead])

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

  useEffect(() => {
    if (!llmPopupOpen && !assistantPopupOpen && !playbookPopupOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setLlmPopupOpen(false)
        setAssistantPopupOpen(false)
        setPlaybookPopupOpen(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [llmPopupOpen, assistantPopupOpen, playbookPopupOpen])

  const canSaveInteraction = can('interactions:create:self_assigned')
  const canRunAi = canRunLlmAnalysis

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
    if (!canRunLlmAnalysis) {
      setAiErr(
        'Tác vụ LLM cần được Quản lý bật «Cho phép dùng LLM & tác vụ AI» trong Cài đặt → Quản lý nhân sự, hoặc dùng tài khoản Siêu quản trị.',
      )
      return
    }
    const config = loadAIConfigFromStorage()
    if (!config?.apiKey?.trim()) {
      setAiErr('Chưa cấu hình Gemini hoặc ChatGPT: Cài đặt → tab LLM.')
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

  const playbooksBody = (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {matched.length ? (
        matched.map((pb) => (
          <div
            key={pb.id}
            className="rounded-xl border border-amber-200/80 bg-amber-50/90 p-4 shadow-inner sm:p-5"
          >
            <p className="text-xs font-semibold uppercase tracking-wide text-amber-900 sm:text-sm">{pb.title}</p>
            {pb.keySellingPoints?.length ? (
              <ul className="mt-2 list-inside list-disc text-sm leading-relaxed text-slate-700">
                {pb.keySellingPoints.map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ul>
            ) : null}
            <p className="mt-2 text-sm leading-relaxed text-slate-800 sm:text-[15px]">{pb.strategy}</p>
            {pb.objectionHandling?.length ? (
              <div className="mt-3 border-t border-slate-200/80 pt-2">
                <p className="text-xs font-medium text-amber-800 sm:text-sm">Phản đối dự kiến</p>
                <ul className="mt-1.5 list-inside list-decimal text-sm leading-relaxed text-slate-600">
                  {pb.objectionHandling.map((x) => (
                    <li key={x}>{x}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ))
      ) : (
        <p className="col-span-full text-sm text-slate-500">Không có playbook khớp điều kiện hiện tại.</p>
      )}
    </div>
  )

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="lead-detail-title"
      className="fixed inset-0 z-[100] flex h-[100dvh] max-h-[100dvh] w-screen max-w-[100vw] flex-col overflow-x-hidden bg-gradient-to-b from-slate-50 via-white to-slate-50/90 text-slate-900 shadow-[0_-20px_80px_rgba(15,23,42,0.12)]"
    >
      <header className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-200/90 bg-white/95 px-3 py-3 shadow-sm sm:px-5 lg:px-6">
        <div className="min-w-0 flex-1">
          <p className="text-[9px] font-bold uppercase tracking-wider text-amber-800">Chi tiết hồ sơ</p>
          <h2
            id="lead-detail-title"
            className="font-display text-lg font-semibold tracking-tight text-slate-900 sm:text-xl"
          >
            {lead.fullName || 'Chưa rõ tên'}
          </h2>
          <div className="mt-2 flex max-w-full flex-nowrap items-center gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:thin]">
            {[
              { k: 'SĐT', v: lead.phone || '—', t: false },
              { k: 'SĐT PH', v: lead.parentPhone || '—', t: false },
              { k: 'Mã KH', v: lead.customerId || '—', t: false },
              { k: 'Nguồn', v: lead.source || '—', t: true },
              { k: 'CRM', v: LEAD_COUNSELOR_STATUS_LABELS[lead.status], t: false },
              { k: 'Pipeline', v: PIPELINE_LABEL[lead.pipelineStatus], t: false },
              { k: 'TVV', v: assigneeHeaderLabel, t: true },
            ].map((row) => (
              <div
                key={row.k}
                className="flex max-w-[10.5rem] shrink-0 items-center gap-1 rounded-md border border-slate-200/90 bg-slate-50 px-2 py-0.5 text-[11px] text-slate-700"
                title={row.t ? row.v : undefined}
              >
                <span className="shrink-0 text-slate-500">{row.k}</span>
                <span className="min-w-0 truncate font-medium text-slate-900">{row.v}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-stretch justify-end gap-1.5">
          <button
            type="button"
            onClick={() => setPlaybookPopupOpen(true)}
            className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-amber-400/70 bg-amber-500 px-2.5 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-amber-600"
          >
            <BookOpen className="h-3.5 w-3.5 shrink-0" aria-hidden strokeWidth={1.75} />
            Playbook
          </button>
          {dynamicAssistantSlot ? (
            <button
              type="button"
              onClick={() => setAssistantPopupOpen(true)}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-sky-300/80 bg-sky-600 px-2.5 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-sky-700"
            >
              <Bot className="h-3.5 w-3.5 shrink-0" aria-hidden strokeWidth={1.75} />
              Trợ lý
            </button>
          ) : null}
          {canRunAi ? (
            <button
              type="button"
              onClick={() => setLlmPopupOpen(true)}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-violet-400/60 bg-gradient-to-r from-violet-600 to-fuchsia-600 px-2.5 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:brightness-110"
            >
              <Sparkles className="h-3.5 w-3.5 shrink-0" aria-hidden strokeWidth={1.75} />
              LLM
            </button>
          ) : null}
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-800 shadow-sm transition hover:border-amber-300 hover:bg-amber-50"
          >
            <X className="h-3.5 w-3.5" aria-hidden />
            Đóng
          </button>
        </div>
      </header>

      {lead.isAiShortlisted ? (
        <section className="relative shrink-0 border-b border-amber-400/35 bg-gradient-to-r from-amber-50/95 via-yellow-50/85 to-amber-100/80 px-3 py-4 shadow-[inset_0_0_48px_rgba(251,191,36,0.12)] backdrop-blur-xl sm:px-6">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(251,191,36,0.22),_transparent_55%)]" />
          <div className="relative flex flex-col gap-4 lg:flex-row lg:items-start lg:gap-8">
            <div className="flex min-w-0 items-start gap-3">
              <span className="mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-amber-300/90 bg-white/90 shadow-md shadow-amber-500/20">
                <Zap className="h-5 w-5 text-amber-600" fill="currentColor" strokeWidth={1.5} aria-hidden />
              </span>
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-amber-900">
                  AI Shortlist · Chiến lược chốt
                </p>
                {lead.aiProcessedAt?.toDate ? (
                  <p className="mt-0.5 text-[10px] text-amber-800/80">
                    Cập nhật AI: {lead.aiProcessedAt.toDate().toLocaleString('vi-VN')}
                  </p>
                ) : null}
              </div>
            </div>
            <div className="min-w-0 flex-1 space-y-3">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wide text-amber-900/90">Phân tích</p>
                <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-slate-900">
                  {lead.aiShortlistReason?.trim() || '—'}
                </p>
              </div>
              <div className="rounded-xl border border-amber-300/60 bg-white/70 px-3 py-2.5 shadow-sm">
                <p className="text-[10px] font-bold uppercase tracking-wide text-emerald-900">Hành động đề xuất</p>
                <p className="mt-1 text-sm font-semibold leading-snug text-emerald-950">
                  {lead.recommendedAction?.trim() || '—'}
                </p>
              </div>
            </div>
          </div>
        </section>
      ) : null}

      <div className="mx-auto flex min-h-0 w-full max-w-[1920px] flex-1 flex-col overflow-hidden px-2 sm:px-4 lg:px-6">
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden lg:bg-white/40">
            <div className="grid min-h-0 flex-1 grid-cols-1 overflow-y-auto lg:grid lg:grid-cols-12 lg:overflow-hidden">
              {/* ~2/3: thông tin hồ sơ, tiến độ, CRM, form thêm ghi chú */}
              <div className="scroll-touch flex min-h-0 flex-col gap-3 border-b border-slate-200/80 p-3 sm:p-4 lg:col-span-8 lg:min-h-0 lg:border-b-0 lg:border-r lg:overflow-y-auto">
                <aside className="space-y-3 text-sm leading-snug">
                  <div className="grid grid-cols-2 gap-x-2 gap-y-2 sm:grid-cols-3 sm:gap-x-3">
                    <Info label="Mã KH" value={lead.customerId} />
                    <Info label="Nguồn" value={lead.source} />
                    <Info label="Hệ đào tạo" value={lead.educationLevel} />
                    <Info label="Tỉnh / TP" value={lead.province} />
                    <Info label="Địa chỉ" value={lead.address} />
                    <Info label="Trường học" value={lead.highSchool} />
                    <Info label="Lớp" value={lead.gradeClass} />
                    <Info label="Điện thoại SV" value={lead.phone} />
                    <Info label="ĐT người liên hệ" value={lead.parentPhone} />
                    <div className="col-span-2 sm:col-span-3">
                      <p className="text-xs text-slate-500">Ghi chú / mô tả (hồ sơ)</p>
                      <p className="mt-0.5 max-h-24 overflow-y-auto whitespace-pre-wrap break-words text-slate-800">
                        {leadDescriptionForDisplay(lead.description).trim() || '—'}
                      </p>
                    </div>
                    <Info
                      label="Điểm (profile)"
                      value={String(scoringPreview?.calculatedScore ?? lead.calculatedScore)}
                    />
                    <div>
                      <p className="text-[10px] text-slate-500">Nhãn</p>
                      <div className="mt-0.5">
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

                  {db ? (
                    <LeadScoringSignalsPanel
                      key={`sig-${lead.id}`}
                      lead={lead}
                      db={db}
                      activeScoringProfile={activeScoringProfile}
                      canEdit={canEditScoringSignals}
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
                </aside>

                <section className="rounded-xl border border-slate-200/80 bg-white p-3 shadow-sm">
                  <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-600">Thêm ghi chú</h3>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    <label className="block text-xs font-medium text-slate-700 sm:col-span-2">
                      Ghi chú
                      <textarea
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        rows={3}
                        className="mt-0.5 w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-800 outline-none focus:ring-1 focus:ring-emerald-400/50"
                      />
                    </label>
                    <label className="block text-xs font-medium text-slate-700">
                      Nhãn
                      <select
                        value={evalTag}
                        onChange={(e) => setEvalTag(e.target.value)}
                        className="mt-0.5 w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-900 outline-none focus:ring-1 focus:ring-emerald-400/50"
                      >
                        {EVALUATION_TAGS.map((t) => (
                          <option key={t} value={t} className="bg-white">
                            {t}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="block text-xs font-medium text-slate-700">
                      Pipeline
                      <select
                        value={statusForForm}
                        onChange={(e) => setStatusDirty(e.target.value as LeadPipelineStatus)}
                        className="mt-0.5 w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-900 outline-none focus:ring-1 focus:ring-emerald-400/50"
                      >
                        {(Object.keys(PIPELINE_LABEL) as LeadPipelineStatus[]).map((k) => (
                          <option key={k} value={k} className="bg-white">
                            {PIPELINE_LABEL[k]}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  {msg ? <p className="mt-1.5 text-xs text-emerald-700">{msg}</p> : null}
                  <button
                    type="button"
                    disabled={saving || !db || !canSaveInteraction}
                    onClick={() => void save()}
                    className="mt-2 w-full rounded-lg border border-emerald-500 bg-emerald-600 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-50"
                  >
                    {saving ? 'Đang lưu…' : 'Lưu tương tác'}
                  </button>
                </section>
              </div>

              {/* ~1/3: chỉ lịch sử ghi chú & đánh giá */}
              <aside className="scroll-touch flex min-h-0 flex-col border-b border-slate-200/80 p-3 sm:p-4 lg:col-span-4 lg:max-h-full lg:border-b-0 lg:overflow-hidden">
                <section className="flex min-h-0 flex-1 flex-col rounded-xl border border-slate-200/80 bg-white p-3 shadow-sm">
                  <h3 className="shrink-0 text-[11px] font-bold uppercase tracking-wider text-slate-600">
                    Lịch sử ghi chú &amp; đánh giá
                  </h3>
                  {intLoading ? <p className="mt-1 shrink-0 text-xs text-slate-500">Đang tải…</p> : null}
                  <ul className="scroll-touch mt-2 min-h-0 flex-1 space-y-1.5 overflow-y-auto overscroll-contain">
                    {interactions.map((it) => (
                      <li
                        key={it.id}
                        className="rounded-lg border border-slate-200/70 bg-slate-50/90 p-2 text-xs text-slate-700"
                      >
                        <p className="font-medium text-slate-900">
                          {it.channel} {it.evaluationTag ? `· ${it.evaluationTag}` : ''}
                        </p>
                        {it.counselorNote ? (
                          <p className="mt-0.5 whitespace-pre-wrap leading-snug text-slate-700">{it.counselorNote}</p>
                        ) : null}
                        {it.aiSentiment ? (
                          <p className="mt-0.5 text-[11px] text-violet-800">
                            AI: {it.aiSentiment.label} ({it.aiSentiment.score}) — {it.aiSentiment.summary}
                          </p>
                        ) : null}
                        <p className="mt-0.5 text-[10px] text-slate-500">
                          {it.timestamp?.toDate?.().toLocaleString?.('vi-VN') ?? ''}
                        </p>
                      </li>
                    ))}
                    {!intLoading && !interactions.length ? (
                      <li className="text-xs text-slate-500">Chưa có tương tác.</li>
                    ) : null}
                  </ul>
                </section>
              </aside>
            </div>
        </div>
      </div>

      {playbookPopupOpen ? (
        <>
          <button
            type="button"
            className="fixed inset-0 z-[110] cursor-default bg-slate-900/45 backdrop-blur-[2px]"
            aria-label="Đóng cửa sổ playbook"
            onClick={() => setPlaybookPopupOpen(false)}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="lead-playbook-dialog-title"
            className="fixed left-1/2 top-1/2 z-[120] flex h-[min(92dvh,88dvh)] max-h-[92dvh] w-[min(calc(100vw-1rem),85rem)] max-w-[min(96vw,85rem)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-amber-200/90 bg-white text-slate-900 shadow-2xl sm:h-[min(92dvh,76dvh)]"
          >
            <div className="flex shrink-0 flex-wrap items-start justify-between gap-3 border-b border-slate-200/90 bg-gradient-to-r from-amber-50/90 to-white px-4 py-3 sm:px-5 sm:py-4">
              <div className="flex min-w-0 items-start gap-3">
                <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-amber-200/80 bg-white shadow-sm sm:h-11 sm:w-11">
                  <BookOpen className="h-5 w-5 text-amber-700 sm:h-6 sm:w-6" strokeWidth={1.75} aria-hidden />
                </span>
                <div className="min-w-0">
                  <h2 id="lead-playbook-dialog-title" className="text-base font-semibold text-slate-900 sm:text-lg">
                    Playbook tư vấn
                  </h2>
                  <p className="mt-0.5 text-xs leading-snug text-slate-600 sm:text-sm">
                    Gợi ý chiến lược, điểm bán, xử lý phản đối — khớp điều kiện hồ sơ; cấu hình trong Cài đặt.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPlaybookPopupOpen(false)}
                className="flex shrink-0 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50"
              >
                <X className="h-4 w-4" aria-hidden />
                Đóng
              </button>
            </div>
            <div className="scroll-touch min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 sm:p-6">
              {playbooksBody}
            </div>
          </div>
        </>
      ) : null}

      {canRunAi && llmPopupOpen ? (
        <>
          <button
            type="button"
            className="fixed inset-0 z-[110] cursor-default bg-slate-900/45 backdrop-blur-[2px]"
            aria-label="Đóng cửa sổ phân tích LLM"
            onClick={() => setLlmPopupOpen(false)}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="lead-llm-dialog-title"
            className={[
              'fixed left-1/2 top-1/2 z-[120] flex h-[50dvh] max-h-[92dvh] w-[94vw] max-w-[96vw] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-amber-200/90 bg-white text-slate-900 shadow-2xl sm:w-[50vw] sm:max-w-none',
              aiRunning ? 'ring-2 ring-amber-400/50 ring-inset' : '',
            ].join(' ')}
          >
            <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-200/90 bg-gradient-to-r from-violet-50/90 to-amber-50/80 px-4 py-3">
              <div className="flex min-w-0 items-center gap-2">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-amber-200/80 bg-white shadow-sm">
                  <Sparkles className="h-4 w-4 text-amber-600" strokeWidth={1.75} aria-hidden />
                </span>
                <div className="min-w-0">
                  <h2 id="lead-llm-dialog-title" className="text-base font-semibold text-slate-900 sm:text-lg">
                    Phân tích LLM
                  </h2>
                  <p className="mt-0.5 text-xs leading-snug text-slate-600 sm:text-sm">
                    Gemini / ChatGPT (key do Siêu quản trị cấu hình trên trình duyệt) — kết quả lưu Firestore. Cần quản
                    lý bật quyền dùng LLM cho tài khoản của bạn.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setLlmPopupOpen(false)}
                className="flex shrink-0 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50"
              >
                <X className="h-4 w-4" aria-hidden />
                Đóng
              </button>
            </div>

            <div className="scroll-touch min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 sm:p-5">
              {aiTasksErr ? <p className="text-sm text-rose-700">{aiTasksErr}</p> : null}

              <label className="mt-1 block text-sm font-medium text-slate-700">
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
                disabled={aiRunning || aiTasksLoading || !selectedAITask || !aiTasks.length || !db}
                onClick={() => void runAiLlmAnalysis()}
                className="group relative mt-4 flex w-full items-center justify-center gap-2 overflow-hidden rounded-xl border border-amber-400/45 bg-gradient-to-r from-violet-600/95 via-fuchsia-600/90 to-amber-600/95 px-4 py-2.5 text-sm font-semibold text-white shadow-md transition hover:brightness-110 disabled:opacity-45"
              >
                <span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/15 to-transparent opacity-0 transition group-hover:translate-x-full group-hover:opacity-100 group-hover:duration-700" />
                <Wand2 className="relative h-4 w-4 shrink-0 text-amber-100" strokeWidth={1.75} />
                <span className="relative">{aiRunning ? 'Đang phân tích…' : 'Chạy phân tích AI'}</span>
              </button>

              {aiErr ? <p className="mt-2 text-sm text-rose-700">{aiErr}</p> : null}

              {aiRunning ? (
                <div className="mt-4 space-y-2">
                  <p className="text-xs text-slate-400">Đang suy luận…</p>
                  <div className="h-10 rounded-xl ai-skeleton-shimmer" />
                  <div className="h-10 rounded-xl ai-skeleton-shimmer" style={{ animationDelay: '0.15s' }} />
                  <div className="h-24 rounded-xl ai-skeleton-shimmer" style={{ animationDelay: '0.3s' }} />
                </div>
              ) : displayAiResult ? (
                <div className="mt-4 rounded-2xl border border-rose-200/60 bg-gradient-to-br from-white to-rose-50/50 p-3 shadow-inner">
                  <VietMyAccentHeading as="p" tone="onLight" size="sm" className="mb-2 block">
                    Kết quả
                  </VietMyAccentHeading>
                  <AiInsightsGrid data={displayAiResult} />
                </div>
              ) : (
                <p className="mt-3 text-xs leading-relaxed text-slate-500">
                  Chọn tác vụ và bấm chạy. API key chỉ Siêu quản trị lưu được (Cài đặt → tab LLM). Nếu bị chặn, nhờ
                  quản lý bật «Cho phép dùng LLM và tác vụ AI» trong Quản lý nhân sự.
                </p>
              )}
            </div>
          </div>
        </>
      ) : null}

      {dynamicAssistantSlot && assistantPopupOpen ? (
        <>
          <button
            type="button"
            className="fixed inset-0 z-[110] cursor-default bg-slate-900/45 backdrop-blur-[2px]"
            aria-label="Đóng cửa sổ trợ lý kịch bản"
            onClick={() => setAssistantPopupOpen(false)}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="lead-assistant-dialog-title"
            className="fixed left-1/2 top-1/2 z-[120] flex h-[min(92dvh,88dvh)] max-h-[92dvh] w-[min(calc(100vw-1rem),85rem)] max-w-[min(96vw,85rem)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-sky-200/90 bg-white text-slate-900 shadow-2xl sm:h-[min(92dvh,76dvh)]"
          >
            <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-slate-200/90 bg-gradient-to-r from-sky-50/90 to-white px-4 py-3 sm:px-5 sm:py-4">
              <div className="flex min-w-0 flex-1 flex-wrap items-center gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-sky-200/80 bg-white shadow-sm">
                  <Bot className="h-5 w-5 text-sky-700" strokeWidth={1.75} aria-hidden />
                </span>
                <div className="min-w-0">
                  <h2 id="lead-assistant-dialog-title" className="text-lg font-semibold text-slate-900 sm:text-xl">
                    Trợ lý kịch bản
                  </h2>
                  <p className="text-sm text-slate-600 sm:text-base">Luồng Script Hub theo hồ sơ</p>
                </div>
                <div
                  className="flex cursor-help items-center gap-2 rounded-xl border border-violet-200/80 bg-violet-50/80 px-2.5 py-1.5 shadow-sm"
                  title={buildMlWinHoverText(leadMl)}
                >
                  <MlWinGauge value={leadMl.mlWinProbability} title={buildMlWinHoverText(leadMl)} />
                  <div className="min-w-0">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-violet-900">Điểm thông tin</p>
                    <span className="text-sm font-bold text-violet-900">{leadMl.mlWinProbability}%</span>
                    <span className="ml-1.5 rounded bg-violet-200/80 px-1 text-[10px] font-semibold uppercase text-violet-950">
                      {leadMl.source === 'mvp_mock' ? 'MVP' : 'Đã lưu'}
                    </span>
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setAssistantPopupOpen(false)}
                className="flex shrink-0 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50"
              >
                <X className="h-4 w-4" aria-hidden />
                Đóng
              </button>
            </div>
            <div className="scroll-touch min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 sm:p-6">
              {dynamicAssistantSlot}
            </div>
          </div>
        </>
      ) : null}
    </div>
  )
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] font-medium text-slate-500">{label}</p>
      <p className="mt-0.5 break-words text-xs text-slate-800">{value || '—'}</p>
    </div>
  )
}
