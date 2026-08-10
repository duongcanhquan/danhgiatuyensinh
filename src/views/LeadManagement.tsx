import type { MouseEvent, ReactNode } from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useSearchParams, Link } from 'react-router-dom'
import { BookOpen, Bot, ChevronDown, CircleHelp, ClipboardList, Download, Info as InfoIcon, Library, RefreshCw, Sparkles, Trash2, UserPlus, UserRound, Wand2, X, Zap } from 'lucide-react'
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
import {
  useLeads,
  mapDoc,
  fetchLeadsInScopeForRescore,
  serverFiltersForBulkRescore,
  leadMatchesClientSearch,
  type LeadListServerFilters,
  LEADS_PAGE_SIZE,
  LEADS_UI_FULL_SCOPE_MAX,
  LEADS_UI_PROGRAM_SCAN_MAX,
} from '../hooks/useLeads'
import { useMasterData } from '../hooks/useMasterData'
import { useLeadProfileCatalogs } from '../hooks/useLeadProfileCatalogs'
import { LEAD_AI_INSIGHT_AGGREGATE_ID, useLeadAiInsightTasks } from '../hooks/useLeadAiInsightTasks'
import { useInteractions } from '../hooks/useInteractions'
import { useConsultingPlaybooks } from '../hooks/useConsultingPlaybooks'
import { useAuth } from '../hooks/useAuth'
import { useOrg } from '../hooks/useOrg'
import { useInfoScoreRules } from '../contexts/InfoScoreRulesContext'
import { useLeadClassificationRules } from '../contexts/LeadClassificationRulesContext'
import { canCreateLead, canWriteLead, leadAssignedUid } from '../auth/leadAccess'
import { isAdminLikeRole, isFieldStaffRole, isTeamLeadRole } from '../auth/roleUtils'
import { counselorIdsInManagerScope } from '../utils/teamScope'
import { useLeadScoring } from '../hooks/useLeadScoring'
import { useAutoPersistLeadScores } from '../hooks/useAutoPersistLeadScores'
import { leadNeedsAutoScorePersist } from '../hooks/leadNeedsAutoScorePersist'
import { useLeadSources } from '../hooks/useLeadSources'
import { useScholarships } from '../hooks/useScholarships'
import { TagBadge } from '../components/TagBadge'
import { AppPageHeader } from '../components/AppPageHeader'
import { BentoCell, BentoGrid, BentoStat } from '../components/bento'
import { LeadPlaybookPanel } from '../components/LeadPlaybookPanel'
import { LlmAccessHelpPanel } from '../components/LlmAccessHelpPanel'
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
import { evaluateLeadWithClassification } from '../utils/leadClassificationScore'
import { persistLeadRescoresToFirestore, rescoreLeadList } from '../utils/bulkLeadRescore'
import { useOrgAiIntegration } from '../contexts/OrgAiIntegrationContext'
import { resolveAIIntegrationConfig, runAIAnalysis, getAiIntegrationDiagnostics } from '../utils/aiEngine'
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
import { formatLeadLastCallAiLine } from '../utils/leadCallAiDisplay'
import {
  formatLeadLastCallLine,
} from '../utils/leadCallSignals'
import {
  CALL_DISPOSITIONS,
  compareCallWorkQueueOrder,
  buildCallWorkLeadPatch,
  dispositionPriorityOverridesAfterScoring,
  getCallDisposition,
  isCallDispositionId,
  leadMatchesCallWorkBucket,
  leadMatchesDisposition,
  resolveCallWorkBucket,
  summarizeCallWorkQueue,
  type CallDispositionFilter,
  type CallDispositionId,
  type CallWorkBucketFilter,
} from '../utils/callWorkQueue'
import { BulkPriorityPartialError, bulkSetLeadPriorityTags } from '../utils/bulkLeadPriorityTag'
import { BulkReassignPartialError, bulkReassignLeads } from '../utils/bulkLeadReassign'
import {
  planLeadAssignments,
  summarizeAssignPlan,
  type SmartAssignMode,
} from '../utils/smartLeadAssign'
import { countAssignments } from '../utils/routing'
import {
  BulkIntakeProgramPartialError,
  bulkSetLeadIntakeProgram,
} from '../utils/bulkLeadIntakeProgram'
import { BulkDeleteLeadsPartialError, bulkDeleteLeads } from '../utils/bulkDeleteLeads'
import { collectLeadIdsByIntakeProgram, PURGE_PROGRAM_HARD_CAP } from '../utils/purgeLeadsByIntakeProgram'
import {
  loadRecentIntakePrograms,
  normalizeIntakeProgramLabel,
  rememberIntakeProgram,
  intakeProgramsMatch,
} from '../utils/intakeProgramRecent'
import { sliceClientPagedRows } from '../utils/leadListClientPaging'
import { resolveLeadDisplayPriorityTag } from '../utils/leadPriorityTag'
import { useAITasks } from '../hooks/useAITasks'
import { MlWinGauge } from '../components/MlWinGauge'
import { InfoScoreHelpPopover } from '../components/InfoScoreHelpPopover'
import { SearchableFilterSelect } from '../components/SearchableFilterSelect'
import { ScoringViewModeHint } from '../components/ScoringViewModeHint'
import { resolveLeadPrimarySource } from '../utils/leadSemanticFieldValue'
import { profileHasActiveRules } from '../utils/scoringProfileUtils'
import { useScriptSnippets } from '../hooks/useScriptSnippets'
import { ConsultingAssistantPanel } from '../components/ConsultingAssistantPanel'
import { LeadScoringSignalsPanel } from '../components/LeadScoringSignalsPanel'
import { LeadProfileCoreForm } from '../components/LeadProfileCoreForm'
import { LeadActivityTimeline } from '../components/LeadActivityTimeline'
import { LeadProfileFinanceSection } from '../components/LeadProfileFinanceSection'
import { LeadProfileInviteSection } from '../components/LeadProfileInviteSection'
import { OmicallCallButton } from '../components/OmicallCallButton'
import { buildLeadCoreFirestorePatch, isCoreDraftDirty, leadToCoreDraft, mergeCoreDraftIntoLead } from '../utils/leadProfileEdit'
import { isFinanceDraftDirty, leadToFinanceDraft } from '../utils/leadFinance'
import { persistLeadFinance } from '../utils/persistLeadFinance'
import { triggerInvitationN8n } from '../utils/n8nIntegration'
import { BulkLeadActionBar, BULK_PRIORITY_TAG_OPTIONS } from '../components/bulk/BulkLeadActionBar'
import { useCounselorDirectory } from '../hooks/useCounselorDirectory'
import { useScoringProfileSelection } from '../hooks/useScoringProfiles'
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
  parseCallWorkBucketFromUrl,
  parseCrmFromUrl,
  parseDispositionFromUrl,
  parsePipelineFromUrl,
  parseTagFromUrl,
  stripListFiltersKeepOpenView,
} from '../utils/leadWorkspaceUrlFilters'
import { formatStaffDirectoryLabel, formatStaffDisplayName } from '../utils/counselorDisplay'
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

/** Nhãn + ô lọc trên toolbar Hồ sơ — kích thước chạm được (không siết h-8). */
const LEAD_FILTER_LABEL =
  'flex min-w-0 flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-slate-500'
const LEAD_FILTER_CONTROL =
  'min-h-10 w-full rounded-lg border border-slate-200/95 bg-white px-2.5 text-sm font-medium text-slate-900 outline-none transition focus:border-amber-400 focus:ring-2 focus:ring-amber-100'
const LEAD_BTN =
  'inline-flex min-h-10 cursor-pointer items-center gap-1.5 rounded-lg border px-3 text-sm font-semibold shadow-sm transition disabled:cursor-not-allowed'

/** Bộ lọc đang chọn (nháp) vs đã áp dụng — chỉ chạy khi bấm «Áp dụng lọc». */
type LeadUiFilters = {
  tag: string
  callQueue: CallWorkBucketFilter
  disposition: CallDispositionFilter
  region: string
  major: string
  status: string
  crm: string
  source: string
  program: string
  school: string
  assignee: string
  scoreMin: string
  scoreMax: string
  aiShortlistOnly: boolean
}

function emptyLeadUiFilters(): LeadUiFilters {
  return {
    tag: 'ALL',
    callQueue: 'all',
    disposition: 'all',
    region: 'ALL',
    major: 'ALL',
    status: 'ALL',
    crm: 'ALL',
    source: 'ALL',
    program: 'ALL',
    school: 'ALL',
    assignee: '',
    scoreMin: '',
    scoreMax: '',
    aiShortlistOnly: false,
  }
}

function leadUiFiltersEqual(a: LeadUiFilters, b: LeadUiFilters): boolean {
  return (
    a.tag === b.tag &&
    a.callQueue === b.callQueue &&
    a.disposition === b.disposition &&
    a.region === b.region &&
    a.major === b.major &&
    a.status === b.status &&
    a.crm === b.crm &&
    a.source === b.source &&
    a.program === b.program &&
    a.school === b.school &&
    a.assignee === b.assignee &&
    a.scoreMin === b.scoreMin &&
    a.scoreMax === b.scoreMax &&
    a.aiShortlistOnly === b.aiShortlistOnly
  )
}

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

function formatAssignedCounselorLabel(l: Lead, names: Map<string, string>): string {
  const uid = leadAssignedUid(l)
  if (!uid) return '—'
  return names.get(uid) ?? `${uid.slice(0, 8)}…`
}

