import type { MouseEvent, ReactNode } from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useSearchParams } from 'react-router-dom'
import { motion } from 'motion/react'
import { BookOpen, Bot, ChevronDown, CircleHelp, Download, Info as InfoIcon, Library, Sparkles, UserPlus, Wand2, X, Zap } from 'lucide-react'
import {
  addDoc,
  collection,
  deleteField,
  doc,
  getDoc,
  setDoc,
  Timestamp,
  updateDoc,
  writeBatch,
} from 'firebase/firestore'
import type {
  InviteDocumentType,
  Lead,
  LeadCounselorStatus,
  LeadPipelineStatus,
  PriorityTag,
  ProfileCustomScoringSignal,
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
import { useLeads, mapDoc, type LeadListServerFilters, LEADS_UI_FULL_SCOPE_MAX } from '../hooks/useLeads'
import { useMasterData } from '../hooks/useMasterData'
import { useLeadProfileCatalogs } from '../hooks/useLeadProfileCatalogs'
import { LEAD_AI_INSIGHT_AGGREGATE_ID, useLeadAiInsightTasks } from '../hooks/useLeadAiInsightTasks'
import { useInteractions } from '../hooks/useInteractions'
import { useConsultingPlaybooks } from '../hooks/useConsultingPlaybooks'
import { useAuth } from '../hooks/useAuth'
import { useInfoScoreRules } from '../contexts/InfoScoreRulesContext'
import { canCreateLead, canWriteLead } from '../auth/leadAccess'
import { isAdminLikeRole, isTeamLeadRole } from '../auth/roleUtils'
import { counselorIdsInManagerScope } from '../utils/teamScope'
import { useLeadScoring } from '../hooks/useLeadScoring'
import { useLeadSources } from '../hooks/useLeadSources'
import { useScholarships } from '../hooks/useScholarships'
import { TagBadge } from '../components/TagBadge'
import { LeadPlaybookPanel } from '../components/LeadPlaybookPanel'
import { LeadKnowledgePanel } from '../components/LeadKnowledgePanel'
import {
  evaluateLead,
  leadToEvaluationRecord,
  persistedLeadScoringFields,
  type MasterDataBuckets,
} from '../utils/scoring'
import {
  exportEvaluatedLeadsToXlsx,
  exportSelectedEvaluatedLeadsToXlsx,
} from '../utils/exportEvaluatedLeads'
import { resolveAIIntegrationConfig, runAIAnalysis } from '../utils/aiEngine'
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
import { useKnowledgeCategories } from '../hooks/useKnowledgeCategories'
import { buildLeadConsultingInsights } from '../utils/leadConsultingInsights'
import { useAITasks } from '../hooks/useAITasks'
import { MlWinGauge } from '../components/MlWinGauge'
import { InfoScoreHelpPopover } from '../components/InfoScoreHelpPopover'
import { SearchableFilterSelect } from '../components/SearchableFilterSelect'
import { profileHasActiveRules } from '../utils/scoringProfileUtils'
import { useScriptSnippets } from '../hooks/useScriptSnippets'
import { ConsultingAssistantPanel } from '../components/ConsultingAssistantPanel'
import { LeadScoringSignalsPanel } from '../components/LeadScoringSignalsPanel'
import { LeadProfileCoreForm } from '../components/LeadProfileCoreForm'
import { LeadActivityTimeline } from '../components/LeadActivityTimeline'
import { LeadProfileFinanceSection } from '../components/LeadProfileFinanceSection'
import { LeadProfileInviteSection } from '../components/LeadProfileInviteSection'
import { buildLeadCoreFirestorePatch, isCoreDraftDirty, leadToCoreDraft } from '../utils/leadProfileEdit'
import { isFinanceDraftDirty, leadToFinanceDraft } from '../utils/leadFinance'
import { persistLeadFinance } from '../utils/persistLeadFinance'
import { triggerInvitationN8n } from '../utils/n8nIntegration'
import { BulkLeadActionBar } from '../components/bulk/BulkLeadActionBar'
import { useCounselorDirectory } from '../hooks/useCounselorDirectory'
import { commitAuditLog } from '../services/auditLog'
import {
  diffCounselorStatus,
  diffPipelineStatus,
  diffPriorityTag,
  recordLeadEvent,
} from '../services/leadEvents'
import { leadTouchPatch } from '../utils/leadTouch'
import { assigneeFirestoreMirror, counselorStatusToPipeline } from '../utils/leadIdentity'
import {
  LWF,
  leadFilterSignatureForHydrate,
  mergeLeadFiltersIntoSearchParams,
  parseCrmFromUrl,
  parsePipelineFromUrl,
  parseTagFromUrl,
  stripListFiltersKeepOpenView,
} from '../utils/leadWorkspaceUrlFilters'
import { formatStaffDirectoryLabel, formatStaffDisplayName } from '../utils/counselorDisplay'
import { VietMyAccentHeading } from '../components/VietMyAccentHeading'
import { CreateLeadModal } from '../components/CreateLeadModal'

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
  'Tiêu cực',
  'Không quan tâm',
  'Chưa rõ ràng',
] as const

/** Tooltip cột Điểm thông tin — đặt chuột lên nút ? hoặc gauge để xem chi tiết. */
const ML_WIN_COLUMN_HINT =
  'Điểm thông tin = độ đầy dữ liệu tĩnh trên hồ sơ (điểm nền + các tiêu chí bật và khớp; kẹp min–max theo Cài đặt → Điểm thông tin). Bám theo 20 cột Excel quy chuẩn + tiêu chí mở rộng (educationLevel, description) nếu bật. Có thể ghi đè từng lead trên Firestore (mlWinProbability + mlExplanation). Đặt chuột lên vòng % để xem bảng chi tiết.'

function isElevatedForAdminFilters(role: string | undefined): boolean {
  return role === 'admin' || role === 'super_admin' || role === 'head_of_department' || role === 'head_of_profession'
}

function formatAssignedCounselorLabel(l: Lead, names: Map<string, string>): string {
  const uid = l.assignedTo ?? l.assignedCounselorId
  if (!uid) return '—'
  return names.get(uid) ?? `${uid.slice(0, 8)}…`
}