function effectiveLeadAssigneeUid(l: Lead): string {
  return leadAssignedUid(l) ?? ''
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

const LEAD_TABLE_COL_COUNT = 12

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
  const { effectiveOrgId } = useOrg()
  const { runtime: infoScoreRuntime } = useInfoScoreRules()
  const { runtime: classificationRuntime } = useLeadClassificationRules()
  const { users: directoryUsers, fieldStaff: fieldStaffUsers, counselors: counselorUsers, loading: counselorsLoading } = useCounselorDirectory()
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

  const showAdminGlobalFilters = can('leads:read:global')
  const [inspectProfileOpen, setInspectProfileOpen] = useState(false)
  const [createLeadOpen, setCreateLeadOpen] = useState(false)

  const [tagFilter, setTagFilter] = useState<string>('ALL')
  const [callWorkBucketFilter, setCallWorkBucketFilter] = useState<CallWorkBucketFilter>('all')
  const [dispositionFilter, setDispositionFilter] = useState<CallDispositionFilter>('all')
  const [regionFilter, setRegionFilter] = useState<string>('ALL')
  const [majorFilter, setMajorFilter] = useState<string>('ALL')
  const [statusFilter, setStatusFilter] = useState<string>('ALL')
  const [crmStatusFilter, setCrmStatusFilter] = useState<string>('ALL')
  const [sourceFilter, setSourceFilter] = useState<string>('ALL')
  const [sourceCatalogRequested, setSourceCatalogRequested] = useState(false)
  const [programCatalogRequested, setProgramCatalogRequested] = useState(false)
  /** ALL | __UNSET__ | nhãn chương trình */
  const [programFilter, setProgramFilter] = useState<string>('ALL')
  const [schoolFilter, setSchoolFilter] = useState<string>('ALL')
  /** Lọc TVV phụ trách (client); '' = tất cả, __UNASSIGNED__ = chưa gán. */
  const [assigneeFilter, setAssigneeFilter] = useState<string>('')
  const [scoreMinInput, setScoreMinInput] = useState('')
  const [scoreMaxInput, setScoreMaxInput] = useState('')
  const [aiShortlistOnly, setAiShortlistOnly] = useState(false)
  const [aiShortlistGuideOpen, setAiShortlistGuideOpen] = useState(false)

  /** Lựa chọn trên UI — chưa chạy cho đến khi «Áp dụng lọc». */
  const [draftFilters, setDraftFilters] = useState<LeadUiFilters>(() => emptyLeadUiFilters())

  const appliedFiltersSnapshot = useMemo(
    (): LeadUiFilters => ({
      tag: tagFilter,
      callQueue: callWorkBucketFilter,
      disposition: dispositionFilter,
      region: regionFilter,
      major: majorFilter,
      status: statusFilter,
      crm: crmStatusFilter,
      source: sourceFilter,
      program: programFilter,
      school: schoolFilter,
      assignee: assigneeFilter,
      scoreMin: scoreMinInput,
      scoreMax: scoreMaxInput,
      aiShortlistOnly,
    }),
    [
      tagFilter,
      callWorkBucketFilter,
      dispositionFilter,
      regionFilter,
      majorFilter,
      statusFilter,
      crmStatusFilter,
      sourceFilter,
      programFilter,
      schoolFilter,
      assigneeFilter,
      scoreMinInput,
      scoreMaxInput,
      aiShortlistOnly,
    ],
  )

  const filtersPendingApply = !leadUiFiltersEqual(draftFilters, appliedFiltersSnapshot)

  const patchDraftFilters = useCallback((patch: Partial<LeadUiFilters>) => {
    setDraftFilters((prev) => ({ ...prev, ...patch }))
  }, [])

  /**
   * Chỉ quét fullScope khi lọc nhãn theo profile chấm điểm đang bật.
   * Nhãn đã lưu trên Firestore → lọc server (`priorityTag`) + phân trang.
   */
  const { profileScoringLive } = useScoringProfileSelection()
  const tagClientEval = !urlQuery.trim() && tagFilter !== 'ALL' && profileScoringLive
  /** Lọc hàng chờ / note sau gọi — thiếu field trên hồ sơ cũ → quét phạm vi rộng. */
  const callQueueNeedsScope = callWorkBucketFilter !== 'all' || dispositionFilter !== 'all'
  /** «Chưa gán» không query được trên Firestore → fullScope + lọc client. */
  const assigneeUnsetNeedsScope = assigneeFilter === '__UNASSIGNED__'
  /** Có chọn chương trình (kể cả «Chưa gắn») — dùng chip / nút xóa lô. */
  const programFilterActive = programFilter !== 'ALL'
  /**
   * Chỉ «Chưa gắn» cần fullScope (thiếu field — không where được).
   * Chương trình có nhãn → lọc server `intakeProgram` + phân trang (nhanh).
   */
  const programNeedsScope = programFilter === '__UNSET__'

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
    if (programFilter !== 'ALL' && programFilter !== '__UNSET__') {
      o.intakeProgram = programFilter
    }
    if (schoolFilter !== 'ALL') {
      o.highSchoolIn = [schoolFilter]
    }
    if (
      assigneeFilter &&
      assigneeFilter !== '__UNASSIGNED__' &&
      can('leads:read:global')
    ) {
      o.assignedCounselorIn = [assigneeFilter]
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
    programFilter,
    schoolFilter,
    assigneeFilter,
    scoreMinInput,
    scoreMaxInput,
    aiShortlistOnly,
    tagClientEval,
    can,
  ])

  const leadServerFiltersKey = useMemo(() => JSON.stringify(leadServerFilters ?? {}), [leadServerFilters])

  const listNeedsFullScope =
    tagClientEval || callQueueNeedsScope || assigneeUnsetNeedsScope || programNeedsScope

  /** «Chưa gắn»: quét theo id + chỉ giữ hồ sơ không có intakeProgram. */
  const unsetProgramKeepMatch = useMemo(() => {
    if (!programNeedsScope) return undefined
    return (l: Lead) => {
      if ((l.intakeProgram ?? '').trim()) return false
      if (callWorkBucketFilter !== 'all' && !leadMatchesCallWorkBucket(l, callWorkBucketFilter)) {
        return false
      }
      if (dispositionFilter !== 'all' && !leadMatchesDisposition(l, dispositionFilter)) return false
      if (assigneeFilter === '__UNASSIGNED__') {
        if (effectiveLeadAssigneeUid(l)) return false
      } else if (assigneeFilter && effectiveLeadAssigneeUid(l) !== assigneeFilter) {
        return false
      }
      return true
    }
  }, [programNeedsScope, callWorkBucketFilter, dispositionFilter, assigneeFilter])

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
    fetchScopeSourceOptions,
    scopeProgramOptions,
    fetchScopeProgramOptions,
    applyLocalLeadPatch,
    removeLocalLeads,
    refetchLeads,
    totalLeadCount,
    searchHitTotal,
  } = useLeads({
    serverFilters: leadServerFilters,
    searchText: urlQuery,
    directoryLabels: counselorDirectoryLabelById,
    dataMode: listNeedsFullScope ? 'fullScope' : 'paged',
    maxFullScopeLeads: listNeedsFullScope ? LEADS_UI_FULL_SCOPE_MAX : undefined,
    fullScopeOrderMode: programNeedsScope ? 'docId' : undefined,
    maxFullScopeScanDocs: programNeedsScope ? LEADS_UI_PROGRAM_SCAN_MAX : undefined,
    fullScopeKeepMatch: unsetProgramKeepMatch,
    fullScopeMatchKey: programNeedsScope
      ? `unset|cq:${callWorkBucketFilter}|disp:${dispositionFilter}|as:${assigneeFilter}`
      : undefined,
    // Đếm HOT/WARM… và catalog chương trình chỉ khi cần — giảm 4× count + 800 doc mỗi lần tải.
    includeScopeTagCounts: false,
    includeScopeSourceOptions: sourceCatalogRequested,
    includeScopeProgramOptions: programCatalogRequested,
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

  const hoDQueryLabels = useMemo(() => {
    const ids = profile?.managedMajorIds ?? []
    if (!ids.length) return [] as string[]
    const idSet = new Set(ids)
    const majors = byKind.majors ?? []
    return majors.filter((m) => idSet.has(m.id)).map((m) => m.label.trim()).filter(Boolean)
  }, [profile?.managedMajorIds, byKind.majors])

  const rescoreServerFilters = useMemo(
    () => serverFiltersForBulkRescore(leadServerFilters),
    [leadServerFilters],
  )

  const {
    scoringProfiles,
    profilesLoading,
    setScoringProfileId,
    resolvedScoringProfileId,
    activeScoringProfile,
    scoreByLeadId,
    schoolTvvSignalDefs,
  } = useLeadScoring(leads, { masterBuckets: scoringMasterBuckets, infoScoreRuntime })

  const profileScoringActive = Boolean(activeScoringProfile)

  const effectiveLeadTag = useCallback(
    (l: Lead) => {
      const scored = profileScoringActive
        ? (scoreByLeadId.get(l.id)?.priorityTag ?? l.priorityTag)
        : l.priorityTag
      return resolveLeadDisplayPriorityTag(l, scored)
    },
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
    // Ước lượng từ dữ liệu đã tải — không gọi 4× getCount mỗi lần mở Hồ sơ.
    return tagCountsFromLoadedLeads
  }, [urlQuery, tagClientEval, scopeTagCounts, tagCountsFromLoadedLeads])

  const {
    snippets: scriptSnippets,
    loading: scriptSnippetsLoading,
    error: scriptSnippetsErr,
  } = useScriptSnippets()

  const reassignPickList = useMemo(() => {
    const base = fieldStaffUsers
    const elevated = can('leads:read:global')
    const teamLead = isTeamLeadRole(profile?.role)

    if (teamLead && profile) {
      const team = new Set(counselorIdsInManagerScope(profile, directoryUsers))
      team.add(profile.id)
      return base
        .filter((u) => team.has(u.id))
        .sort((a, b) => formatStaffDirectoryLabel(a).localeCompare(formatStaffDirectoryLabel(b), 'vi'))
    }

    if (elevated) {
      const extras = directoryUsers.filter(
        (u) => u.isActive && isAdminLikeRole(u.role) && !base.some((c) => c.id === u.id),
      )
      return [...base, ...extras].sort((a, b) =>
        formatStaffDirectoryLabel(a).localeCompare(formatStaffDirectoryLabel(b), 'vi'),
      )
    }

    if (profile?.id && isFieldStaffRole(profile.role)) {
      const self =
        base.find((u) => u.id === profile.id) ??
        directoryUsers.find((u) => u.id === profile.id && u.isActive)
      return self ? [self] : []
    }

    return base
  }, [fieldStaffUsers, directoryUsers, profile, can])

  /**
   * Mục tiêu khi giao việc hàng loạt.
   * Peer mode: dùng danh sách TVV đầy đủ (giống LeadCrmQuickBlock) — không chỉ chính mình.
   */
  const bulkReassignTargets = useMemo(() => {
    const peerMode = !can('leads:read:global') && !can('leads:reassign:team') && can('leads:reassign:peer')
    if (!peerMode || !profile?.id) return reassignPickList
    const me = counselorUsers.find((c) => c.id === profile.id)
    const others = counselorUsers
      .filter((c) => c.id !== profile.id && c.isActive)
      .sort((a, b) => formatStaffDirectoryLabel(a).localeCompare(formatStaffDirectoryLabel(b), 'vi'))
    return me ? [me, ...others] : others
  }, [reassignPickList, counselorUsers, profile?.id, can])

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
  const [bulkModal, setBulkModal] = useState<null | 'reassign' | 'crm' | 'priorityTag' | 'intakeProgram'>(
    null,
  )
  const [bulkReassignUid, setBulkReassignUid] = useState<string>('')
  const [bulkAssignMode, setBulkAssignMode] = useState<SmartAssignMode>('single')
  const [bulkAssignPoolIds, setBulkAssignPoolIds] = useState<string[]>([])
  const [bulkReassignProgress, setBulkReassignProgress] = useState<null | { done: number; total: number }>(
    null,
  )
  const [selectScopeBusy, setSelectScopeBusy] = useState(false)
  /** Tải TVV ước lượng theo phạm vi (hydrate khi mở modal phân lead). */
  const [assignmentLoadSnapshot, setAssignmentLoadSnapshot] = useState<Map<string, number> | null>(null)
  const [assignmentLoadBusy, setAssignmentLoadBusy] = useState(false)
  /** Hồ sơ đã tải khi «Chọn tất cả theo lọc» — dùng khi id không còn trong trang hiện tại. */
  const selectScopeLeadsRef = useRef<Map<string, Lead>>(new Map())
  const [bulkCrmStatus, setBulkCrmStatus] = useState<LeadCounselorStatus>('NEW')
  const [bulkPriorityTag, setBulkPriorityTag] = useState<PriorityTag>('WARM')
  const [bulkIntakeProgram, setBulkIntakeProgram] = useState('')
  const [bulkIntakeProgramRecent, setBulkIntakeProgramRecent] = useState<string[]>(() =>
    loadRecentIntakePrograms(),
  )
  const [bulkBusy, setBulkBusy] = useState(false)
  const [rescoreBusy, setRescoreBusy] = useState(false)
  const [rescoreMsg, setRescoreMsg] = useState<string | null>(null)
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

  const isElevatedLeadScope = can('leads:read:global') || can('leads:reassign:team')
  const canPeerReassignLeads = Boolean(can('leads:reassign:peer'))
  const showBulkReassign = isElevatedLeadScope || canPeerReassignLeads
  const canDeleteLeads = Boolean(can('leads:delete'))
  const canBulkWrite = Boolean(
    can('leads:write:self_assigned') || showBulkReassign || canDeleteLeads,
  )
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
      const src = resolveLeadPrimarySource(l)
      if (src) s.add(src)
    }
    if (sourceFilter !== 'ALL') s.add(sourceFilter)
    return [...s].sort((a, b) => a.localeCompare(b, 'vi'))
  }, [leads, scopeSourceOptions, sourceFilter])

  const programOptions = useMemo(() => {
    const byLower = new Map<string, string>()
    const add = (raw: string) => {
      const p = raw.trim()
      if (!p) return
      const k = p.toLowerCase()
      if (!byLower.has(k)) byLower.set(k, p)
    }
    for (const p of scopeProgramOptions) add(p)
    for (const p of loadRecentIntakePrograms()) add(p)
    for (const l of leads) add(l.intakeProgram ?? '')
    if (programFilter !== 'ALL' && programFilter !== '__UNSET__') add(programFilter)
    return [...byLower.values()].sort((a, b) => a.localeCompare(b, 'vi'))
  }, [leads, programFilter, scopeProgramOptions])

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
    if (callWorkBucketFilter !== 'all') {
      rows = rows.filter((l) => leadMatchesCallWorkBucket(l, callWorkBucketFilter))
    }
    if (dispositionFilter !== 'all') {
      rows = rows.filter((l) => leadMatchesDisposition(l, dispositionFilter))
    }
    if (programFilter === '__UNSET__') {
      rows = rows.filter((l) => !(l.intakeProgram ?? '').trim())
    } else if (programFilter !== 'ALL') {
      // Client filter: bắt buộc khi fullScope (TVV / combo); idempotent khi server đã lọc exact.
      rows = rows.filter((l) => intakeProgramsMatch(l.intakeProgram, programFilter))
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
    profileScoringActive,
    scoreByLeadId,
    tagClientEval,
    tagFilter,
    effectiveLeadTag,
    callWorkBucketFilter,
    dispositionFilter,
    programFilter,
    assigneeFilter,
  ])

  const sortedFiltered = useMemo(() => {
    const rows = [...filtered]
    if (sortKey === 'none') {
      rows.sort(compareCallWorkQueueOrder)
      return rows
    }
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
  }, [
    filtered,
    sortKey,
    sortDir,
    effectiveLeadTag,
    profileScoringActive,
    scoreByLeadId,
    infoScoreRuntime,
  ])

  /** Tổng kết hàng chờ của người đang đăng nhập (hồ sơ gán cho mình trong phạm vi đã tải). */
  const myCallWorkSummary = useMemo(() => {
    const uid = profile?.id?.trim()
    const mine = uid
      ? leads.filter((l) => effectiveLeadAssigneeUid(l) === uid)
      : []
    return summarizeCallWorkQueue(mine)
  }, [leads, profile?.id])

  /**
   * fullScope (lọc nhãn theo profile / ca gọi) trả cả tập — phải cắt trang trên client
   * để «Chọn tất cả trên trang» không chọn hàng nghìn hồ sơ một lúc.
   */
  /** fullScope trả về cả mảng — luôn phân trang client để không mount hàng nghìn dòng. */
  const clientPagingActive = listNeedsFullScope
  const clientPageSlice = useMemo(
    () =>
      clientPagingActive
        ? sliceClientPagedRows(sortedFiltered, currentPage, LEADS_PAGE_SIZE)
        : {
            pageRows: sortedFiltered,
            totalPages: Math.max(1, firestoreTotalPages),
            safePage: currentPage,
          },
    [clientPagingActive, sortedFiltered, currentPage, firestoreTotalPages],
  )
  const displayTotalPages = clientPageSlice.totalPages
  const pagedRows = clientPageSlice.pageRows

  /** Tổng hồ sơ trong phạm vi (cache khi chưa lọc) — không đổi khi đang áp bộ lọc. */
  const [scopeBaselineTotal, setScopeBaselineTotal] = useState<number | null>(null)

  const filterMatchCount = useMemo(() => {
    // Khi fullScope / hàng chờ / chương trình: `listNeedsFullScope` đã true → đếm client.
    if (listNeedsFullScope || clientPagingActive) return sortedFiltered.length
    const q = (searchParams.get(LWF.Q) ?? '').trim()
    if (q) return searchHitTotal ?? sortedFiltered.length
    if (
      scoreMinInput.trim() !== '' ||
      scoreMaxInput.trim() !== '' ||
      dispositionFilter !== 'all' ||
      callWorkBucketFilter !== 'all' ||
      aiShortlistOnly
    ) {
      return sortedFiltered.length
    }
    return totalLeadCount ?? sortedFiltered.length
  }, [
    listNeedsFullScope,
    clientPagingActive,
    sortedFiltered.length,
    searchParams,
    searchHitTotal,
    scoreMinInput,
    scoreMaxInput,
    dispositionFilter,
    callWorkBucketFilter,
    aiShortlistOnly,
    totalLeadCount,
  ])

  const programSummary = useMemo(() => {
    const source =
      listNeedsFullScope || clientPagingActive || (searchParams.get(LWF.Q) ?? '').trim()
        ? sortedFiltered
        : leads
    const map = new Map<string, number>()
    let unset = 0
    for (const l of source) {
      const p = (l.intakeProgram ?? '').trim()
      if (!p) {
        unset += 1
        continue
      }
      map.set(p, (map.get(p) ?? 0) + 1)
    }
    const rows = [...map.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'vi'))
      .slice(0, 8)
    const sampleOnly = !(listNeedsFullScope || clientPagingActive) && !(searchParams.get(LWF.Q) ?? '').trim()
    return { rows, unset, sampleSize: source.length, sampleOnly }
  }, [listNeedsFullScope, clientPagingActive, sortedFiltered, leads, searchParams])

  useEffect(() => {
    if (currentPage > displayTotalPages) setPage(displayTotalPages)
  }, [currentPage, displayTotalPages, setPage])

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
    const next: LeadUiFilters = {
      ...emptyLeadUiFilters(),
      tag: sp.has(LWF.TAG) ? parseTagFromUrl(sp.get(LWF.TAG)) : 'ALL',
      region: sp.has(LWF.REGION) ? sp.get(LWF.REGION)!.trim() || 'ALL' : 'ALL',
      school: sp.has(LWF.SCHOOL) ? sp.get(LWF.SCHOOL)!.trim() || 'ALL' : 'ALL',
      major: sp.has(LWF.MAJOR) ? sp.get(LWF.MAJOR)!.trim() || 'ALL' : 'ALL',
      status: sp.has(LWF.PIPE) ? parsePipelineFromUrl(sp.get(LWF.PIPE)) : 'ALL',
      crm: sp.has(LWF.CRM) ? parseCrmFromUrl(sp.get(LWF.CRM)) : 'ALL',
      source: sp.has(LWF.SOURCE) ? sp.get(LWF.SOURCE)!.trim() || 'ALL' : 'ALL',
      program: (sp.get(LWF.PROG) ?? '').trim() || 'ALL',
      assignee: sp.has(LWF.ASSIGN) ? sp.get(LWF.ASSIGN)!.trim() : '',
      callQueue: parseCallWorkBucketFromUrl(sp.get(LWF.CQ)),
      disposition: (() => {
        const d = parseDispositionFromUrl(sp.get(LWF.DISP))
        return d && isCallDispositionId(d) ? d : 'all'
      })(),
      // Điểm / AI shortlist không nằm trên URL — giữ giá trị đang áp dụng.
      scoreMin: scoreMinInput,
      scoreMax: scoreMaxInput,
      aiShortlistOnly,
    }
    setTagFilter(next.tag)
    setRegionFilter(next.region)
    setSchoolFilter(next.school)
    setMajorFilter(next.major)
    setStatusFilter(next.status)
    setCrmStatusFilter(next.crm)
    setSourceFilter(next.source)
    setProgramFilter(next.program)
    setAssigneeFilter(next.assignee)
    setCallWorkBucketFilter(next.callQueue)
    setDispositionFilter(next.disposition)
    setDraftFilters((prev) => ({
      ...next,
      scoreMin: prev.scoreMin,
      scoreMax: prev.scoreMax,
      aiShortlistOnly: prev.aiShortlistOnly,
    }))
    // Chỉ hydrate từ URL — không đưa score/AI vào deps để tránh ghi đè nháp khi gõ điểm.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- filterHydrateSig
  }, [filterHydrateSig, searchParams])

  const applyDraftFilters = useCallback(() => {
    const d = draftFilters
    setTagFilter(d.tag)
    setCallWorkBucketFilter(d.callQueue)
    setDispositionFilter(d.disposition)
    setRegionFilter(d.region)
    setMajorFilter(d.major)
    setStatusFilter(d.status)
    setCrmStatusFilter(d.crm)
    setSourceFilter(d.source)
    setProgramFilter(d.program)
    setSchoolFilter(d.school)
    setAssigneeFilter(d.assignee)
    setScoreMinInput(d.scoreMin)
    setScoreMaxInput(d.scoreMax)
    setAiShortlistOnly(d.aiShortlistOnly)
    mergeListFilterUrl({
      [LWF.TAG]: d.tag === 'ALL' ? null : d.tag,
      [LWF.CQ]: d.callQueue === 'all' ? null : d.callQueue,
      [LWF.DISP]: d.disposition === 'all' ? null : d.disposition,
      [LWF.REGION]: d.region === 'ALL' ? null : d.region,
      [LWF.MAJOR]: d.major === 'ALL' ? null : d.major,
      [LWF.PIPE]: d.status === 'ALL' ? null : d.status,
      [LWF.CRM]: d.crm === 'ALL' ? null : d.crm,
      [LWF.SOURCE]: d.source === 'ALL' ? null : d.source,
      [LWF.PROG]: d.program === 'ALL' ? null : d.program,
      [LWF.SCHOOL]: d.school === 'ALL' ? null : d.school,
      [LWF.ASSIGN]: d.assignee ? d.assignee : null,
    })
    setPage(1)
  }, [draftFilters, mergeListFilterUrl, setPage])

  /** Chip chương trình: chọn + áp dụng ngay (không cần bấm «Áp dụng lọc»). */
  const applyProgramFilterQuick = useCallback(
    (program: string) => {
      setDraftFilters((prev) => ({ ...prev, program }))
      setProgramFilter(program)
      mergeListFilterUrl({ [LWF.PROG]: program === 'ALL' ? null : program })
      setPage(1)
    },
    [mergeListFilterUrl, setPage],
  )

  /** Hàng chờ gọi / ô tổng kết: áp dụng ngay. `pinMine` = lọc thêm hồ sơ gán cho mình. */
  const applyCallQueueQuick = useCallback(
    (callQueue: CallWorkBucketFilter, opts?: { pinMine?: boolean }) => {
      const uid = profile?.id?.trim() ?? ''
      const pinMine = Boolean(opts?.pinMine && uid)
      setDraftFilters((prev) => ({
        ...prev,
        callQueue,
        ...(pinMine ? { assignee: uid } : {}),
      }))
      setCallWorkBucketFilter(callQueue)
      if (pinMine) setAssigneeFilter(uid)
      mergeListFilterUrl({
        [LWF.CQ]: callQueue === 'all' ? null : callQueue,
        ...(pinMine ? { [LWF.ASSIGN]: uid } : {}),
      })
      setPage(1)
    },
    [mergeListFilterUrl, setPage, profile?.id],
  )

  /** Note sau gọi: áp dụng ngay (cùng hàng chờ gọi). */
  const applyDispositionQuick = useCallback(
    (disposition: CallDispositionFilter) => {
      setDraftFilters((prev) => ({ ...prev, disposition }))
      setDispositionFilter(disposition)
      mergeListFilterUrl({ [LWF.DISP]: disposition === 'all' ? null : disposition })
      setPage(1)
    },
    [mergeListFilterUrl, setPage],
  )

  /** Nhãn HOT/WARM/…: áp dụng ngay. */
  const applyTagQuick = useCallback(
    (tag: string) => {
      setDraftFilters((prev) => ({ ...prev, tag }))
      setTagFilter(tag)
      mergeListFilterUrl({ [LWF.TAG]: tag === 'ALL' ? null : tag })
      setPage(1)
    },
    [mergeListFilterUrl, setPage],
  )

  const discardDraftFilters = useCallback(() => {
    setDraftFilters(appliedFiltersSnapshot)
  }, [appliedFiltersSnapshot])

  const clearQuickFilters = useCallback(() => {
    const empty = emptyLeadUiFilters()
    setTagFilter(empty.tag)
    setCallWorkBucketFilter(empty.callQueue)
    setDispositionFilter(empty.disposition)
    setRegionFilter(empty.region)
    setMajorFilter(empty.major)
    setStatusFilter(empty.status)
    setCrmStatusFilter(empty.crm)
    setSourceFilter(empty.source)
    setProgramFilter(empty.program)
    setSchoolFilter(empty.school)
    setAssigneeFilter(empty.assignee)
    setScoreMinInput(empty.scoreMin)
    setScoreMaxInput(empty.scoreMax)
    setAiShortlistOnly(empty.aiShortlistOnly)
    setDraftFilters(empty)
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
          setDraftFilters((prev) => ({ ...prev, tag: 'ALL' }))
          setPage(1)
          mergeListFilterUrl({ [LWF.TAG]: null })
        },
      })
    }
    if (callWorkBucketFilter !== 'all') {
      const callLabels: Record<Exclude<CallWorkBucketFilter, 'all'>, string> = {
        uncalled: 'Chưa gọi',
        callback: 'Gọi lại',
        called: 'Đã xử lý',
      }
      out.push({
        id: 'callQueue',
        label: `Hàng chờ: ${callLabels[callWorkBucketFilter]}`,
        onClear: () => {
          setCallWorkBucketFilter('all')
          setDraftFilters((prev) => ({ ...prev, callQueue: 'all' }))
          setPage(1)
          mergeListFilterUrl({ [LWF.CQ]: null })
        },
      })
    }
    if (dispositionFilter !== 'all') {
      const disp = CALL_DISPOSITIONS.find((d) => d.id === dispositionFilter)
      out.push({
        id: 'disp',
        label: `Note: ${disp?.label ?? dispositionFilter}`,
        onClear: () => {
          setDispositionFilter('all')
          setDraftFilters((prev) => ({ ...prev, disposition: 'all' }))
          setPage(1)
          mergeListFilterUrl({ [LWF.DISP]: null })
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
    if (programFilter !== 'ALL') {
      out.push({
        id: 'prog',
        label:
          programFilter === '__UNSET__'
            ? 'Chương trình: Chưa gắn'
            : `Chương trình: ${programFilter.length > 18 ? `${programFilter.slice(0, 18)}…` : programFilter}`,
        onClear: () => {
          setProgramFilter('ALL')
          setPage(1)
          mergeListFilterUrl({ [LWF.PROG]: null })
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
          setDraftFilters((prev) => ({ ...prev, assignee: '' }))
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
          patchDraftFilters({ scoreMin: '', scoreMax: '' })
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
          patchDraftFilters({ aiShortlistOnly: false })
          setPage(1)
        },
      })
    }
    return out
  }, [
    searchParams,
    tagFilter,
    callWorkBucketFilter,
    dispositionFilter,
    regionFilter,
    majorFilter,
    statusFilter,
    crmStatusFilter,
    sourceFilter,
    programFilter,
    schoolFilter,
    assigneeFilter,
    scoreMinInput,
    scoreMaxInput,
    aiShortlistOnly,
    mergeListFilterUrl,
    patchDraftFilters,
    counselorDisplayNameById,
    reassignPickList,
    setSearchParams,
    setPage,
  ])

  useEffect(() => {
    if (activeFilterChips.length === 0 && totalLeadCount != null) {
      setScopeBaselineTotal(totalLeadCount)
    }
  }, [activeFilterChips.length, totalLeadCount])

  const scoringPersistOpts = useMemo(
    () => ({
      infoScoreRuntime,
      includeAuxScores: true as const,
      classificationRuntime: classificationRuntime.enabled ? classificationRuntime : null,
    }),
    [infoScoreRuntime, classificationRuntime],
  )

  const scoreLead = useCallback(
    (l: Lead) =>
      activeScoringProfile
        ? evaluateLead(leadToEvaluationRecord(l), activeScoringProfile, scoringMasterBuckets, schoolTvvSignalDefs, {
            lead: l,
            infoScoreRuntime,
            includeAuxScores: true,
            classificationRuntime: classificationRuntime.enabled ? classificationRuntime : null,
          })
        : { calculatedScore: l.calculatedScore, priorityTag: l.priorityTag },
    [activeScoringProfile, scoringMasterBuckets, schoolTvvSignalDefs, infoScoreRuntime, classificationRuntime],
  )

  const handleExportEvaluated = () => {
    const m = new Map<string, { calculatedScore: number; priorityTag: PriorityTag }>()
    for (const l of sortedFiltered) {
      const ev = activeScoringProfile ? scoreByLeadId.get(l.id) ?? scoreLead(l) : scoreLead(l)
      m.set(l.id, ev)
    }
    exportEvaluatedLeadsToXlsx(sortedFiltered, m, {
      profileName: activeScoringProfile?.profileName ?? 'Mặc định',
    })
  }

  const runBulkRescore = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!db || !profile || !activeScoringProfile || !profileHasActiveRules(activeScoringProfile)) return
      const profileName = activeScoringProfile.profileName?.trim() || 'profile'
      if (
        !opts?.silent &&
        !window.confirm(
          `Tính lại điểm và nhãn cho mọi hồ sơ trong phạm vi hiện tại theo bộ «${profileName}»?\n\nThao tác ghi lên Firestore (có thể mất vài phút nếu nhiều hồ sơ).`,
        )
      ) {
        return
      }
      setRescoreBusy(true)
      setRescoreMsg(opts?.silent ? 'Đang tự động tính lại điểm cho hồ sơ trong phạm vi…' : 'Đang tải danh sách hồ sơ…')
      try {
        const { leads: scopeLeads, truncated } = await fetchLeadsInScopeForRescore(
          db,
          profile,
          hoDQueryLabels,
          rescoreServerFilters,
          { maxLeads: LEADS_UI_FULL_SCOPE_MAX, canReadGlobal: can('leads:read:global') },
        )
        setRescoreMsg(`Đang chấm ${scopeLeads.length.toLocaleString('vi-VN')} hồ sơ…`)
        const results = rescoreLeadList(
          scopeLeads,
          activeScoringProfile,
          scoringMasterBuckets,
          schoolTvvSignalDefs,
          infoScoreRuntime,
          classificationRuntime.enabled ? classificationRuntime : null,
        )
        const changed = results.filter((r) => r.changed)
        setRescoreMsg(`Đang lưu ${changed.length.toLocaleString('vi-VN')} hồ sơ có thay đổi…`)
        const written = await persistLeadRescoresToFirestore(db, results)
        for (const r of changed) {
          applyLocalLeadPatch(r.leadId, {
            calculatedScore: r.calculatedScore,
            priorityTag: r.priorityTag,
            ...(r.leadScoreProfilePart !== undefined ? { leadScoreProfilePart: r.leadScoreProfilePart } : {}),
            ...(r.leadScoreEngagementPart !== undefined
              ? { leadScoreEngagementPart: r.leadScoreEngagementPart }
              : {}),
          })
        }
        setSelected((prev) => {
          if (!prev) return prev
          const hit = changed.find((r) => r.leadId === prev.id)
          return hit
            ? {
                ...prev,
                calculatedScore: hit.calculatedScore,
                priorityTag: hit.priorityTag,
                ...(hit.leadScoreProfilePart !== undefined
                  ? { leadScoreProfilePart: hit.leadScoreProfilePart }
                  : {}),
                ...(hit.leadScoreEngagementPart !== undefined
                  ? { leadScoreEngagementPart: hit.leadScoreEngagementPart }
                  : {}),
              }
            : prev
        })
        void refetchLeads()
        const truncNote = truncated
          ? ` (đạt giới hạn ${LEADS_UI_FULL_SCOPE_MAX.toLocaleString('vi-VN')} hồ sơ — chạy lại nếu còn hồ sơ cũ hơn)`
          : ''
        setRescoreMsg(
          `Đã cập nhật ${written.toLocaleString('vi-VN')} / ${scopeLeads.length.toLocaleString('vi-VN')} hồ sơ${truncNote}.`,
        )
      } catch (e) {
        console.error(e)
        setRescoreMsg('Không tính lại được điểm — kiểm tra quyền Firestore hoặc thử lại.')
      } finally {
        setRescoreBusy(false)
      }
    },
    [
      db,
      profile,
      can,
      activeScoringProfile,
      hoDQueryLabels,
      rescoreServerFilters,
      scoringMasterBuckets,
      schoolTvvSignalDefs,
      infoScoreRuntime,
      classificationRuntime,
      applyLocalLeadPatch,
      refetchLeads,
    ],
  )

  useAutoPersistLeadScores({
    db,
    user: profile,
    activeScoringProfile,
    leads,
    scoreByLeadId,
    masterBuckets: scoringMasterBuckets,
    schoolTvvSignalDefs,
    infoScoreRuntime,
    classificationRuntime: classificationRuntime.enabled ? classificationRuntime : null,
    applyLocalLeadPatch,
    enabled: profileScoringLive && Boolean(db) && !rescoreBusy,
    onRequestFullRescore: () => {
      void runBulkRescore({ silent: true })
    },
  })

  const evalMapForExport = useCallback(
    (rows: Lead[]) => {
      const m = new Map<string, { calculatedScore: number; priorityTag: PriorityTag }>()
      for (const l of rows) {
        const ev = activeScoringProfile ? scoreByLeadId.get(l.id) ?? scoreLead(l) : scoreLead(l)
        m.set(l.id, ev)
      }
      return m
    },
    [activeScoringProfile, scoreByLeadId, scoreLead],
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

  const assignmentLoadByUid = useMemo(() => {
    if (assignmentLoadSnapshot) return assignmentLoadSnapshot
    return countAssignments(leads)
  }, [assignmentLoadSnapshot, leads])

  const hydrateAssignmentLoads = useCallback(async () => {
    if (!db || !profile || !isElevatedLeadScope) return
    setAssignmentLoadBusy(true)
    try {
      const { leads: scopeLeads } = await fetchLeadsInScopeForRescore(
        db,
        profile,
        hoDQueryLabels,
        undefined,
        {
          maxLeads: LEADS_UI_FULL_SCOPE_MAX,
          canReadGlobal: can('leads:read:global'),
          orgId: effectiveOrgId,
        },
      )
      setAssignmentLoadSnapshot(countAssignments(scopeLeads))
    } catch (e) {
      console.error(e)
      setAssignmentLoadSnapshot(countAssignments(leads))
    } finally {
      setAssignmentLoadBusy(false)
    }
  }, [db, profile, isElevatedLeadScope, hoDQueryLabels, can, effectiveOrgId, leads])

  const resolveLeadForBulk = useCallback(
    (id: string): Lead | undefined => selectScopeLeadsRef.current.get(id) ?? leads.find((x) => x.id === id),
    [leads],
  )

  const selectAllMatchingFilters = useCallback(async () => {
    if (!db || !profile) return
    setSelectScopeBusy(true)
    setRescoreMsg(null)
    try {
      let rows = filtered
      let truncated = Boolean(listNeedsFullScope && scopeFetchTruncated)
      if (!listNeedsFullScope) {
        const { leads: scopeLeads, truncated: t } = await fetchLeadsInScopeForRescore(
          db,
          profile,
          hoDQueryLabels,
          leadServerFilters,
          {
            maxLeads: LEADS_UI_FULL_SCOPE_MAX,
            canReadGlobal: can('leads:read:global'),
            orgId: effectiveOrgId,
          },
        )
        truncated = t
        rows = scopeLeads
        // Khớp cùng predicate với `filtered` (điểm live / nhãn client / hàng chờ / TVV).
        const minScore =
          scoreMinInput.trim() === '' || Number.isNaN(Number(scoreMinInput)) ? null : Number(scoreMinInput)
        const maxScore =
          scoreMaxInput.trim() === '' || Number.isNaN(Number(scoreMaxInput)) ? null : Number(scoreMaxInput)
        if (minScore != null || maxScore != null) {
          rows = rows.filter((l) => {
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
        if (callWorkBucketFilter !== 'all') {
          rows = rows.filter((l) => leadMatchesCallWorkBucket(l, callWorkBucketFilter))
        }
        if (dispositionFilter !== 'all') {
          rows = rows.filter((l) => leadMatchesDisposition(l, dispositionFilter))
        }
        if (urlQuery.trim()) {
          rows = rows.filter((l) =>
            leadMatchesClientSearch(l, urlQuery.trim().toLowerCase(), counselorDirectoryLabelById),
          )
        }
        // Khi !listNeedsFullScope thì programNeedsScope = false → programFilter luôn 'ALL'
        // (lọc chương trình đã đi nhánh fullScope + `filtered`). Không lọc lại ở đây.
      }
      const map = new Map<string, Lead>()
      for (const l of rows) map.set(l.id, l)
      selectScopeLeadsRef.current = map
      setSelectedIds(new Set(rows.map((l) => l.id)))
      const truncNote = truncated
        ? ` (đạt giới hạn ${LEADS_UI_FULL_SCOPE_MAX.toLocaleString('vi-VN')} — có thể còn hồ sơ chưa tải)`
        : ''
      setRescoreMsg(
        `Đã chọn ${rows.length.toLocaleString('vi-VN')} hồ sơ theo bộ lọc hiện tại${truncNote}.`,
      )
    } catch (e) {
      console.error(e)
      setRescoreMsg(e instanceof Error ? e.message : 'Không chọn được theo bộ lọc.')
    } finally {
      setSelectScopeBusy(false)
    }
  }, [
    db,
    profile,
    filtered,
    listNeedsFullScope,
    scopeFetchTruncated,
    hoDQueryLabels,
    leadServerFilters,
    can,
    effectiveOrgId,
    scoreMinInput,
    scoreMaxInput,
    profileScoringActive,
    scoreByLeadId,
    tagClientEval,
    tagFilter,
    effectiveLeadTag,
    assigneeFilter,
    callWorkBucketFilter,
    dispositionFilter,
    urlQuery,
    counselorDirectoryLabelById,
  ])

  const applyBulkReassign = useCallback(async () => {
    if (!db || !profile || !selectedIds.size) return
    const ids = [...selectedIds]

    if (!isElevatedLeadScope && canPeerReassignLeads) {
      for (const id of ids) {
        const row = resolveLeadForBulk(id)
        if (!row) {
          window.alert(
            'Có hồ sơ chưa tải đủ để kiểm tra quyền — bỏ chọn hoặc bấm lại «Chọn tất cả theo lọc».',
          )
          return
        }
        const owner = leadAssignedUid(row)
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
      team.add(profile.id)
      for (const id of ids) {
        const row = resolveLeadForBulk(id)
        if (!row) {
          window.alert('Có hồ sơ chưa tải đủ — bỏ chọn hoặc bấm lại «Chọn tất cả theo lọc».')
          return
        }
        const owner = leadAssignedUid(row)
        // Chưa gán hoặc đang trong nhóm → được phân; ngoài nhóm → chặn.
        if (owner && !team.has(owner)) {
          window.alert('Có hồ sơ nằm ngoài phạm vi nhóm — bỏ chọn hoặc liên hệ Quản trị.')
          return
        }
      }
      if (bulkAssignMode === 'single') {
        if (!team.has(bulkReassignUid)) {
          window.alert('Chỉ được gán cho TVV trong nhóm bạn quản lý.')
          return
        }
      } else {
        for (const uid of bulkAssignPoolIds) {
          if (!team.has(uid)) {
            window.alert('Chỉ được chia cho TVV trong nhóm bạn quản lý.')
            return
          }
        }
      }
    }

    let plan
    try {
      plan = planLeadAssignments(
        ids,
        bulkAssignMode === 'single' ? [bulkReassignUid] : bulkAssignPoolIds,
        bulkAssignMode,
        {
          singleUid: bulkReassignUid,
          currentLoads: assignmentLoadByUid,
        },
      )
    } catch (e) {
      window.alert(e instanceof Error ? e.message : 'Không lập được kế hoạch phân lead.')
      return
    }

    setBulkBusy(true)
    setBulkReassignProgress({ done: 0, total: ids.length })
    setRescoreMsg(null)

    let items: Array<{
      leadId: string
      counselorUid: string
      prevOwner: string | null
      extraPatch: Record<string, unknown>
      localPatch: Partial<Lead>
    }> = []

    const applyCommitted = (committedIds: string[]) => {
      for (const id of committedIds) {
        const item = items.find((x) => x.leadId === id)
        if (!item) continue
        applyLocalLeadPatch(id, item.localPatch)
        setSelected((p) => (p?.id === id ? { ...p, ...item.localPatch } : p))
        const cached = selectScopeLeadsRef.current.get(id)
        if (cached) selectScopeLeadsRef.current.set(id, { ...cached, ...item.localPatch })
      }
    }

    try {
      const touch = leadTouchPatch()
      items = ids.map((leadId) => {
        const counselorUid = (plan.assignments.get(leadId) ?? '').trim()
        if (!counselorUid) {
          throw new Error(`Không xác định được người nhận cho hồ sơ ${leadId.slice(0, 8)}…`)
        }
        const prev = resolveLeadForBulk(leadId)
        const prevOwner = prev ? leadAssignedUid(prev) ?? null : null
        const assignPatch = assigneeFirestoreMirror(counselorUid) as Partial<Lead>
        const scoreFields = prev
          ? persistedLeadScoringFields(
              prev,
              assignPatch,
              activeScoringProfile,
              scoringMasterBuckets,
              schoolTvvSignalDefs,
              scoringPersistOpts,
            )
          : {}
        return {
          leadId,
          counselorUid,
          prevOwner,
          extraPatch: { ...scoreFields } as Record<string, unknown>,
          localPatch: { ...assignPatch, ...scoreFields, ...touch } as Partial<Lead>,
        }
      })

      const { committedIds } = await bulkReassignLeads(
        db,
        items.map(({ leadId, counselorUid, extraPatch }) => ({ leadId, counselorUid, extraPatch })),
        {
          onProgress: (done, total) => setBulkReassignProgress({ done, total }),
        },
      )
      applyCommitted(committedIds)
      const performer = profile.displayName?.trim() || profile.email || profile.id
      const modeLabel =
        bulkAssignMode === 'single'
          ? 'một người'
          : bulkAssignMode === 'round_robin'
            ? 'chia đều'
            : 'theo tải thấp nhất'
      const itemById = new Map(items.map((it) => [it.leadId, it]))
      const writeAuditSample = async (committed: string[]) => {
        for (const id of committed.slice(0, 40)) {
          const item = itemById.get(id)
          const uid = item?.counselorUid ?? plan.assignments.get(id) ?? ''
          const targetLabel =
            bulkReassignTargets.find((c) => c.id === uid)?.displayName?.trim() ||
            bulkReassignTargets.find((c) => c.id === uid)?.email ||
            reassignPickList.find((c) => c.id === uid)?.displayName?.trim() ||
            reassignPickList.find((c) => c.id === uid)?.email ||
            uid
          const before = item?.prevOwner ?? '—'
          await commitAuditLog(db, {
            leadId: id,
            actionType: 'REASSIGNMENT',
            description: `Phân công hàng loạt (${modeLabel}) → ${targetLabel} (trước: ${before})`,
            performedBy: profile.id,
            performedByName: performer,
          })
        }
      }
      await writeAuditSample(committedIds)
      setBulkModal(null)
      setSelectedIds(new Set())
      selectScopeLeadsRef.current = new Map()
      const auditNote =
        committedIds.length > 40
          ? ` (đã ghi nhật ký mẫu ${Math.min(40, committedIds.length)} hồ sơ)`
          : ''
      setRescoreMsg(
        `Đã giao việc ${committedIds.length.toLocaleString('vi-VN')} hồ sơ · ${summarizeAssignPlan(plan)}${auditNote}.`,
      )
      refetchLeads()
    } catch (e) {
      console.error(e)
      if (e instanceof BulkReassignPartialError) {
        applyCommitted(e.committedIds)
        if (e.committedIds.length && items.length) {
          try {
            const performer = profile.displayName?.trim() || profile.email || profile.id
            const modeLabel =
              bulkAssignMode === 'single'
                ? 'một người'
                : bulkAssignMode === 'round_robin'
                  ? 'chia đều'
                  : 'theo tải thấp nhất'
            const itemById = new Map(items.map((it) => [it.leadId, it]))
            for (const id of e.committedIds.slice(0, 40)) {
              const item = itemById.get(id)
              const uid = item?.counselorUid ?? ''
              const targetLabel =
                bulkReassignTargets.find((c) => c.id === uid)?.displayName?.trim() ||
                bulkReassignTargets.find((c) => c.id === uid)?.email ||
                reassignPickList.find((c) => c.id === uid)?.displayName?.trim() ||
                reassignPickList.find((c) => c.id === uid)?.email ||
                uid
              await commitAuditLog(db, {
                leadId: id,
                actionType: 'REASSIGNMENT',
                description: `Phân công hàng loạt (${modeLabel}) → ${targetLabel} (trước: ${item?.prevOwner ?? '—'})`,
                performedBy: profile.id,
                performedByName: performer,
              })
            }
          } catch (auditErr) {
            console.error(auditErr)
          }
        }
        setBulkModal(null)
        setSelectedIds(new Set(e.remainingIds))
        setRescoreMsg(e.message)
        refetchLeads()
      } else {
        setRescoreMsg(e instanceof Error ? e.message : 'Không giao việc hàng loạt được.')
      }
    } finally {
      setBulkBusy(false)
      setBulkReassignProgress(null)
    }
  }, [
    db,
    profile,
    selectedIds,
    resolveLeadForBulk,
    isElevatedLeadScope,
    canPeerReassignLeads,
    directoryUsers,
    bulkAssignMode,
    bulkReassignUid,
    bulkAssignPoolIds,
    assignmentLoadByUid,
    activeScoringProfile,
    scoringMasterBuckets,
    schoolTvvSignalDefs,
    scoringPersistOpts,
    bulkReassignTargets,
    reassignPickList,
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
              scoringPersistOpts,
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

  const applyBulkPriorityTag = useCallback(async () => {
    if (!db || !profile || !selectedIds.size) return
    setBulkBusy(true)
    setRescoreMsg(null)
    const ids = [...selectedIds]
    const touch = leadTouchPatch()
    const applyCommitted = (committedIds: string[]) => {
      for (const id of committedIds) {
        const localPatch = { priorityTag: bulkPriorityTag, ...touch } as Partial<Lead>
        applyLocalLeadPatch(id, localPatch)
        setSelected((p) => (p?.id === id ? { ...p, ...localPatch } : p))
      }
    }
    try {
      const { committedIds } = await bulkSetLeadPriorityTags(db, ids, bulkPriorityTag)
      applyCommitted(committedIds)
      const performer = profile.displayName || profile.email || profile.id
      for (const id of committedIds.slice(0, 40)) {
        await commitAuditLog(db, {
          leadId: id,
          actionType: 'SYSTEM_UPDATE',
          description: `Gán nhãn phân loại hàng loạt → ${bulkPriorityTag}`,
          performedBy: profile.id,
          performedByName: performer,
        })
      }
      setBulkModal(null)
      setSelectedIds(new Set())
      const auditNote =
        committedIds.length > 40
          ? ` (đã ghi nhật ký mẫu ${Math.min(40, committedIds.length)} hồ sơ)`
          : ''
      setRescoreMsg(`Đã gán nhãn ${bulkPriorityTag} cho ${committedIds.length} hồ sơ.${auditNote}`)
      refetchLeads()
    } catch (e) {
      console.error(e)
      if (e instanceof BulkPriorityPartialError) {
        applyCommitted(e.committedIds)
        setBulkModal(null)
        setSelectedIds(new Set(e.remainingIds))
        setRescoreMsg(e.message)
        refetchLeads()
      } else {
        setRescoreMsg(e instanceof Error ? e.message : 'Không gán được nhãn hàng loạt.')
      }
    } finally {
      setBulkBusy(false)
    }
  }, [db, profile, selectedIds, bulkPriorityTag, applyLocalLeadPatch, refetchLeads])

  const applyBulkDelete = useCallback(async () => {
    if (!db || !profile || !canDeleteLeads || !selectedIds.size || bulkBusy) return
    const ids = [...selectedIds]
    const n = ids.length
    setBulkBusy(true)
    setRescoreMsg(`Đang xóa ${n.toLocaleString('vi-VN')} hồ sơ đã chọn…`)
    try {
      const { deleted, deletedIds } = await bulkDeleteLeads(db, ids)
      const deletedSet = new Set(deletedIds)
      removeLocalLeads(deletedIds)
      setSelectedIds(new Set())
      if (selected && deletedSet.has(selected.id)) {
        setSelected(null)
        leadDetailUnsavedRef.current = false
      }
      const performer = profile.displayName?.trim() || profile.email || profile.id
      for (const id of deletedIds.slice(0, 12)) {
        const name = leads.find((l) => l.id === id)?.fullName?.trim() || id.slice(0, 8)
        await commitAuditLog(db, {
          leadId: id,
          actionType: 'SYSTEM_UPDATE',
          description: `Xóa hồ sơ «${name}»`,
          performedBy: profile.id,
          performedByName: performer,
        }).catch(() => {})
      }
      setRescoreMsg(`Đã xóa ${deleted} hồ sơ.`)
      void refetchLeads()
    } catch (e) {
      if (e instanceof BulkDeleteLeadsPartialError) {
        removeLocalLeads(e.deletedIds)
        setSelectedIds(new Set(e.remainingIds))
        if (selected && e.deletedIds.includes(selected.id)) {
          setSelected(null)
          leadDetailUnsavedRef.current = false
        }
        setRescoreMsg(e.message)
        void refetchLeads()
      } else {
        console.error(e)
        setRescoreMsg(e instanceof Error ? e.message : 'Không xóa được hồ sơ.')
      }
    } finally {
      setBulkBusy(false)
    }
  }, [
    db,
    profile,
    canDeleteLeads,
    selectedIds,
    selected,
    leads,
    bulkBusy,
    removeLocalLeads,
    refetchLeads,
  ])

  /**
   * Xóa nhanh cả lô theo chương trình (vd. file Excel nhập sai),
   * hoặc theo đúng bộ lọc đang bật — chỉ Admin (`leads:delete`).
   */
  const deleteEntireBatch = useCallback(
    async (mode: 'program' | 'filters', programKey?: string) => {
      if (!db || !profile || !canDeleteLeads || bulkBusy || selectScopeBusy) return

      const prog =
        mode === 'program'
          ? (
              programKey ??
              (programFilterActive
                ? programFilter
                : draftFilters.program !== 'ALL'
                  ? draftFilters.program
                  : '')
            ).trim()
          : ''
      if (mode === 'program' && !prog) {
        setRescoreMsg('Chọn chương trình (chip hoặc bộ lọc) rồi bấm xóa cả lô — có thể chưa cần Áp dụng lọc.')
        return
      }
      if (mode === 'filters' && activeFilterChips.length === 0) {
        setRescoreMsg('Hãy lọc trước (chương trình, nguồn…) rồi mới xóa cả lô theo lọc.')
        return
      }

      const scopeLabel =
        mode === 'program'
          ? prog === '__UNSET__'
            ? 'chưa gắn chương trình'
            : `chương trình «${prog}»`
          : `bộ lọc hiện tại (${activeFilterChips.length} điều kiện)`

      // Một lần bấm = xóa ngay (không confirm / không gõ lại tên).
      setSelectScopeBusy(true)
      setBulkBusy(true)
      setRescoreMsg(`Đang quét hồ sơ thuộc ${scopeLabel}…`)

      /** Xóa theo chương trình: quét + xóa lặp đến hết (không kẹt ~1500). */
      if (mode === 'program') {
        try {
          let totalDeleted = 0
          let round = 0

          while (round < 50) {
            round += 1
            const collected = await collectLeadIdsByIntakeProgram(
              db,
              profile,
              hoDQueryLabels,
              prog,
              {
                canReadGlobal: can('leads:read:global'),
                orgId: effectiveOrgId,
                onProgress: (scanned, matched) =>
                  setRescoreMsg(
                    `Đang quét… đã xem ${scanned.toLocaleString('vi-VN')} · khớp ${matched.toLocaleString('vi-VN')}`,
                  ),
              },
            )
            if (!collected.ids.length) {
              if (round === 1) {
                setRescoreMsg(
                  `Không tìm thấy hồ sơ thuộc ${scopeLabel} (đã quét ${collected.scanned.toLocaleString('vi-VN')} bản ghi). Kiểm tra đúng tên chương trình trên hồ sơ.`,
                )
              } else {
                setRescoreMsg(
                  `Đã xóa hết ${totalDeleted.toLocaleString('vi-VN')} hồ sơ thuộc ${scopeLabel}.`,
                )
                void refetchLeads()
              }
              return
            }

            setRescoreMsg(`Đang xóa ${totalDeleted.toLocaleString('vi-VN')}… (+${collected.ids.length})`)
            try {
              const { deleted, deletedIds } = await bulkDeleteLeads(db, collected.ids, {
                onProgress: (done, total) =>
                  setRescoreMsg(
                    `Đang xóa ${(totalDeleted + done).toLocaleString('vi-VN')} (lô ${done}/${total})…`,
                  ),
              })
              totalDeleted += deleted
              removeLocalLeads(deletedIds)
              const deletedSet = new Set(deletedIds)
              if (selected && deletedSet.has(selected.id)) {
                setSelected(null)
                leadDetailUnsavedRef.current = false
              }
            } catch (e) {
              if (e instanceof BulkDeleteLeadsPartialError) {
                totalDeleted += e.deletedIds.length
                removeLocalLeads(e.deletedIds)
                setRescoreMsg(
                  `${e.message}\nĐã xóa cộng dồn ${totalDeleted.toLocaleString('vi-VN')} hồ sơ.`,
                )
                void refetchLeads()
                return
              }
              throw e
            }

            if (!collected.mayHaveMore) break
            setRescoreMsg(
              `Đã xóa ${totalDeleted.toLocaleString('vi-VN')} — đang quét tiếp phần còn lại…`,
            )
          }

          setSelectedIds(new Set())
          selectScopeLeadsRef.current = new Map()
          const performer = profile.displayName?.trim() || profile.email || profile.id
          await commitAuditLog(db, {
            leadId: 'batch',
            actionType: 'SYSTEM_UPDATE',
            description: `Xóa cả lô (${totalDeleted} hồ sơ) — ${scopeLabel}`,
            performedBy: profile.id,
            performedByName: performer,
          }).catch(() => {})
          setRescoreMsg(
            `Đã xóa hết ${totalDeleted.toLocaleString('vi-VN')} hồ sơ thuộc ${scopeLabel}.`,
          )
          void refetchLeads()
        } catch (e) {
          console.error(e)
          setRescoreMsg(e instanceof Error ? e.message : 'Không xóa được cả lô.')
        } finally {
          setSelectScopeBusy(false)
          setBulkBusy(false)
        }
        return
      }

      let rows: Lead[] = []
      let truncated = false
      try {
        if (listNeedsFullScope) {
          rows = filtered
          truncated = Boolean(scopeFetchTruncated)
        } else {
          const fetched = await fetchLeadsInScopeForRescore(
            db,
            profile,
            hoDQueryLabels,
            leadServerFilters,
            {
              maxLeads: PURGE_PROGRAM_HARD_CAP,
              canReadGlobal: can('leads:read:global'),
              orgId: effectiveOrgId,
            },
          )
          truncated = fetched.truncated
          rows = fetched.leads
          const minScore =
            scoreMinInput.trim() === '' || Number.isNaN(Number(scoreMinInput))
              ? null
              : Number(scoreMinInput)
          const maxScore =
            scoreMaxInput.trim() === '' || Number.isNaN(Number(scoreMaxInput))
              ? null
              : Number(scoreMaxInput)
          if (minScore != null || maxScore != null) {
            rows = rows.filter((l) => {
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
          if (callWorkBucketFilter !== 'all') {
            rows = rows.filter((l) => leadMatchesCallWorkBucket(l, callWorkBucketFilter))
          }
          if (dispositionFilter !== 'all') {
            rows = rows.filter((l) => leadMatchesDisposition(l, dispositionFilter))
          }
          if (urlQuery.trim()) {
            rows = rows.filter((l) =>
              leadMatchesClientSearch(l, urlQuery.trim().toLowerCase(), counselorDirectoryLabelById),
            )
          }
        }
      } catch (e) {
        console.error(e)
        setRescoreMsg(e instanceof Error ? e.message : 'Không quét được hồ sơ để xóa.')
        setSelectScopeBusy(false)
        setBulkBusy(false)
        return
      } finally {
        setSelectScopeBusy(false)
      }

      if (!rows.length) {
        setRescoreMsg(`Không có hồ sơ nào thuộc ${scopeLabel}.`)
        setBulkBusy(false)
        return
      }

      const n = rows.length
      const ids = rows.map((l) => l.id)
      setRescoreMsg(
        truncated
          ? `Đang xóa 0/${n}… (đã chạm trần ${PURGE_PROGRAM_HARD_CAP.toLocaleString('vi-VN')} — có thể còn hồ sơ; chạy lại nếu cần)`
          : `Đang xóa 0/${n}…`,
      )
      try {
        const { deleted, deletedIds } = await bulkDeleteLeads(db, ids, {
          onProgress: (done, total) => setRescoreMsg(`Đang xóa ${done}/${total}…`),
        })
        const deletedSet = new Set(deletedIds)
        removeLocalLeads(deletedIds)
        setSelectedIds(new Set())
        selectScopeLeadsRef.current = new Map()
        if (selected && deletedSet.has(selected.id)) {
          setSelected(null)
          leadDetailUnsavedRef.current = false
        }
        const performer = profile.displayName?.trim() || profile.email || profile.id
        await commitAuditLog(db, {
          leadId: deletedIds[0] ?? 'batch',
          actionType: 'SYSTEM_UPDATE',
          description: `Xóa cả lô (${deleted} hồ sơ) — ${scopeLabel}`,
          performedBy: profile.id,
          performedByName: performer,
        }).catch(() => {})
        setRescoreMsg(`Đã xóa ${deleted.toLocaleString('vi-VN')} hồ sơ thuộc ${scopeLabel}.`)
        void refetchLeads()
      } catch (e) {
        if (e instanceof BulkDeleteLeadsPartialError) {
          removeLocalLeads(e.deletedIds)
          setSelectedIds(new Set(e.remainingIds))
          if (selected && e.deletedIds.includes(selected.id)) {
            setSelected(null)
            leadDetailUnsavedRef.current = false
          }
          setRescoreMsg(e.message)
          void refetchLeads()
        } else {
          console.error(e)
          setRescoreMsg(e instanceof Error ? e.message : 'Không xóa được cả lô.')
        }
      } finally {
        setBulkBusy(false)
      }
    },
    [
      db,
      profile,
      canDeleteLeads,
      bulkBusy,
      selectScopeBusy,
      programFilterActive,
      programFilter,
      draftFilters.program,
      activeFilterChips.length,
      hoDQueryLabels,
      can,
      effectiveOrgId,
      listNeedsFullScope,
      filtered,
      scopeFetchTruncated,
      leadServerFilters,
      scoreMinInput,
      scoreMaxInput,
      profileScoringActive,
      scoreByLeadId,
      tagClientEval,
      tagFilter,
      effectiveLeadTag,
      assigneeFilter,
      callWorkBucketFilter,
      dispositionFilter,
      urlQuery,
      counselorDirectoryLabelById,
      selected,
      removeLocalLeads,
      refetchLeads,
    ],
  )

  const applyBulkIntakeProgram = useCallback(
    async (mode: 'set' | 'clear' = 'set') => {
      if (!db || !profile || !selectedIds.size) return
      const label = normalizeIntakeProgramLabel(bulkIntakeProgram)
      const clear = mode === 'clear' || !label
      if (mode === 'set' && !label) {
        setRescoreMsg('Nhập tên chương trình trước khi gán, hoặc dùng «Gỡ gắn».')
        return
      }
      setBulkBusy(true)
      setRescoreMsg(null)
      const ids = [...selectedIds]
      const touch = leadTouchPatch()
      const applyCommitted = (committedIds: string[]) => {
        for (const id of committedIds) {
          const localPatch = {
            ...(clear ? { intakeProgram: undefined } : { intakeProgram: label }),
            ...touch,
          } as Partial<Lead>
          applyLocalLeadPatch(id, localPatch)
          setSelected((p) => {
            if (p?.id !== id) return p
            if (clear) {
              const { intakeProgram: _drop, ...rest } = { ...p, ...touch }
              return rest as Lead
            }
            return { ...p, ...localPatch }
          })
        }
      }
      try {
        const { committedIds } = await bulkSetLeadIntakeProgram(db, ids, clear ? null : label)
        applyCommitted(committedIds)
        if (!clear) setBulkIntakeProgramRecent(rememberIntakeProgram(label))
        const performer = profile.displayName || profile.email || profile.id
        const desc = clear
          ? 'Gỡ chương trình / đợt nhập (đặt chưa gắn) hàng loạt'
          : `Gán chương trình hàng loạt → ${label}`
        for (const id of committedIds.slice(0, 40)) {
          await commitAuditLog(db, {
            leadId: id,
            actionType: 'SYSTEM_UPDATE',
            description: desc,
            performedBy: profile.id,
            performedByName: performer,
          })
        }
        setBulkModal(null)
        setSelectedIds(new Set())
        const auditNote =
          committedIds.length > 40
            ? ` (đã ghi nhật ký mẫu ${Math.min(40, committedIds.length)} hồ sơ)`
            : ''
        setRescoreMsg(
          clear
            ? `Đã gỡ chương trình cho ${committedIds.length} hồ sơ (chưa gắn).${auditNote}`
            : `Đã gán chương trình «${label}» cho ${committedIds.length} hồ sơ.${auditNote}`,
        )
        refetchLeads()
      } catch (e) {
        console.error(e)
        if (e instanceof BulkIntakeProgramPartialError) {
          applyCommitted(e.committedIds)
          if (!clear && e.committedIds.length) setBulkIntakeProgramRecent(rememberIntakeProgram(label))
          setBulkModal(null)
          setSelectedIds(new Set(e.remainingIds))
          setRescoreMsg(e.message)
          refetchLeads()
        } else {
          setRescoreMsg(e instanceof Error ? e.message : 'Không gán được chương trình hàng loạt.')
        }
      } finally {
        setBulkBusy(false)
      }
    },
    [db, profile, selectedIds, bulkIntakeProgram, applyLocalLeadPatch, refetchLeads],
  )

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
    <div className="bento-board gap-4">
      <BentoCell variant="hero" className="!p-4 sm:!p-5">
        <AppPageHeader
          title="Hồ sơ"
          meta={
            <span className="text-indigo-100/90">
              Tìm · lọc · gọi · cập nhật — xếp Gọi lại → Chưa gọi → Đã xử lý
            </span>
          }
          className="!mb-0 [&_h1]:text-2xl [&_h1]:text-white sm:[&_h1]:text-3xl [&_.text-slate-500]:text-indigo-100/85"
        />
      </BentoCell>

      {!configured || !db ? (
        <div className="flex justify-end">
          <span className="rounded-full border border-amber-300/70 bg-amber-50 px-3 py-1 text-sm text-amber-900">
            Firebase chưa cấu hình.
          </span>
        </div>
      ) : null}

      {error ? (
        <div className="rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-base text-rose-900 shadow-sm backdrop-blur-xl">
          {error}
        </div>
      ) : null}

      <BentoCell className="space-y-4 !p-4 sm:!p-5">
        {/* Tổng kết nhẹ — luôn hiện */}
        <div
          className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-slate-200/70 bg-slate-50/90 px-3 py-2.5 text-sm text-slate-600"
          role="status"
          aria-live="polite"
        >
          <span>
            Tổng{' '}
            <strong className="tabular-nums text-slate-900">
              {(scopeBaselineTotal ?? totalLeadCount)?.toLocaleString('vi-VN') ?? '…'}
            </strong>
          </span>
          <span className="hidden h-3 w-px bg-slate-200 sm:inline" aria-hidden />
          <span>
            {activeFilterChips.length > 0 ? 'Khớp lọc' : 'Đang xem'}{' '}
            <strong className="tabular-nums text-amber-900">
              {loading ? '…' : filterMatchCount.toLocaleString('vi-VN')}
            </strong>
            {activeFilterChips.length > 0 ? (
              <span className="text-slate-500"> · {activeFilterChips.length} điều kiện</span>
            ) : null}
          </span>
          {tagChipCounts ? (
            <>
              <span className="hidden h-3 w-px bg-slate-200 sm:inline" aria-hidden />
              <span className="inline-flex flex-wrap items-center gap-1.5 tabular-nums">
                <span className="text-rose-700">HOT {tagChipCounts.HOT}</span>
                <span className="text-amber-800">WARM {tagChipCounts.WARM}</span>
                <span className="text-sky-800">COLD {tagChipCounts.COLD}</span>
              </span>
            </>
          ) : null}
          {programSummary.rows.length > 0 || programSummary.unset > 0 ? (
            <>
              <span className="hidden h-3 w-px bg-slate-200 sm:inline" aria-hidden />
              <span className="min-w-0 flex-1 basis-full sm:basis-auto">
                <span className="mr-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                  Chương trình{programSummary.sampleOnly ? ' (trang này)' : ''}
                </span>
                <span className="inline-flex flex-wrap gap-1">
                  {programSummary.rows.map(([name, n]) => (
                    <span
                      key={name}
                      className={[
                        'inline-flex h-6 max-w-[14rem] items-stretch overflow-hidden rounded border',
                        draftFilters.program === name || programFilter === name
                          ? 'border-amber-400 bg-amber-100 text-amber-950'
                          : 'border-slate-200/90 bg-white text-slate-700',
                      ].join(' ')}
                    >
                      <button
                        type="button"
                        title={`Lọc chương trình «${name}»`}
                        onClick={() => applyProgramFilterQuick(name)}
                        className="inline-flex min-w-0 max-w-[11rem] items-center gap-1 truncate px-1.5 text-[11px] font-medium transition hover:bg-amber-50/80"
                      >
                        <span className="truncate">{name}</span>
                        <span className="shrink-0 tabular-nums text-slate-500">{n}</span>
                      </button>
                      {canDeleteLeads ? (
                        <button
                          type="button"
                          title={`Xóa cả lô chương trình «${name}»`}
                          disabled={bulkBusy || selectScopeBusy}
                          onClick={() => void deleteEntireBatch('program', name)}
                          className="inline-flex shrink-0 items-center border-l border-inherit px-1 text-rose-700 transition hover:bg-rose-100 disabled:opacity-40"
                        >
                          <Trash2 className="h-3 w-3" strokeWidth={2.25} aria-hidden />
                          <span className="sr-only">Xóa cả lô</span>
                        </button>
                      ) : null}
                    </span>
                  ))}
                  {programSummary.unset > 0 ? (
                    <span
                      className={[
                        'inline-flex h-6 items-stretch overflow-hidden rounded border',
                        draftFilters.program === '__UNSET__' || programFilter === '__UNSET__'
                          ? 'border-slate-500 bg-slate-700 text-white'
                          : 'border-dashed border-slate-300 bg-white text-slate-600',
                      ].join(' ')}
                    >
                      <button
                        type="button"
                        title="Lọc hồ sơ chưa gắn chương trình"
                        onClick={() => applyProgramFilterQuick('__UNSET__')}
                        className="inline-flex items-center gap-1 px-1.5 text-[11px] font-medium"
                      >
                        Chưa gắn <span className="tabular-nums">{programSummary.unset}</span>
                      </button>
                      {canDeleteLeads ? (
                        <button
                          type="button"
                          title="Xóa cả lô hồ sơ chưa gắn chương trình"
                          disabled={bulkBusy || selectScopeBusy}
                          onClick={() => void deleteEntireBatch('program', '__UNSET__')}
                          className="inline-flex shrink-0 items-center border-l border-inherit px-1 text-rose-300 transition hover:bg-rose-900/40 disabled:opacity-40"
                        >
                          <Trash2 className="h-3 w-3" strokeWidth={2.25} aria-hidden />
                          <span className="sr-only">Xóa cả lô</span>
                        </button>
                      ) : null}
                    </span>
                  ) : null}
                </span>
              </span>
            </>
          ) : null}
        </div>

        {/* Tìm kiếm + thao tác chính */}
        <div className="flex flex-wrap items-end gap-2.5">
          <label className={`${LEAD_FILTER_LABEL} min-w-[14rem] flex-1`}>
            <span>Tìm kiếm</span>
            <input
              value={searchParams.get(LWF.Q) ?? ''}
              onChange={(e) => setUrlQuery(e.target.value)}
              placeholder="Tên, SĐT, mã KH, TVV…"
              title="Tìm trong các thông tin hiển thị trên hồ sơ (tên, SĐT, mã KH, mô tả, TVV…)."
              className={LEAD_FILTER_CONTROL}
            />
          </label>
          <div className="flex flex-wrap items-center gap-2">
            {canCreateManualLead && configured && db ? (
              <button
                type="button"
                onClick={() => setCreateLeadOpen(true)}
                className={`${LEAD_BTN} border-emerald-500 bg-indigo-600 text-white hover:bg-indigo-700`}
                title="Tạo hồ sơ ứng viên mới"
              >
                <UserPlus className="h-4 w-4 shrink-0" aria-hidden />
                Tạo mới
              </button>
            ) : null}
            <button
              type="button"
              title="Bật/tắt lọc AI Shortlist ngay"
              onClick={() => {
                const next = !draftFilters.aiShortlistOnly
                setDraftFilters((prev) => ({ ...prev, aiShortlistOnly: next }))
                setAiShortlistOnly(next)
                setPage(1)
              }}
              className={[
                LEAD_BTN,
                draftFilters.aiShortlistOnly
                  ? 'border-amber-400 bg-amber-400 text-amber-950'
                  : 'border-slate-200 bg-white text-slate-700 hover:border-amber-300 hover:bg-amber-50/80',
              ].join(' ')}
            >
              <Zap className="h-3.5 w-3.5 shrink-0" strokeWidth={2.5} aria-hidden />
              AI
            </button>
            <button
              type="button"
              onClick={() => setAiShortlistGuideOpen(true)}
              className={`${LEAD_BTN} border-slate-200 bg-white text-slate-700 hover:border-amber-300 hover:bg-amber-50/80`}
              title="Hướng dẫn AI Shortlist"
            >
              <CircleHelp className="h-3.5 w-3.5 shrink-0 text-amber-700" strokeWidth={2.25} aria-hidden />
              HD
            </button>
            {canBulkWrite && showBulkReassign ? (
              <button
                type="button"
                disabled={selectScopeBusy || loading || !filtered.length}
                onClick={() => void selectAllMatchingFilters()}
                className={`${LEAD_BTN} border-violet-300 bg-violet-50 text-violet-950 hover:border-violet-400 hover:bg-violet-100 disabled:opacity-40`}
                title={`Chọn mọi hồ sơ khớp lọc (tối đa ${LEADS_UI_FULL_SCOPE_MAX.toLocaleString('vi-VN')}).`}
              >
                <UserPlus className="h-3.5 w-3.5 shrink-0" aria-hidden />
                {selectScopeBusy
                  ? 'Đang chọn…'
                  : listNeedsFullScope
                    ? `Chọn lọc (${filtered.length.toLocaleString('vi-VN')})`
                    : 'Chọn theo lọc'}
              </button>
            ) : null}
            <button
              type="button"
              onClick={applyDraftFilters}
              disabled={!filtersPendingApply}
              className={[
                LEAD_BTN,
                filtersPendingApply
                  ? 'border-amber-500 bg-amber-500 text-amber-950 hover:bg-amber-600'
                  : 'border-slate-200 bg-slate-100 text-slate-400',
              ].join(' ')}
              title="Chạy bộ lọc đã chọn trên danh sách hồ sơ"
            >
              Áp dụng lọc
            </button>
            {filtersPendingApply ? (
              <button
                type="button"
                onClick={discardDraftFilters}
                className={`${LEAD_BTN} border-slate-200 bg-white text-slate-600 hover:bg-slate-50`}
                title="Hoàn tác lựa chọn về bộ lọc đang chạy"
              >
                Hủy chọn
              </button>
            ) : null}
            <button
              type="button"
              onClick={clearQuickFilters}
              disabled={activeFilterChips.length === 0 && !filtersPendingApply}
              className={`${LEAD_BTN} border-slate-300 bg-white text-slate-700 hover:border-rose-300 hover:bg-rose-50 hover:text-rose-900 disabled:opacity-40`}
            >
              Xóa lọc
            </button>
            {canDeleteLeads &&
            (programFilterActive || draftFilters.program !== 'ALL') ? (
              <button
                type="button"
                disabled={bulkBusy || selectScopeBusy || loading}
                onClick={() =>
                  void deleteEntireBatch(
                    'program',
                    programFilterActive ? programFilter : draftFilters.program,
                  )
                }
                className={`${LEAD_BTN} border-rose-400 bg-rose-600 text-white hover:bg-rose-700 disabled:opacity-40`}
                title={
                  (programFilterActive ? programFilter : draftFilters.program) === '__UNSET__'
                    ? 'Xóa hết hồ sơ chưa gắn chương trình'
                    : `Xóa hết hồ sơ chương trình «${programFilterActive ? programFilter : draftFilters.program}»`
                }
              >
                <Trash2 className="h-3.5 w-3.5 shrink-0" aria-hidden />
                {bulkBusy || selectScopeBusy ? 'Đang xóa…' : 'Xóa hết lô'}
              </button>
            ) : null}
            {canDeleteLeads && !programFilterActive && activeFilterChips.length > 0 ? (
              <button
                type="button"
                disabled={bulkBusy || selectScopeBusy || loading}
                onClick={() => void deleteEntireBatch('filters')}
                className={`${LEAD_BTN} border-rose-300 bg-rose-50 text-rose-900 hover:border-rose-400 hover:bg-rose-100 disabled:opacity-40`}
                title="Xóa toàn bộ hồ sơ đang khớp bộ lọc hiện tại"
              >
                <Trash2 className="h-3.5 w-3.5 shrink-0" aria-hidden />
                {bulkBusy || selectScopeBusy ? 'Đang xóa…' : 'Xóa theo lọc'}
              </button>
            ) : null}
          </div>
        </div>

        {/* Tổng kết hàng chờ của tôi + lọc nhanh */}
        <div className="flex flex-col gap-3 border-t border-slate-200/60 pt-3">
          {myCallWorkSummary.total > 0 ? (
            <BentoGrid className="w-full sm:!grid-cols-2 lg:!grid-cols-4">
              <button
                type="button"
                onClick={() => applyCallQueueQuick('callback', { pinMine: true })}
                className="bento-stat bento-cell cursor-pointer border-amber-200/90 !bg-amber-50/95 text-left hover:border-amber-400"
                title="Mở hàng chờ gọi lại của bạn"
              >
                <p className="bento-stat__label !text-amber-800">Cần gọi lại</p>
                <p className="bento-stat__value !text-amber-950">
                  {myCallWorkSummary.callback.toLocaleString('vi-VN')}
                </p>
              </button>
              <button
                type="button"
                onClick={() => applyCallQueueQuick('uncalled', { pinMine: true })}
                className="bento-stat bento-cell cursor-pointer border-sky-200/90 !bg-sky-50/95 text-left hover:border-sky-400"
                title="Mở hồ sơ chưa gọi của bạn"
              >
                <p className="bento-stat__label !text-sky-800">Chưa gọi</p>
                <p className="bento-stat__value !text-sky-950">
                  {myCallWorkSummary.uncalled.toLocaleString('vi-VN')}
                </p>
              </button>
              <button
                type="button"
                onClick={() => applyCallQueueQuick('called', { pinMine: true })}
                className="bento-stat bento-cell bento-cell--accent cursor-pointer text-left"
                title="Đã xử lý = không còn trong hàng chờ gọi lại (không phải mọi lần bấm gọi)"
              >
                <p className="bento-stat__label">Đã xử lý</p>
                <p className="bento-stat__value">
                  {myCallWorkSummary.called.toLocaleString('vi-VN')}
                </p>
              </button>
              <BentoStat
                label="Còn lại / tổng của tôi"
                value={
                  <>
                    {myCallWorkSummary.remaining.toLocaleString('vi-VN')}
                    <span className="text-base font-semibold opacity-70">
                      {' '}
                      / {myCallWorkSummary.total.toLocaleString('vi-VN')}
                    </span>
                  </>
                }
                tone="ink"
              />
            </BentoGrid>
          ) : null}
          <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
          <div className="min-w-0">
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">Hàng chờ gọi</p>
            <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Hàng chờ gọi">
              {(
                [
                  { id: 'all' as const, label: 'Tất cả' },
                  { id: 'callback' as const, label: 'Gọi lại' },
                  { id: 'uncalled' as const, label: 'Chưa gọi' },
                  { id: 'called' as const, label: 'Đã xử lý' },
                ] as const
              ).map((tab) => {
                const active = draftFilters.callQueue === tab.id
                return (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => applyCallQueueQuick(tab.id)}
                    className={`inline-flex min-h-10 cursor-pointer items-center rounded-lg px-3 text-sm font-semibold transition ${
                      active
                        ? 'bg-amber-500 text-white shadow-sm'
                        : 'border border-slate-200/95 bg-white text-slate-700 hover:border-amber-300 hover:bg-amber-50/60'
                    }`}
                  >
                    {tab.label}
                  </button>
                )
              })}
            </div>
            <p className="mt-1.5 max-w-lg text-xs leading-snug text-slate-500">
              {myCallWorkSummary.total > 0
                ? 'Bấm ô tổng kết phía trên để mở hàng chờ của bạn.'
                : 'Chưa có hồ sơ gán cho bạn trong danh sách đang tải.'}
            </p>
          </div>
          <label
            className={`${LEAD_FILTER_LABEL} w-[11rem] shrink-0`}
            title="Lọc theo note kết quả sau gọi"
          >
            <span>Note sau gọi</span>
            <select
              value={draftFilters.disposition === 'all' ? 'all' : draftFilters.disposition}
              onChange={(e) => {
                const v = e.target.value
                const next: CallDispositionFilter =
                  v === 'all' || !isCallDispositionId(v) ? 'all' : v
                applyDispositionQuick(next)
              }}
              className={`${LEAD_FILTER_CONTROL} cursor-pointer normal-case tracking-normal`}
            >
              <option value="all">Tất cả note</option>
              {CALL_DISPOSITIONS.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.label}
                </option>
              ))}
            </select>
          </label>
          <div className="min-w-0 flex-1">
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">Nhãn</p>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Lọc nhanh nhãn">
              <button
                type="button"
                disabled={!scoringProfiles.length}
                onClick={() => applyTagQuick('ALL')}
                className={[
                  'inline-flex min-h-10 cursor-pointer items-center rounded-lg border px-3 text-sm font-semibold transition disabled:cursor-not-allowed',
                  draftFilters.tag === 'ALL'
                    ? 'border-slate-700 bg-slate-800 text-white'
                    : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300',
                ].join(' ')}
              >
                Tất cả
              </button>
              {TAG_OPTIONS.map((tg) => {
                const on = draftFilters.tag === tg
                const cnt = tagChipCounts?.[tg]
                return (
                  <button
                    key={tg}
                    type="button"
                    disabled={!scoringProfiles.length}
                    onClick={() => applyTagQuick(tg)}
                    className={[
                      'inline-flex min-h-10 cursor-pointer items-center gap-1.5 rounded-lg border px-3 text-sm font-semibold transition disabled:cursor-not-allowed',
                      on
                        ? tg === 'HOT'
                          ? 'border-rose-500 bg-rose-600 text-white'
                          : tg === 'WARM'
                            ? 'border-amber-500 bg-amber-500 text-amber-950'
                            : tg === 'COLD'
                              ? 'border-sky-400 bg-sky-600 text-white'
                              : 'border-slate-600 bg-slate-700 text-white'
                        : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300',
                    ].join(' ')}
                  >
                    <span>{tg}</span>
                    {cnt !== undefined ? <span className="tabular-nums opacity-90">({cnt})</span> : null}
                  </button>
                )
              })}
            </div>
          </div>
          </div>
        </div>

        {/* Bộ lọc chi tiết */}
        <details className="group rounded-lg border border-slate-200/80 bg-white/60 open:bg-white/90">
          <summary className="flex min-h-10 cursor-pointer list-none items-center gap-2 px-3 text-xs font-semibold uppercase tracking-wide text-slate-600 marker:content-none [&::-webkit-details-marker]:hidden">
            <ChevronDown
              className="h-3.5 w-3.5 shrink-0 text-slate-500 transition duration-200 group-open:rotate-180"
              strokeWidth={2}
              aria-hidden
            />
            <span>Bộ lọc</span>
            {filtersPendingApply ? (
              <span className="rounded bg-sky-100 px-1.5 py-0.5 text-[10px] font-bold normal-case tracking-normal text-sky-900">
                chờ áp dụng
              </span>
            ) : null}
            {activeFilterChips.length > 0 ? (
              <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold normal-case tracking-normal text-amber-900">
                {activeFilterChips.length}
              </span>
            ) : !filtersPendingApply ? (
              <span className="font-normal normal-case tracking-normal text-slate-400">
                chọn xong → Áp dụng lọc
              </span>
            ) : null}
          </summary>
          <div className="space-y-3 border-t border-slate-200/60 px-3 pb-3 pt-3">
            <div className="grid grid-cols-2 gap-x-2 gap-y-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6">
              <FilterSelect
                compact
                label="Nhãn"
                title="Nhãn HOT / WARM / COLD theo bộ chấm điểm."
                value={draftFilters.tag}
                onChange={(v) => patchDraftFilters({ tag: v })}
                options={[
                  { v: 'ALL', t: 'Tất cả' },
                  ...TAG_OPTIONS.map((t) => ({ v: t, t })),
                ]}
              />
              <SearchableFilterSelect
                compact
                label="Vùng"
                title="Tỉnh / thành trên hồ sơ."
                value={draftFilters.region}
                onChange={(v) => patchDraftFilters({ region: v })}
                options={regions.map((p) => ({ v: p, t: p }))}
              />
              <FilterSelect
                compact
                label="Hệ ĐT"
                title="Ngành / hệ đào tạo ghi trên hồ sơ."
                value={draftFilters.major}
                onChange={(v) => patchDraftFilters({ major: v })}
                options={[
                  { v: 'ALL', t: 'Tất cả' },
                  ...majors.map((p) => ({ v: p, t: p })),
                ]}
              />
              <FilterSelect
                compact
                label="Funnel"
                title="Giai đoạn tuyển sinh trên hồ sơ."
                value={draftFilters.status}
                onChange={(v) => patchDraftFilters({ status: v })}
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
                title="Tiến độ làm việc với tư vấn viên."
                value={draftFilters.crm}
                onChange={(v) => patchDraftFilters({ crm: v })}
                options={[
                  { v: 'ALL', t: 'Tất cả' },
                  ...LEAD_COUNSELOR_STATUS_ORDER.map((k) => ({ v: k, t: LEAD_COUNSELOR_STATUS_LABELS[k] })),
                ]}
              />
              <FilterSelect
                compact
                label="Nguồn"
                title="Kênh hồ sơ đến (web, Zalo, giới thiệu…)."
                value={draftFilters.source}
                onFocus={() => {
                  if (!sourceCatalogRequested) setSourceCatalogRequested(true)
                  else void fetchScopeSourceOptions()
                }}
                onChange={(v) => patchDraftFilters({ source: v })}
                options={[{ v: 'ALL', t: 'Tất cả' }, ...sources.map((s) => ({ v: s, t: s }))]}
              />
              <FilterSelect
                compact
                label="Chương trình"
                title="Đợt / chương trình gắn khi nhập Excel hoặc gán hàng loạt."
                value={draftFilters.program}
                onFocus={() => {
                  if (!programCatalogRequested) setProgramCatalogRequested(true)
                  else void fetchScopeProgramOptions()
                }}
                onChange={(v) => patchDraftFilters({ program: v })}
                options={[
                  { v: 'ALL', t: 'Tất cả' },
                  { v: '__UNSET__', t: 'Chưa gắn chương trình' },
                  ...programOptions.map((p) => ({ v: p, t: p })),
                ]}
              />
              <SearchableFilterSelect
                compact
                label="Trường THPT"
                title="Trường THPT của thí sinh."
                value={draftFilters.school}
                onChange={(v) => patchDraftFilters({ school: v })}
                options={schoolOptions.map((sc) => ({
                  v: sc,
                  t: sc.length > 48 ? `${sc.slice(0, 48)}…` : sc,
                }))}
              />
              <FilterSelect
                compact
                label="Nhân viên"
                title="Lọc theo người phụ trách."
                value={draftFilters.assignee}
                onChange={(v) => patchDraftFilters({ assignee: v })}
                options={[
                  { v: '', t: 'Tất cả nhân viên' },
                  { v: '__UNASSIGNED__', t: 'Chưa gán nhân viên' },
                  ...reassignPickList.map((c) => ({
                    v: c.id,
                    t: `${formatStaffDirectoryLabel(c)}${assignmentLoadByUid.has(c.id) ? ` · ${assignmentLoadByUid.get(c.id)}` : ''}`,
                  })),
                ]}
              />
              <label className={LEAD_FILTER_LABEL} title="Lọc theo điểm (cột Điểm).">
                <span>Điểm từ</span>
                <input
                  type="number"
                  inputMode="numeric"
                  placeholder="—"
                  value={draftFilters.scoreMin}
                  onChange={(e) => patchDraftFilters({ scoreMin: e.target.value })}
                  className={`${LEAD_FILTER_CONTROL} tabular-nums`}
                />
              </label>
              <label className={LEAD_FILTER_LABEL} title="Lọc theo điểm (cột Điểm).">
                <span>Điểm đến</span>
                <input
                  type="number"
                  inputMode="numeric"
                  placeholder="—"
                  value={draftFilters.scoreMax}
                  onChange={(e) => patchDraftFilters({ scoreMax: e.target.value })}
                  className={`${LEAD_FILTER_CONTROL} tabular-nums`}
                />
              </label>
            </div>
            <div className="flex flex-wrap items-center gap-2 border-t border-slate-200/50 pt-2">
              <button
                type="button"
                onClick={applyDraftFilters}
                disabled={!filtersPendingApply}
                className={[
                  LEAD_BTN,
                  filtersPendingApply
                    ? 'border-amber-500 bg-amber-500 text-amber-950 hover:bg-amber-600'
                    : 'border-slate-200 bg-slate-100 text-slate-400',
                ].join(' ')}
              >
                Áp dụng lọc
              </button>
              {filtersPendingApply ? (
                <>
                  <button
                    type="button"
                    onClick={discardDraftFilters}
                    className={`${LEAD_BTN} border-slate-200 bg-white text-slate-600`}
                  >
                    Hủy chọn
                  </button>
                  <span className="text-[11px] text-amber-800">Đã chọn — bấm Áp dụng để chạy lọc.</span>
                </>
              ) : (
                <span className="text-[11px] text-slate-500">Chọn điều kiện rồi bấm Áp dụng lọc.</span>
              )}
            </div>
            {activeFilterChips.length > 0 ? (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Đang lọc</span>
                {activeFilterChips.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => c.onClear()}
                    className="inline-flex h-7 max-w-full items-center gap-1 rounded-md border border-amber-300/80 bg-amber-50/95 px-2 text-xs font-medium text-amber-950 transition hover:border-amber-500 hover:bg-amber-100"
                    title={`${c.label} — bấm để bỏ`}
                  >
                    <span className="min-w-0 truncate">{c.label}</span>
                    <span className="shrink-0 font-bold text-amber-800" aria-hidden>
                      ×
                    </span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </details>

        {/* Bộ chấm điểm — thu gọn */}
        <details className="group rounded-md border border-slate-200/80 bg-white/50 open:bg-white/85">
          <summary className="flex min-h-10 cursor-pointer list-none items-center gap-2 px-3 text-xs font-semibold uppercase tracking-wide text-slate-600 marker:content-none [&::-webkit-details-marker]:hidden">
            <ChevronDown
              className="h-3.5 w-3.5 shrink-0 text-slate-500 transition duration-200 group-open:rotate-180"
              strokeWidth={2}
              aria-hidden
            />
            <span className="shrink-0">Bộ chấm điểm</span>
            <span
              className="min-w-0 flex-1 truncate text-left text-xs font-medium normal-case tracking-normal text-slate-800"
              title={
                profilesLoading
                  ? undefined
                  : activeScoringProfile?.profileName?.trim() || undefined
              }
            >
              {profilesLoading
                ? 'Đang tải…'
                : activeScoringProfile?.profileName?.trim() ||
                  (!scoringProfiles.length ? 'Chưa có profile' : '—')}
            </span>
          </summary>
          <div className="space-y-3 border-t border-slate-200/60 px-3 pb-3 pt-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
              <label className={`${LEAD_FILTER_LABEL} min-w-0 flex-1`}>
                <span>Profile</span>
                <select
                  value={resolvedScoringProfileId ?? ''}
                  disabled={!scoringProfiles.length || profilesLoading}
                  onChange={(e) => setScoringProfileId(e.target.value || null)}
                  className={LEAD_FILTER_CONTROL}
                >
                  {!scoringProfiles.length ? (
                    <option value="">Chưa có profile — Cấu hình</option>
                  ) : null}
                  {scoringProfiles.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.profileName} · HOT≥{p.thresholds?.hotMinScore ?? '—'} · WARM≥
                      {p.thresholds?.warmMinScore ?? '—'}
                    </option>
                  ))}
                </select>
              </label>
              <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  disabled={!profileScoringLive || rescoreBusy || !db}
                  onClick={() => void runBulkRescore()}
                  className={`${LEAD_BTN} border-[var(--color-primary)] bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary-hover)] disabled:opacity-40`}
                >
                  <RefreshCw
                    className={`h-3.5 w-3.5 shrink-0 ${rescoreBusy ? 'animate-spin' : ''}`}
                    aria-hidden
                  />
                  {rescoreBusy ? 'Đang tính…' : 'Tính lại'}
                </button>
                <button
                  type="button"
                  disabled={!activeScoringProfile}
                  onClick={() => setInspectProfileOpen(true)}
                  className={`${LEAD_BTN} border-slate-200 bg-white text-slate-800 hover:border-amber-300 hover:bg-amber-50/80 disabled:opacity-40`}
                >
                  <InfoIcon className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  Quy tắc
                </button>
                <button
                  type="button"
                  disabled={!sortedFiltered.length}
                  onClick={handleExportEvaluated}
                  className={`${LEAD_BTN} border-emerald-300 bg-emerald-50 text-emerald-900 hover:border-emerald-400 hover:bg-indigo-100 disabled:opacity-40`}
                >
                  <Download className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  Xuất Excel
                </button>
              </div>
            </div>
            {activeScoringProfile ? (
              <ScoringViewModeHint
                profileName={activeScoringProfile.profileName}
                liveRules={profileScoringLive}
                compact
              />
            ) : null}
            {rescoreMsg ? (
              <p className="text-xs font-medium text-sky-900" role="status">
                {rescoreMsg}
              </p>
            ) : null}
            {(tagClientEval || callQueueNeedsScope || programNeedsScope) && scopeFetchTruncated ? (
              <p className="text-xs font-medium text-amber-900">
                {programNeedsScope
                  ? `Đã quét tối đa ${LEADS_UI_PROGRAM_SCAN_MAX.toLocaleString('vi-VN')} hồ sơ hoặc đủ ${LEADS_UI_FULL_SCOPE_MAX.toLocaleString('vi-VN')} kết quả — có thể còn hồ sơ khớp phía sau.`
                  : `Đã đạt giới hạn tải (${LEADS_UI_FULL_SCOPE_MAX.toLocaleString('vi-VN')} hồ sơ) — có thể thiếu một phần ở đuôi danh sách.`}
              </p>
            ) : null}
          </div>
        </details>
      </BentoCell>

      {inspectProfileOpen && activeScoringProfile ? (
        <ScoringProfileInspectModal profile={activeScoringProfile} onClose={() => setInspectProfileOpen(false)} />
      ) : null}

      <BentoCell className="!p-0 transition-all duration-300">
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
              Trang này <span className="font-semibold text-slate-900">{pagedRows.length}</span>
              {' · '}
              Khớp lọc{' '}
              <span className="font-semibold text-amber-900">{filterMatchCount.toLocaleString('vi-VN')}</span>
              {' · '}
              trang {currentPage}/{displayTotalPages}
            </span>
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                disabled={currentPage <= 1 || loadingPage}
                onClick={() => setPage(1)}
                className="min-h-10 cursor-pointer rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-800 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                « Đầu
              </button>
              <button
                type="button"
                disabled={currentPage <= 1 || loadingPage}
                onClick={() => setPage(currentPage - 1)}
                className="min-h-10 cursor-pointer rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-800 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Trước
              </button>
              <button
                type="button"
                disabled={currentPage >= displayTotalPages || loadingPage}
                onClick={() => setPage(currentPage + 1)}
                className="min-h-10 cursor-pointer rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-800 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Sau
              </button>
              <button
                type="button"
                disabled={currentPage >= displayTotalPages || loadingPage}
                onClick={() => setPage(displayTotalPages)}
                className="min-h-10 cursor-pointer rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-800 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Cuối »
              </button>
            </div>
          </div>
        ) : null}
        <div
          className={`scroll-touch max-h-[min(calc(100dvh-16rem),72vh)] overflow-auto overscroll-contain ${
            canBulkWrite && selectedIds.size > 0
              ? 'pb-[calc(var(--nav-bottom-height,4rem)+9rem)] lg:pb-28'
              : ''
          }`}
        >
          <table className="w-full min-w-[980px] border-collapse text-left text-[13px] leading-snug xl:min-w-0">
            <thead className="sticky top-0 z-10 border-b border-slate-200/90 bg-white/95 backdrop-blur-xl">
              <tr className="text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                <th className="sticky left-0 z-[3] w-9 bg-white/95 px-0.5 py-2 shadow-[2px_0_6px_-2px_rgba(15,23,42,0.12)]">
                  {canBulkWrite ? (
                    <label className="flex h-9 w-9 cursor-pointer items-center justify-center">
                      <input
                        type="checkbox"
                        checked={allVisibleSelected}
                        onChange={toggleSelectAllVisible}
                        disabled={!pagedRows.length}
                        className="h-3.5 w-3.5 rounded border-slate-300 bg-white accent-amber-500"
                        title="Chọn tất cả hồ sơ trên trang này"
                      />
                    </label>
                  ) : null}
                </th>
                <th className="sticky left-9 z-[3] w-[12%] min-w-[7.5rem] bg-white/95 px-2 py-2 font-semibold shadow-[2px_0_6px_-2px_rgba(15,23,42,0.08)]">
                  <button
                    type="button"
                    onClick={() => toggleSort('fullName')}
                    className="flex items-center gap-0.5 text-left normal-case tracking-normal transition hover:text-amber-700"
                  >
                    Họ tên
                    {sortKey === 'fullName' ? <span className="text-amber-600">{sortDir === 'asc' ? '↑' : '↓'}</span> : null}
                  </button>
                </th>
                <th className="w-[7%] max-w-[5.5rem] px-1.5 py-2 font-semibold normal-case tracking-normal">
                  Mã KH
                </th>
                <th
                  className="w-[11%] max-w-[9rem] px-1.5 py-2 font-semibold normal-case tracking-normal"
                  title="Chương trình / đợt gắn khi nhập hoặc gán hàng loạt"
                >
                  Chương trình
                </th>
                <th className="w-[9%] max-w-[7.5rem] px-1.5 py-2 font-semibold">
                  <button
                    type="button"
                    onClick={() => toggleSort('educationLevel')}
                    className="flex items-center gap-0.5 text-left normal-case tracking-normal transition hover:text-amber-700"
                  >
                    Hệ ĐT
                    {sortKey === 'educationLevel' ? (
                      <span className="text-amber-600">{sortDir === 'asc' ? '↑' : '↓'}</span>
                    ) : null}
                  </button>
                </th>
                <th className="w-[7%] max-w-[5.5rem] px-1.5 py-2 font-semibold">
                  <button
                    type="button"
                    onClick={() => toggleSort('province')}
                    className="flex items-center gap-0.5 text-left normal-case tracking-normal transition hover:text-amber-700"
                  >
                    Tỉnh
                    {sortKey === 'province' ? <span className="text-amber-600">{sortDir === 'asc' ? '↑' : '↓'}</span> : null}
                  </button>
                </th>
                <th
                  className="w-[12%] max-w-[9rem] px-1.5 py-2 font-semibold normal-case tracking-normal"
                  title="Mô tả, ghi chú chính và nguyện vọng trên hồ sơ"
                >
                  Ghi chú
                </th>
                <th
                  className="w-[10%] max-w-[8rem] px-1.5 py-2 font-semibold normal-case tracking-normal"
                  title="Ghi chú 1, ghi chú 2, nguyện vọng, sở thích…"
                >
                  Ghi chú thêm
                </th>
                <th className="w-[5%] px-1.5 py-2 font-semibold">
                  <button
                    type="button"
                    onClick={() => toggleSort('score')}
                    className="flex flex-col items-start gap-0 text-left normal-case tracking-normal transition hover:text-amber-700"
                  >
                    <span className="flex items-center gap-0.5">
                      Điểm
                      {sortKey === 'score' ? (
                        <span className="text-amber-600">{sortDir === 'asc' ? '↑' : '↓'}</span>
                      ) : null}
                    </span>
                    {profileScoringActive ? (
                      <span className="text-[10px] font-normal text-[var(--color-primary)]">
                        {profileScoringLive ? 'profile' : 'chưa quy tắc'}
                      </span>
                    ) : null}
                  </button>
                </th>
                <th className="w-[5.5%] min-w-[3.25rem] px-0.5 py-2 text-center font-semibold normal-case tracking-normal">
                  <div className="flex flex-col items-center gap-0">
                    <button
                      type="button"
                      onClick={() => toggleSort('mlWin')}
                      className="inline-flex flex-col items-center text-[11px] leading-tight text-[var(--color-primary)] transition hover:text-[var(--color-primary)]"
                    >
                      <span>Điểm TT</span>
                      {sortKey === 'mlWin' ? (
                        <span className="text-amber-600">{sortDir === 'asc' ? '↑' : '↓'}</span>
                      ) : null}
                    </button>
                    <InfoScoreHelpPopover hint={ML_WIN_COLUMN_HINT} />
                  </div>
                </th>
                <th className="w-[6%] px-1.5 py-2 font-semibold">
                  <button
                    type="button"
                    onClick={() => toggleSort('priorityTag')}
                    className="flex items-center gap-0.5 text-left normal-case tracking-normal transition hover:text-amber-700"
                  >
                    Nhãn
                    {sortKey === 'priorityTag' ? (
                      <span className="text-amber-600">{sortDir === 'asc' ? '↑' : '↓'}</span>
                    ) : null}
                  </button>
                </th>
                <th className="w-[8%] max-w-[7rem] px-1.5 py-2 font-semibold normal-case tracking-normal">
                  TVV
                </th>
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
                    <p>Không có hồ sơ khớp bộ lọc.</p>
                    {programFilter === '__UNSET__' ? (
                      <p className="mx-auto mt-2 max-w-lg text-sm text-slate-600">
                        Bộ lọc «Chưa gắn chương trình» tìm hồ sơ không có nhãn chương trình. Nếu trước đây đã gán
                        chương trình hoặc đã xóa lô, danh sách sẽ trống.
                      </p>
                    ) : programFilter !== 'ALL' ? (
                      <p className="mx-auto mt-2 max-w-lg text-sm text-slate-600">
                        Không thấy hồ sơ thuộc chương trình đã chọn trong phạm vi quét hiện tại. Thử bỏ lọc chương
                        trình hoặc kiểm tra tên chương trình trên cột «Chương trình».
                      </p>
                    ) : null}
                  </td>
                </tr>
              ) : null}
              {pagedRows.map((l) => {
                const ev = profileScoringActive ? scoreByLeadId.get(l.id) : undefined
                const displayScore = profileScoringActive
                  ? (ev?.calculatedScore ?? l.calculatedScore)
                  : l.calculatedScore
                const displayTag = effectiveLeadTag(l)
                const ml = resolveMlWinDisplay(l, infoScoreRuntime)
                const descForTable = leadDescriptionForDisplay(l.description)
                const extraNotesFull = leadSupplementaryNotesText(l)
                const callAiLine = formatLeadLastCallAiLine(l)
                const callQueueLine = formatLeadLastCallLine(l)
                return (
                <tr
                  key={`${l.id}-${resolvedScoringProfileId ?? 'persisted'}`}
                  onClick={() => setSelected(l)}
                  title="Bấm để xem chi tiết: hồ sơ sinh viên, ghi chú, đánh giá, lịch sử tương tác, AI…"
                  className="group cursor-pointer border-b border-slate-100 hover:bg-amber-50/50"
                >
                  <td
                    className="sticky left-0 z-[2] bg-white px-0.5 py-1.5 shadow-[2px_0_6px_-2px_rgba(15,23,42,0.12)] group-hover:bg-amber-50/90"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {canBulkWrite ? (
                      <label className="flex h-9 w-9 cursor-pointer items-center justify-center">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(l.id)}
                          onChange={() => toggleSelectId(l.id)}
                          className="h-3.5 w-3.5 rounded border-slate-300 bg-white accent-amber-500"
                          aria-label={`Chọn ${l.fullName}`}
                        />
                      </label>
                    ) : null}
                  </td>
                  <td className="sticky left-9 z-[2] bg-white px-2 py-1.5 font-medium text-slate-900 shadow-[2px_0_6px_-2px_rgba(15,23,42,0.08)] group-hover:bg-amber-50/90">
                    <span className="inline-flex max-w-full items-center gap-1">
                      {l.isAiShortlisted ? (
                        <Zap
                          className="h-3.5 w-3.5 shrink-0 text-yellow-300 drop-shadow-[0_0_8px_rgba(250,204,21,0.95)]"
                          strokeWidth={2.5}
                          fill="currentColor"
                          aria-label="Đã được AI đánh dấu ưu tiên"
                        />
                      ) : null}
                      <span className="min-w-0 truncate" title={l.fullName || undefined}>
                        {l.fullName || '—'}
                      </span>
                    </span>
                    <p
                      className={`mt-0.5 text-[11px] font-medium leading-snug ${
                        callWorkBucketFilter !== 'all' || dispositionFilter !== 'all'
                          ? 'line-clamp-2'
                          : 'line-clamp-1'
                      } ${callQueueLine === 'Chưa gọi' ? 'text-amber-700' : 'text-slate-500'}`}
                      title={callQueueLine}
                    >
                      {callQueueLine}
                    </p>
                    {callAiLine ? (
                      <p
                        className="mt-0.5 line-clamp-1 text-[11px] font-medium leading-snug text-[var(--color-primary)]"
                        title={callAiLine}
                      >
                        {callAiLine}
                      </p>
                    ) : null}
                  </td>
                  <td className="truncate px-1.5 py-1.5 text-slate-600" title={l.customerId || undefined}>
                    {l.customerId || '—'}
                  </td>
                  <td
                    className="truncate px-1.5 py-1.5 text-slate-700"
                    title={(l.intakeProgram ?? '').trim() || undefined}
                  >
                    {(l.intakeProgram ?? '').trim() ? (
                      <span className="rounded bg-indigo-50 px-1 py-0.5 text-[12px] font-medium text-indigo-900">
                        {formatDescPreview(l.intakeProgram ?? '', 28)}
                      </span>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                  <td className="truncate px-1.5 py-1.5 text-slate-600" title={l.educationLevel || undefined}>
                    {l.educationLevel || '—'}
                  </td>
                  <td className="truncate px-1.5 py-1.5 text-slate-600" title={l.province || undefined}>
                    {l.province || '—'}
                  </td>
                  <td
                    className="truncate px-1.5 py-1.5 text-slate-600"
                    title={descForTable.trim() ? descForTable : undefined}
                  >
                    {formatDescPreview(l.description, 40)}
                  </td>
                  <td
                    className="truncate px-1.5 py-1.5 text-slate-600"
                    title={extraNotesFull.trim() ? extraNotesFull : undefined}
                  >
                    {extraNotesFull.trim() ? formatDescPreview(extraNotesFull, 36) : '—'}
                  </td>
                  <td className="px-1.5 py-1.5 font-medium tabular-nums text-[var(--color-primary)]">
                    {displayScore}
                  </td>
                  <td className="cursor-help px-0.5 py-1 text-center" title={buildMlWinHoverText(ml)}>
                    <MlWinGauge value={ml.mlWinProbability} title={buildMlWinHoverText(ml)} />
                  </td>
                  <td className="px-1.5 py-1.5">
                    <TagBadge tag={displayTag} />
                  </td>
                  <td
                    className="truncate px-1.5 py-1.5 text-slate-600"
                    title={formatAssignedCounselorLabel(l, counselorDisplayNameById)}
                  >
                    {formatAssignedCounselorLabel(l, counselorDisplayNameById)}
                  </td>
                </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </BentoCell>

      {canBulkWrite && selectedIds.size > 0 ? (
        <BulkLeadActionBar
          count={selectedIds.size}
          onClear={() => setSelectedIds(new Set())}
          onReassign={() => {
            const others = bulkReassignTargets.filter((c) => c.id !== profile?.id)
            const defaultUid = others[0]?.id ?? bulkReassignTargets[0]?.id ?? ''
            setBulkReassignUid(defaultUid)
            setBulkAssignMode('single')
            // Không tick sẵn cả danh sách — tránh chia nhầm toàn bộ TVV khi Admin mở modal.
            setBulkAssignPoolIds([])
            setBulkModal('reassign')
            void hydrateAssignmentLoads()
          }}
          onBulkStatus={() => {
            setBulkCrmStatus('NEW')
            setBulkModal('crm')
          }}
          onBulkPriorityTag={() => {
            setBulkPriorityTag('WARM')
            setBulkModal('priorityTag')
          }}
          onBulkIntakeProgram={() => {
            setBulkIntakeProgramRecent(loadRecentIntakePrograms())
            setBulkIntakeProgram(
              programFilter !== 'ALL' && programFilter !== '__UNSET__' ? programFilter : '',
            )
            setBulkModal('intakeProgram')
          }}
          onExport={() => exportBulkSelection()}
          onBulkDelete={canDeleteLeads ? () => void applyBulkDelete() : undefined}
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
          <div className="app-modal app-modal-sheet shadow-xl">
            <h3 className="app-section-heading">Giao việc hàng loạt</h3>
            <p className="mt-1 text-sm text-slate-600">
              Phân {selectedIds.size.toLocaleString('vi-VN')} hồ sơ đã chọn — một người, chia đều, hoặc theo tải
              thấp nhất.
              {!isElevatedLeadScope && canPeerReassignLeads ? (
                <span className="mt-1 block font-medium text-amber-800">
                  Bạn chỉ có thể chuyển các hồ sơ đang gán cho chính bạn sang đồng nghiệp (theo quyền TVV).
                </span>
              ) : null}
            </p>

            <fieldset className="mt-4 space-y-2">
              <legend className="text-sm font-medium text-slate-700">Cách phân</legend>
              {(
                [
                  { v: 'single' as const, t: 'Một người phụ trách' },
                  { v: 'round_robin' as const, t: 'Chia đều (lần lượt)' },
                  { v: 'lowest_load' as const, t: 'Theo tải thấp nhất' },
                ] as const
              ).map((o) => (
                <label key={o.v} className="flex cursor-pointer items-center gap-2 text-sm text-slate-800">
                  <input
                    type="radio"
                    name="bulk-assign-mode"
                    checked={bulkAssignMode === o.v}
                    disabled={bulkBusy || (!isElevatedLeadScope && o.v !== 'single')}
                    onChange={() => setBulkAssignMode(o.v)}
                    className="h-4 w-4 accent-[var(--color-primary)]"
                  />
                  {o.t}
                </label>
              ))}
              {!isElevatedLeadScope ? (
                <p className="text-xs text-slate-500">TVV chỉ chuyển sang một đồng nghiệp (không chia đều).</p>
              ) : null}
            </fieldset>

            {bulkAssignMode === 'single' ? (
              <label className="mt-4 block text-sm font-medium text-slate-700">
                Phụ trách (TVV / Admin)
                <select
                  value={bulkReassignUid}
                  onChange={(e) => setBulkReassignUid(e.target.value)}
                  disabled={counselorsLoading || bulkBusy}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-base text-slate-900 outline-none focus:ring-2 focus:ring-[var(--color-primary)]/20"
                >
                  {bulkReassignTargets.map((c) => (
                    <option key={c.id} value={c.id} className="bg-white">
                      {formatStaffDirectoryLabel(c)}
                      {assignmentLoadByUid.has(c.id) ? ` · đang ~${assignmentLoadByUid.get(c.id)} hồ sơ` : ''}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <div className="mt-4">
                <p className="text-sm font-medium text-slate-700">Chọn nhóm nhận lead</p>
                <p className="mt-0.5 text-xs text-slate-500">
                  {assignmentLoadBusy
                    ? 'Đang ước lượng tải trong phạm vi…'
                    : assignmentLoadSnapshot
                      ? 'Số «đang ~N» ước lượng theo phạm vi (tối đa 4000 hồ sơ gần nhất).'
                      : 'Số «đang ~N» ước lượng theo danh sách đang tải.'}{' '}
                  Đã chọn {bulkAssignPoolIds.length.toLocaleString('vi-VN')} người — tick thủ công để tránh chia nhầm cả danh sách.
                </p>
                <div className="mt-2 max-h-48 space-y-1.5 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50/80 p-2">
                  {bulkReassignTargets
                    .filter((c) => c.role === 'counselor' || isFieldStaffRole(c.role))
                    .map((c) => {
                      const checked = bulkAssignPoolIds.includes(c.id)
                      const load = assignmentLoadByUid.get(c.id) ?? 0
                      return (
                        <label
                          key={c.id}
                          className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-slate-800 hover:bg-white"
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={bulkBusy}
                            onChange={() => {
                              setBulkAssignPoolIds((prev) =>
                                checked ? prev.filter((id) => id !== c.id) : [...prev, c.id],
                              )
                            }}
                            className="h-4 w-4 accent-violet-600"
                          />
                          <span className="min-w-0 flex-1 truncate">{formatStaffDirectoryLabel(c)}</span>
                          <span className="shrink-0 tabular-nums text-xs text-slate-500">~{load}</span>
                        </label>
                      )
                    })}
                </div>
                {(() => {
                  try {
                    const preview = planLeadAssignments(
                      [...selectedIds].slice(0, Math.min(selectedIds.size, 5000)),
                      bulkAssignPoolIds,
                      bulkAssignMode,
                      { currentLoads: assignmentLoadByUid },
                    )
                    return (
                      <p className="mt-2 text-xs font-medium text-violet-900">
                        Xem trước: {summarizeAssignPlan(preview)}
                      </p>
                    )
                  } catch {
                    return (
                      <p className="mt-2 text-xs text-amber-800">Chọn ít nhất một người trong nhóm nhận.</p>
                    )
                  }
                })()}
              </div>
            )}

            {bulkReassignProgress ? (
              <p className="mt-3 text-sm font-medium text-slate-700">
                Đang ghi {bulkReassignProgress.done.toLocaleString('vi-VN')} /{' '}
                {bulkReassignProgress.total.toLocaleString('vi-VN')}…
              </p>
            ) : null}

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
                disabled={
                  bulkBusy ||
                  (bulkAssignMode === 'lowest_load' && assignmentLoadBusy) ||
                  (bulkAssignMode === 'single' ? !bulkReassignUid : bulkAssignPoolIds.length === 0)
                }
                onClick={() => void applyBulkReassign()}
                className="rounded-xl border border-[var(--color-primary)] bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white shadow-sm disabled:opacity-40"
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
          <div className="app-modal app-modal-sheet shadow-xl">
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

      {bulkModal === 'priorityTag' && db ? (
        <>
          <button
            type="button"
            className="fixed inset-0 z-[55] bg-slate-900/25 backdrop-blur-md"
            aria-label="Đóng"
            onClick={() => !bulkBusy && setBulkModal(null)}
          />
          <div className="app-modal app-modal-sheet shadow-xl">
            <h3 className="app-section-heading">Gán nhãn phân loại</h3>
            <p className="mt-1 text-sm text-slate-600">
              Gán cùng một nhãn HOT / WARM / COLD / LOSS cho {selectedIds.size} hồ sơ đã chọn (không đổi điểm). Muốn
              máy chấm lại điểm + nhãn, dùng nút «Tính lại».
            </p>
            <label className="mt-4 block text-sm font-medium text-slate-700">
              Nhãn
              <select
                value={bulkPriorityTag}
                onChange={(e) => setBulkPriorityTag(e.target.value as PriorityTag)}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-base text-slate-900 outline-none focus:ring-2 focus:ring-sky-200"
              >
                {BULK_PRIORITY_TAG_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value} className="bg-white">
                    {o.label}
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
                onClick={() => void applyBulkPriorityTag()}
                className="rounded-xl border border-sky-600 bg-sky-600 px-4 py-2 text-sm font-semibold text-white shadow-sm disabled:opacity-40"
              >
                {bulkBusy ? 'Đang xử lý…' : 'Gán nhãn'}
              </button>
            </div>
          </div>
        </>
      ) : null}

      {bulkModal === 'intakeProgram' && db ? (
        <>
          <button
            type="button"
            className="fixed inset-0 z-[55] bg-slate-900/25 backdrop-blur-md"
            aria-label="Đóng"
            onClick={() => !bulkBusy && setBulkModal(null)}
          />
          <div className="app-modal app-modal-sheet shadow-xl">
            <h3 className="app-section-heading">Gán chương trình</h3>
            <p className="mt-1 text-sm text-slate-600">
              Gắn đợt / chương trình cho {selectedIds.size} hồ sơ đã chọn — dùng để lọc và xử lý theo từng lần nhập.
              Hồ sơ cũ chưa gắn có thể gán ở đây; «Gỡ gắn» đưa về chưa phân loại.
            </p>
            <label className="mt-4 block text-sm font-medium text-slate-700">
              Chương trình / đợt
              <input
                list="bulk-intake-program-suggestions"
                value={bulkIntakeProgram}
                onChange={(e) => setBulkIntakeProgram(e.target.value)}
                disabled={bulkBusy}
                placeholder="Vd. Đợt 9/2026 — Offline Hà Nội"
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-base text-slate-900 outline-none focus:ring-2 focus:ring-indigo-200"
              />
            </label>
            <datalist id="bulk-intake-program-suggestions">
              {[...new Set([...bulkIntakeProgramRecent, ...programOptions])].map((p) => (
                <option key={p} value={p} />
              ))}
            </datalist>
            <div className="mt-4 flex flex-wrap justify-end gap-2">
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
                onClick={() => void applyBulkIntakeProgram('clear')}
                className="rounded-xl border border-slate-300 bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-800 shadow-sm disabled:opacity-40"
              >
                {bulkBusy ? 'Đang xử lý…' : 'Gỡ gắn (chưa gắn)'}
              </button>
              <button
                type="button"
                disabled={bulkBusy || !normalizeIntakeProgramLabel(bulkIntakeProgram)}
                onClick={() => void applyBulkIntakeProgram('set')}
                className="rounded-xl border border-indigo-600 bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm disabled:opacity-40"
              >
                {bulkBusy ? 'Đang xử lý…' : 'Gán chương trình'}
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
                className="relative z-10 max-h-[min(90dvh,900px)] w-full max-w-lg overflow-y-auto overscroll-contain rounded-2xl border border-amber-200/80 bg-white p-5 shadow-[0_24px_64px_rgba(15,23,42,0.28)] sm:max-w-2xl sm:p-7 lg:max-w-4xl"
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
                <div className="absolute -right-1/4 bottom-0 h-[110%] w-[65%] rounded-full bg-gradient-to-tl from-cyan-400/20 via-indigo-400/15 to-transparent blur-3xl" />
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
                        <span className="font-bold text-[var(--color-primary)] tabular-nums">{gatekeeperModal.passed.length}</span>{' '}
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
              <div className="relative w-full max-w-sm overflow-hidden rounded-2xl border border-white/40 bg-gradient-to-br from-white/30 via-violet-100/25 to-indigo-100/20 p-5 shadow-[0_24px_80px_rgba(15,23,42,0.25)] backdrop-blur-2xl">
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
                    className="ai-skeleton-shimmer absolute left-0 top-0 h-full rounded-full bg-gradient-to-r from-violet-500/90 via-indigo-400/90 to-amber-400/90 transition-[width] duration-500 ease-out"
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
                      { lead: selected, ...scoringPersistOpts },
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
              canDeleteLead={canDeleteLeads}
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
              onDeleted={(leadId) => {
                removeLocalLeads([leadId])
                setSelectedIds((prev) => {
                  if (!prev.has(leadId)) return prev
                  const next = new Set(prev)
                  next.delete(leadId)
                  return next
                })
                setSelected(null)
                leadDetailUnsavedRef.current = false
                void refetchLeads()
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
        className="app-modal fixed left-1/2 top-1/2 z-[60] max-h-[min(90dvh,860px)] w-[min(96vw,48rem)] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-3xl shadow-xl lg:w-[min(92vw,56rem)]"
      >
        <div className="scroll-touch max-h-[min(90dvh,860px)] overflow-y-auto overscroll-contain p-6">
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
  onFocus,
  options,
  compact,
}: {
  label: string
  /** Tooltip — giải thích ngắn khi rê chuột lên nhãn lọc. */
  title?: string
  value: string
  onChange: (v: string) => void
  onFocus?: () => void
  options: { v: string; t: string }[]
  compact?: boolean
}) {
  return (
    <label title={title} className={compact ? LEAD_FILTER_LABEL : 'flex flex-col text-xs font-medium text-slate-600'}>
      <span className="truncate">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={onFocus}
        title={options.find((o) => o.v === value)?.t ?? title}
        className={
          compact
            ? LEAD_FILTER_CONTROL
            : 'mt-1 min-h-11 min-w-[140px] rounded-xl border border-slate-200/95 bg-white px-2 py-2 text-base text-slate-900 outline-none transition focus:ring-2 focus:ring-amber-200'
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
    scoringOpts?: Pick<import('../utils/scoring').EvaluateLeadOptions, 'infoScoreRuntime' | 'includeAuxScores' | 'classificationRuntime'>
  }
}) {
  const { profile, can } = useAuth()
  const { runtime: infoScoreRuntime } = useInfoScoreRules()
  const { runtime: classificationRuntime } = useLeadClassificationRules()
  const crmScoringOpts = useMemo(
    () =>
      leadScoringContext?.scoringOpts ?? {
        infoScoreRuntime,
        includeAuxScores: true as const,
        classificationRuntime: classificationRuntime.enabled ? classificationRuntime : null,
      },
    [leadScoringContext?.scoringOpts, infoScoreRuntime, classificationRuntime],
  )
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
            crmScoringOpts,
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
          ? 'shrink-0 rounded-lg border border-[var(--color-primary)]/30 bg-[var(--color-primary-soft)]/50 p-2 shadow-sm'
          : 'rounded-xl border border-[var(--color-primary)]/30 bg-[var(--color-primary-soft)]/50 p-3 shadow-sm'
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
              ? 'mt-0.5 w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-900 outline-none focus:ring-1 focus:ring-[var(--color-primary)]/20 disabled:opacity-50'
              : 'mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-2 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-[var(--color-primary)]/20 disabled:opacity-50'
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
              ? 'mt-0.5 w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-900 outline-none focus:ring-1 focus:ring-[var(--color-primary)]/20'
              : 'mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-2 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-[var(--color-primary)]/20'
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
        <p className={compact ? 'mt-1.5 text-xs text-[var(--color-primary)]' : 'mt-2 text-sm text-[var(--color-primary)]'}>{crmMsg}</p>
      ) : null}
      <button
        type="button"
        disabled={crmBusy}
        onClick={() => void save()}
        className={
          compact
            ? 'mt-2 w-full rounded-md border border-[var(--color-primary)] bg-[var(--color-primary)] py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-[var(--color-primary-hover)] disabled:opacity-50'
            : 'mt-3 w-full rounded-lg border border-[var(--color-primary)] bg-[var(--color-primary)] py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-[var(--color-primary-hover)] disabled:opacity-50'
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
  canDeleteLead: canDeleteThisLead,
  onClose,
  onUnsavedChange,
  onUpdated,
  onDeleted,
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
  /** Admin: xóa hồ sơ này khỏi hệ thống. */
  canDeleteLead?: boolean
  /** Đóng panel — parent có thể bọc confirm khi còn dirty (đồng bộ qua onUnsavedChange). */
  onClose: () => void
  /** Báo parent có thay đổi chưa lưu (funnel / ghi chú / CRM trái) để onClose hỏi xác nhận. */
  onUnsavedChange?: (dirty: boolean) => void
  onUpdated: (patch: Partial<Lead>) => void
  /** Sau khi xóa thành công — parent đóng panel và bỏ khỏi danh sách. */
  onDeleted?: (leadId: string) => void
  /** Trợ lý kịch bản (nhúng trong layout fullscreen). */
  dynamicAssistantSlot?: ReactNode
}) {
  const { profile, can, canRunLlmAnalysis } = useAuth()
  const { runtime: infoScoreRuntime } = useInfoScoreRules()
  const { runtime: classificationRuntime } = useLeadClassificationRules()
  const detailScoringOpts = useMemo(
    () => ({
      infoScoreRuntime,
      includeAuxScores: true as const,
      classificationRuntime: classificationRuntime.enabled ? classificationRuntime : null,
    }),
    [infoScoreRuntime, classificationRuntime],
  )
  const canEditScoringSignals = canWriteLead(profile, lead, can, pickListUsers)
  const { tasksById: aiInsightTasksById } = useLeadAiInsightTasks(lead.id)
  const { interactions } = useInteractions(lead.id)
  const { playbooks } = useConsultingPlaybooks()
  const { documents: knowledgeDocuments } = useKnowledgeDocuments()
  const { categories: knowledgeCategories } = useKnowledgeCategories()
  const { active: leadSources } = useLeadSources()
  const { items: scholarships } = useScholarships()
  const { catalogs: profileCatalogs, onEnsureCatalogEntry } = useLeadProfileCatalogs()

  const [coreDraft, setCoreDraft] = useState(() => leadToCoreDraft(lead))
  const coreDirty = useMemo(() => isCoreDraftDirty(lead, coreDraft), [lead, coreDraft])
  const scoreAutoSyncedRef = useRef<string | null>(null)

  const detailScoringPreview = useMemo(() => {
    if (!activeScoringProfile) return scoringPreview
    const merged = mergeCoreDraftIntoLead(lead, coreDraft)
    return evaluateLead(
      leadToEvaluationRecord(merged),
      activeScoringProfile,
      scoringMasterBuckets,
      schoolTvvSignalDefs,
      { lead: merged, ...detailScoringOpts },
    )
  }, [
    activeScoringProfile,
    lead,
    coreDraft,
    scoringMasterBuckets,
    schoolTvvSignalDefs,
    infoScoreRuntime,
    detailScoringOpts,
    scoringPreview,
  ])

  useEffect(() => {
    scoreAutoSyncedRef.current = null
  }, [lead.id])

  useEffect(() => {
    if (!db || !profile || !activeScoringProfile || !profileHasActiveRules(activeScoringProfile)) return
    if (!canWriteLead(profile, lead, can, pickListUsers)) return
    if (coreDirty) return
    const live = detailScoringPreview
    if (!live) return
    // Chỉ tự ghi khi điểm lệch — không ghi đè nhãn tay khi điểm đã khớp.
    if (!leadNeedsAutoScorePersist(lead, live)) return
    const syncKey = `${lead.id}:${activeScoringProfile.id}:${live.calculatedScore}:${live.priorityTag}`
    if (scoreAutoSyncedRef.current === syncKey) return
    scoreAutoSyncedRef.current = syncKey

    void (async () => {
      try {
        const patch: Partial<Lead> = {
          calculatedScore: live.calculatedScore,
          priorityTag: live.priorityTag,
        }
        if (classificationRuntime.enabled) {
          const merged = mergeCoreDraftIntoLead(lead, coreDraft)
          const full = evaluateLeadWithClassification(
            merged,
            activeScoringProfile,
            classificationRuntime,
            scoringMasterBuckets,
            schoolTvvSignalDefs,
            { infoScoreRuntime },
          )
          patch.leadScoreProfilePart = full.profilePart
          patch.leadScoreEngagementPart = full.engagementPart
        }
        await updateDoc(doc(db, FS_COLLECTIONS.leads, lead.id), patch)
        onUpdated(patch)
      } catch (e) {
        console.error(e)
        scoreAutoSyncedRef.current = null
      }
    })()
  }, [
    db,
    profile,
    can,
    pickListUsers,
    lead,
    activeScoringProfile,
    detailScoringPreview,
    coreDirty,
    onUpdated,
  ])

  const consultingInsights = useMemo(
    () =>
      buildLeadConsultingInsights(lead, playbooks, knowledgeDocuments, {
        infoScoreRuntime,
        priorityTag: detailScoringPreview?.priorityTag,
        calculatedScore: detailScoringPreview?.calculatedScore,
      }),
    [lead, playbooks, knowledgeDocuments, infoScoreRuntime, detailScoringPreview],
  )

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
  const [dispositionDraft, setDispositionDraft] = useState<CallDispositionId | ''>(() =>
    lead.lastCallDispositionId && isCallDispositionId(lead.lastCallDispositionId)
      ? lead.lastCallDispositionId
      : '',
  )
  const [crmDirty, setCrmDirty] = useState<LeadCounselorStatus | null>(null)
  const crmForForm = crmDirty ?? lead.status
  const [statusDirty, setStatusDirty] = useState<LeadPipelineStatus | null>(null)
  const statusForForm = statusDirty ?? lead.pipelineStatus
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [llmPopupOpen, setLlmPopupOpen] = useState(false)
  const [llmAccessHelpOpen, setLlmAccessHelpOpen] = useState(false)
  const [assistantPopupOpen, setAssistantPopupOpen] = useState(false)
  const [playbookPopupOpen, setPlaybookPopupOpen] = useState(false)
  const [playbookPopupTab, setPlaybookPopupTab] = useState<'consulting' | 'general'>('consulting')
  const [closeDetailConfirmOpen, setCloseDetailConfirmOpen] = useState(false)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [detailLeftTab, setDetailLeftTab] = useState<'counselor' | 'profile'>('counselor')
  const [detailRightTab, setDetailRightTab] = useState<'assign' | 'history'>('history')
  const signalsHelpRef = useRef<HTMLDialogElement>(null)

  const deleteThisLead = useCallback(async () => {
    if (!db || !profile || !canDeleteThisLead || deleteBusy) return
    const label = lead.fullName?.trim() || 'hồ sơ này'
    if (
      !window.confirm(
        `Xóa vĩnh viễn «${label}»?\n\nKhông hoàn tác được. Chỉ Admin được xóa.`,
      )
    ) {
      return
    }
    setDeleteBusy(true)
    setMsg(null)
    try {
      await bulkDeleteLeads(db, [lead.id])
      await commitAuditLog(db, {
        leadId: lead.id,
        actionType: 'SYSTEM_UPDATE',
        description: `Xóa hồ sơ «${label}»`,
        performedBy: profile.id,
        performedByName: profile.displayName?.trim() || profile.email || profile.id,
      }).catch(() => {})
      onDeleted?.(lead.id)
    } catch (e) {
      console.error(e)
      setMsg(e instanceof Error ? e.message : 'Không xóa được hồ sơ.')
      setDeleteBusy(false)
    }
  }, [db, profile, canDeleteThisLead, deleteBusy, lead.id, lead.fullName, onDeleted])

  useEffect(() => {
    setNote('')
    setEvalTag(EVALUATION_TAGS[0])
    setDispositionDraft(
      lead.lastCallDispositionId && isCallDispositionId(lead.lastCallDispositionId)
        ? lead.lastCallDispositionId
        : '',
    )
    setCrmDirty(null)
    setStatusDirty(null)
    setMsg(null)
    setPlaybookPopupTab('consulting')
    setDetailLeftTab('counselor')
    setDetailRightTab('history')
    signalsHelpRef.current?.close()
    // Chỉ reset khi đổi hồ sơ — không phụ thuộc field lead (tránh xóa draft khi patch local).
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: lead.id only
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

  const { orgConfig } = useOrgAiIntegration()
  const { tasks: aiTasks, loading: aiTasksLoading, error: aiTasksErr } = useAITasks()
  const aiIntegrationDiag = useMemo(() => getAiIntegrationDiagnostics(), [orgConfig])
  const llmDialogHint = useMemo(() => {
    const parts: string[] = ['✓ Tài khoản đã được phép dùng AI trên hồ sơ.']
    if (!aiIntegrationDiag.apiKeyPresent) {
      parts.push('Chưa có khóa API toàn trường — Siêu quản trị lưu trong Cài đặt → LLM (Lưu API cho cả team).')
    } else if (aiIntegrationDiag.source === 'firestore') {
      parts.push('Đang dùng khóa API cấu hình toàn trường — cả team dùng chung.')
    } else {
      parts.push('Kết quả phân tích lưu trên hệ thống.')
    }
    if (!aiTasksLoading && !aiTasks.length) {
      parts.push('Chưa có tác vụ — cần tạo trong Cài đặt → AI & LLM.')
    }
    return parts.join(' ')
  }, [aiIntegrationDiag.apiKeyPresent, aiTasksLoading, aiTasks.length])
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

  const dispositionChanged =
    (dispositionDraft || null) !== (lead.lastCallDispositionId && isCallDispositionId(lead.lastCallDispositionId)
      ? lead.lastCallDispositionId
      : null)

  const hasUnsavedProgress = useMemo(
    () =>
      coreDirty ||
      financeDirty ||
      (crmDirty !== null && crmForForm !== lead.status) ||
      (statusDirty !== null && statusForForm !== lead.pipelineStatus) ||
      note.trim().length > 0 ||
      dispositionChanged,
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
      dispositionChanged,
    ],
  )

  useEffect(() => {
    onUnsavedChange?.(hasUnsavedProgress)
    return () => {
      onUnsavedChange?.(false)
    }
  }, [hasUnsavedProgress, onUnsavedChange])

  const requestClosePanel = useCallback(() => {
    if (hasUnsavedProgress) {
      setCloseDetailConfirmOpen(true)
      return
    }
    onClose()
  }, [hasUnsavedProgress, onClose])

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
        detailScoringOpts,
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
    const nextDispositionId =
      dispositionDraft && isCallDispositionId(dispositionDraft) ? dispositionDraft : null
    const dispChanged =
      nextDispositionId !==
      (lead.lastCallDispositionId && isCallDispositionId(lead.lastCallDispositionId)
        ? lead.lastCallDispositionId
        : null)

    if (!crmChanged && !pipeChanged && !noteTrim && !coreChanged && !dispChanged) {
      setMsg('Không có thay đổi.')
      return
    }
    if (dispChanged && !canSaveInteraction && !canMutateLead) {
      setMsg('Bạn không có quyền cập nhật note sau gọi trên hồ sơ này.')
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
      const callerLabel = profile.displayName?.trim() || profile.email?.trim() || profile.id
      let callWorkFields: Partial<Lead> = {}
      if (dispChanged && nextDispositionId) {
        const work = buildCallWorkLeadPatch({
          dispositionId: nextDispositionId,
          calledByLabel: callerLabel,
          previousAttemptCount: lead.callAttemptCount,
          bumpAttempt: true,
          existingScoringSignals: lead.scoringSignals,
        })
        const overrides = dispositionPriorityOverridesAfterScoring(nextDispositionId, lead.priorityTag)
        callWorkFields = { ...work }
        if (overrides.priorityTag) callWorkFields.priorityTag = overrides.priorityTag
        Object.assign(dataPatch, callWorkFields)
      }

      const mergedForScore: Partial<Lead> = { ...dataPatch, ...coreAsPartial }
      const scoreFields = persistedLeadScoringFields(
        lead,
        mergedForScore,
        activeScoringProfile,
        scoringMasterBuckets,
        schoolTvvSignalDefs,
        detailScoringOpts,
      )

      const touch = leadTouchPatch()
      const performer = callerLabel

      const leadFirestorePatch: Record<string, unknown> = {
        ...touch,
        ...scoreFields,
        ...corePatch,
        ...callWorkFields,
      }
      if (dispChanged && nextDispositionId === 'enrolled_elsewhere') {
        const overrides = dispositionPriorityOverridesAfterScoring('enrolled_elsewhere', lead.priorityTag)
        leadFirestorePatch.priorityTag = 'LOSS'
        if (overrides.clearCallEvalPriorityBoost) {
          leadFirestorePatch.callEvalPriorityBoost = deleteField()
          leadFirestorePatch.callEvalPriorityBoostAt = deleteField()
        }
      } else if (dispChanged && nextDispositionId === 'college_hot') {
        const scored =
          typeof scoreFields.priorityTag === 'string'
            ? (scoreFields.priorityTag as PriorityTag)
            : lead.priorityTag
        const ov = dispositionPriorityOverridesAfterScoring('college_hot', scored)
        if (ov.priorityTag) leadFirestorePatch.priorityTag = ov.priorityTag
        if (ov.callEvalPriorityBoost) {
          leadFirestorePatch.callEvalPriorityBoost = ov.callEvalPriorityBoost
          leadFirestorePatch.callEvalPriorityBoostAt = Timestamp.now()
        }
      }
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
        (leadFirestorePatch.priorityTag as PriorityTag | undefined) ??
        (scoreFields.priorityTag as PriorityTag | undefined) ??
        scoringPreview?.priorityTag ??
        detailScoringPreview?.priorityTag ??
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

      const dispDef = nextDispositionId ? getCallDisposition(nextDispositionId) : undefined
      if (noteTrim || dispChanged) {
        const sub = collection(db, FS_COLLECTIONS.leads, lead.id, FS_COLLECTIONS.interactions)
        const counselorNote =
          noteTrim ||
          (dispDef ? `Note sau gọi: ${dispDef.label}` : '')
        await addDoc(sub, {
          leadId: lead.id,
          channel: dispChanged ? 'CALL' : 'NOTE',
          authorUid: profile.id,
          authorRole: profile.role,
          counselorNote,
          evaluationTag: evalTag,
          ...(dispDef
            ? {
                callDispositionId: dispDef.id,
                callDispositionLabel: dispDef.label,
                callOutcome: (callWorkFields.lastCallOutcome as Lead['lastCallOutcome']) ?? undefined,
              }
            : {}),
          snapshotCrmStatus: nextCrm,
          snapshotPipelineStatus: nextPipeFinal,
          snapshotPriorityTag: nextPriority,
          timestamp: Timestamp.now(),
        })
        await commitAuditLog(db, {
          leadId: lead.id,
          actionType: 'NOTE_ADDED',
          description: dispDef
            ? `Note sau gọi: ${dispDef.label}${noteTrim ? ` — ${noteTrim.slice(0, 200)}` : ''}`
            : `Ghi chú tương tác (${evalTag}): ${noteTrim.slice(0, 280)}${noteTrim.length > 280 ? '…' : ''}`,
          performedBy: profile.id,
          performedByName: performer,
        })
      }

      const nextLead: Lead = {
        ...lead,
        ...dataPatch,
        ...coreAsPartial,
        ...scoreFields,
        ...(typeof leadFirestorePatch.priorityTag === 'string'
          ? { priorityTag: leadFirestorePatch.priorityTag as PriorityTag }
          : {}),
        updatedAt: touch.updatedAt,
        lastTouchedAt: touch.lastTouchedAt,
      }
      setCoreDraft(leadToCoreDraft(nextLead))

      onUpdated({
        ...dataPatch,
        ...coreAsPartial,
        ...scoreFields,
        ...(typeof leadFirestorePatch.priorityTag === 'string'
          ? { priorityTag: leadFirestorePatch.priorityTag as PriorityTag }
          : {}),
        updatedAt: touch.updatedAt,
        lastTouchedAt: touch.lastTouchedAt,
      })

      setNote('')
      setStatusDirty(null)
      setCrmDirty(null)
      if (dispDef) setDispositionDraft(dispDef.id)
      setMsg(dispDef ? `Đã lưu · Note sau gọi: ${dispDef.label}` : 'Đã lưu cập nhật.')
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
        'Chưa có khóa AI — lưu Gemini/OpenAI/DeepSeek trong Cài đặt → LLM → API, hoặc đặt VITE_AI_API_KEY + VITE_AI_PROVIDER=DeepSeek trong .env/Vercel.',
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
      className="safe-area-pt safe-area-pb fixed inset-0 z-[100] flex h-[100dvh] max-h-[100dvh] w-screen max-w-[100vw] flex-col overflow-x-hidden bg-gradient-to-b from-slate-50 via-white to-slate-50/90 text-slate-900 shadow-[0_-20px_80px_rgba(15,23,42,0.12)]"
    >
      <header className="flex shrink-0 items-start justify-between gap-2 border-b border-slate-200/90 bg-white/95 px-3 py-3 shadow-sm sm:gap-3 sm:px-5 lg:px-6">
        <div className="min-w-0 flex-1">
          <h2
            id="lead-detail-title"
            className="truncate text-lg font-semibold tracking-tight text-slate-900 sm:text-xl"
            title={lead.fullName || undefined}
          >
            {lead.fullName || 'Chưa rõ tên'}
          </h2>
        </div>
        <div className="flex shrink-0 flex-wrap items-stretch justify-end gap-1.5">
          <button
            type="button"
            onClick={() => setPlaybookPopupOpen(true)}
            title="Playbook"
            className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg border border-amber-400/70 bg-amber-500 px-2.5 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-amber-600"
          >
            <BookOpen className="h-3.5 w-3.5 shrink-0" aria-hidden strokeWidth={1.75} />
            <span className="hidden sm:inline">Playbook</span>
          </button>
          {dynamicAssistantSlot ? (
            <button
              type="button"
              onClick={() => setAssistantPopupOpen(true)}
              title="Trợ lý"
              className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg border border-sky-300/80 bg-sky-600 px-2.5 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-sky-700"
            >
              <Bot className="h-3.5 w-3.5 shrink-0" aria-hidden strokeWidth={1.75} />
              <span className="hidden sm:inline">Trợ lý</span>
            </button>
          ) : null}
          {canRunAi ? (
            <button
              type="button"
              onClick={() => setLlmPopupOpen(true)}
              title="LLM"
              className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg border border-[var(--color-primary)]/50 bg-gradient-to-r from-[var(--color-primary)] to-[var(--color-accent)] px-2.5 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:brightness-110"
            >
              <Sparkles className="h-3.5 w-3.5 shrink-0" aria-hidden strokeWidth={1.75} />
              <span className="hidden sm:inline">LLM</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setLlmAccessHelpOpen(true)}
              title="Cần bật quyền AI trên tài khoản"
              className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg border border-violet-300/80 bg-violet-100 px-2.5 py-1.5 text-xs font-semibold text-violet-900 shadow-sm transition hover:bg-violet-200"
            >
              <Sparkles className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden strokeWidth={1.75} />
              <span className="hidden sm:inline">LLM (khóa)</span>
            </button>
          )}
          {canDeleteThisLead ? (
            <button
              type="button"
              onClick={() => void deleteThisLead()}
              disabled={deleteBusy}
              title="Xóa hồ sơ khỏi hệ thống"
              className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg border border-rose-400 bg-rose-600 px-2.5 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-rose-700 disabled:opacity-60"
            >
              <Trash2 className="h-3.5 w-3.5 shrink-0" aria-hidden strokeWidth={1.75} />
              <span className="hidden sm:inline">{deleteBusy ? 'Đang xóa…' : 'Xóa'}</span>
            </button>
          ) : null}
          <button
            type="button"
            onClick={requestClosePanel}
            title="Đóng"
            className="inline-flex min-h-10 min-w-10 items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-800 shadow-sm transition hover:border-amber-300 hover:bg-amber-50"
          >
            <X className="h-3.5 w-3.5" aria-hidden />
            <span className="hidden sm:inline">Đóng</span>
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
                {typeof lead.aiProcessedAt?.toDate === 'function' ? (
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
                  className="sticky top-0 z-10 grid shrink-0 grid-cols-2 gap-1.5 rounded-xl border border-slate-200/90 bg-slate-100/95 p-1.5 shadow-sm backdrop-blur-sm"
                  role="tablist"
                  aria-label="Nội dung chính chi tiết hồ sơ"
                >
                  <button
                    type="button"
                    role="tab"
                    aria-selected={detailLeftTab === 'counselor'}
                    onClick={() => setDetailLeftTab('counselor')}
                    className={[
                      'relative flex min-h-[3.25rem] flex-col items-start gap-1 rounded-lg border px-3 py-2.5 text-left transition sm:min-h-[3.5rem] sm:flex-row sm:items-center sm:gap-2.5 sm:px-4',
                      detailLeftTab === 'counselor'
                        ? 'border-amber-500/70 bg-gradient-to-br from-amber-500 to-amber-600 text-white shadow-md ring-2 ring-amber-400/40'
                        : 'border-transparent bg-white text-slate-800 hover:border-amber-200 hover:bg-amber-50/80',
                    ].join(' ')}
                  >
                    <ClipboardList
                      className={[
                        'h-5 w-5 shrink-0',
                        detailLeftTab === 'counselor' ? 'text-amber-50' : 'text-amber-700',
                      ].join(' ')}
                      aria-hidden
                    />
                    <span className="min-w-0">
                      <span className="block text-sm font-bold leading-tight tracking-tight">Thao tác TVV</span>
                      <span
                        className={[
                          'mt-0.5 block text-[11px] font-medium leading-snug',
                          detailLeftTab === 'counselor' ? 'text-amber-50/95' : 'text-slate-600',
                        ].join(' ')}
                      >
                        Ghi chú · gọi điện · funnel
                      </span>
                    </span>
                    {hasUnsavedProgress && detailLeftTab !== 'counselor' ? (
                      <span
                        className="absolute right-2 top-2 h-2.5 w-2.5 rounded-full bg-amber-500 ring-2 ring-white"
                        title="Có thay đổi chưa lưu"
                        aria-hidden
                      />
                    ) : null}
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={detailLeftTab === 'profile'}
                    onClick={() => setDetailLeftTab('profile')}
                    className={[
                      'relative flex min-h-[3.25rem] flex-col items-start gap-1 rounded-lg border px-3 py-2.5 text-left transition sm:min-h-[3.5rem] sm:flex-row sm:items-center sm:gap-2.5 sm:px-4',
                      detailLeftTab === 'profile'
                        ? 'border-slate-600/60 bg-slate-800 text-white shadow-md ring-2 ring-slate-500/30'
                        : 'border-transparent bg-white text-slate-800 hover:border-slate-200 hover:bg-slate-50',
                    ].join(' ')}
                  >
                    <UserRound
                      className={[
                        'h-5 w-5 shrink-0',
                        detailLeftTab === 'profile' ? 'text-slate-200' : 'text-slate-600',
                      ].join(' ')}
                      aria-hidden
                    />
                    <span className="min-w-0">
                      <span className="block text-sm font-bold leading-tight tracking-tight">Hồ sơ ứng viên</span>
                      <span
                        className={[
                          'mt-0.5 block text-[11px] font-medium leading-snug',
                          detailLeftTab === 'profile' ? 'text-slate-300' : 'text-slate-600',
                        ].join(' ')}
                      >
                        Thông tin · học tập · tài chính
                      </span>
                    </span>
                    {(coreDirty || financeDirty) && detailLeftTab !== 'profile' ? (
                      <span
                        className="absolute right-2 top-2 h-2.5 w-2.5 rounded-full bg-amber-500 ring-2 ring-white"
                        title="Có thay đổi hồ sơ chưa lưu"
                        aria-hidden
                      />
                    ) : null}
                  </button>
                </nav>
                {/* SĐT dùng chung — hiện khi đang ở Thao tác TVV hoặc Hồ sơ ứng viên */}
                <section
                  className="shrink-0 rounded-xl border border-sky-200/80 bg-sky-50/50 px-2.5 py-2"
                  aria-label="Điện thoại liên hệ"
                >
                  <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs font-semibold text-sky-950">Gọi nhanh</p>
                    {showCounselorProgressForm && coreDirty ? (
                      <button
                        type="button"
                        disabled={saving || financeSaving}
                        onClick={() => void saveCoreProfile()}
                        className="rounded-lg border border-emerald-600 bg-indigo-600 px-2.5 py-1 text-[11px] font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        {saving ? 'Đang lưu…' : 'Lưu số'}
                      </button>
                    ) : null}
                  </div>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <label className="block min-w-0 text-xs font-medium text-slate-800">
                      Sinh viên
                      <div className="mt-0.5 flex min-w-0 items-start gap-2">
                        <input
                          className="vm-input min-w-0 flex-1"
                          inputMode="tel"
                          value={coreDraft.phone}
                          disabled={!showCounselorProgressForm || saving || financeSaving}
                          onChange={(e) => setCoreDraft({ ...coreDraft, phone: e.target.value })}
                          placeholder="SĐT sinh viên"
                        />
                        <OmicallCallButton
                          leadId={lead.id}
                          leadName={lead.fullName || lead.customerId || 'Hồ sơ'}
                          phone={coreDraft.phone}
                          target="student"
                          disabled={saving || financeSaving}
                          placement="beside"
                        />
                      </div>
                    </label>
                    <label className="block min-w-0 text-xs font-medium text-slate-800">
                      Người liên hệ
                      <div className="mt-0.5 flex min-w-0 items-start gap-2">
                        <input
                          className="vm-input min-w-0 flex-1"
                          inputMode="tel"
                          value={coreDraft.parentPhone}
                          disabled={!showCounselorProgressForm || saving || financeSaving}
                          onChange={(e) => setCoreDraft({ ...coreDraft, parentPhone: e.target.value })}
                          placeholder="SĐT người liên hệ"
                        />
                        <OmicallCallButton
                          leadId={lead.id}
                          leadName={lead.fullName || lead.customerId || 'Hồ sơ'}
                          phone={coreDraft.parentPhone}
                          target="parent"
                          disabled={saving || financeSaving}
                          placement="beside"
                        />
                      </div>
                    </label>
                  </div>
                </section>
                <div className="scroll-touch flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain">
                  {detailLeftTab === 'profile' ? (
                    <aside className="flex min-h-0 flex-1 flex-col space-y-2 text-sm leading-snug text-slate-800">
                      <section className="flex min-h-0 flex-1 flex-col rounded-xl border border-slate-200/90 bg-white p-2 shadow-sm sm:p-2.5">
                        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2">
                          <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-600">
                            <span className="tabular-nums">
                              Điểm: {String(detailScoringPreview?.calculatedScore ?? lead.calculatedScore)}
                            </span>
                            <TagBadge tag={detailScoringPreview?.priorityTag ?? lead.priorityTag} />
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
                                className="rounded-lg border border-emerald-600 bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-40"
                              >
                                {saving ? 'Đang lưu…' : 'Lưu thông tin hồ sơ'}
                              </button>
                            </div>
                          ) : null}
                        </div>
                        {msg && detailLeftTab === 'profile' ? (
                          <p className="mt-1 shrink-0 text-xs font-medium text-amber-900">{msg}</p>
                        ) : null}
                        <div className="mt-2 flex flex-col">
                          <LeadProfileCoreForm
                            draft={coreDraft}
                            onChange={setCoreDraft}
                            disabled={!showCounselorProgressForm || financeSaving}
                            leadSources={leadSources}
                            scholarships={scholarships}
                            catalogs={profileCatalogs}
                            onEnsureCatalogEntry={onEnsureCatalogEntry}
                            layout="tabs"
                            wideGrid
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
                            Điểm: {String(detailScoringPreview?.calculatedScore ?? lead.calculatedScore)}
                          </span>
                          <TagBadge tag={detailScoringPreview?.priorityTag ?? lead.priorityTag} />
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
                                <p className="mt-1 text-[11px] leading-snug text-slate-600">
                                  Hàng chờ:{' '}
                                  <span className="font-semibold text-slate-800">
                                    {resolveCallWorkBucket(lead) === 'uncalled'
                                      ? 'Chưa gọi'
                                      : resolveCallWorkBucket(lead) === 'callback'
                                        ? 'Gọi lại'
                                        : 'Đã xử lý'}
                                  </span>
                                  {lead.lastCallDispositionLabel ? (
                                    <>
                                      {' '}
                                      · Note hiện tại:{' '}
                                      <span className="font-semibold text-slate-800">
                                        {lead.lastCallDispositionLabel}
                                      </span>
                                    </>
                                  ) : null}
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
                                <div className="mt-2" role="group" aria-label="Note sau gọi">
                                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                                    <p className="text-xs font-medium text-slate-800">
                                      Note sau gọi{' '}
                                      <span className="font-normal text-slate-500">
                                        (bấm chọn nhanh — đưa hồ sơ vào Gọi lại / Đã xử lý)
                                      </span>
                                    </p>
                                    {dispositionDraft ? (
                                      <button
                                        type="button"
                                        onClick={() => setDispositionDraft('')}
                                        className="text-[11px] font-semibold text-slate-600 underline-offset-2 hover:text-amber-800 hover:underline"
                                      >
                                        Bỏ chọn
                                      </button>
                                    ) : null}
                                  </div>
                                  {dispositionDraft ? (
                                    <p className="mt-1 text-[11px] text-amber-900">
                                      Đang chọn:{' '}
                                      <span className="font-semibold">
                                        {getCallDisposition(dispositionDraft)?.label ?? dispositionDraft}
                                      </span>
                                    </p>
                                  ) : (
                                    <p className="mt-1 text-[11px] text-slate-500">Chưa chọn note</p>
                                  )}
                                  {(
                                    [
                                      { bucket: 'callback' as const, title: 'Gọi lại' },
                                      { bucket: 'called' as const, title: 'Đã xử lý' },
                                    ] as const
                                  ).map((group) => {
                                    const items = CALL_DISPOSITIONS.filter((d) => d.bucket === group.bucket)
                                    if (!items.length) return null
                                    return (
                                      <div key={group.bucket} className="mt-2">
                                        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                                          {group.title}
                                        </p>
                                        <div className="mt-1 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                                          {items.map((d) => {
                                            const selected = dispositionDraft === d.id
                                            return (
                                              <button
                                                key={d.id}
                                                type="button"
                                                aria-pressed={selected}
                                                onClick={() =>
                                                  setDispositionDraft(selected ? '' : d.id)
                                                }
                                                className={[
                                                  'min-h-10 rounded-lg border px-2.5 py-2 text-left text-xs font-semibold leading-snug transition',
                                                  selected
                                                    ? 'border-amber-600 bg-amber-500 text-white shadow-sm ring-2 ring-amber-400/45'
                                                    : 'border-slate-200 bg-white text-slate-800 hover:border-amber-300 hover:bg-amber-50',
                                                ].join(' ')}
                                              >
                                                {d.label}
                                              </button>
                                            )
                                          })}
                                        </div>
                                      </div>
                                    )
                                  })}
                                </div>
                                <label className="mt-2 block text-xs font-medium text-slate-800">
                                  Ghi chú tương tác
                                  <textarea
                                    value={note}
                                    onChange={(e) => setNote(e.target.value)}
                                    rows={3}
                                    placeholder={
                                      crmEditOnRight
                                        ? 'Ghi nhận buổi làm việc — lưu kèm funnel / note sau gọi phía trên…'
                                        : 'Ghi nhận buổi làm việc — lưu kèm tình trạng / note sau gọi phía trên…'
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

                          <section className="rounded-xl border border-emerald-200/90 bg-gradient-to-br from-indigo-50/45 via-white to-slate-50/90 p-2 shadow-md ring-1 ring-emerald-900/10 sm:p-2.5">
                            <div className="flex items-start gap-1.5">
                              <h3 className="app-section-heading min-w-0 flex-1 leading-tight text-emerald-900">
                                Tín hiệu &amp; đánh giá tiềm năng
                              </h3>
                              <button
                                type="button"
                                className="mt-0.5 shrink-0 rounded-full border border-emerald-300/80 bg-white p-1 text-emerald-900 shadow-sm transition hover:bg-indigo-100"
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
                              className="w-[min(100vw-2rem,40rem)] max-h-[min(88dvh,40rem)] overflow-hidden rounded-xl border border-slate-200 bg-white p-0 text-slate-800 shadow-2xl backdrop:bg-slate-900/40"
                              onClick={(e) => {
                                if (e.target === signalsHelpRef.current) signalsHelpRef.current?.close()
                              }}
                            >
                              <div className="flex max-h-[min(88dvh,40rem)] flex-col">
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
                            ? 'border-indigo-500/55 bg-gradient-to-r from-indigo-600 to-indigo-600 text-white shadow-md'
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
                            key={`${lead.id}-${lead.updatedAt?.toMillis?.() ?? 0}`}
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
                              scoringOpts: detailScoringOpts,
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

      {closeDetailConfirmOpen ? (
        <>
          <button
            type="button"
            className="fixed inset-0 z-[130] bg-slate-900/50 backdrop-blur-[2px]"
            aria-label="Đóng xác nhận"
            onClick={() => setCloseDetailConfirmOpen(false)}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="close-detail-confirm-title"
            className="fixed left-1/2 top-1/2 z-[140] w-[min(calc(100vw-1.5rem),38rem)] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-amber-200/90 bg-white p-5 shadow-2xl sm:p-6"
          >
            <h2 id="close-detail-confirm-title" className="text-lg font-bold text-slate-900">
              Có thay đổi chưa lưu
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">
              Bạn đang chỉnh funnel, ghi chú hoặc tình trạng TVV. Đóng chi tiết bây giờ sẽ bỏ các thay đổi chưa lưu.
            </p>
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => setCloseDetailConfirmOpen(false)}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Tiếp tục chỉnh
              </button>
              <button
                type="button"
                onClick={() => {
                  setCloseDetailConfirmOpen(false)
                  onClose()
                }}
                className="rounded-xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-rose-700"
              >
                Đóng và bỏ thay đổi
              </button>
            </div>
          </div>
        </>
      ) : null}

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
              'fixed left-1/2 top-1/2 z-[120] flex h-[min(92dvh,880px)] max-h-[92dvh] w-[94vw] max-w-[96vw] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-amber-200/90 bg-white text-slate-900 shadow-2xl sm:w-[min(96vw,56rem)] lg:w-[min(92vw,72rem)]',
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
                  <p className="mt-0.5 text-xs leading-snug text-slate-600 sm:text-sm">{llmDialogHint}</p>
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

              {!aiIntegrationDiag.apiKeyPresent ? (
                <div className="mt-1 rounded-xl border border-rose-200 bg-rose-50/90 p-3 text-sm text-rose-950">
                  <p className="font-medium">Chưa cấu hình khóa AI</p>
                  <p className="mt-1 text-xs leading-relaxed">
                    Siêu quản trị vào{' '}
                    <Link
                      to="/settings?tab=connect&sub=llm"
                      className="font-semibold underline"
                      onClick={() => setLlmPopupOpen(false)}
                    >
                      Cài đặt → Tích hợp → AI & LLM
                    </Link>{' '}
                    để lưu khóa Gemini, OpenAI hoặc DeepSeek.
                  </p>
                </div>
              ) : null}

              {!aiTasksLoading && !aiTasks.length ? (
                <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50/90 p-3 text-sm text-amber-950">
                  <p className="font-medium">Chưa có tác vụ phân tích</p>
                  <p className="mt-1 text-xs leading-relaxed">
                    Quản trị vào{' '}
                    <Link
                      to="/settings?tab=connect&sub=llm"
                      className="font-semibold underline"
                      onClick={() => setLlmPopupOpen(false)}
                    >
                      Cài đặt → Tích hợp → AI & LLM
                    </Link>{' '}
                    và bấm «Tạo tác vụ mẫu tư vấn» (hoặc thêm tác vụ mới). Hệ thống cũng tự tạo tác vụ mẫu khi Quản trị
                    đăng nhập lần đầu sau cập nhật.
                  </p>
                </div>
              ) : null}

              <label className="mt-3 block text-sm font-medium text-slate-700">
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
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-600">Kết quả</p>
                  <AiInsightsGrid data={displayAiResult} />
                </div>
              ) : (
                <p className="mt-3 text-xs text-slate-500">
                  {!aiTasks.length
                    ? 'Tạo tác vụ trong Cài đặt → AI & LLM trước khi chạy.'
                    : !aiIntegrationDiag.apiKeyPresent
                      ? 'Cần khóa API trong Cài đặt → LLM trước khi chạy.'
                      : 'Chọn tác vụ và bấm chạy.'}
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
                  className="flex cursor-help items-center gap-2 rounded-xl border border-[var(--color-primary)]/25 bg-[var(--color-primary-soft)]/60 px-2.5 py-1.5 shadow-sm"
                  title={buildMlWinHoverText(leadMl)}
                >
                  <MlWinGauge value={leadMl.mlWinProbability} title={buildMlWinHoverText(leadMl)} />
                  <div className="min-w-0">
                    <p className="text-xs font-bold uppercase tracking-wide text-[var(--color-primary)]">Điểm thông tin</p>
                    <span className="text-sm font-bold text-[var(--color-primary)]">{leadMl.mlWinProbability}%</span>
                    <span className="ml-1.5 rounded bg-[var(--color-primary-soft)] px-1 text-xs font-semibold uppercase text-[var(--color-primary)]">
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

      {llmAccessHelpOpen ? (
        <>
          <button
            type="button"
            className="fixed inset-0 z-[110] cursor-default bg-slate-900/45 backdrop-blur-[2px]"
            aria-label="Đóng hướng dẫn quyền AI"
            onClick={() => setLlmAccessHelpOpen(false)}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="lead-llm-access-title"
            className="fixed left-1/2 top-1/2 z-[120] w-[94vw] max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-violet-200 bg-white p-4 shadow-2xl sm:max-w-2xl sm:p-5"
          >
            <div className="mb-3 flex items-start justify-between gap-2">
              <h2 id="lead-llm-access-title" className="text-base font-semibold text-slate-900">
                Cách bật AI trên hồ sơ
              </h2>
              <button
                type="button"
                onClick={() => setLlmAccessHelpOpen(false)}
                className="rounded-lg p-1 text-slate-500 hover:bg-slate-100"
                aria-label="Đóng"
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            </div>
            <LlmAccessHelpPanel />
          </div>
        </>
      ) : null}
    </div>
  )
}