function effectiveLeadAssigneeUid(l: Lead): string {
  const u = l.assignedTo ?? l.assignedCounselorId
  return u ? String(u).trim() : ''
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

const LEAD_TABLE_COL_COUNT = 13

/** Ghi chú bổ sung (các trường Excel / hồ sơ ngoài cột mô tả chính). */
function leadSupplementaryNotesText(lead: Lead): string {
  const chunks: string[] = []
  const add = (label: string, val?: string) => {
    const t = val?.trim()
    if (t) chunks.push(`${label}: ${t}`)
  }
  add('Ghi chú 1', lead.profileNote1)
  add('Ghi chú 2', lead.profileNote2)
  add('Lưu ý khác', lead.otherAttentionNotes)
  add('Nguyện vọng', lead.aspirations)
  add('Sở thích', lead.hobbies)
  add('Field trip', lead.fieldTripNotes)
  return chunks.join(' · ')
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
    catalogs: scoringCatalogDefs,
  } = useMasterData()
  const { profile, can, canRunLlmAnalysis } = useAuth()
  const { runtime: infoScoreRuntime } = useInfoScoreRules()
  const { users: directoryUsers, counselors: counselorUsers, loading: counselorsLoading } = useCounselorDirectory()
  const { documents: knowledgeDocuments } = useKnowledgeDocuments()
  const institutionalRagBlock = useMemo(
    () => buildInstitutionalRagBlock(knowledgeDocuments),
    [knowledgeDocuments],
  )

  const [searchParams, setSearchParams] = useSearchParams()
  const urlQuery = (searchParams.get(LWF.Q) ?? '').trim().toLowerCase()

  const [sortKey, setSortKey] = useState<
    | 'none'
    | 'fullName'
    | 'phone'
    | 'educationLevel'
    | 'province'
    | 'score'
    | 'mlWin'
    | 'priorityTag'
  >('none')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')

  const showAdminGlobalFilters = isElevatedForAdminFilters(profile?.role)
  const [inspectProfileOpen, setInspectProfileOpen] = useState(false)
  const [createLeadOpen, setCreateLeadOpen] = useState(false)

  const [tagFilter, setTagFilter] = useState<string>('ALL')
  const [regionFilter, setRegionFilter] = useState<string>('ALL')
  const [majorFilter, setMajorFilter] = useState<string>('ALL')
  const [statusFilter, setStatusFilter] = useState<string>('ALL')
  const [crmStatusFilter, setCrmStatusFilter] = useState<string>('ALL')
  const [sourceFilter, setSourceFilter] = useState<string>('ALL')
  const [schoolFilter, setSchoolFilter] = useState<string>('ALL')
  /** Lọc TVV phụ trách (client); '' = tất cả, __UNASSIGNED__ = chưa gán. */
  const [assigneeFilter, setAssigneeFilter] = useState<string>('')
  const [scoreMinInput, setScoreMinInput] = useState('')
  const [scoreMaxInput, setScoreMaxInput] = useState('')
  const [aiShortlistOnly, setAiShortlistOnly] = useState(false)
  const [aiShortlistGuideOpen, setAiShortlistGuideOpen] = useState(false)

  /**
   * Lọc nhãn theo profile (hoặc admin nhãn) trên client — tránh `where(priorityTag)` + index composite;
   * cần quét gần đây (fullScope).
   */
  const tagClientEval = !urlQuery.trim() && tagFilter !== 'ALL'

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
    if (!tagClientEval && tagFilter !== 'ALL') o.priorityTag = tagFilter as PriorityTag
    if (regionFilter !== 'ALL') o.province = regionFilter
    if (majorFilter !== 'ALL') o.educationLevel = majorFilter
    if (sourceFilter !== 'ALL') o.source = sourceFilter
    if (schoolFilter !== 'ALL') {
      o.highSchoolIn = [schoolFilter]
    }
    if (aiShortlistOnly) o.aiShortlistedOnly = true
    return Object.keys(o).length ? o : undefined
  }, [
    statusFilter,
    crmStatusFilter,
    tagFilter,
    regionFilter,
    majorFilter,
    sourceFilter,
    schoolFilter,
    scoreMinInput,
    scoreMaxInput,
    aiShortlistOnly,
    tagClientEval,
  ])

  const leadServerFiltersKey = useMemo(() => JSON.stringify(leadServerFilters ?? {}), [leadServerFilters])

  const {
    leads,
    loading,
    loadingPage,
    error,
    currentPage,
    totalPages: firestoreTotalPages,
    setPage,
    scopeFetchTruncated,
    scopeTagCounts,
    scopeSourceOptions,
    applyLocalLeadPatch,
    refetchLeads,
  } = useLeads({
    serverFilters: leadServerFilters,
    searchText: urlQuery,
    directoryLabels: counselorDirectoryLabelById,
    dataMode: tagClientEval ? 'fullScope' : 'paged',
    maxFullScopeLeads: tagClientEval ? LEADS_UI_FULL_SCOPE_MAX : undefined,
    includeScopeTagCounts: !tagClientEval,
    includeScopeSourceOptions: true,
  })

  const scoringMasterBuckets = useMemo(
    () => ({
      regionLabels,
      highSchoolLabels,
      majorLabels,
      academicPerformanceLabels,
      regionEntries: byKind.regions,
      majorEntries: byKind.majors,
      catalogs: scoringCatalogDefs,
      entriesByCatalogId: byKind,
    }),
    [regionLabels, highSchoolLabels, majorLabels, academicPerformanceLabels, byKind, scoringCatalogDefs],
  )

  const {
    scoringProfiles,
    profilesLoading,
    setScoringProfileId,
    resolvedScoringProfileId,
    activeScoringProfile,
    scoreByLeadId,
    schoolTvvSignalDefs,
  } = useLeadScoring(leads, { masterBuckets: scoringMasterBuckets })

  const profileScoringActive = Boolean(activeScoringProfile)
  const profileScoringLive = Boolean(
    activeScoringProfile && profileHasActiveRules(activeScoringProfile),
  )

  const effectiveLeadTag = useCallback(
    (l: Lead) =>
      profileScoringActive
        ? (scoreByLeadId.get(l.id)?.priorityTag ?? l.priorityTag)
        : l.priorityTag,
    [profileScoringActive, scoreByLeadId],
  )

  /** Đếm theo từng nhãn trên tập `leads` đã tải (dùng khi tính lại nhãn theo profile — fullScope). */
  const tagCountsFromLoadedLeads = useMemo(() => {
    const m: Record<PriorityTag, number> = { HOT: 0, WARM: 0, COLD: 0, LOSS: 0 }
    for (const l of leads) {
      const t = effectiveLeadTag(l)
      if (t in m) m[t]++
    }
    return m
  }, [leads, effectiveLeadTag])

  /**
   * Số trong ngoặc trên nút lọc nhanh: Firestore aggregation (đúng phạm vi lọc, không giới hạn 30/trang)
   * khi dùng nhãn đã lưu; khi tính lại theo profile thì đếm trên tập fullScope đã tải.
   * Khi đang tìm kiếm chuỗi: không hiển thị (full-text là client-side, không có chỉ số server tương ứng).
   */
  const tagChipCounts = useMemo((): Record<PriorityTag, number> | null => {
    if (urlQuery.trim()) return null
    if (tagClientEval) return tagCountsFromLoadedLeads
    if (scopeTagCounts) return scopeTagCounts
    return null
  }, [urlQuery, tagClientEval, scopeTagCounts, tagCountsFromLoadedLeads])

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

  const [selected, setSelected] = useState<Lead | null>(null)
  /** Chi tiết hồ sơ: form tiến độ/ghi chú còn thay đổi chưa lưu — dùng trong onClose (confirm). */
  const leadDetailUnsavedRef = useRef(false)
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

  const openLeadIdFromUrl = (searchParams.get('open') ?? '').trim()

  useEffect(() => {
    leadDetailUnsavedRef.current = false
  }, [selected?.id])

  const closeLeadDetailPanel = useCallback(() => {
    if (leadDetailUnsavedRef.current) {
      const ok = window.confirm(
        'Có thay đổi chưa lưu (funnel, ghi chú hoặc tình trạng TVV nếu chỉnh ở cột trái). Đóng chi tiết và bỏ các thay đổi?',
      )
      if (!ok) return
    }
    leadDetailUnsavedRef.current = false
    setSelected(null)
  }, [])

  useEffect(() => {
    setPage(1)
  }, [leadServerFiltersKey, setPage])

  useEffect(() => {
    if (!openLeadIdFromUrl || !db || !configured) return
    let cancelled = false
    ;(async () => {
      try {
        const snap = await getDoc(doc(db, FS_COLLECTIONS.leads, openLeadIdFromUrl))
        if (!cancelled) {
          setSearchParams(
            (prev) => {
              const next = new URLSearchParams(prev)
              next.delete('open')
              return next
            },
            { replace: true },
          )
        }
        if (cancelled) return
        if (!snap.exists()) return
        const row = mapDoc(openLeadIdFromUrl, snap.data() as Record<string, unknown>)
        if (row) setSelected(row)
      } catch (e) {
        console.error(e)
        if (!cancelled) {
          setSearchParams(
            (prev) => {
              const next = new URLSearchParams(prev)
              next.delete('open')
              return next
            },
            { replace: true },
          )
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [openLeadIdFromUrl, db, configured, setSearchParams])

  const isElevatedLeadScope = isElevatedForAdminFilters(profile?.role)
  const canPeerReassignLeads = Boolean(can('leads:reassign:peer'))
  const showBulkReassign = isElevatedLeadScope || canPeerReassignLeads
  const canBulkWrite = Boolean(can('leads:write:self_assigned') || showBulkReassign)
  const canCreateManualLead = canCreateLead(profile, can)

  const wantsCreateFromUrl = searchParams.get('create') === '1'
  useEffect(() => {
    if (!wantsCreateFromUrl || !canCreateManualLead || !configured || !db) return
    setCreateLeadOpen(true)
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        next.delete('create')
        return next
      },
      { replace: true },
    )
  }, [wantsCreateFromUrl, canCreateManualLead, configured, db, setSearchParams])

  const openLeadById = useCallback(
    async (leadId: string) => {
      if (!db) return
      try {
        const snap = await getDoc(doc(db, FS_COLLECTIONS.leads, leadId))
        if (!snap.exists()) return
        const row = mapDoc(leadId, snap.data() as Record<string, unknown>)
        if (row) {
          setSelected(row)
          setSearchParams(
            (prev) => {
              const next = new URLSearchParams(prev)
              next.set('open', leadId)
              return next
            },
            { replace: true },
          )
        }
      } catch (e) {
        console.error(e)
      }
    },
    [db, setSearchParams],
  )

  const handleManualLeadCreated = useCallback(
    (leadId: string) => {
      void refetchLeads()
      void openLeadById(leadId)
    },
    [refetchLeads, openLeadById],
  )

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
    const s = new Set<string>(scopeSourceOptions)
    for (const l of leads) {
      const src = (l.source ?? '').trim()
      if (src) s.add(src)
    }
    if (sourceFilter !== 'ALL') s.add(sourceFilter)
    return [...s].sort((a, b) => a.localeCompare(b, 'vi'))
  }, [leads, scopeSourceOptions, sourceFilter])

  const filtered = useMemo(() => {
    const minScore =
      scoreMinInput.trim() === '' || Number.isNaN(Number(scoreMinInput)) ? null : Number(scoreMinInput)
    const maxScore =
      scoreMaxInput.trim() === '' || Number.isNaN(Number(scoreMaxInput)) ? null : Number(scoreMaxInput)
    let rows = leads
    if (minScore != null || maxScore != null) {
      rows = leads.filter((l) => {
        const displayScore = profileScoringActive
          ? (scoreByLeadId.get(l.id)?.calculatedScore ?? l.calculatedScore)
          : l.calculatedScore
        if (minScore != null && displayScore < minScore) return false
        if (maxScore != null && displayScore > maxScore) return false
        return true
      })
    }
    if (tagClientEval && tagFilter !== 'ALL') {
      rows = rows.filter((l) => effectiveLeadTag(l) === tagFilter)
    }
    if (assigneeFilter === '__UNASSIGNED__') {
      rows = rows.filter((l) => !effectiveLeadAssigneeUid(l))
    } else if (assigneeFilter) {
      rows = rows.filter((l) => effectiveLeadAssigneeUid(l) === assigneeFilter)
    }
    return rows
  }, [
    leads,
    scoreMinInput,
    scoreMaxInput,
    activeScoringProfile,
    scoreByLeadId,
    tagClientEval,
    tagFilter,
    effectiveLeadTag,
    assigneeFilter,
  ])

  const sortedFiltered = useMemo(() => {
    const rows = [...filtered]
    if (sortKey === 'none') return rows
    const dir = sortDir === 'asc' ? 1 : -1
    const scoreOf = (l: Lead) =>
      profileScoringActive
        ? (scoreByLeadId.get(l.id)?.calculatedScore ?? l.calculatedScore)
        : l.calculatedScore
    const tagOf = (l: Lead) => effectiveLeadTag(l)
    const mlOf = (l: Lead) => resolveMlWinDisplay(l, infoScoreRuntime).mlWinProbability
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
        default:
          return 0
      }
    })
    return rows
  }, [filtered, sortKey, sortDir, effectiveLeadTag, activeScoringProfile, scoreByLeadId, infoScoreRuntime])

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
    if (t) next.set(LWF.Q, t)
    else next.delete(LWF.Q)
    setSearchParams(next, { replace: true })
    setPage(1)
  }

  const mergeListFilterUrl = useCallback(
    (patch: Partial<Record<(typeof LWF)[keyof typeof LWF], string | null | undefined>>) => {
      setSearchParams((prev) => mergeLeadFiltersIntoSearchParams(prev, patch), { replace: true })
    },
    [setSearchParams],
  )

  const filterHydrateSig = useMemo(() => leadFilterSignatureForHydrate(searchParams), [searchParams])

  useEffect(() => {
    const sp = searchParams
    if (sp.has(LWF.TAG)) setTagFilter(parseTagFromUrl(sp.get(LWF.TAG)))
    if (sp.has(LWF.REGION)) setRegionFilter(sp.get(LWF.REGION)!.trim() || 'ALL')
    if (sp.has(LWF.SCHOOL)) setSchoolFilter(sp.get(LWF.SCHOOL)!.trim() || 'ALL')
    if (sp.has(LWF.MAJOR)) setMajorFilter(sp.get(LWF.MAJOR)!.trim() || 'ALL')
    if (sp.has(LWF.PIPE)) setStatusFilter(parsePipelineFromUrl(sp.get(LWF.PIPE)))
    if (sp.has(LWF.CRM)) setCrmStatusFilter(parseCrmFromUrl(sp.get(LWF.CRM)))
    if (sp.has(LWF.SOURCE)) setSourceFilter(sp.get(LWF.SOURCE)!.trim() || 'ALL')
    if (sp.has(LWF.ASSIGN)) setAssigneeFilter(sp.get(LWF.ASSIGN)!.trim())
  }, [filterHydrateSig, searchParams])

  const clearQuickFilters = useCallback(() => {
    setTagFilter('ALL')
    setRegionFilter('ALL')
    setMajorFilter('ALL')
    setStatusFilter('ALL')
    setCrmStatusFilter('ALL')
    setSourceFilter('ALL')
    setSchoolFilter('ALL')
    setAssigneeFilter('')
    setScoreMinInput('')
    setScoreMaxInput('')
    setAiShortlistOnly(false)
    setSearchParams((prev) => stripListFiltersKeepOpenView(prev), { replace: true })
    setPage(1)
  }, [setSearchParams, setPage])

  const activeFilterChips = useMemo(() => {
    type Chip = { id: string; label: string; onClear: () => void }
    const out: Chip[] = []
    const qRaw = (searchParams.get(LWF.Q) ?? '').trim()
    if (qRaw) {
      const short = qRaw.length > 26 ? `${qRaw.slice(0, 26)}…` : qRaw
      out.push({
        id: 'q',
        label: `Tìm «${short}»`,
        onClear: () => {
          setSearchParams(
            (prev) => {
              const n = new URLSearchParams(prev)
              n.delete(LWF.Q)
              return n
            },
            { replace: true },
          )
          setPage(1)
        },
      })
    }
    if (tagFilter !== 'ALL') {
      out.push({
        id: 'tag',
        label: `Nhãn: ${tagFilter}`,
        onClear: () => {
          setTagFilter('ALL')
          setPage(1)
          mergeListFilterUrl({ [LWF.TAG]: null })
        },
      })
    }
    if (regionFilter !== 'ALL') {
      out.push({
        id: 'region',
        label: `Vùng: ${regionFilter}`,
        onClear: () => {
          setRegionFilter('ALL')
          setPage(1)
          mergeListFilterUrl({ [LWF.REGION]: null })
        },
      })
    }
    if (majorFilter !== 'ALL') {
      out.push({
        id: 'major',
        label: `Hệ: ${majorFilter.length > 20 ? `${majorFilter.slice(0, 20)}…` : majorFilter}`,
        onClear: () => {
          setMajorFilter('ALL')
          setPage(1)
          mergeListFilterUrl({ [LWF.MAJOR]: null })
        },
      })
    }
    if (statusFilter !== 'ALL') {
      out.push({
        id: 'pipeline',
        label: `Funnel: ${PIPELINE_LABEL[statusFilter as LeadPipelineStatus]}`,
        onClear: () => {
          setStatusFilter('ALL')
          setPage(1)
          mergeListFilterUrl({ [LWF.PIPE]: null })
        },
      })
    }
    if (crmStatusFilter !== 'ALL') {
      out.push({
        id: 'crm',
        label: `Tư vấn: ${LEAD_COUNSELOR_STATUS_LABELS[crmStatusFilter as LeadCounselorStatus]}`,
        onClear: () => {
          setCrmStatusFilter('ALL')
          setPage(1)
          mergeListFilterUrl({ [LWF.CRM]: null })
        },
      })
    }
    if (sourceFilter !== 'ALL') {
      out.push({
        id: 'source',
        label: `Nguồn: ${sourceFilter.length > 18 ? `${sourceFilter.slice(0, 18)}…` : sourceFilter}`,
        onClear: () => {
          setSourceFilter('ALL')
          setPage(1)
          mergeListFilterUrl({ [LWF.SOURCE]: null })
        },
      })
    }
    if (schoolFilter !== 'ALL') {
      out.push({
        id: 'school',
        label: `Trường: ${schoolFilter.length > 18 ? `${schoolFilter.slice(0, 18)}…` : schoolFilter}`,
        onClear: () => {
          setSchoolFilter('ALL')
          setPage(1)
          mergeListFilterUrl({ [LWF.SCHOOL]: null })
        },
      })
    }
    if (assigneeFilter) {
      const al =
        assigneeFilter === '__UNASSIGNED__'
          ? 'Chưa gán TVV'
          : counselorDisplayNameById.get(assigneeFilter) ??
            reassignPickList.find((c) => c.id === assigneeFilter)?.displayName ??
            assigneeFilter.slice(0, 8)
      out.push({
        id: 'assign',
        label: `TVV: ${al}`,
        onClear: () => {
          setAssigneeFilter('')
          setPage(1)
          mergeListFilterUrl({ [LWF.ASSIGN]: null })
        },
      })
    }
    const smin = scoreMinInput.trim()
    const smax = scoreMaxInput.trim()
    const minN = smin === '' || Number.isNaN(Number(smin)) ? null : Number(smin)
    const maxN = smax === '' || Number.isNaN(Number(smax)) ? null : Number(smax)
    if (minN != null || maxN != null) {
      out.push({
        id: 'score',
        label:
          minN != null && maxN != null
            ? `Điểm: ${minN}–${maxN}`
            : minN != null
              ? `Điểm ≥ ${minN}`
              : `Điểm ≤ ${maxN}`,
        onClear: () => {
          setScoreMinInput('')
          setScoreMaxInput('')
          setPage(1)
        },
      })
    }
    if (aiShortlistOnly) {
      out.push({
        id: 'ai',
        label: 'Chỉ hồ sơ AI đã đánh dấu',
        onClear: () => {
          setAiShortlistOnly(false)
          setPage(1)
        },
      })
    }
    return out
  }, [
    searchParams,
    tagFilter,
    regionFilter,
    majorFilter,
    statusFilter,
    crmStatusFilter,
    sourceFilter,
    schoolFilter,
    assigneeFilter,
    scoreMinInput,
    scoreMaxInput,
    aiShortlistOnly,
    mergeListFilterUrl,
    counselorDisplayNameById,
    reassignPickList,
    setSearchParams,
    setPage,
  ])

  const handleExportEvaluated = () => {
    const m = new Map<string, { calculatedScore: number; priorityTag: PriorityTag }>()
    for (const l of sortedFiltered) {
      const ev = activeScoringProfile
        ? scoreByLeadId.get(l.id) ??
          evaluateLead(leadToEvaluationRecord(l), activeScoringProfile, scoringMasterBuckets, schoolTvvSignalDefs)
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
          ? scoreByLeadId.get(l.id) ??
            evaluateLead(leadToEvaluationRecord(l), activeScoringProfile, scoringMasterBuckets, schoolTvvSignalDefs)
          : { calculatedScore: l.calculatedScore, priorityTag: l.priorityTag }
        m.set(l.id, ev)
      }
      return m
    },
    [activeScoringProfile, scoreByLeadId, scoringMasterBuckets, schoolTvvSignalDefs],
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
    if (isElevatedLeadScope && profile && isTeamLeadRole(profile.role)) {
      const team = new Set(counselorIdsInManagerScope(profile, directoryUsers))
      if (!team.has(bulkReassignUid)) {
        window.alert('Chỉ được gán cho TVV trong nhóm bạn quản lý.')
        return
      }
      for (const id of selectedIds) {
        const row = leads.find((x) => x.id === id)
        if (row && !canWriteLead(profile, row, can, directoryUsers)) {
          window.alert('Có hồ sơ nằm ngoài phạm vi nhóm — bỏ chọn hoặc liên hệ Quản trị.')
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
        setSelected((p) => (p?.id === id ? { ...p, ...localPatch } : p))
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
        const ref = doc(db, FS_COLLECTIONS.leads, id)
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
        await updateDoc(ref, localPatch)
        applyLocalLeadPatch(id, localPatch)
        setSelected((p) => (p?.id === id ? { ...p, ...localPatch } : p))
        await commitAuditLog(db, {
          leadId: id,
          actionType: 'STATUS_CHANGE',
          description: `Tình trạng tư vấn (hàng loạt): ${prev ? LEAD_COUNSELOR_STATUS_LABELS[prev.status] : '—'} → ${LEAD_COUNSELOR_STATUS_LABELS[bulkCrmStatus]}`,
          performedBy: profile.id,
          performedByName: performer,
        })
      }
      setBulkModal(null)
      setSelectedIds(new Set())
      refetchLeads()
    } catch (e) {
      console.error(e)
    } finally {
      setBulkBusy(false)
    }
  }, [db, profile, selectedIds, leads, bulkCrmStatus, activeScoringProfile, scoringMasterBuckets, schoolTvvSignalDefs, applyLocalLeadPatch, refetchLeads])

  const executeBulkAiMiner = useCallback(
    async (warmPassed: Lead[]) => {
      if (!db || !profile) return
      if (!canRunLlmAnalysis) {
        setAiMinerError(
          'Phân tích AI cần được quản lý bật «Cho phép dùng AI trên hồ sơ» trong Cài đặt → Quản lý nhân sự, hoặc dùng tài khoản Siêu quản trị.',
        )
        return
      }
      const cfg = resolveAIIntegrationConfig()
      if (!cfg) {
        setAiMinerError(
          'Chưa có khóa AI — vào Cài đặt → LLM → API rồi bấm Lưu, hoặc đặt VITE_AI_API_KEY (tuỳ chọn VITE_AI_PROVIDER=OpenAI|Gemini, VITE_AI_MODEL) trong .env và chạy lại dev/build.',
        )
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
        const processedAt = Timestamp.now()
        const touchAfter = leadTouchPatch()
        for (const r of results) {
          const localPatch: Partial<Lead> = {
            isAiShortlisted: r.isShortlisted,
            aiShortlistReason:
              r.reasoning ||
              (r.isShortlisted ? 'Được AI đánh dấu shortlist — xem nhật ký tương tác.' : 'Không đủ tín hiệu shortlist.'),
            recommendedAction:
              r.nextBestAction ||
              (r.isShortlisted ? 'Liên hệ ngay theo kênh ưu tiên của phụ huynh.' : 'Tiếp tục nuôi lead trong nhóm WARM.'),
            aiProcessedAt: processedAt,
            ...touchAfter,
          }
          applyLocalLeadPatch(r.leadId, localPatch)
        }
        setSelected((p) => {
          if (!p) return p
          const r = results.find((x) => x.leadId === p.id)
          if (!r) return p
          return {
            ...p,
            isAiShortlisted: r.isShortlisted,
            aiShortlistReason:
              r.reasoning ||
              (r.isShortlisted ? 'Được AI đánh dấu shortlist — xem nhật ký tương tác.' : 'Không đủ tín hiệu shortlist.'),
            recommendedAction:
              r.nextBestAction ||
              (r.isShortlisted ? 'Liên hệ ngay theo kênh ưu tiên của phụ huynh.' : 'Tiếp tục nuôi lead trong nhóm WARM.'),
            aiProcessedAt: processedAt,
            ...touchAfter,
          }
        })
        const performer = profile.displayName?.trim() || profile.email || profile.id
        const shorted = results.filter((x) => x.isShortlisted).length
        await commitAuditLog(db, {
          leadId: warmPassed[0]!.id,
          actionType: 'AI_RUN',
          description: `AI Lead Miner (shortlist, sau Gatekeeper): ${results.length} hồ sơ → ${shorted} shortlist`,
          performedBy: profile.id,
          performedByName: performer,
        })
        refetchLeads()
      } catch (e) {
        console.error(e)
        setAiMinerError(e instanceof Error ? e.message : 'Không chạy được AI Lead Miner.')
      } finally {
        setAiMinerProgress(null)
        setSelectedIds(new Set())
      }
    },
    [db, profile, canRunLlmAnalysis, applyLocalLeadPatch, refetchLeads],
  )

  const openAiMinerGatekeeper = useCallback(async () => {
    if (!db || !profile) return
    if (!canRunLlmAnalysis) {
      setAiMinerError(
        'Phân tích AI cần được quản lý bật «Cho phép dùng AI trên hồ sơ» trong Cài đặt → Quản lý nhân sự, hoặc dùng tài khoản Siêu quản trị.',
      )
      return
    }
    const cfg = resolveAIIntegrationConfig()
    if (!cfg) {
      setAiMinerError(
        'Chưa có khóa AI — vào Cài đặt → LLM → API rồi bấm Lưu, hoặc đặt VITE_AI_API_KEY trong .env và chạy lại dev/build.',
      )
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
        e instanceof Error ? e.message : 'Không tải được lịch sử tương tác để kiểm tra trước khi chạy AI.',
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
      {!configured || !db ? (
        <div className="flex justify-end">
          <span className="rounded-full border border-amber-300/70 bg-amber-50 px-3 py-1 text-xs text-amber-900">
            Firebase chưa cấu hình.
          </span>
        </div>
      ) : null}

      {error ? (
        <div className="rounded-xl border border-rose-300 bg-rose-50 px-3 py-2 text-base text-rose-900 shadow-sm backdrop-blur-xl">
          {error}
        </div>
      ) : null}


      <section className="app-card-glass-strong space-y-2 p-2 shadow-md sm:p-3">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:gap-3">
          <details className="group min-w-0 flex-1 rounded-lg border border-slate-200/80 bg-white/50 px-2 py-1 shadow-sm open:bg-white/85 sm:px-2.5">
            <summary className="flex cursor-pointer list-none items-center gap-2 rounded-md py-1 text-xs font-bold uppercase tracking-wide text-slate-600 marker:content-none [&::-webkit-details-marker]:hidden">
              <ChevronDown
                className="h-4 w-4 shrink-0 text-slate-500 transition duration-200 group-open:rotate-180"
                strokeWidth={2}
                aria-hidden
              />
              <span className="shrink-0">Bộ chấm điểm</span>
              <span className="min-w-0 flex-1 truncate text-left text-xs font-semibold normal-case tracking-normal text-slate-800 group-open:hidden">
                {profilesLoading
                  ? 'Đang tải…'
                  : activeScoringProfile?.profileName?.trim() || (!scoringProfiles.length ? 'Chưa có profile' : '—')}
              </span>
            </summary>
            <div className="mt-2 flex flex-col gap-2 border-t border-slate-200/60 pt-2 sm:flex-row sm:items-end">
              <label className="min-w-0 flex-1 text-xs font-bold uppercase tracking-wide text-slate-500">
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
                  <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-slate-500">
                    ▾
                  </span>
                </div>
              </label>
              <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                {canCreateManualLead && configured && db ? (
                  <button
                    type="button"
                    onClick={() => setCreateLeadOpen(true)}
                    className="inline-flex items-center gap-1 rounded-lg border border-emerald-500 bg-emerald-600 px-2 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-emerald-700"
                  >
                    <UserPlus className="h-3.5 w-3.5 shrink-0" aria-hidden />
                    Tạo hồ sơ mới
                  </button>
                ) : null}
                <button
                  type="button"
                  disabled={!activeScoringProfile}
                  onClick={() => setInspectProfileOpen(true)}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200/95 bg-white px-2 py-1.5 text-xs font-medium text-slate-800 shadow-sm transition hover:border-amber-300 hover:bg-amber-50/80 disabled:opacity-40"
                >
                  <InfoIcon className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  Quy tắc
                </button>
                <button
                  type="button"
                  disabled={!sortedFiltered.length}
                  onClick={handleExportEvaluated}
                  className="inline-flex items-center gap-1 rounded-lg border border-emerald-300 bg-emerald-50 px-2 py-1.5 text-xs font-semibold text-emerald-900 shadow-sm transition hover:border-emerald-400 hover:bg-emerald-100 disabled:opacity-40"
                >
                  <Download className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  Xuất Excel (trang hiện tại)
                </button>
              </div>
            </div>
            <div className="mt-2 flex flex-col gap-1.5 border-t border-amber-100/90 pt-2">
              {profileScoringActive && !profileScoringLive ? (
                <p className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-950">
                  Profile «{activeScoringProfile?.profileName}» chưa có quy tắc — thêm khối quy tắc trong{' '}
                  <strong>Cài đặt → Cài đặt Profile</strong>. Cột điểm hiện theo dữ liệu đã lưu hoặc 0.
                </p>
              ) : null}
              <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Lọc nhanh nhãn chấm điểm">
                <button
                  type="button"
                  disabled={!scoringProfiles.length}
                  onClick={() => {
                    setTagFilter('ALL')
                    setPage(1)
                    mergeListFilterUrl({ [LWF.TAG]: null })
                  }}
                  className={[
                    'rounded-full border px-2.5 py-1 text-xs font-semibold transition',
                    tagFilter === 'ALL'
                      ? 'border-slate-700 bg-slate-800 text-white'
                      : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300',
                  ].join(' ')}
                >
                  Tất cả
                </button>
                {TAG_OPTIONS.map((tg) => {
                  const on = tagFilter === tg
                  const cnt = tagChipCounts?.[tg]
                  return (
                    <button
                      key={tg}
                      type="button"
                      disabled={!scoringProfiles.length}
                      onClick={() => {
                        setTagFilter(tg)
                        setPage(1)
                        mergeListFilterUrl({ [LWF.TAG]: tg })
                      }}
                      className={[
                        'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold transition',
                        on
                          ? tg === 'HOT'
                            ? 'border-rose-500 bg-rose-600 text-white shadow-sm'
                            : tg === 'WARM'
                              ? 'border-amber-500 bg-amber-500 text-amber-950 shadow-sm'
                              : tg === 'COLD'
                                ? 'border-sky-400 bg-sky-600 text-white shadow-sm'
                                : 'border-slate-600 bg-slate-700 text-white shadow-sm'
                          : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300',
                      ].join(' ')}
                    >
                      <span className="font-bold tracking-wide">{tg}</span>
                      {cnt !== undefined ? <span className="tabular-nums opacity-90">({cnt})</span> : null}
                    </button>
                  )
                })}
              </div>
              {tagClientEval && scopeFetchTruncated ? (
                <p className="text-xs font-medium text-amber-900">
                  Đã đạt giới hạn tải ({LEADS_UI_FULL_SCOPE_MAX.toLocaleString('vi-VN')} hồ sơ) — có thể thiếu một
                  phần ở đuôi danh sách.
                </p>
              ) : null}
            </div>
          </details>
          <label className="min-w-0 w-full text-xs font-bold uppercase tracking-wide text-slate-500 lg:max-w-md lg:flex-1">
            Tìm kiếm
            <input
              value={searchParams.get(LWF.Q) ?? ''}
              onChange={(e) => setUrlQuery(e.target.value)}
              placeholder="Tên, SĐT, mã KH, TVV…"
              title="Tìm trong các thông tin hiển thị trên hồ sơ (tên, SĐT, mã KH, mô tả, TVV…). Có thể dùng chung với các lọc bên dưới."
              className="mt-0.5 w-full rounded-lg border border-slate-200/95 bg-white px-2.5 py-1.5 text-sm text-slate-900 outline-none transition focus:border-amber-400 focus:ring-1 focus:ring-amber-100"
            />
          </label>
        </div>

        <div className="flex flex-nowrap items-end gap-1.5 overflow-x-auto border-t border-slate-200/70 pb-0.5 pt-2 [scrollbar-width:thin]">
          <FilterSelect
            compact
            label="Nhãn"
            title="Nhãn HOT / WARM / COLD theo bộ chấm điểm đang chọn ở đầu trang (khi đang tìm kiếm có thể dùng nhãn đã lưu trên hồ sơ)."
            value={tagFilter}
            onChange={(v) => {
              setTagFilter(v)
              setPage(1)
              mergeListFilterUrl({ [LWF.TAG]: v === 'ALL' ? null : v })
            }}
            options={[
              { v: 'ALL', t: 'Tất cả' },
              ...TAG_OPTIONS.map((t) => ({ v: t, t })),
            ]}
          />
          <SearchableFilterSelect
            compact
            label="Vùng"
            title="Tỉnh / thành trên hồ sơ."
            value={regionFilter}
            onChange={(v) => {
              setRegionFilter(v)
              setPage(1)
              mergeListFilterUrl({ [LWF.REGION]: v === 'ALL' ? null : v })
            }}
            options={regions.map((p) => ({ v: p, t: p }))}
          />
          <FilterSelect
            compact
            label="Hệ ĐT"
            title="Ngành / hệ đào tạo ghi trên hồ sơ."
            value={majorFilter}
            onChange={(v) => {
              setMajorFilter(v)
              setPage(1)
              mergeListFilterUrl({ [LWF.MAJOR]: v === 'ALL' ? null : v })
            }}
            options={[
              { v: 'ALL', t: 'Tất cả' },
              ...majors.map((p) => ({ v: p, t: p })),
            ]}
          />
          <FilterSelect
            compact
            label="Funnel"
            title="Giai đoạn tuyển sinh trên hồ sơ (khác với cột «Tư vấn» — tiến độ làm việc với TVV)."
            value={statusFilter}
            onChange={(v) => {
              setStatusFilter(v)
              setPage(1)
              mergeListFilterUrl({ [LWF.PIPE]: v === 'ALL' ? null : v })
            }}
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
            label="Tư vấn"
            title="Tiến độ làm việc với tư vấn viên (CRM)."
            value={crmStatusFilter}
            onChange={(v) => {
              setCrmStatusFilter(v)
              setPage(1)
              mergeListFilterUrl({ [LWF.CRM]: v === 'ALL' ? null : v })
            }}
            options={[
              { v: 'ALL', t: 'Tất cả' },
              ...LEAD_COUNSELOR_STATUS_ORDER.map((k) => ({ v: k, t: LEAD_COUNSELOR_STATUS_LABELS[k] })),
            ]}
          />
          <FilterSelect
            compact
            label="Nguồn"
            title="Kênh hồ sơ đến (web, Zalo, giới thiệu…)."
            value={sourceFilter}
            onChange={(v) => {
              setSourceFilter(v)
              setPage(1)
              mergeListFilterUrl({ [LWF.SOURCE]: v === 'ALL' ? null : v })
            }}
            options={[{ v: 'ALL', t: 'Tất cả' }, ...sources.map((s) => ({ v: s, t: s }))]}
          />
          <SearchableFilterSelect
            compact
            label="Trường THPT"
            title="Trường THPT của thí sinh."
            value={schoolFilter}
            onChange={(v) => {
              setSchoolFilter(v)
              setPage(1)
              mergeListFilterUrl({ [LWF.SCHOOL]: v === 'ALL' ? null : v })
            }}
            options={schoolOptions.map((sc) => ({
              v: sc,
              t: sc.length > 48 ? `${sc.slice(0, 48)}…` : sc,
            }))}
          />
          <FilterSelect
            compact
            label="TVV"
            title="TVV được phân công (áp dụng trên danh sách đang hiển thị)."
            value={assigneeFilter}
            onChange={(v) => {
              setAssigneeFilter(v)
              setPage(1)
              mergeListFilterUrl({ [LWF.ASSIGN]: v ? v : null })
            }}
            options={[
              { v: '', t: 'Tất cả TVV' },
              { v: '__UNASSIGNED__', t: 'Chưa gán TVV' },
              ...reassignPickList.map((c) => ({
                v: c.id,
                t: formatStaffDirectoryLabel(c),
              })),
            ]}
          />
          <label className="flex shrink-0 flex-col text-xs font-bold uppercase tracking-wide text-slate-500" title="Lọc theo điểm đã lưu / điểm preview profile (cột Điểm).">
            Điểm từ
            <input
              type="number"
              inputMode="numeric"
              placeholder="—"
              value={scoreMinInput}
              onChange={(e) => setScoreMinInput(e.target.value)}
              className="mt-0.5 w-[4.5rem] shrink-0 rounded-md border border-slate-200/95 bg-white px-1.5 py-1 text-xs tabular-nums text-slate-900 outline-none transition focus:border-amber-400 focus:ring-1 focus:ring-amber-100"
            />
          </label>
          <label className="flex shrink-0 flex-col text-xs font-bold uppercase tracking-wide text-slate-500" title="Lọc theo điểm đã lưu / điểm preview profile (cột Điểm).">
            Điểm đến
            <input
              type="number"
              inputMode="numeric"
              placeholder="—"
              value={scoreMaxInput}
              onChange={(e) => setScoreMaxInput(e.target.value)}
              className="mt-0.5 w-[4.5rem] shrink-0 rounded-md border border-slate-200/95 bg-white px-1.5 py-1 text-xs tabular-nums text-slate-900 outline-none transition focus:border-amber-400 focus:ring-1 focus:ring-amber-100"
            />
          </label>
          <button
            type="button"
            onClick={clearQuickFilters}
            className="shrink-0 self-end rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs font-semibold whitespace-nowrap text-slate-700 shadow-sm transition hover:border-rose-300 hover:bg-rose-50 hover:text-rose-900"
          >
            Xóa lọc nhanh
          </button>
        </div>

        {activeFilterChips.length > 0 ? (
          <div className="flex flex-wrap items-center gap-2 border-t border-slate-200/60 pt-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Đang lọc</span>
            <div className="flex min-w-0 flex-1 flex-wrap gap-1.5">
              {activeFilterChips.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => c.onClear()}
                  className="inline-flex max-w-full items-center gap-1 rounded-full border border-amber-300/80 bg-amber-50/95 px-2.5 py-1 text-xs font-medium text-amber-950 shadow-sm transition hover:border-amber-500 hover:bg-amber-100"
                  title="Bỏ lọc này"
                >
                  <span className="min-w-0 truncate">{c.label}</span>
                  <span className="shrink-0 font-bold text-amber-800" aria-hidden>
                    ×
                  </span>
                </button>
              ))}
            </div>
          </div>
        ) : null}

        <div className="flex flex-wrap items-end gap-2 border-t border-slate-200/60 pt-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              title="Chỉ hiện các hồ sơ đã được AI phân tích và đánh dấu ưu tiên (có tia sét vàng cạnh tên). Bấm lại để tắt."
              onClick={() => {
                setAiShortlistOnly((v) => !v)
                setPage(1)
              }}
              className={[
                'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide transition sm:px-3 sm:py-1.5 sm:text-xs',
                aiShortlistOnly
                  ? 'border-amber-400 bg-gradient-to-r from-amber-500 to-yellow-400 text-amber-950 shadow-[0_0_22px_rgba(251,191,36,0.5)]'
                  : 'border-slate-200/90 bg-white/90 text-slate-700 hover:border-amber-300 hover:bg-amber-50/80',
              ].join(' ')}
            >
              <Zap className="h-3.5 w-3.5 shrink-0 text-current" strokeWidth={2.5} aria-hidden />
              ⚡ AI Shortlist
            </button>
            <button
              type="button"
              onClick={() => setAiShortlistGuideOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-full border border-slate-200/90 bg-white/90 px-2.5 py-1 text-xs font-semibold text-slate-700 shadow-sm transition hover:border-amber-400 hover:bg-amber-50/90 hover:text-amber-950"
              title="Mở hướng dẫn từng bước (cửa sổ giữa màn hình)"
            >
              <CircleHelp className="h-3.5 w-3.5 shrink-0 text-amber-700" strokeWidth={2.25} aria-hidden />
              Hướng dẫn
            </button>
          </div>
          {aiShortlistOnly ? (
            <span className="max-w-xl text-xs leading-snug text-slate-600">
              Đang lọc: chỉ các hồ sơ đã được AI đánh dấu ưu tiên (có <strong className="text-amber-900">tia sét vàng</strong>{' '}
              cạnh tên). Nếu chưa từng chạy bước phân tích AI cho nhóm WARM, danh sách có thể không có dòng nào — hãy
              mở <strong>Hướng dẫn</strong> bên cạnh.
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
                className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-800 transition hover:bg-slate-50 disabled:opacity-40"
              >
                « Đầu
              </button>
              <button
                type="button"
                disabled={currentPage <= 1 || loadingPage}
                onClick={() => setPage(currentPage - 1)}
                className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-800 transition hover:bg-slate-50 disabled:opacity-40"
              >
                Trước
              </button>
              <button
                type="button"
                disabled={currentPage >= displayTotalPages || loadingPage}
                onClick={() => setPage(currentPage + 1)}
                className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-800 transition hover:bg-slate-50 disabled:opacity-40"
              >
                Sau
              </button>
              <button
                type="button"
                disabled={currentPage >= displayTotalPages || loadingPage}
                onClick={() => setPage(displayTotalPages)}
                className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-800 transition hover:bg-slate-50 disabled:opacity-40"
              >
                Cuối »
              </button>
            </div>
          </div>
        ) : null}
        <div className="scroll-touch max-h-[min(calc(100dvh-200px),78vh)] overflow-auto overscroll-contain">
          <table className="min-w-[1280px] w-full border-collapse text-left text-sm">
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
                <th
                  className="max-w-[11rem] px-2 py-3 text-sm font-medium normal-case"
                  title="Mô tả / ghi chú chính trên hồ sơ"
                >
                  Ghi chú
                </th>
                <th
                  className="max-w-[11rem] px-2 py-3 text-sm font-medium normal-case"
                  title="Ghi chú 1, ghi chú 2, nguyện vọng, sở thích… (khi có nhiều trường ghi chú)"
                >
                  Ghi chú thêm
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
                    {profileScoringActive ? (
                      <span className="text-xs font-normal normal-case text-violet-700">
                        {profileScoringLive ? 'theo profile' : 'profile (chưa có quy tắc)'}
                      </span>
                    ) : null}
                  </button>
                </th>
                <th className="w-16 min-w-[3.75rem] px-1 py-3 text-center text-xs font-medium normal-case">
                  <div className="flex flex-col items-center gap-0.5">
                    <button
                      type="button"
                      onClick={() => toggleSort('mlWin')}
                      className="inline-flex flex-col items-center gap-0.5 text-violet-900 transition hover:text-violet-700"
                    >
                      <span className="leading-tight">Điểm</span>
                      <span className="leading-tight">thông tin</span>
                      {sortKey === 'mlWin' ? (
                        <span className="text-amber-600">{sortDir === 'asc' ? '↑' : '↓'}</span>
                      ) : null}
                    </button>
                    <InfoScoreHelpPopover hint={ML_WIN_COLUMN_HINT} />
                  </div>
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
                <th className="min-w-[6rem] max-w-[9rem] px-2 py-3 text-sm font-medium normal-case">TVV</th>
              </tr>
            </thead>
            <tbody>
              {loading
                ? Array.from({ length: 8 }).map((_, i) => (
                    <tr key={i} className="border-b border-slate-100">
                      {Array.from({ length: LEAD_TABLE_COL_COUNT }).map((__, j) => (
                        <td key={j} className="px-4 py-3">
                          <div className="h-4 rounded-md bg-gradient-to-r from-slate-200 via-slate-100 to-slate-200 ai-skeleton-shimmer" />
                        </td>
                      ))}
                    </tr>
                  ))
                : null}
              {!loading && !sortedFiltered.length ? (
                <tr>
                  <td colSpan={LEAD_TABLE_COL_COUNT} className="px-4 py-12 text-center text-slate-500">
                    Không có hồ sơ khớp bộ lọc.
                  </td>
                </tr>
              ) : null}
              {pagedRows.map((l) => {
                const ev = profileScoringActive ? scoreByLeadId.get(l.id) : undefined
                const displayScore = profileScoringActive
                  ? (ev?.calculatedScore ?? l.calculatedScore)
                  : l.calculatedScore
                const displayTag = profileScoringActive ? (ev?.priorityTag ?? l.priorityTag) : l.priorityTag
                const ml = resolveMlWinDisplay(l, infoScoreRuntime)
                const descForTable = leadDescriptionForDisplay(l.description)
                const extraNotesFull = leadSupplementaryNotesText(l)
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
                          aria-label="Đã được AI đánh dấu ưu tiên"
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
                    className="max-w-[11rem] truncate px-2 py-3 leading-snug text-slate-600"
                    title={descForTable.trim() ? descForTable : undefined}
                  >
                    {formatDescPreview(l.description)}
                  </td>
                  <td
                    className="max-w-[11rem] truncate px-2 py-3 leading-snug text-slate-600"
                    title={extraNotesFull.trim() ? extraNotesFull : undefined}
                  >
                    {extraNotesFull.trim() ? formatDescPreview(extraNotesFull, 56) : '—'}
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
            !resolveAIIntegrationConfig() ||
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
            <h3 className="app-section-heading">Đổi tình trạng tư vấn</h3>
            <p className="mt-1 text-sm text-slate-600">Áp dụng cho {selectedIds.size} hồ sơ đã chọn.</p>
            <label className="mt-4 block text-sm font-medium text-slate-700">
              Tình trạng tư vấn mới
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

      {aiShortlistGuideOpen && typeof document !== 'undefined'
        ? createPortal(
            <div className="fixed inset-0 z-[74] flex items-center justify-center p-4 sm:p-6" role="presentation">
              <button
                type="button"
                className="absolute inset-0 bg-slate-950/55 backdrop-blur-sm"
                aria-label="Đóng hướng dẫn"
                onClick={() => setAiShortlistGuideOpen(false)}
              />
              <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="ai-shortlist-guide-title"
                className="relative z-10 max-h-[min(88dvh,720px)] w-full max-w-lg overflow-y-auto overscroll-contain rounded-2xl border border-amber-200/80 bg-white p-5 shadow-[0_24px_64px_rgba(15,23,42,0.28)] sm:max-w-xl sm:p-7"
              >
                <div className="flex items-start justify-between gap-3 border-b border-amber-100 pb-4">
                  <div className="min-w-0">
                    <p
                      id="ai-shortlist-guide-title"
                      className="text-lg font-bold tracking-tight text-slate-900 sm:text-xl"
                    >
                      AI Shortlist — làm thế nào?
                    </p>
                    <p className="mt-1 text-sm leading-relaxed text-slate-600">
                      Có <strong className="text-slate-800">hai việc khác nhau</strong>: trước hết để AI phân tích và
                      lưu gợi ý lên hồ sơ, sau đó (tuỳ chọn) dùng nút lọc để chỉ xem nhóm đó.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setAiShortlistGuideOpen(false)}
                    className="shrink-0 rounded-xl border border-slate-200 bg-white p-2 text-slate-600 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-900"
                    aria-label="Đóng"
                  >
                    <X className="h-5 w-5" strokeWidth={2} aria-hidden />
                  </button>
                </div>

                <section className="mt-5 space-y-3 rounded-xl border border-emerald-200/70 bg-emerald-50/50 p-4 text-sm leading-relaxed text-slate-800 sm:text-[15px]">
                  <p className="font-bold text-emerald-950">A. Chuẩn bị (làm một lần hoặc khi đổi máy)</p>
                  <ol className="list-decimal space-y-2 pl-5 marker:font-semibold marker:text-emerald-800">
                    <li>
                      Vào <strong>Cài đặt</strong> → tab <strong>LLM</strong> → mục <strong>API</strong>: chọn nhà cung
                      cấp, dán khóa, bấm <strong>Lưu API vào trình duyệt</strong>. Phải lưu trên{' '}
                      <strong>đúng máy và trình duyệt</strong> bạn đang dùng (hoặc cấu hình{' '}
                      <code className="rounded bg-white/80 px-1 py-0.5 text-xs">VITE_AI_API_KEY</code> trong{' '}
                      <code className="rounded bg-white/80 px-1 py-0.5 text-xs">.env</code> khi dev/build — ưu tiên
                      localStorage nếu đã lưu).
                    </li>
                    <li>
                      Nếu bạn <strong>không phải Siêu quản trị</strong>: nhờ quản lý vào <strong>Quản lý nhân sự</strong>,
                      mở hồ sơ của bạn và bật <strong>«Cho phép dùng AI trên hồ sơ»</strong>. Không bật thì các nút
                      chạy AI sẽ không hoạt động.
                    </li>
                  </ol>
                </section>

                <section className="mt-4 space-y-3 text-sm leading-relaxed text-slate-800 sm:text-[15px]">
                  <p className="font-bold text-slate-900">B. Để AI phân tích và “đánh dấu” hồ sơ (có tia sét vàng)</p>
                  <ol className="list-decimal space-y-2.5 pl-5 marker:font-semibold marker:text-amber-700">
                    <li>
                      Ở trang <strong>Hồ sơ</strong>, ở bộ lọc nhãn, chọn <strong>WARM</strong> (nhãn theo bộ chấm điểm
                      đang bật ở đầu trang).
                    </li>
                    <li>
                      Tick ô vuông bên trái các dòng bạn muốn gửi cho AI (ít nhất một dòng WARM).
                    </li>
                    <li>
                      Kéo xuống <strong>thanh thao tác hàng loạt</strong> dưới cùng → bấm{' '}
                      <strong>✨ Chạy AI Phân tích (Shortlist)</strong>.
                    </li>
                    <li>
                      Đọc cửa sổ kiểm tra hiện ra (tiêu đề kiểu “tiết kiệm token”) → bấm xác nhận <strong>Chạy AI</strong>{' '}
                      nếu đồng ý. Chờ đến khi xong; mỗi hồ sơ được xử lý sẽ có <strong>tia sét vàng</strong> cạnh tên trên
                      bảng.
                    </li>
                    <li>
                      Mở chi tiết một hồ sơ: phần <strong>«Gợi ý từ AI»</strong> ở đầu panel hiển thị lý do và hành động
                      gợi ý.
                    </li>
                  </ol>
                </section>

                <section className="mt-4 space-y-2 rounded-xl border border-amber-200/80 bg-amber-50/60 p-4 text-sm leading-relaxed text-slate-800 sm:text-[15px]">
                  <p className="font-bold text-amber-950">C. Nút «⚡ AI Shortlist» trên bộ lọc</p>
                  <p>
                    Nút này chỉ <strong>lọc bảng</strong> để còn các hồ sơ <strong>đã có tia sét vàng</strong> (tức đã
                    qua bước B). <strong>Không</strong> gọi AI, <strong>không</strong> tốn phí API.
                  </p>
                  <p className="font-semibold text-amber-950">
                    Nếu bật lọc mà không thấy dòng nào: thường là vì chưa ai chạy bước B cho các hồ sơ trong phạm vi bạn
                    được xem — không phải lỗi màn hình.
                  </p>
                </section>

                <div className="mt-5 rounded-xl border border-slate-200/90 bg-slate-50/90 p-4 text-sm text-slate-700">
                  <p className="font-semibold text-slate-900">Tắt lọc nhanh</p>
                  <p className="mt-1">
                    Dải chip <strong>«Đang lọc»</strong> phía trên có dòng <strong>«Chỉ hồ sơ AI đã đánh dấu»</strong> —
                    bấm dấu × trên chip đó, hoặc bấm lại nút <strong>⚡ AI Shortlist</strong>.
                  </p>
                </div>

                <div className="mt-6 flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-4">
                  <button
                    type="button"
                    onClick={() => setAiShortlistGuideOpen(false)}
                    className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 shadow-sm transition hover:bg-slate-50"
                  >
                    Đóng
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setAiShortlistGuideOpen(false)
                      setAiShortlistOnly(true)
                      setPage(1)
                    }}
                    className="rounded-xl border border-amber-400 bg-gradient-to-r from-amber-500 to-yellow-400 px-4 py-2.5 text-sm font-bold text-amber-950 shadow-sm transition hover:brightness-105"
                  >
                    Chỉ xem hồ sơ đã có tia sét
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}

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
                    className="text-center text-xs font-bold uppercase tracking-[0.2em] text-slate-600"
                  >
                    Kiểm tra trước khi chạy AI
                  </p>
                  <p className="mt-1 text-center text-[11px] font-medium uppercase tracking-wide text-slate-500">
                    Giúp giảm chi phí — chỉ gửi hồ sơ đủ điều kiện
                  </p>
                  <p className="mt-4 text-center text-base font-semibold text-slate-900">
                    Bạn đã chọn {gatekeeperModal.totalSelected} hồ sơ
                    {gatekeeperModal.totalSelected !== gatekeeperModal.warmCount ? (
                      <span className="mt-1 block text-sm font-normal text-slate-600">
                        Trong đó {gatekeeperModal.warmCount} hồ sơ có nhãn WARM được đưa vào bước kiểm tra (chỉ nhóm này
                        mới được gửi cho AI phân tích).
                      </span>
                    ) : null}
                  </p>
                  {gatekeeperModal.warmCount > 0 ? (
                    <p className="mt-4 rounded-xl border border-emerald-400/35 bg-emerald-500/10 px-4 py-3 text-sm leading-relaxed text-emerald-950">
                      🛡️ Bước kiểm tra tự động đã loại bỏ{' '}
                      <span className="font-bold tabular-nums">{gatekeeperModal.skipped}</span> hồ sơ (ghi chú quá ngắn,
                      chưa đủ tín hiệu theo cài đặt, hoặc chưa có tương tác trong khoảng thời gian cho phép).
                    </p>
                  ) : null}
                  {gatekeeperModal.passed.length > 0 ? (
                    <>
                      <p className="mt-4 text-center text-sm font-medium text-slate-800">
                        🚀 Chỉ có{' '}
                        <span className="font-bold text-violet-800 tabular-nums">{gatekeeperModal.passed.length}</span>{' '}
                        hồ sơ đạt chuẩn. Bạn có muốn bắt đầu chạy AI cho{' '}
                        <span className="font-semibold tabular-nums">{gatekeeperModal.passed.length}</span> hồ sơ này
                        không?
                        {gatekeeperModal.warmCount > 0 ? (
                          <span className="mt-2 block text-sm font-normal text-slate-600">
                            (Ước tính tiết kiệm ~{Math.round((gatekeeperModal.skipped / gatekeeperModal.warmCount) * 100)}
                            % chi phí so với việc gửi toàn bộ WARM đã chọn.)
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
                      Không có hồ sơ WARM nào đủ điều kiện. Bạn có thể nới quy tắc trong{' '}
                      <strong>Cài đặt → tab LLM → «Lọc trước khi gọi AI»</strong>, hoặc bổ sung ghi chú / tương tác rồi
                      thử lại.
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
                <p className="text-center text-xs font-bold uppercase tracking-wider text-slate-600">
                  Đang phân tích AI theo lô
                </p>
                <p className="mt-2 text-center text-base font-semibold text-slate-900">
                  {aiMinerProgress.done}/{aiMinerProgress.total} hồ sơ
                </p>
                <p className="mt-1 text-center text-xs text-slate-600">
                  Xử lý theo lô — tối đa 12 hồ sơ mỗi lần gọi AI (giúp giảm chi phí).
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
                    evaluateLead(
                      leadToEvaluationRecord(selected),
                      activeScoringProfile,
                      scoringMasterBuckets,
                      schoolTvvSignalDefs,
                    )
                  : undefined
              }
              db={db}
              institutionalRagBlock={institutionalRagBlock}
              counselorUsers={counselorUsers}
              pickListUsers={reassignPickList}
              counselorsLoading={counselorsLoading}
              canReassignLead={showBulkReassign}
              reassignElevated={isElevatedLeadScope}
              scoringMasterBuckets={scoringMasterBuckets}
              schoolTvvSignalDefs={schoolTvvSignalDefs}
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
              onClose={closeLeadDetailPanel}
              onUnsavedChange={(dirty) => {
                leadDetailUnsavedRef.current = dirty
              }}
              onUpdated={(patch) => {
                applyLocalLeadPatch(selected.id, patch)
                setSelected((prev) => (prev ? { ...prev, ...patch } : prev))
              }}
            />,
            document.body,
          )
        : null}

      <CreateLeadModal
        open={createLeadOpen}
        onClose={() => setCreateLeadOpen(false)}
        db={db}
        profile={profile}
        assigneeOptions={reassignPickList}
        directoryUsers={directoryUsers}
        activeScoringProfile={activeScoringProfile}
        scoringMasterBuckets={scoringMasterBuckets}
        schoolTvvSignalDefs={schoolTvvSignalDefs}
        onCreated={handleManualLeadCreated}
        onOpenExisting={(id) => void openLeadById(id)}
      />
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
  title,
  value,
  onChange,
  options,
  compact,
}: {
  label: string
  /** Tooltip — giải thích ngắn khi rê chuột lên nhãn lọc. */
  title?: string
  value: string
  onChange: (v: string) => void
  options: { v: string; t: string }[]
  compact?: boolean
}) {
  return (
    <label
      title={title}
      className={
        compact
          ? 'flex shrink-0 flex-col text-xs font-bold uppercase tracking-wide text-slate-500'
          : 'flex flex-col text-xs font-medium text-slate-600'
      }
    >
      {label}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={
          compact
            ? 'mt-0.5 max-w-[7.25rem] min-w-[3.75rem] shrink-0 truncate rounded-md border border-slate-200/95 bg-white px-1 py-1 text-xs font-medium text-slate-900 outline-none transition focus:ring-2 focus:ring-amber-200'
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

function LeadCrmQuickBlock({
  lead,
  db,
  counselorUsers,
  pickListUsers,
  counselorsLoading,
  reassignElevated,
  onUpdated,
  compact,
  leadScoringContext,
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
  compact?: boolean
  leadScoringContext?: {
    profile: ScoringProfile | null
    buckets?: MasterDataBuckets
    schoolDefs: ProfileCustomScoringSignal[] | null
  }
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
  const [crmCounselorStatus, setCrmCounselorStatus] = useState<LeadCounselorStatus>(() => lead.status)
  const [crmBusy, setCrmBusy] = useState(false)
  const [crmMsg, setCrmMsg] = useState<string | null>(null)

  useEffect(() => {
    setCrmAssignUid(lead.assignedTo ?? lead.assignedCounselorId ?? '')
    setCrmCounselorStatus(lead.status)
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
    const sameStatus = prevStatus === crmCounselorStatus
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
      const assignPatch = {
        ...assigneeFirestoreMirror(nextUid),
        status: crmCounselorStatus,
        pipelineStatus: counselorStatusToPipeline(crmCounselorStatus),
      } as Partial<Lead>
      const scoreFields = leadScoringContext
        ? persistedLeadScoringFields(
            lead,
            assignPatch,
            leadScoringContext.profile,
            leadScoringContext.buckets,
            leadScoringContext.schoolDefs,
          )
        : {}
      await updateDoc(doc(db, FS_COLLECTIONS.leads, lead.id), {
        ...assignPatch,
        ...scoreFields,
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
          description: `Tình trạng tư vấn: ${LEAD_COUNSELOR_STATUS_LABELS[prevStatus]} → ${LEAD_COUNSELOR_STATUS_LABELS[crmCounselorStatus]}`,
          performedBy: profile.id,
          performedByName: performer,
        })
      }
      onUpdated({
        ...assignPatch,
        ...scoreFields,
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
    <section
      className={
        compact
          ? 'shrink-0 rounded-lg border border-violet-200/80 bg-violet-50/50 p-2 shadow-sm'
          : 'rounded-xl border border-violet-200/80 bg-violet-50/50 p-3 shadow-sm'
      }
    >
      <h3
        className={
          compact
            ? 'text-xs font-bold uppercase tracking-wider text-slate-600'
            : 'app-section-heading'
        }
      >
        Phân công &amp; tình trạng
      </h3>
      {peerMode ? (
        <p
          className={
            compact
              ? 'mt-0.5 text-xs leading-snug text-slate-600'
              : 'mt-0.5 text-sm leading-snug text-slate-600'
          }
        >
          Chuyển hồ sơ của bạn cho đồng nghiệp (danh sách: tên hiển thị · email). Không thể bỏ gán trống — chọn người
          nhận.
        </p>
      ) : null}
      <label
        className={
          compact ? 'mt-1.5 block text-xs font-medium text-slate-700' : 'mt-2 block text-sm font-medium text-slate-700'
        }
      >
        {reassignElevated ? 'Phụ trách (TVV / Admin)' : 'Tư vấn viên'}
        <select
          value={crmAssignUid}
          onChange={(e) => setCrmAssignUid(e.target.value)}
          disabled={counselorsLoading}
          className={
            compact
              ? 'mt-0.5 w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-900 outline-none focus:ring-1 focus:ring-violet-200 disabled:opacity-50'
              : 'mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-2 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-violet-200 disabled:opacity-50'
          }
        >
          {reassignElevated ? <option value="">— Chưa gán —</option> : null}
          {assignableCounselors.map((c) => (
            <option key={c.id} value={c.id} className="bg-white">
              {formatStaffDirectoryLabel(c)}
            </option>
          ))}
        </select>
      </label>
      <label
        className={
          compact ? 'mt-1.5 block text-xs font-medium text-slate-700' : 'mt-2 block text-sm font-medium text-slate-700'
        }
      >
        Tình trạng tư vấn
        <select
          value={crmCounselorStatus}
          onChange={(e) => setCrmCounselorStatus(e.target.value as LeadCounselorStatus)}
          className={
            compact
              ? 'mt-0.5 w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-900 outline-none focus:ring-1 focus:ring-violet-200'
              : 'mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-2 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-violet-200'
          }
        >
          {LEAD_COUNSELOR_STATUS_ORDER.map((s) => (
            <option key={s} value={s} className="bg-white">
              {LEAD_COUNSELOR_STATUS_LABELS[s]}
            </option>
          ))}
        </select>
      </label>
      {crmMsg ? (
        <p className={compact ? 'mt-1.5 text-xs text-violet-900' : 'mt-2 text-sm text-violet-900'}>{crmMsg}</p>
      ) : null}
      <button
        type="button"
        disabled={crmBusy}
        onClick={() => void save()}
        className={
          compact
            ? 'mt-2 w-full rounded-md border border-violet-500 bg-violet-600 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-violet-700 disabled:opacity-50'
            : 'mt-3 w-full rounded-lg border border-violet-500 bg-violet-600 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-violet-700 disabled:opacity-50'
        }
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
  scoringMasterBuckets,
  schoolTvvSignalDefs,
  db,
  institutionalRagBlock,
  counselorUsers,
  pickListUsers,
  counselorsLoading,
  canReassignLead,
  reassignElevated,
  onClose,
  onUnsavedChange,
  onUpdated,
  dynamicAssistantSlot,
}: {
  lead: Lead
  activeScoringProfile: ScoringProfile | null
  scoringPreview?: { calculatedScore: number; priorityTag: PriorityTag }
  scoringMasterBuckets?: MasterDataBuckets
  schoolTvvSignalDefs?: ProfileCustomScoringSignal[] | null
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
  /** Đóng panel — parent có thể bọc confirm khi còn dirty (đồng bộ qua onUnsavedChange). */
  onClose: () => void
  /** Báo parent có thay đổi chưa lưu (funnel / ghi chú / CRM trái) để onClose hỏi xác nhận. */
  onUnsavedChange?: (dirty: boolean) => void
  onUpdated: (patch: Partial<Lead>) => void
  /** Trợ lý kịch bản (nhúng trong layout fullscreen). */
  dynamicAssistantSlot?: ReactNode
}) {
  const { profile, can, canRunLlmAnalysis } = useAuth()
  const { runtime: infoScoreRuntime } = useInfoScoreRules()
  const canEditScoringSignals = canWriteLead(profile, lead, can, pickListUsers)
  const { tasksById: aiInsightTasksById } = useLeadAiInsightTasks(lead.id)
  const { interactions } = useInteractions(lead.id)
  const { playbooks } = useConsultingPlaybooks()
  const { documents: knowledgeDocuments } = useKnowledgeDocuments()
  const { categories: knowledgeCategories } = useKnowledgeCategories()
  const { active: leadSources } = useLeadSources()
  const { items: scholarships } = useScholarships()
  const { catalogs: profileCatalogs, onEnsureCatalogEntry } = useLeadProfileCatalogs()

  const consultingInsights = useMemo(
    () =>
      buildLeadConsultingInsights(lead, playbooks, knowledgeDocuments, {
        infoScoreRuntime,
        priorityTag: scoringPreview?.priorityTag,
        calculatedScore: scoringPreview?.calculatedScore,
      }),
    [lead, playbooks, knowledgeDocuments, infoScoreRuntime, scoringPreview],
  )

  const [coreDraft, setCoreDraft] = useState(() => leadToCoreDraft(lead))
  const coreDirty = useMemo(() => isCoreDraftDirty(lead, coreDraft), [lead, coreDraft])
  const [financeDraft, setFinanceDraft] = useState(() => leadToFinanceDraft(lead))
  const financeDirty = useMemo(() => isFinanceDraftDirty(lead, financeDraft), [lead, financeDraft])
  const [financeSaving, setFinanceSaving] = useState(false)
  const [inviteBusy, setInviteBusy] = useState(false)

  useEffect(() => {
    setCoreDraft(leadToCoreDraft(lead))
    setFinanceDraft(leadToFinanceDraft(lead))
  }, [lead.id])

  const [note, setNote] = useState('')
  const [evalTag, setEvalTag] = useState<string>(EVALUATION_TAGS[0])
  const [crmDirty, setCrmDirty] = useState<LeadCounselorStatus | null>(null)
  const crmForForm = crmDirty ?? lead.status
  const [statusDirty, setStatusDirty] = useState<LeadPipelineStatus | null>(null)
  const statusForForm = statusDirty ?? lead.pipelineStatus
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [llmPopupOpen, setLlmPopupOpen] = useState(false)
  const [assistantPopupOpen, setAssistantPopupOpen] = useState(false)
  const [playbookPopupOpen, setPlaybookPopupOpen] = useState(false)
  const [playbookPopupTab, setPlaybookPopupTab] = useState<'consulting' | 'general'>('consulting')
  const [detailLeftTab, setDetailLeftTab] = useState<'counselor' | 'profile'>('counselor')
  const [detailRightTab, setDetailRightTab] = useState<'assign' | 'history'>('history')
  const signalsHelpRef = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    setNote('')
    setEvalTag(EVALUATION_TAGS[0])
    setCrmDirty(null)
    setStatusDirty(null)
    setMsg(null)
    setPlaybookPopupTab('consulting')
    setDetailLeftTab('profile')
    setDetailRightTab('history')
    signalsHelpRef.current?.close()
  }, [lead.id])

  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (e.defaultPrevented) return
      if (playbookPopupOpen) {
        e.preventDefault()
        setPlaybookPopupOpen(false)
        return
      }
      if (llmPopupOpen) {
        e.preventDefault()
        setLlmPopupOpen(false)
        return
      }
      if (assistantPopupOpen) {
        e.preventDefault()
        setAssistantPopupOpen(false)
        return
      }
      const help = signalsHelpRef.current
      if (help?.open) {
        help.close()
        e.preventDefault()
        return
      }
      e.preventDefault()
      onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [playbookPopupOpen, llmPopupOpen, assistantPopupOpen, onClose])

  const { tasks: aiTasks, loading: aiTasksLoading, error: aiTasksErr } = useAITasks()
  const notesAgg = useMemo(
    () =>
      interactions
        .map((i) => i.counselorNote)
        .filter((x): x is string => Boolean(x?.trim()))
        .join('\n---\n'),
    [interactions],
  )

  const showCounselorProgressForm = canWriteLead(profile, lead, can, pickListUsers)

  /** Khối phân công bên phải ẩn khi TVV peer xem hồ sơ không phải của mình — khi đó không gỡ CRM bên trái. */
  const peerModeForCrmBlock = !reassignElevated && Boolean(can('leads:reassign:peer'))
  const leadIsMineForCrm = (lead.assignedTo ?? lead.assignedCounselorId) === profile?.id
  const crmQuickBlockVisible =
    canReassignLead && Boolean(db) && !(peerModeForCrmBlock && !leadIsMineForCrm)

  /** Một nguồn sự thật: khi khối phân công hiển thị thì chỉnh tình trạng TVV ở đó. */
  const crmEditOnRight = crmQuickBlockVisible
  const crmEditOnLeft = showCounselorProgressForm && !crmEditOnRight

  const hasUnsavedProgress = useMemo(
    () =>
      coreDirty ||
      financeDirty ||
      (crmDirty !== null && crmForForm !== lead.status) ||
      (statusDirty !== null && statusForForm !== lead.pipelineStatus) ||
      note.trim().length > 0,
    [
      coreDirty,
      financeDirty,
      crmDirty,
      crmForForm,
      lead.status,
      statusDirty,
      statusForForm,
      lead.pipelineStatus,
      note,
    ],
  )

  useEffect(() => {
    onUnsavedChange?.(hasUnsavedProgress)
    return () => {
      onUnsavedChange?.(false)
    }
  }, [hasUnsavedProgress, onUnsavedChange])

  useEffect(() => {
    if (!hasUnsavedProgress || saving) return
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [hasUnsavedProgress, saving])

  const leadMl = useMemo(() => resolveMlWinDisplay(lead, infoScoreRuntime), [lead, infoScoreRuntime])

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

  const labelUid = useCallback(
    (uid: string) => {
      if (!uid) return '—'
      const u = pickListUsers.find((c) => c.id === uid) ?? counselorUsers.find((c) => c.id === uid)
      return u ? formatStaffDisplayName(u) : `${uid.slice(0, 8)}…`
    },
    [pickListUsers, counselorUsers],
  )

  const saveFinanceProfile = async () => {
    if (!db || !profile) {
      setMsg('Chưa có kết nối hoặc chưa đăng nhập.')
      return
    }
    if (!showCounselorProgressForm) {
      setMsg('Bạn không có quyền chỉnh tài chính hồ sơ này.')
      return
    }
    if (!financeDirty) {
      setMsg('Không có thay đổi tài chính.')
      return
    }
    setFinanceSaving(true)
    setMsg(null)
    try {
      const performer = profile.displayName?.trim() || profile.email || profile.id
      const { finance, updatedAt, lastTouchedAt } = await persistLeadFinance({
        db,
        lead,
        draft: financeDraft,
        counselorName: performer,
      })
      await commitAuditLog(db, {
        leadId: lead.id,
        actionType: 'SYSTEM_UPDATE',
        description: 'Cập nhật tài chính / chứng từ (upload + n8n nếu đổi tiền hoặc file)',
        performedBy: profile.id,
        performedByName: performer,
      })
      const nextLead: Lead = { ...lead, finance, updatedAt, lastTouchedAt }
      setFinanceDraft(leadToFinanceDraft(nextLead))
      onUpdated({ finance, updatedAt, lastTouchedAt })
      setMsg('Đã lưu tài chính.')
    } catch (e) {
      console.error(e)
      const err = e instanceof Error ? e.message : 'Không lưu được tài chính.'
      setMsg(err)
    } finally {
      setFinanceSaving(false)
    }
  }

  const handleInvitation = async (docType: InviteDocumentType, scholarshipId: string) => {
    if (!db || !profile) {
      setMsg('Chưa có kết nối hoặc chưa đăng nhập.')
      return
    }
    if (!showCounselorProgressForm) {
      setMsg('Bạn không có quyền tạo giấy mời trên hồ sơ này.')
      return
    }
    setInviteBusy(true)
    setMsg(null)
    try {
      const scholarship = scholarshipId ? (scholarships.find((s) => s.id === scholarshipId) ?? null) : null
      const scholarship2 = lead.scholarship2Id
        ? (scholarships.find((s) => s.id === lead.scholarship2Id) ?? null)
        : null
      const { folderUrl } = await triggerInvitationN8n({
        lead,
        docType,
        scholarship,
        scholarship2Label: scholarship2?.label ?? '',
        inviteFolderUrl: lead.inviteFolderUrl,
      })
      if (folderUrl) {
        const touch = leadTouchPatch()
        await updateDoc(doc(db, FS_COLLECTIONS.leads, lead.id), {
          ...touch,
          inviteFolderUrl: folderUrl,
        })
        onUpdated({ inviteFolderUrl: folderUrl, updatedAt: touch.updatedAt, lastTouchedAt: touch.lastTouchedAt })
      }
      setMsg('Đã gửi yêu cầu tạo giấy tờ qua n8n.')
    } catch (e) {
      console.error(e)
      const err = e instanceof Error ? e.message : 'Không tạo được giấy mời.'
      setMsg(err)
    } finally {
      setInviteBusy(false)
    }
  }

  const saveCoreProfile = async () => {
    if (!db || !profile) {
      setMsg('Chưa có kết nối hoặc chưa đăng nhập.')
      return
    }
    if (!showCounselorProgressForm) {
      setMsg('Bạn không có quyền chỉnh thông tin hồ sơ này (cần Admin hoặc TVV được gán + quyền ghi hồ sơ).')
      return
    }
    const corePatch = buildLeadCoreFirestorePatch(lead, coreDraft)
    if (Object.keys(corePatch).length === 0) {
      setMsg('Không có thay đổi thông tin hồ sơ.')
      return
    }
    setSaving(true)
    setMsg(null)
    try {
      const coreAsPartial = corePatch as unknown as Partial<Lead>
      const mergedForScore: Partial<Lead> = { ...coreAsPartial }
      const scoreFields = persistedLeadScoringFields(
        lead,
        mergedForScore,
        activeScoringProfile,
        scoringMasterBuckets,
        schoolTvvSignalDefs,
      )
      const touch = leadTouchPatch()
      const performer = profile.displayName?.trim() || profile.email || profile.id
      const leadFirestorePatch: Record<string, unknown> = { ...touch, ...scoreFields, ...corePatch }
      await updateDoc(doc(db, FS_COLLECTIONS.leads, lead.id), leadFirestorePatch)
      await commitAuditLog(db, {
        leadId: lead.id,
        actionType: 'SYSTEM_UPDATE',
        description: `Cập nhật thông tin hồ sơ (${Object.keys(corePatch).length} trường): ${Object.keys(corePatch)
          .slice(0, 12)
          .join(', ')}${Object.keys(corePatch).length > 12 ? '…' : ''}`,
        performedBy: profile.id,
        performedByName: performer,
      })
      const nextPriority =
        (scoreFields.priorityTag as PriorityTag | undefined) ?? lead.priorityTag
      const tagDiffCore = diffPriorityTag(lead.priorityTag, nextPriority)
      if (tagDiffCore) {
        await recordLeadEvent(db, {
          leadId: lead.id,
          counselorUid: profile.id,
          type: 'TAG_CHANGED',
          from: tagDiffCore.from,
          to: tagDiffCore.to,
        })
      }
      const nextLead: Lead = {
        ...lead,
        ...coreAsPartial,
        ...scoreFields,
        updatedAt: touch.updatedAt,
        lastTouchedAt: touch.lastTouchedAt,
      }
      setCoreDraft(leadToCoreDraft(nextLead))
      onUpdated({
        ...coreAsPartial,
        ...scoreFields,
        updatedAt: touch.updatedAt,
        lastTouchedAt: touch.lastTouchedAt,
      })
      setMsg('Đã lưu thông tin hồ sơ.')
    } catch (e) {
      console.error(e)
      setMsg('Không lưu được thông tin hồ sơ. Kiểm tra Firestore Rules.')
    } finally {
      setSaving(false)
    }
  }

  const saveUnified = async () => {
    if (!db || !profile) {
      setMsg('Chưa có kết nối hoặc chưa đăng nhập.')
      return
    }
    const canMutateLead = showCounselorProgressForm
    const noteTrim = note.trim()
    const crmChanged = crmDirty !== null && crmForForm !== lead.status
    const pipeChanged = statusDirty !== null && statusForForm !== lead.pipelineStatus
    const corePatch = buildLeadCoreFirestorePatch(lead, coreDraft)
    const coreChanged = Object.keys(corePatch).length > 0

    if (!crmChanged && !pipeChanged && !noteTrim && !coreChanged) {
      setMsg('Không có thay đổi.')
      return
    }
    if (coreChanged && !canMutateLead) {
      setMsg('Bạn không có quyền chỉnh thông tin hồ sơ này (cần Admin hoặc TVV được gán + quyền ghi hồ sơ).')
      return
    }
    if (crmChanged && !canMutateLead) {
      setMsg('Bạn không có quyền đổi tình trạng tư vấn trên hồ sơ này.')
      return
    }
    if (pipeChanged && !noteTrim && !canMutateLead) {
      setMsg(
        'Để chỉnh funnel không kèm ghi chú, cần quyền chỉnh sửa hồ sơ được gán (hoặc nhập ghi chú rồi bấm «Lưu cập nhật»).',
      )
      return
    }
    if (noteTrim && !canSaveInteraction) {
      setMsg('Bạn không có quyền ghi tương tác.')
      return
    }

    setSaving(true)
    setMsg(null)
    try {
      const nextCrm = crmChanged ? crmForForm : lead.status
      let nextPipeFinal = lead.pipelineStatus
      if (pipeChanged) nextPipeFinal = statusForForm
      else if (crmChanged) nextPipeFinal = counselorStatusToPipeline(crmForForm)

      const dataPatch: Partial<Lead> = {}
      if (crmChanged) dataPatch.status = nextCrm
      if (pipeChanged) dataPatch.pipelineStatus = statusForForm
      else if (crmChanged) dataPatch.pipelineStatus = counselorStatusToPipeline(crmForForm)

      const coreAsPartial = corePatch as unknown as Partial<Lead>
      const mergedForScore: Partial<Lead> = { ...dataPatch, ...coreAsPartial }
      const scoreFields = persistedLeadScoringFields(
        lead,
        mergedForScore,
        activeScoringProfile,
        scoringMasterBuckets,
        schoolTvvSignalDefs,
      )

      const touch = leadTouchPatch()
      const performer = profile.displayName?.trim() || profile.email || profile.id

      const leadFirestorePatch: Record<string, unknown> = { ...touch, ...scoreFields, ...corePatch }
      if (crmChanged || pipeChanged) {
        if (crmChanged) leadFirestorePatch.status = nextCrm
        if (pipeChanged) leadFirestorePatch.pipelineStatus = statusForForm
        else if (crmChanged) leadFirestorePatch.pipelineStatus = counselorStatusToPipeline(crmForForm)
      }

      await updateDoc(doc(db, FS_COLLECTIONS.leads, lead.id), leadFirestorePatch)

      if (coreChanged) {
        await commitAuditLog(db, {
          leadId: lead.id,
          actionType: 'SYSTEM_UPDATE',
          description: `Cập nhật thông tin hồ sơ (${Object.keys(corePatch).length} trường): ${Object.keys(corePatch)
            .slice(0, 12)
            .join(', ')}${Object.keys(corePatch).length > 12 ? '…' : ''}`,
          performedBy: profile.id,
          performedByName: performer,
        })
      }

      if (crmChanged) {
        await commitAuditLog(db, {
          leadId: lead.id,
          actionType: 'STATUS_CHANGE',
          description: `Tình trạng tư vấn: ${LEAD_COUNSELOR_STATUS_LABELS[lead.status]} → ${LEAD_COUNSELOR_STATUS_LABELS[nextCrm]}`,
          performedBy: profile.id,
          performedByName: performer,
        })
      }
      if (nextPipeFinal !== lead.pipelineStatus) {
        await commitAuditLog(db, {
          leadId: lead.id,
          actionType: 'STATUS_CHANGE',
          description: `Pipeline funnel: ${PIPELINE_LABEL[lead.pipelineStatus]} → ${PIPELINE_LABEL[nextPipeFinal]}`,
          performedBy: profile.id,
          performedByName: performer,
        })
      }

      const nextPriority: PriorityTag =
        (scoreFields.priorityTag as PriorityTag | undefined) ??
        scoringPreview?.priorityTag ??
        lead.priorityTag
      const tagDiff = diffPriorityTag(lead.priorityTag, nextPriority)
      if (tagDiff) {
        await recordLeadEvent(db, {
          leadId: lead.id,
          counselorUid: profile.id,
          type: 'TAG_CHANGED',
          from: tagDiff.from,
          to: tagDiff.to,
        })
      }
      if (crmChanged) {
        const st = diffCounselorStatus(lead.status, nextCrm)
        if (st) {
          await recordLeadEvent(db, {
            leadId: lead.id,
            counselorUid: profile.id,
            type: 'STATUS_CHANGED',
            from: st.from,
            to: st.to,
          })
        }
      }
      if (nextPipeFinal !== lead.pipelineStatus) {
        const pl = diffPipelineStatus(lead.pipelineStatus, nextPipeFinal)
        if (pl) {
          await recordLeadEvent(db, {
            leadId: lead.id,
            counselorUid: profile.id,
            type: 'PIPELINE_CHANGED',
            from: pl.from,
            to: pl.to,
          })
        }
      }

      if (noteTrim) {
        const sub = collection(db, FS_COLLECTIONS.leads, lead.id, FS_COLLECTIONS.interactions)
        await addDoc(sub, {
          leadId: lead.id,
          channel: 'NOTE',
          authorUid: profile.id,
          authorRole: profile.role,
          counselorNote: noteTrim,
          evaluationTag: evalTag,
          snapshotCrmStatus: nextCrm,
          snapshotPipelineStatus: nextPipeFinal,
          snapshotPriorityTag: nextPriority,
          timestamp: Timestamp.now(),
        })
        await commitAuditLog(db, {
          leadId: lead.id,
          actionType: 'NOTE_ADDED',
          description: `Ghi chú tương tác (${evalTag}): ${noteTrim.slice(0, 280)}${noteTrim.length > 280 ? '…' : ''}`,
          performedBy: profile.id,
          performedByName: performer,
        })
      }

      const nextLead: Lead = {
        ...lead,
        ...dataPatch,
        ...coreAsPartial,
        ...scoreFields,
        updatedAt: touch.updatedAt,
        lastTouchedAt: touch.lastTouchedAt,
      }
      setCoreDraft(leadToCoreDraft(nextLead))

      onUpdated({
        ...dataPatch,
        ...coreAsPartial,
        ...scoreFields,
        updatedAt: touch.updatedAt,
        lastTouchedAt: touch.lastTouchedAt,
      })

      setNote('')
      setStatusDirty(null)
      setCrmDirty(null)
      setMsg('Đã lưu cập nhật.')
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
        'Phân tích AI cần được quản lý bật «Cho phép dùng AI trên hồ sơ» trong Cài đặt → Quản lý nhân sự, hoặc dùng tài khoản Siêu quản trị.',
      )
      return
    }
    const config = resolveAIIntegrationConfig()
    if (!config?.apiKey?.trim()) {
      setAiErr(
        'Chưa có khóa ChatGPT / Gemini — lưu trong Cài đặt → LLM, hoặc đặt VITE_AI_API_KEY (tuỳ chọn VITE_AI_PROVIDER, VITE_AI_MODEL) trong .env rồi chạy lại dev/build.',
      )
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
          description: `Chạy phân tích AI: «${selectedAITask.name}»`,
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

  const interactionsHistorySection = (
    <LeadActivityTimeline leadId={lead.id} labelUid={labelUid} />
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
          <p className="app-page-kicker text-slate-600">Chi tiết hồ sơ</p>
          <h2
            id="lead-detail-title"
            className="text-lg font-semibold tracking-tight text-slate-900 sm:text-xl"
          >
            {lead.fullName || 'Chưa rõ tên'}
          </h2>
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
                <p className="text-xs font-bold uppercase tracking-[0.22em] text-amber-900">
                  Gợi ý từ AI (ưu tiên chốt sale)
                </p>
                {lead.aiProcessedAt?.toDate ? (
                  <p className="mt-0.5 text-xs text-amber-800/80">
                    Cập nhật AI: {lead.aiProcessedAt.toDate().toLocaleString('vi-VN')}
                  </p>
                ) : null}
              </div>
            </div>
            <div className="min-w-0 flex-1 space-y-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-amber-900/90">Phân tích</p>
                <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-slate-900">
                  {lead.aiShortlistReason?.trim() || '—'}
                </p>
              </div>
              <div className="rounded-xl border border-amber-300/60 bg-white/70 px-3 py-2.5 shadow-sm">
                <p className="text-xs font-bold uppercase tracking-wide text-emerald-900">Hành động đề xuất</p>
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
              <div className="flex min-h-0 flex-col gap-2 border-b border-slate-200/80 p-2 sm:p-3 lg:col-span-7 lg:min-h-0 lg:border-b-0 lg:border-r lg:overflow-hidden">
                <nav
                  className="flex shrink-0 flex-wrap gap-2 rounded-xl border border-slate-200/90 bg-white p-2 shadow-sm"
                  role="tablist"
                  aria-label="Nội dung chính chi tiết hồ sơ"
                >
                  <button
                    type="button"
                    role="tab"
                    aria-selected={detailLeftTab === 'counselor'}
                    onClick={() => setDetailLeftTab('counselor')}
                    className={[
                      'min-h-9 rounded-lg border px-3 py-2 text-left text-xs font-semibold tracking-tight transition sm:px-4 sm:text-sm',
                      detailLeftTab === 'counselor'
                        ? 'border-violet-500/55 bg-gradient-to-r from-violet-600 to-violet-700 text-white shadow-md'
                        : 'border-transparent bg-slate-50 text-slate-800 hover:border-slate-200 hover:bg-white',
                    ].join(' ')}
                  >
                    Thao tác TVV
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={detailLeftTab === 'profile'}
                    onClick={() => setDetailLeftTab('profile')}
                    className={[
                      'min-h-9 rounded-lg border px-3 py-2 text-left text-xs font-semibold tracking-tight transition sm:px-4 sm:text-sm',
                      detailLeftTab === 'profile'
                        ? 'border-slate-600/50 bg-slate-800 text-white shadow-md'
                        : 'border-transparent bg-slate-50 text-slate-800 hover:border-slate-200 hover:bg-white',
                    ].join(' ')}
                  >
                    Hồ sơ ứng viên
                  </button>
                </nav>
                <div className="scroll-touch flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain">
                  {detailLeftTab === 'profile' ? (
                    <aside className="flex min-h-0 flex-1 flex-col space-y-2 text-sm leading-snug text-slate-800">
                      <section className="flex min-h-0 flex-1 flex-col rounded-xl border border-slate-200/90 bg-white p-2 shadow-sm sm:p-2.5">
                        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2">
                          <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-600">
                            <span className="tabular-nums">
                              Điểm: {String(scoringPreview?.calculatedScore ?? lead.calculatedScore)}
                            </span>
                            <TagBadge tag={scoringPreview?.priorityTag ?? lead.priorityTag} />
                          </div>
                          {showCounselorProgressForm ? (
                            <div className="flex flex-wrap items-center gap-2">
                              {coreDirty || financeDirty ? (
                                <span className="text-[10px] font-semibold text-amber-800">Chưa lưu thay đổi</span>
                              ) : null}
                              <button
                                type="button"
                                disabled={saving || financeSaving || !financeDirty}
                                onClick={() => void saveFinanceProfile()}
                                className="rounded-lg border border-blue-600 bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
                              >
                                {financeSaving ? 'Đang lưu…' : 'Lưu tài chính'}
                              </button>
                              <button
                                type="button"
                                disabled={saving || financeSaving || !coreDirty}
                                onClick={() => void saveCoreProfile()}
                                className="rounded-lg border border-emerald-600 bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40"
                              >
                                {saving ? 'Đang lưu…' : 'Lưu thông tin hồ sơ'}
                              </button>
                            </div>
                          ) : null}
                        </div>
                        {msg && detailLeftTab === 'profile' ? (
                          <p className="mt-1 shrink-0 text-xs font-medium text-amber-900">{msg}</p>
                        ) : null}
                        <div className="mt-2 flex min-h-0 flex-1 flex-col">
                          <LeadProfileCoreForm
                            draft={coreDraft}
                            onChange={setCoreDraft}
                            disabled={!showCounselorProgressForm || financeSaving}
                            leadSources={leadSources}
                            scholarships={scholarships}
                            catalogs={profileCatalogs}
                            onEnsureCatalogEntry={onEnsureCatalogEntry}
                            layout="tabs"
                            callContext={{
                              leadId: lead.id,
                              leadName: lead.fullName || lead.customerId || 'Hồ sơ',
                            }}
                            financePanel={
                              <LeadProfileFinanceSection
                                draft={financeDraft}
                                onChange={setFinanceDraft}
                                disabled={!showCounselorProgressForm || saving || financeSaving}
                              />
                            }
                            invitePanel={
                              <LeadProfileInviteSection
                                lead={lead}
                                scholarships={scholarships}
                                inviteFolderUrl={lead.inviteFolderUrl}
                                disabled={!showCounselorProgressForm || inviteBusy}
                                busy={inviteBusy}
                                onGenerate={handleInvitation}
                              />
                            }
                          />
                        </div>
                        {!showCounselorProgressForm ? (
                          <p className="mt-2 shrink-0 text-[10px] text-amber-800">
                            Chỉ xem — không có quyền sửa thông tin hồ sơ (Admin hoặc TVV được gán).
                          </p>
                        ) : null}
                      </section>
                    </aside>
                  ) : (
                    <aside className="space-y-2 text-sm leading-snug text-slate-800">
                      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200/90 bg-white px-2 py-1.5 text-[11px] text-slate-700 shadow-sm">
                        <span className="font-semibold text-slate-800">Tóm tắt nhanh</span>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="tabular-nums">
                            Điểm: {String(scoringPreview?.calculatedScore ?? lead.calculatedScore)}
                          </span>
                          <TagBadge tag={scoringPreview?.priorityTag ?? lead.priorityTag} />
                        </div>
                      </div>
                      {db ? (
                        <div className="space-y-2">
                          {showCounselorProgressForm || canSaveInteraction ? (
                            <div className="space-y-1.5 border-b border-slate-200/70 pb-2">
                              <div className="rounded-xl border border-amber-200/90 bg-gradient-to-br from-amber-50/95 via-white to-amber-50/35 p-2 shadow-md ring-1 ring-amber-200/70 sm:p-2.5">
                                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-amber-900/90">
                                  Tiến độ tư vấn &amp; ghi chú
                                </p>
                                <div
                                  className={`mt-2 grid gap-1.5 ${crmEditOnLeft ? 'sm:grid-cols-3' : 'sm:grid-cols-2'}`}
                                >
                                  {crmEditOnLeft ? (
                                    <label className="block text-xs font-medium text-slate-800">
                                      Tình trạng tư vấn
                                      <select
                                        value={crmForForm}
                                        onChange={(e) => setCrmDirty(e.target.value as LeadCounselorStatus)}
                                        className="mt-0.5 w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-900 outline-none focus:ring-1 focus:ring-amber-400/50"
                                      >
                                        {LEAD_COUNSELOR_STATUS_ORDER.map((s) => (
                                          <option key={s} value={s} className="bg-white">
                                            {LEAD_COUNSELOR_STATUS_LABELS[s]}
                                          </option>
                                        ))}
                                      </select>
                                    </label>
                                  ) : null}
                                  <label className="block text-xs font-medium text-slate-800">
                                    Funnel tuyển sinh
                                    <select
                                      value={statusForForm}
                                      onChange={(e) => setStatusDirty(e.target.value as LeadPipelineStatus)}
                                      className="mt-0.5 w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-900 outline-none focus:ring-1 focus:ring-amber-400/50"
                                    >
                                      {(Object.keys(PIPELINE_LABEL) as LeadPipelineStatus[]).map((k) => (
                                        <option key={k} value={k} className="bg-white">
                                          {PIPELINE_LABEL[k]}
                                        </option>
                                      ))}
                                    </select>
                                  </label>
                                  <label className="block text-xs font-medium text-slate-800">
                                    Nhãn đánh giá
                                    <select
                                      value={evalTag}
                                      onChange={(e) => setEvalTag(e.target.value)}
                                      className="mt-0.5 w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-900 outline-none focus:ring-1 focus:ring-amber-400/50"
                                    >
                                      {EVALUATION_TAGS.map((t) => (
                                        <option key={t} value={t} className="bg-white">
                                          {t}
                                        </option>
                                      ))}
                                    </select>
                                  </label>
                                </div>
                                <label className="mt-2 block text-xs font-medium text-slate-800">
                                  Ghi chú tương tác
                                  <textarea
                                    value={note}
                                    onChange={(e) => setNote(e.target.value)}
                                    rows={3}
                                    placeholder={
                                      crmEditOnRight
                                        ? 'Ghi nhận buổi làm việc — lưu kèm funnel / nhãn phía trên…'
                                        : 'Ghi nhận buổi làm việc — lưu kèm tình trạng / funnel phía trên…'
                                    }
                                    className="mt-0.5 w-full resize-y rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-800 outline-none focus:ring-1 focus:ring-amber-400/50"
                                  />
                                </label>
                                {msg ? <p className="mt-1 text-xs font-medium text-amber-900">{msg}</p> : null}
                                <button
                                  type="button"
                                  disabled={
                                    saving ||
                                    !db ||
                                    (!showCounselorProgressForm && !canSaveInteraction) ||
                                    !hasUnsavedProgress
                                  }
                                  onClick={() => void saveUnified()}
                                  className="mt-2 w-full rounded-md border border-amber-600 bg-gradient-to-r from-amber-500 to-amber-600 py-2 text-xs font-semibold text-white shadow-sm transition hover:brightness-105 disabled:pointer-events-none disabled:opacity-45"
                                >
                                  {saving ? 'Đang lưu…' : 'Lưu cập nhật'}
                                </button>
                              </div>
                            </div>
                          ) : null}

                          <section className="rounded-xl border border-emerald-200/90 bg-gradient-to-br from-emerald-50/45 via-white to-slate-50/90 p-2 shadow-md ring-1 ring-emerald-900/10 sm:p-2.5">
                            <div className="flex items-start gap-1.5">
                              <h3 className="app-section-heading min-w-0 flex-1 leading-tight text-emerald-900">
                                Tín hiệu &amp; đánh giá tiềm năng
                              </h3>
                              <button
                                type="button"
                                className="mt-0.5 shrink-0 rounded-full border border-emerald-300/80 bg-white p-1 text-emerald-900 shadow-sm transition hover:bg-emerald-100"
                                aria-label="Giải thích khối tín hiệu đánh giá"
                                title="Giải thích"
                                onClick={() => signalsHelpRef.current?.showModal()}
                              >
                                <CircleHelp className="h-3.5 w-3.5" aria-hidden />
                              </button>
                            </div>
                            <p className="mt-1 text-xs leading-snug text-slate-600">
                              Cờ hành vi / rủi ro — mỗi thay đổi <strong>lưu ngay</strong> vào hồ sơ; điểm &amp; nhãn HOT/WARM/COLD
                              theo profile chấm điểm đang chọn.
                            </p>

                            <dialog
                              ref={signalsHelpRef}
                              className="w-[min(100vw-2rem,26rem)] max-h-[min(85vh,32rem)] overflow-hidden rounded-xl border border-slate-200 bg-white p-0 text-slate-800 shadow-2xl backdrop:bg-slate-900/40"
                              onClick={(e) => {
                                if (e.target === signalsHelpRef.current) signalsHelpRef.current?.close()
                              }}
                            >
                              <div className="flex max-h-[min(85vh,32rem)] flex-col">
                                <div className="flex shrink-0 items-center justify-between gap-2 border-b border-slate-100 bg-emerald-50/60 px-3 py-2">
                                  <p className="text-sm font-semibold text-emerald-950">Giải thích nhanh</p>
                                  <button
                                    type="button"
                                    className="rounded-md border border-slate-200 bg-white p-1 text-slate-600 hover:bg-slate-50"
                                    aria-label="Đóng"
                                    onClick={() => signalsHelpRef.current?.close()}
                                  >
                                    <X className="h-4 w-4" aria-hidden />
                                  </button>
                                </div>
                                <div className="min-h-0 overflow-y-auto px-3 py-2.5 text-sm leading-relaxed">
                                  <p>
                                    Khối <strong>Tín hiệu &amp; đánh giá tiềm năng</strong> phục vụ chấm điểm profile, nhãn{' '}
                                    <strong>HOT / WARM / COLD</strong>, lọc bảng hồ sơ và dữ liệu cho{' '}
                                    <strong>AI</strong> (bước kiểm tra trước khi gọi AI, rồi phân tích và tóm tắt ghi chú tương
                                    tác).
                                  </p>
                                  <p className="mt-2">
                                    <span className="font-semibold text-slate-900">Hành vi &amp; rủi ro</span> — bật/tắt là{' '}
                                    <strong>lưu ngay</strong> từng mục (không dùng chung nút «Lưu cập nhật» của khối tiến độ).
                                  </p>
                                  <p className="mt-2">
                                    <span className="font-semibold text-slate-900">Tiến độ &amp; ghi chú</span> — thẻ màu
                                    cam: funnel, nhãn đánh giá, ghi chú tương tác và nút <strong>Lưu cập nhật</strong>. Khi có
                                    tab «Phân công &amp; tình trạng», <strong>tình trạng TVV</strong> chỉnh ở đó để tránh trùng.
                                  </p>
                                </div>
                              </div>
                            </dialog>

                            <div className="mt-2 min-h-0">
                              <LeadScoringSignalsPanel
                                key={`sig-${lead.id}`}
                                lead={lead}
                                db={db}
                                activeScoringProfile={activeScoringProfile}
                                canEdit={canEditScoringSignals}
                                onUpdated={onUpdated}
                                compact
                              />
                            </div>
                          </section>
                        </div>
                      ) : null}
                    </aside>
                  )}
                </div>
              </div>

              <aside className="flex min-h-0 flex-col gap-2 border-b border-slate-200/80 p-2 sm:p-3 lg:col-span-5 lg:h-full lg:max-h-full lg:border-b-0 lg:overflow-hidden lg:overscroll-contain">
                {crmQuickBlockVisible && db ? (
                  <>
                    <nav
                      className="flex shrink-0 flex-wrap gap-2 rounded-xl border border-slate-200/90 bg-white p-2 shadow-sm"
                      role="tablist"
                      aria-label="Phân công và lịch sử"
                    >
                      <button
                        type="button"
                        role="tab"
                        aria-selected={detailRightTab === 'assign'}
                        onClick={() => setDetailRightTab('assign')}
                        className={[
                          'min-h-9 rounded-lg border px-3 py-2 text-left text-xs font-semibold tracking-tight transition sm:px-4 sm:text-sm',
                          detailRightTab === 'assign'
                            ? 'border-teal-500/55 bg-gradient-to-r from-teal-600 to-emerald-600 text-white shadow-md'
                            : 'border-transparent bg-slate-50 text-slate-800 hover:border-slate-200 hover:bg-white',
                        ].join(' ')}
                      >
                        Phân công &amp; tình trạng
                      </button>
                      <button
                        type="button"
                        role="tab"
                        aria-selected={detailRightTab === 'history'}
                        onClick={() => setDetailRightTab('history')}
                        className={[
                          'min-h-9 rounded-lg border px-3 py-2 text-left text-xs font-semibold tracking-tight transition sm:px-4 sm:text-sm',
                          detailRightTab === 'history'
                            ? 'border-sky-500/55 bg-gradient-to-r from-sky-600 to-indigo-600 text-white shadow-md'
                            : 'border-transparent bg-slate-50 text-slate-800 hover:border-slate-200 hover:bg-white',
                        ].join(' ')}
                      >
                        Dòng thời gian
                      </button>
                    </nav>
                    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                      {detailRightTab === 'assign' ? (
                        <div className="scroll-touch min-h-0 flex-1 overflow-y-auto overscroll-contain">
                          <LeadCrmQuickBlock
                            key={`${lead.id}-${lead.updatedAt.toMillis()}`}
                            lead={lead}
                            db={db}
                            counselorUsers={counselorUsers}
                            pickListUsers={pickListUsers}
                            counselorsLoading={counselorsLoading}
                            reassignElevated={reassignElevated}
                            onUpdated={onUpdated}
                            compact
                            leadScoringContext={{
                              profile: activeScoringProfile,
                              buckets: scoringMasterBuckets,
                              schoolDefs: schoolTvvSignalDefs ?? null,
                            }}
                          />
                        </div>
                      ) : (
                        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{interactionsHistorySection}</div>
                      )}
                    </div>
                  </>
                ) : (
                  interactionsHistorySection
                )}
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
            className="fixed left-1/2 top-1/2 z-[120] flex h-[min(96dvh,calc(100dvh-0.75rem))] max-h-[min(96dvh,calc(100dvh-0.75rem))] w-[min(calc(100vw-0.75rem),100rem)] max-w-[calc(100vw-0.75rem)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-amber-200/90 bg-white text-slate-900 shadow-2xl"
          >
            <div className="flex shrink-0 flex-wrap items-start justify-between gap-3 border-b border-slate-200/90 bg-gradient-to-r from-amber-50/90 to-white px-4 py-3 sm:px-6 sm:py-4">
              <div className="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
                <div className="flex min-w-0 items-start gap-3">
                  <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-amber-200/80 bg-white shadow-sm sm:h-11 sm:w-11">
                    <BookOpen className="h-5 w-5 text-amber-700 sm:h-6 sm:w-6" strokeWidth={1.75} aria-hidden />
                  </span>
                  <div className="min-w-0">
                    <h2 id="lead-playbook-dialog-title" className="text-base font-semibold text-slate-900 sm:text-xl">
                      Tư vấn & tra cứu
                    </h2>
                    <p className="mt-0.5 text-xs text-slate-600 sm:text-sm">
                      {lead.fullName || 'Hồ sơ'} — kịch bản tham vấn và thông tin nhà trường
                    </p>
                  </div>
                </div>
                <div
                  className="flex shrink-0 flex-wrap gap-1 rounded-xl border border-slate-200/90 bg-white p-1 shadow-sm"
                  role="tablist"
                  aria-label="Loại tra cứu"
                >
                  <button
                    type="button"
                    role="tab"
                    aria-selected={playbookPopupTab === 'consulting'}
                    onClick={() => setPlaybookPopupTab('consulting')}
                    className={[
                      'inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold sm:text-sm',
                      playbookPopupTab === 'consulting'
                        ? 'bg-amber-500 text-white shadow-sm'
                        : 'text-slate-700 hover:bg-slate-50',
                    ].join(' ')}
                  >
                    <BookOpen className="h-3.5 w-3.5 shrink-0" aria-hidden strokeWidth={1.75} />
                    Tham vấn trả lời
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={playbookPopupTab === 'general'}
                    onClick={() => setPlaybookPopupTab('general')}
                    className={[
                      'inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold sm:text-sm',
                      playbookPopupTab === 'general'
                        ? 'bg-amber-500 text-white shadow-sm'
                        : 'text-slate-700 hover:bg-slate-50',
                    ].join(' ')}
                  >
                    <Library className="h-3.5 w-3.5 shrink-0" aria-hidden strokeWidth={1.75} />
                    Thông tin chung
                  </button>
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
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-3 sm:p-5">
              {playbookPopupTab === 'consulting' ? (
                <LeadPlaybookPanel
                  lead={lead}
                  playbooks={playbooks}
                  quickSearchTerms={consultingInsights.quickSearchTerms}
                />
              ) : (
                <LeadKnowledgePanel
                  lead={lead}
                  documents={knowledgeDocuments}
                  categories={knowledgeCategories}
                  quickSearchTerms={consultingInsights.quickSearchTerms}
                />
              )}
            </div>
          </div>
        </>
      ) : null}

      {canRunAi && llmPopupOpen ? (
        <>
          <button
            type="button"
            className="fixed inset-0 z-[110] cursor-default bg-slate-900/45 backdrop-blur-[2px]"
            aria-label="Đóng cửa sổ phân tích AI"
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
                    Phân tích AI
                  </h2>
                  <p className="mt-0.5 text-xs leading-snug text-slate-600 sm:text-sm">
                    ChatGPT / Gemini (khóa do Siêu quản trị lưu trong Cài đặt → LLM) — kết quả lưu trên hệ thống. Cần
                    quản lý bật «Cho phép dùng AI trên hồ sơ» cho tài khoản của bạn.
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
                  Chọn tác vụ và bấm chạy. Khóa API chỉ Siêu quản trị lưu được (Cài đặt → LLM). Nếu bị chặn, nhờ quản
                  lý bật «Cho phép dùng AI trên hồ sơ» trong Quản lý nhân sự.
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
                    <p className="text-xs font-bold uppercase tracking-wide text-violet-900">Điểm thông tin</p>
                    <span className="text-sm font-bold text-violet-900">{leadMl.mlWinProbability}%</span>
                    <span className="ml-1.5 rounded bg-violet-200/80 px-1 text-xs font-semibold uppercase text-violet-950">
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
