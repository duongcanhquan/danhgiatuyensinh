import type { MouseEvent } from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useSearchParams } from 'react-router-dom'
import { motion } from 'motion/react'
import { BookOpen, Bot, ChevronDown, CircleHelp, Download, Info as InfoIcon, Save, Sparkles, Wand2, X, Zap } from 'lucide-react'
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
  Lead,
  LeadCounselorStatus,
  LeadPipelineStatus,
  PriorityTag,
  ProfileCustomScoringSignal,
  ScoringProfile,
  ScriptSnippet,
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
import { LEAD_AI_INSIGHT_AGGREGATE_ID, useLeadAiInsightTasks } from '../hooks/useLeadAiInsightTasks'
import { useInteractions } from '../hooks/useInteractions'
import { useConsultingPlaybooks } from '../hooks/useConsultingPlaybooks'
import { useAuth } from '../hooks/useAuth'
import { useInfoScoreRules } from '../contexts/InfoScoreRulesContext'
import { canReassignTeamLeads, canWriteLead, hasGlobalLeadFilters } from '../auth/leadAccess'
import { isAdminLikeRole, isTeamLeadRole } from '../auth/roleUtils'
import { counselorIdsInManagerScope } from '../utils/teamScope'
import { useLeadScoring } from '../hooks/useLeadScoring'
import { TagBadge } from '../components/TagBadge'
import { playbooksMatchingLead } from '../utils/playbookMatch'
import { LeadConsultingHub, type ConsultingHubTab } from '../components/LeadConsultingHub'
import {
  evaluateLead,
  leadToEvaluationRecord,
  persistedLeadScoringFields,
  profileHasActiveRules,
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
import { buildLeadContextualRagBlock, countLeadRelevantKnowledge } from '../utils/knowledgeRag'
import { buildPlaybookContextBlock } from '../utils/counselingAiDefaults'
import { buildMlWinHoverText, resolveMlWinDisplay } from '../utils/mlWinMock'
import { useKnowledgeDocuments } from '../hooks/useKnowledgeDocuments'
import { useAITasks } from '../hooks/useAITasks'
import { MlWinGauge } from '../components/MlWinGauge'
import { useScriptSnippets } from '../hooks/useScriptSnippets'
import { ConsultingAssistantPanel } from '../components/ConsultingAssistantPanel'
import { LeadScoringSignalsPanel } from '../components/LeadScoringSignalsPanel'
import { LeadProfileCoreForm } from '../components/LeadProfileCoreForm'
import {
  buildLeadCoreFirestorePatch,
  isCoreDraftDirty,
  leadToCoreDraft,
  mergeCoreDraftIntoLead,
  mergeLeadDetailPreview,
} from '../utils/leadProfileEdit'
import { BulkLeadActionBar } from '../components/bulk/BulkLeadActionBar'
import { useCounselorDirectory } from '../hooks/useCounselorDirectory'
import { commitAuditLog } from '../services/auditLog'
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

const PIPELINE_LABEL: Record<LeadPipelineStatus, string> = {
  NEW: 'Má»›i',
  CONTACTED: 'ÄÃ£ liÃªn há»‡',
  QUALIFIED: 'Äá»§ Ä‘iá»u kiá»‡n',
  APPLIED: 'ÄÃ£ ná»™p há»“ sÆ¡',
  ENROLLED: 'ÄÃ£ ghi danh',
  LOST: 'KhÃ´ng cÃ²n tiá»m nÄƒng',
  ARCHIVED: 'LÆ°u trá»¯',
}

function interactionChannelVi(ch: string): string {
  const m: Record<string, string> = {
    NOTE: 'Ghi chÃº',
    CALL: 'Gá»i',
    SMS: 'SMS',
    EMAIL: 'Email',
    ZALO: 'Zalo',
    IN_PERSON: 'Trá»±c tiáº¿p',
    SYSTEM: 'Há»‡ thá»‘ng',
  }
  return m[ch] ?? ch
}

const TAG_OPTIONS: PriorityTag[] = ['HOT', 'WARM', 'COLD', 'LOSS']

const EVALUATION_TAGS = [
  'TÃ­ch cá»±c',
  'Cáº§n follow-up',
  'Váº¥n Ä‘á» tÃ i chÃ­nh',
  'ChÆ°a quyáº¿t Ä‘á»‹nh',
  'Quan tÃ¢m cao',
  'TiÃªu cá»±c',
  'KhÃ´ng quan tÃ¢m',
  'ChÆ°a rÃµ rÃ ng',
] as const

/** Tooltip cá»™t Äiá»ƒm thÃ´ng tin â€” Ä‘áº·t chuá»™t lÃªn nÃºt ? hoáº·c gauge Ä‘á»ƒ xem chi tiáº¿t. */
const ML_WIN_COLUMN_HINT =
  'Äiá»ƒm thÃ´ng tin = Ä‘á»™ Ä‘áº§y dá»¯ liá»‡u tÄ©nh trÃªn há»“ sÆ¡ (Ä‘iá»ƒm ná»n + cÃ¡c tiÃªu chÃ­ báº­t vÃ  khá»›p; káº¹p minâ€“max theo CÃ i Ä‘áº·t â†’ Äiá»ƒm thÃ´ng tin). BÃ¡m theo 20 cá»™t Excel quy chuáº©n + tiÃªu chÃ­ má»Ÿ rá»™ng (educationLevel, description) náº¿u báº­t. CÃ³ thá»ƒ ghi Ä‘Ã¨ tá»«ng lead trÃªn Firestore (mlWinProbability + mlExplanation). Äáº·t chuá»™t lÃªn vÃ²ng % Ä‘á»ƒ xem báº£ng chi tiáº¿t.'

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
  if (!uid) return 'â€”'
  return names.get(uid) ?? `${uid.slice(0, 8)}â€¦`
}

function effectiveLeadAssigneeUid(l: Lead): string {
  const u = l.assignedTo ?? l.assignedCounselorId
  return u ? String(u).trim() : ''
}

/** Bá» dÃ²ng nháº­t kÃ½ nháº­p `[Import]â€¦` khá»i mÃ´ táº£ â€” chá»‰ dÃ¹ng khi hiá»ƒn thá»‹, khÃ´ng sá»­a dá»¯ liá»‡u gá»‘c. */
function leadDescriptionForDisplay(raw: string | undefined): string {
  if (!raw?.trim()) return ''
  const kept = raw.split('\n').filter((line) => {
    const t = line.trim()
    return !(t && /^\[Import\]/i.test(t))
  })
  return kept.join('\n').replace(/^\s+|\s+$/g, '')
}

/** RÃºt gá»n ghi chÃº / mÃ´ táº£ trÃªn báº£ng â€” báº£n Ä‘áº§y Ä‘á»§ trong `title` Ã´ hoáº·c trong panel chi tiáº¿t. */
function formatDescPreview(raw: string | undefined, max = 64): string {
  const cleaned = leadDescriptionForDisplay(raw)
  const t = cleaned.replace(/\s+/g, ' ').trim()
  if (!t) return 'â€”'
  return t.length <= max ? t : `${t.slice(0, max).trim()}â€¦`
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
  const { profile, permissions, can, canRunLlmAnalysis } = useAuth()
  const { runtime: infoScoreRuntime } = useInfoScoreRules()
  const { users: directoryUsers, counselors: counselorUsers, loading: counselorsLoading } = useCounselorDirectory()
  const { documents: knowledgeDocuments } = useKnowledgeDocuments()

  const [searchParams, setSearchParams] = useSearchParams()
  const urlQuery = (searchParams.get(LWF.Q) ?? '').trim().toLowerCase()

  const [sortKey, setSortKey] = useState<
    | 'none'
    | 'fullName'
    | 'phone'
    | 'educationLevel'
    | 'province'
    | 'source'
    | 'score'
    | 'mlWin'
    | 'priorityTag'
    | 'pipelineStatus'
  >('none')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')

  const showAdminGlobalFilters = hasGlobalLeadFilters(permissions)
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
  const [schoolFilter, setSchoolFilter] = useState<string>('ALL')
  /** Lá»c TVV phá»¥ trÃ¡ch (client); '' = táº¥t cáº£, __UNASSIGNED__ = chÆ°a gÃ¡n. */
  const [assigneeFilter, setAssigneeFilter] = useState<string>('')
  const [scoreMinInput, setScoreMinInput] = useState('')
  const [scoreMaxInput, setScoreMaxInput] = useState('')
  const [aiShortlistOnly, setAiShortlistOnly] = useState(false)
  const [aiShortlistGuideOpen, setAiShortlistGuideOpen] = useState(false)

  /** Lá»c HOT/WARM/COLD theo Ä‘iá»ƒm profile hiá»‡n táº¡i â€” khÃ´ng dÃ¹ng `where(priorityTag)`; cáº§n quÃ©t gáº§n Ä‘Ã¢y (fullScope). */
  const tagClientEval = tagFilter !== 'ALL' && !urlQuery.trim()

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
    if (showAdminGlobalFilters && adminSchools.length) {
      o.highSchoolIn = adminSchools.slice(0, 10)
    } else if (schoolFilter !== 'ALL') {
      o.highSchoolIn = [schoolFilter]
    }
    if (aiShortlistOnly) o.aiShortlistedOnly = true
    if (showAdminGlobalFilters) {
      if (adminUploaderIds.length) o.uploadedByIn = adminUploaderIds.slice(0, 10)
      if (adminRegions.length) o.provinceIn = adminRegions.slice(0, 10)
      if (!tagClientEval) {
        if (adminTags.length === 1) {
          o.priorityTag = adminTags[0]
        } else if (adminTags.length > 1) {
          o.priorityTagsIn = adminTags.slice(0, 10) as PriorityTag[]
        }
      }
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
    schoolFilter,
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
    schoolTvvSignalDefs,
  } = useLeadScoring(leads)

  const scoringProfileRulesWarning = useMemo(() => {
    if (profilesLoading || !activeScoringProfile) return null
    if (profileHasActiveRules(activeScoringProfile)) return null
    return 'Bộ chấm điểm đang chọn chưa có quy tắc cộng điểm — vào Cài đặt → Chấm điểm hồ sơ, kéo mẫu vào canvas và Lưu profile.'
  }, [profilesLoading, activeScoringProfile])

  const effectiveLeadTag = useCallback(
    (l: Lead) => (activeScoringProfile ? (scoreByLeadId.get(l.id)?.priorityTag ?? l.priorityTag) : l.priorityTag),
    [activeScoringProfile, scoreByLeadId],
  )

  /** Äáº¿m theo tá»«ng nhÃ£n trÃªn táº­p `leads` Ä‘Ã£ táº£i (dÃ¹ng khi tÃ­nh láº¡i nhÃ£n theo profile â€” fullScope). */
  const tagCountsFromLoadedLeads = useMemo(() => {
    const m: Record<PriorityTag, number> = { HOT: 0, WARM: 0, COLD: 0, LOSS: 0 }
    for (const l of leads) {
      const t = effectiveLeadTag(l)
      if (t in m) m[t]++
    }
    return m
  }, [leads, effectiveLeadTag])

  /**
   * Sá»‘ trong ngoáº·c trÃªn nÃºt lá»c nhanh: Firestore aggregation (Ä‘Ãºng pháº¡m vi lá»c, khÃ´ng giá»›i háº¡n 30/trang)
   * khi dÃ¹ng nhÃ£n Ä‘Ã£ lÆ°u; khi tÃ­nh láº¡i theo profile thÃ¬ Ä‘áº¿m trÃªn táº­p fullScope Ä‘Ã£ táº£i.
   * Khi Ä‘ang tÃ¬m kiáº¿m chuá»—i: khÃ´ng hiá»ƒn thá»‹ (full-text lÃ  client-side, khÃ´ng cÃ³ chá»‰ sá»‘ server tÆ°Æ¡ng á»©ng).
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
    if (hasGlobalLeadFilters(permissions)) {
      const extras = directoryUsers.filter(
        (u) => u.isActive && isAdminLikeRole(u.role) && !base.some((c) => c.id === u.id),
      )
      return [...base, ...extras].sort((a, b) =>
        formatStaffDirectoryLabel(a).localeCompare(formatStaffDirectoryLabel(b), 'vi'),
      )
    }
    if (profile && isTeamLeadRole(profile.role)) {
      const team = new Set(counselorIdsInManagerScope(profile, directoryUsers))
      return base
        .filter((c) => team.has(c.id))
        .sort((a, b) => formatStaffDirectoryLabel(a).localeCompare(formatStaffDirectoryLabel(b), 'vi'))
    }
    return base
  }, [counselorUsers, directoryUsers, permissions, profile])

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
  const institutionalRagBlock = useMemo(
    () =>
      selected
        ? buildLeadContextualRagBlock(selected, knowledgeDocuments)
        : '',
    [selected, knowledgeDocuments],
  )
  /** Chi tiáº¿t há»“ sÆ¡: form tiáº¿n Ä‘á»™/ghi chÃº cÃ²n thay Ä‘á»•i chÆ°a lÆ°u â€” dÃ¹ng trong onClose (confirm). */
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
        'CÃ³ thay Ä‘á»•i chÆ°a lÆ°u (funnel, ghi chÃº hoáº·c tÃ¬nh tráº¡ng TVV náº¿u chá»‰nh á»Ÿ cá»™t trÃ¡i). ÄÃ³ng chi tiáº¿t vÃ  bá» cÃ¡c thay Ä‘á»•i?',
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

  const canTeamReassign = canReassignTeamLeads(permissions)
  const canPeerReassignLeads = Boolean(can('leads:reassign:peer'))
  const showBulkReassign = canTeamReassign || canPeerReassignLeads
  const reassignElevated = canTeamReassign
  const canBulkWrite = Boolean(
    can('leads:write:self_assigned') || can('leads:write:team_scope') || isAdminLikeRole(profile?.role),
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
        const displayScore = activeScoringProfile
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
      activeScoringProfile
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
        case 'source':
          return (a.source || '').localeCompare(b.source || '', 'vi') * dir
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
  }, [filtered, sortKey, sortDir, effectiveLeadTag, activeScoringProfile, scoreByLeadId, infoScoreRuntime])

  /** PhÃ¢n trang theo Firestore / bucket tÃ¬m kiáº¿m â€” hook Ä‘Ã£ tráº£ Ä‘Ãºng má»™t trang (â‰¤30 dÃ²ng). */
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
    setAdminUploaderIds([])
    setAdminRegions([])
    setAdminTags([])
    setAdminSchools([])
    setAdminAssignedCounselorIds([])
    setAdminDateFrom('')
    setAdminDateTo('')
    setSearchParams((prev) => stripListFiltersKeepOpenView(prev), { replace: true })
    setPage(1)
  }, [setSearchParams, setPage])

  const activeFilterChips = useMemo(() => {
    type Chip = { id: string; label: string; onClear: () => void }
    const out: Chip[] = []
    const qRaw = (searchParams.get(LWF.Q) ?? '').trim()
    if (qRaw) {
      const short = qRaw.length > 26 ? `${qRaw.slice(0, 26)}â€¦` : qRaw
      out.push({
        id: 'q',
        label: `TÃ¬m Â«${short}Â»`,
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
        label: `NhÃ£n: ${tagFilter}`,
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
        label: `VÃ¹ng: ${regionFilter}`,
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
        label: `Há»‡: ${majorFilter.length > 20 ? `${majorFilter.slice(0, 20)}â€¦` : majorFilter}`,
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
        label: `TÆ° váº¥n: ${LEAD_COUNSELOR_STATUS_LABELS[crmStatusFilter as LeadCounselorStatus]}`,
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
        label: `TrÆ°á»ng: ${schoolFilter.length > 18 ? `${schoolFilter.slice(0, 18)}â€¦` : schoolFilter}`,
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
          ? 'ChÆ°a gÃ¡n TVV'
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
            ? `Äiá»ƒm: ${minN}â€“${maxN}`
            : minN != null
              ? `Äiá»ƒm â‰¥ ${minN}`
              : `Äiá»ƒm â‰¤ ${maxN}`,
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
        label: 'Chá»‰ há»“ sÆ¡ AI Ä‘Ã£ Ä‘Ã¡nh dáº¥u',
        onClear: () => {
          setAiShortlistOnly(false)
          setPage(1)
        },
      })
    }
    const adminHas =
      showAdminGlobalFilters &&
      (adminUploaderIds.length > 0 ||
        adminRegions.length > 0 ||
        adminTags.length > 0 ||
        adminSchools.length > 0 ||
        adminAssignedCounselorIds.length > 0 ||
        Boolean(adminDateFrom.trim()) ||
        Boolean(adminDateTo.trim()))
    if (adminHas) {
      out.push({
        id: 'admin',
        label: 'Bá»™ lá»c Admin',
        onClear: () => {
          setAdminUploaderIds([])
          setAdminRegions([])
          setAdminTags([])
          setAdminSchools([])
          setAdminAssignedCounselorIds([])
          setAdminDateFrom('')
          setAdminDateTo('')
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
    showAdminGlobalFilters,
    adminUploaderIds,
    adminRegions,
    adminTags,
    adminSchools,
    adminAssignedCounselorIds,
    adminDateFrom,
    adminDateTo,
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
      profileName: activeScoringProfile?.profileName ?? 'Máº·c Ä‘á»‹nh',
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
    if (!reassignElevated && canPeerReassignLeads) {
      for (const id of selectedIds) {
        const row = leads.find((x) => x.id === id)
        const owner = row?.assignedTo ?? row?.assignedCounselorId
        if (owner !== profile.id) {
          window.alert(
            'Chỉ có thể «Giao việc hàng loạt» cho các hồ sơ đang gán cho bạn. Bỏ chọn hồ sơ của đồng nghiệp hoặc liên hệ Trưởng nhóm / Quản trị.',
          )
          return
        }
      }
    }
    if (reassignElevated && profile && isTeamLeadRole(profile.role)) {
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
          description: `PhÃ¢n cÃ´ng hÃ ng loáº¡t â†’ ${targetLabel}${prev ? ` (trÆ°á»›c: ${prev.assignedTo ?? prev.assignedCounselorId ?? 'â€”'})` : ''}`,
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
    reassignElevated,
    canPeerReassignLeads,
    directoryUsers,
    can,
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
          description: `TÃ¬nh tráº¡ng tÆ° váº¥n (hÃ ng loáº¡t): ${prev ? LEAD_COUNSELOR_STATUS_LABELS[prev.status] : 'â€”'} â†’ ${LEAD_COUNSELOR_STATUS_LABELS[bulkCrmStatus]}`,
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
          'PhÃ¢n tÃ­ch AI cáº§n Ä‘Æ°á»£c quáº£n lÃ½ báº­t Â«Cho phÃ©p dÃ¹ng AI trÃªn há»“ sÆ¡Â» trong CÃ i Ä‘áº·t â†’ Quáº£n lÃ½ nhÃ¢n sá»±, hoáº·c dÃ¹ng tÃ i khoáº£n SiÃªu quáº£n trá»‹.',
        )
        return
      }
      const cfg = resolveAIIntegrationConfig()
      if (!cfg) {
        setAiMinerError(
          'ChÆ°a cÃ³ khÃ³a AI â€” vÃ o CÃ i Ä‘áº·t â†’ LLM â†’ API rá»“i báº¥m LÆ°u, hoáº·c Ä‘áº·t VITE_AI_API_KEY (tuá»³ chá»n VITE_AI_PROVIDER=OpenAI|Gemini, VITE_AI_MODEL) trong .env vÃ  cháº¡y láº¡i dev/build.',
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
              (r.isShortlisted ? 'ÄÆ°á»£c AI Ä‘Ã¡nh dáº¥u shortlist â€” xem nháº­t kÃ½ tÆ°Æ¡ng tÃ¡c.' : 'KhÃ´ng Ä‘á»§ tÃ­n hiá»‡u shortlist.'),
            recommendedAction:
              r.nextBestAction ||
              (r.isShortlisted ? 'LiÃªn há»‡ ngay theo kÃªnh Æ°u tiÃªn cá»§a phá»¥ huynh.' : 'Tiáº¿p tá»¥c nuÃ´i lead trong nhÃ³m WARM.'),
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
              (r.isShortlisted ? 'ÄÆ°á»£c AI Ä‘Ã¡nh dáº¥u shortlist â€” xem nháº­t kÃ½ tÆ°Æ¡ng tÃ¡c.' : 'KhÃ´ng Ä‘á»§ tÃ­n hiá»‡u shortlist.'),
            recommendedAction:
              r.nextBestAction ||
              (r.isShortlisted ? 'LiÃªn há»‡ ngay theo kÃªnh Æ°u tiÃªn cá»§a phá»¥ huynh.' : 'Tiáº¿p tá»¥c nuÃ´i lead trong nhÃ³m WARM.'),
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
              (r.isShortlisted ? 'ÄÆ°á»£c AI Ä‘Ã¡nh dáº¥u shortlist â€” xem nháº­t kÃ½ tÆ°Æ¡ng tÃ¡c.' : 'KhÃ´ng Ä‘á»§ tÃ­n hiá»‡u shortlist.'),
            recommendedAction:
              r.nextBestAction ||
              (r.isShortlisted ? 'LiÃªn há»‡ ngay theo kÃªnh Æ°u tiÃªn cá»§a phá»¥ huynh.' : 'Tiáº¿p tá»¥c nuÃ´i lead trong nhÃ³m WARM.'),
            aiProcessedAt: processedAt,
            ...touchAfter,
          }
        })
        const performer = profile.displayName?.trim() || profile.email || profile.id
        const shorted = results.filter((x) => x.isShortlisted).length
        await commitAuditLog(db, {
          leadId: warmPassed[0]!.id,
          actionType: 'AI_RUN',
          description: `AI Lead Miner (shortlist, sau Gatekeeper): ${results.length} há»“ sÆ¡ â†’ ${shorted} shortlist`,
          performedBy: profile.id,
          performedByName: performer,
        })
        refetchLeads()
      } catch (e) {
        console.error(e)
        setAiMinerError(e instanceof Error ? e.message : 'KhÃ´ng cháº¡y Ä‘Æ°á»£c AI Lead Miner.')
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
        'PhÃ¢n tÃ­ch AI cáº§n Ä‘Æ°á»£c quáº£n lÃ½ báº­t Â«Cho phÃ©p dÃ¹ng AI trÃªn há»“ sÆ¡Â» trong CÃ i Ä‘áº·t â†’ Quáº£n lÃ½ nhÃ¢n sá»±, hoáº·c dÃ¹ng tÃ i khoáº£n SiÃªu quáº£n trá»‹.',
      )
      return
    }
    const cfg = resolveAIIntegrationConfig()
    if (!cfg) {
      setAiMinerError(
        'ChÆ°a cÃ³ khÃ³a AI â€” vÃ o CÃ i Ä‘áº·t â†’ LLM â†’ API rá»“i báº¥m LÆ°u, hoáº·c Ä‘áº·t VITE_AI_API_KEY trong .env vÃ  cháº¡y láº¡i dev/build.',
      )
      return
    }
    const warmRows = leads.filter((l) => selectedIds.has(l.id) && effectiveLeadTag(l) === 'WARM')
    if (!warmRows.length) {
      setAiMinerError('Chá»n Ã­t nháº¥t má»™t há»“ sÆ¡ cÃ³ nhÃ£n WARM (theo profile cháº¥m Ä‘iá»ƒm hiá»‡n táº¡i).')
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
        e instanceof Error ? e.message : 'KhÃ´ng táº£i Ä‘Æ°á»£c lá»‹ch sá»­ tÆ°Æ¡ng tÃ¡c Ä‘á»ƒ kiá»ƒm tra trÆ°á»›c khi cháº¡y AI.',
      )
    } finally {
      setGatekeeperBusy(false)
    }
  }, [db, profile, leads, selectedIds, effectiveLeadTag, canRunLlmAnalysis])

  const exportBulkSelection = useCallback(() => {
    const rows = leads.filter((l) => selectedIds.has(l.id))
    exportSelectedEvaluatedLeadsToXlsx(rows, selectedIds, evalMapForExport(rows), {
      profileName: activeScoringProfile?.profileName ?? 'Máº·c Ä‘á»‹nh',
    })
  }, [leads, selectedIds, evalMapForExport, activeScoringProfile])

  return (
    <div className="space-y-3">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <VietMyAccentHeading as="h1" tone="onLight" size="xl" className="block">
            Há»“ sÆ¡
          </VietMyAccentHeading>
        </div>
        {!configured || !db ? (
          <span className="rounded-full border border-amber-300/70 bg-amber-50 px-3 py-1 text-xs text-amber-900">
            Firebase chÆ°a cáº¥u hÃ¬nh.
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
                <span className="text-sm font-semibold text-slate-800">Lá»c theo ngÃ y, TVV, ngÆ°á»i táº£i, vÃ¹ngâ€¦</span>
                <span className="text-slate-400 transition group-open:rotate-90">â€º</span>
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
                XÃ³a lá»c admin
              </button>
            </div>
          </summary>
          <div className="border-t border-slate-200/80 px-4 pb-4 pt-2 md:px-5 md:pb-5">
            <div className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200/60 bg-white/40 p-3">
              <label className="flex flex-col text-xs font-medium text-slate-600">
                Má»‘c thá»i gian
                <select
                  value={adminDateField}
                  onChange={(e) => setAdminDateField(e.target.value as AdminDateField)}
                  className="mt-1 min-w-[9rem] rounded-lg border border-slate-200/95 bg-white px-2 py-1.5 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-amber-200"
                >
                  <option value="created">NgÃ y táº¡o</option>
                  <option value="updated">Cáº­p nháº­t gáº§n nháº¥t</option>
                  <option value="imported">NgÃ y nháº­p (import)</option>
                </select>
              </label>
              <label className="flex flex-col text-xs font-medium text-slate-600">
                Tá»« ngÃ y
                <input
                  type="date"
                  value={adminDateFrom}
                  onChange={(e) => setAdminDateFrom(e.target.value)}
                  className="mt-1 rounded-lg border border-slate-200/95 bg-white px-2 py-1.5 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-amber-200"
                />
              </label>
              <label className="flex flex-col text-xs font-medium text-slate-600">
                Äáº¿n ngÃ y
                <input
                  type="date"
                  value={adminDateTo}
                  onChange={(e) => setAdminDateTo(e.target.value)}
                  className="mt-1 rounded-lg border border-slate-200/95 bg-white px-2 py-1.5 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-amber-200"
                />
              </label>
            </div>
            <div className="mt-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">TÆ° váº¥n viÃªn Ä‘Æ°á»£c gÃ¡n</p>
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
                    {counselorsLoading ? 'Äang táº£i danh báº¡ TVVâ€¦' : 'ChÆ°a cÃ³ tÃ i khoáº£n counselor trong há»‡ thá»‘ng.'}
                  </p>
                )}
              </div>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">NgÆ°á»i táº£i</p>
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
                    <p className="text-xs text-slate-500">ChÆ°a cÃ³ dá»¯ liá»‡u ngÆ°á»i táº£i.</p>
                  )}
                </div>
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">VÃ¹ng / tá»‰nh</p>
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
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">NhÃ£n (profile)</p>
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
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">TrÆ°á»ng THPT</p>
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
                    <span className="self-center text-xs text-slate-500">+{schoolOptions.length - 36}â€¦</span>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        </details>
      ) : null}

      <section className="app-card-glass-strong space-y-2 p-2 shadow-md sm:p-3">
        {scoringProfileRulesWarning ? (
          <p className="rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-2 text-xs font-medium text-amber-950">
            {scoringProfileRulesWarning}
          </p>
        ) : null}
        <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:gap-3">
          <details className="group min-w-0 flex-1 rounded-lg border border-slate-200/80 bg-white/50 px-2 py-1 shadow-sm open:bg-white/85 sm:px-2.5">
            <summary className="flex cursor-pointer list-none items-center gap-2 rounded-md py-1 text-xs font-bold uppercase tracking-wide text-slate-600 marker:content-none [&::-webkit-details-marker]:hidden">
              <ChevronDown
                className="h-4 w-4 shrink-0 text-slate-500 transition duration-200 group-open:rotate-180"
                strokeWidth={2}
                aria-hidden
              />
              <span className="shrink-0">Bá»™ cháº¥m Ä‘iá»ƒm</span>
              <span className="min-w-0 flex-1 truncate text-left text-xs font-semibold normal-case tracking-normal text-slate-800 group-open:hidden">
                {profilesLoading
                  ? 'Äang táº£iâ€¦'
                  : activeScoringProfile?.profileName?.trim() || (!scoringProfiles.length ? 'ChÆ°a cÃ³ profile' : 'â€”')}
              </span>
            </summary>
            <div className="mt-2 flex flex-col gap-2 border-t border-slate-200/60 pt-2 sm:flex-row sm:items-end">
              <label className="min-w-0 flex-1 text-xs font-bold uppercase tracking-wide text-slate-500">
                Chá»n profile
                <div className="relative mt-0.5">
                  <select
                    value={resolvedScoringProfileId ?? ''}
                    disabled={!scoringProfiles.length || profilesLoading}
                    onChange={(e) => setScoringProfileId(e.target.value || null)}
                    className="w-full appearance-none rounded-lg border border-slate-200/95 bg-white/95 py-1.5 pl-2 pr-7 text-xs font-medium text-slate-900 shadow-inner outline-none transition focus:border-amber-400 focus:ring-1 focus:ring-amber-100 disabled:opacity-50 sm:min-w-[12rem]"
                  >
                    {!scoringProfiles.length ? (
                      <option value="">ChÆ°a cÃ³ profile â€” Cáº¥u hÃ¬nh</option>
                    ) : null}
                    {scoringProfiles.map((p) => (
                      <option key={p.id} value={p.id} className="bg-white text-slate-900">
                        {p.profileName} Â· HOTâ‰¥{p.thresholds?.hotMinScore ?? 'â€”'} Â· WARMâ‰¥{p.thresholds?.warmMinScore ?? 'â€”'}
                      </option>
                    ))}
                  </select>
                  <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-slate-500">
                    â–¾
                  </span>
                </div>
              </label>
              <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  disabled={!activeScoringProfile}
                  onClick={() => setInspectProfileOpen(true)}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200/95 bg-white px-2 py-1.5 text-xs font-medium text-slate-800 shadow-sm transition hover:border-amber-300 hover:bg-amber-50/80 disabled:opacity-40"
                >
                  <InfoIcon className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  Quy táº¯c
                </button>
                <button
                  type="button"
                  disabled={!sortedFiltered.length}
                  onClick={handleExportEvaluated}
                  className="inline-flex items-center gap-1 rounded-lg border border-emerald-300 bg-emerald-50 px-2 py-1.5 text-xs font-semibold text-emerald-900 shadow-sm transition hover:border-emerald-400 hover:bg-emerald-100 disabled:opacity-40"
                >
                  <Download className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  Xuáº¥t Excel (trang hiá»‡n táº¡i)
                </button>
              </div>
            </div>
            <div className="mt-2 flex flex-col gap-1.5 border-t border-amber-100/90 pt-2">
              <p className="text-xs leading-snug text-slate-600">
                <span className="font-semibold text-slate-800">Lá»c nhanh theo nhÃ£n (profile Ä‘ang chá»n)</span>
                {urlQuery.trim() ? (
                  <>
                    {' '}
                    â€” khi Ä‘ang <strong>tÃ¬m kiáº¿m</strong>, cá»™t Â«NhÃ£nÂ» bÃªn dÆ°á»›i lá»c theo <strong>nhÃ£n Ä‘Ã£ lÆ°u</strong> trÃªn
                    há»“ sÆ¡; sá»‘ lÆ°á»£ng trÃªn cÃ¡c nÃºt HOT/WARMâ€¦ táº¡m áº©n (tÃ¬m kiáº¿m lÃ  lá»c client trÃªn trang táº£i).
                  </>
                ) : (
                  <>
                    {' '}
                    â€” HOT / WARM / COLD / LOSS: sá»‘ trong ngoáº·c lÃ  <strong>tá»•ng trong pháº¡m vi lá»c</strong> (Firestore),
                    khÃ´ng chá»‰ 30 dÃ²ng trang hiá»‡n táº¡i. Khi <strong>khÃ´ng</strong> Ä‘ang tÃ¬m kiáº¿m vÃ  báº¡n chá»n nhÃ£n, cÃ¡c
                    nhÃ£n Ä‘Æ°á»£c <strong>tÃ­nh láº¡i</strong> theo bá»™ Ä‘iá»ƒm Ä‘ang chá»n (tá»‘i Ä‘a{' '}
                    {LEADS_UI_FULL_SCOPE_MAX.toLocaleString('vi-VN')} há»“ sÆ¡ cáº­p nháº­t gáº§n Ä‘Ã¢y).
                  </>
                )}
              </p>
              <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Lá»c nhanh nhÃ£n cháº¥m Ä‘iá»ƒm">
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
                  Táº¥t cáº£
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
                  ÄÃ£ Ä‘áº¡t giá»›i háº¡n táº£i ({LEADS_UI_FULL_SCOPE_MAX.toLocaleString('vi-VN')} há»“ sÆ¡) â€” cÃ³ thá»ƒ thiáº¿u má»™t
                  pháº§n á»Ÿ Ä‘uÃ´i danh sÃ¡ch.
                </p>
              ) : null}
            </div>
          </details>
          <label className="min-w-0 w-full text-xs font-bold uppercase tracking-wide text-slate-500 lg:max-w-md lg:flex-1">
            TÃ¬m kiáº¿m
            <input
              value={searchParams.get(LWF.Q) ?? ''}
              onChange={(e) => setUrlQuery(e.target.value)}
              placeholder="TÃªn, SÄT, mÃ£ KH, TVVâ€¦"
              title="TÃ¬m trong cÃ¡c thÃ´ng tin hiá»ƒn thá»‹ trÃªn há»“ sÆ¡ (tÃªn, SÄT, mÃ£ KH, mÃ´ táº£, TVVâ€¦). CÃ³ thá»ƒ dÃ¹ng chung vá»›i cÃ¡c lá»c bÃªn dÆ°á»›i."
              className="mt-0.5 w-full rounded-lg border border-slate-200/95 bg-white px-2.5 py-1.5 text-sm text-slate-900 outline-none transition focus:border-amber-400 focus:ring-1 focus:ring-amber-100"
            />
          </label>
        </div>

        <div className="flex flex-nowrap items-end gap-1.5 overflow-x-auto border-t border-slate-200/70 pb-0.5 pt-2 [scrollbar-width:thin]">
          <FilterSelect
            compact
            label="NhÃ£n"
            title="NhÃ£n HOT / WARM / COLD theo bá»™ cháº¥m Ä‘iá»ƒm Ä‘ang chá»n á»Ÿ Ä‘áº§u trang (khi Ä‘ang tÃ¬m kiáº¿m cÃ³ thá»ƒ dÃ¹ng nhÃ£n Ä‘Ã£ lÆ°u trÃªn há»“ sÆ¡)."
            value={tagFilter}
            onChange={(v) => {
              setTagFilter(v)
              setPage(1)
              mergeListFilterUrl({ [LWF.TAG]: v === 'ALL' ? null : v })
            }}
            options={[
              { v: 'ALL', t: 'Táº¥t cáº£' },
              ...TAG_OPTIONS.map((t) => ({ v: t, t })),
            ]}
          />
          <FilterSelect
            compact
            label="VÃ¹ng"
            title="Tá»‰nh / thÃ nh trÃªn há»“ sÆ¡."
            value={regionFilter}
            onChange={(v) => {
              setRegionFilter(v)
              setPage(1)
              mergeListFilterUrl({ [LWF.REGION]: v === 'ALL' ? null : v })
            }}
            options={[
              { v: 'ALL', t: 'Táº¥t cáº£' },
              ...regions.map((p) => ({ v: p, t: p })),
            ]}
          />
          <FilterSelect
            compact
            label="Há»‡ ÄT"
            title="NgÃ nh / há»‡ Ä‘Ã o táº¡o ghi trÃªn há»“ sÆ¡."
            value={majorFilter}
            onChange={(v) => {
              setMajorFilter(v)
              setPage(1)
              mergeListFilterUrl({ [LWF.MAJOR]: v === 'ALL' ? null : v })
            }}
            options={[
              { v: 'ALL', t: 'Táº¥t cáº£' },
              ...majors.map((p) => ({ v: p, t: p })),
            ]}
          />
          <FilterSelect
            compact
            label="Funnel"
            title="Giai Ä‘oáº¡n tuyá»ƒn sinh trÃªn há»“ sÆ¡ (khÃ¡c vá»›i cá»™t Â«TÆ° váº¥nÂ» â€” tiáº¿n Ä‘á»™ lÃ m viá»‡c vá»›i TVV)."
            value={statusFilter}
            onChange={(v) => {
              setStatusFilter(v)
              setPage(1)
              mergeListFilterUrl({ [LWF.PIPE]: v === 'ALL' ? null : v })
            }}
            options={[
              { v: 'ALL', t: 'Táº¥t cáº£' },
              ...(Object.keys(PIPELINE_LABEL) as LeadPipelineStatus[]).map((k) => ({
                v: k,
                t: PIPELINE_LABEL[k],
              })),
            ]}
          />
          <FilterSelect
            compact
            label="TÆ° váº¥n"
            title="Tiáº¿n Ä‘á»™ lÃ m viá»‡c vá»›i tÆ° váº¥n viÃªn (CRM)."
            value={crmStatusFilter}
            onChange={(v) => {
              setCrmStatusFilter(v)
              setPage(1)
              mergeListFilterUrl({ [LWF.CRM]: v === 'ALL' ? null : v })
            }}
            options={[
              { v: 'ALL', t: 'Táº¥t cáº£' },
              ...LEAD_COUNSELOR_STATUS_ORDER.map((k) => ({ v: k, t: LEAD_COUNSELOR_STATUS_LABELS[k] })),
            ]}
          />
          <FilterSelect
            compact
            label="Nguồn"
            title="Kênh hồ sơ đến (web, Zalo, giới thiệu…). Lọc theo trường source trên Firestore."
            value={sourceFilter}
            onChange={(v) => {
              setSourceFilter(v)
              setPage(1)
              mergeListFilterUrl({ [LWF.SOURCE]: v === 'ALL' ? null : v })
            }}
            options={[
              { v: 'ALL', t: 'Tất cả' },
              ...sources.map((s) => ({ v: s, t: s.length > 36 ? `${s.slice(0, 36)}…` : s })),
            ]}
          />
          <FilterSelect
            compact
            label="TrÆ°á»ng THPT"
            title="TrÆ°á»ng THPT cá»§a thÃ­ sinh. Äá»‹a chá»‰ trang cÃ³ thá»ƒ lÆ°u láº¡i Ä‘á»ƒ ngÆ°á»i khÃ¡c má»Ÿ cÃ¹ng bá»™ lá»c (náº¿u cÃ³ quyá»n xem)."
            value={schoolFilter}
            onChange={(v) => {
              setSchoolFilter(v)
              setPage(1)
              mergeListFilterUrl({ [LWF.SCHOOL]: v === 'ALL' ? null : v })
            }}
            options={[
              { v: 'ALL', t: 'Táº¥t cáº£' },
              ...schoolOptions.slice(0, 80).map((sc) => ({
                v: sc,
                t: sc.length > 40 ? `${sc.slice(0, 40)}â€¦` : sc,
              })),
            ]}
          />
          <FilterSelect
            compact
            label="TVV"
            title="TVV Ä‘Æ°á»£c phÃ¢n cÃ´ng (Ã¡p dá»¥ng trÃªn danh sÃ¡ch Ä‘ang hiá»ƒn thá»‹)."
            value={assigneeFilter}
            onChange={(v) => {
              setAssigneeFilter(v)
              setPage(1)
              mergeListFilterUrl({ [LWF.ASSIGN]: v ? v : null })
            }}
            options={[
              { v: '', t: 'Táº¥t cáº£ TVV' },
              { v: '__UNASSIGNED__', t: 'ChÆ°a gÃ¡n TVV' },
              ...reassignPickList.map((c) => ({
                v: c.id,
                t: formatStaffDirectoryLabel(c),
              })),
            ]}
          />
          <label className="flex shrink-0 flex-col text-xs font-bold uppercase tracking-wide text-slate-500" title="Lá»c theo Ä‘iá»ƒm Ä‘Ã£ lÆ°u / Ä‘iá»ƒm preview profile (cá»™t Äiá»ƒm).">
            Äiá»ƒm tá»«
            <input
              type="number"
              inputMode="numeric"
              placeholder="â€”"
              value={scoreMinInput}
              onChange={(e) => setScoreMinInput(e.target.value)}
              className="mt-0.5 w-[4.5rem] shrink-0 rounded-md border border-slate-200/95 bg-white px-1.5 py-1 text-xs tabular-nums text-slate-900 outline-none transition focus:border-amber-400 focus:ring-1 focus:ring-amber-100"
            />
          </label>
          <label className="flex shrink-0 flex-col text-xs font-bold uppercase tracking-wide text-slate-500" title="Lá»c theo Ä‘iá»ƒm Ä‘Ã£ lÆ°u / Ä‘iá»ƒm preview profile (cá»™t Äiá»ƒm).">
            Äiá»ƒm Ä‘áº¿n
            <input
              type="number"
              inputMode="numeric"
              placeholder="â€”"
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
            XÃ³a lá»c nhanh
          </button>
        </div>

        {activeFilterChips.length > 0 ? (
          <div className="flex flex-wrap items-center gap-2 border-t border-slate-200/60 pt-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Äang lá»c</span>
            <div className="flex min-w-0 flex-1 flex-wrap gap-1.5">
              {activeFilterChips.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => c.onClear()}
                  className="inline-flex max-w-full items-center gap-1 rounded-full border border-amber-300/80 bg-amber-50/95 px-2.5 py-1 text-xs font-medium text-amber-950 shadow-sm transition hover:border-amber-500 hover:bg-amber-100"
                  title="Bá» lá»c nÃ y"
                >
                  <span className="min-w-0 truncate">{c.label}</span>
                  <span className="shrink-0 font-bold text-amber-800" aria-hidden>
                    Ã—
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
              title="Chá»‰ hiá»‡n cÃ¡c há»“ sÆ¡ Ä‘Ã£ Ä‘Æ°á»£c AI phÃ¢n tÃ­ch vÃ  Ä‘Ã¡nh dáº¥u Æ°u tiÃªn (cÃ³ tia sÃ©t vÃ ng cáº¡nh tÃªn). Báº¥m láº¡i Ä‘á»ƒ táº¯t."
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
              âš¡ AI Shortlist
            </button>
            <button
              type="button"
              onClick={() => setAiShortlistGuideOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-full border border-slate-200/90 bg-white/90 px-2.5 py-1 text-xs font-semibold text-slate-700 shadow-sm transition hover:border-amber-400 hover:bg-amber-50/90 hover:text-amber-950"
              title="Má»Ÿ hÆ°á»›ng dáº«n tá»«ng bÆ°á»›c (cá»­a sá»• giá»¯a mÃ n hÃ¬nh)"
            >
              <CircleHelp className="h-3.5 w-3.5 shrink-0 text-amber-700" strokeWidth={2.25} aria-hidden />
              HÆ°á»›ng dáº«n
            </button>
          </div>
          {aiShortlistOnly ? (
            <span className="max-w-xl text-xs leading-snug text-slate-600">
              Äang lá»c: chá»‰ cÃ¡c há»“ sÆ¡ Ä‘Ã£ Ä‘Æ°á»£c AI Ä‘Ã¡nh dáº¥u Æ°u tiÃªn (cÃ³ <strong className="text-amber-900">tia sÃ©t vÃ ng</strong>{' '}
              cáº¡nh tÃªn). Náº¿u chÆ°a tá»«ng cháº¡y bÆ°á»›c phÃ¢n tÃ­ch AI cho nhÃ³m WARM, danh sÃ¡ch cÃ³ thá»ƒ khÃ´ng cÃ³ dÃ²ng nÃ o â€” hÃ£y
              má»Ÿ <strong>HÆ°á»›ng dáº«n</strong> bÃªn cáº¡nh.
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
              ÄÃ³ng
            </button>
          </div>
        ) : null}
        {sortedFiltered.length > 0 ? (
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/80 bg-slate-50/90 px-3 py-2 text-xs text-slate-700 sm:px-4">
            <span className="text-slate-600">
              Äang xem <span className="font-semibold text-slate-900">{pagedRows.length}</span> há»“ sÆ¡ (trang{' '}
              {currentPage}/{displayTotalPages})
            </span>
            <div className="flex flex-wrap items-center gap-1">
              <button
                type="button"
                disabled={currentPage <= 1 || loadingPage}
                onClick={() => setPage(1)}
                className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-800 transition hover:bg-slate-50 disabled:opacity-40"
              >
                Â« Äáº§u
              </button>
              <button
                type="button"
                disabled={currentPage <= 1 || loadingPage}
                onClick={() => setPage(currentPage - 1)}
                className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-800 transition hover:bg-slate-50 disabled:opacity-40"
              >
                TrÆ°á»›c
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
                Cuá»‘i Â»
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
                      title="Chá»n táº¥t cáº£ há»“ sÆ¡ trÃªn trang nÃ y"
                    />
                  ) : null}
                </th>
                <th className="px-4 py-3 font-medium">
                  <button
                    type="button"
                    onClick={() => toggleSort('fullName')}
                    className="flex items-center gap-1 text-left transition hover:text-amber-700"
                  >
                    Há» tÃªn
                    {sortKey === 'fullName' ? <span className="text-amber-600">{sortDir === 'asc' ? 'â†‘' : 'â†“'}</span> : null}
                  </button>
                </th>
                <th className="max-w-[6.5rem] px-2 py-3 text-sm font-medium normal-case">MÃ£ KH</th>
                <th className="px-4 py-3 font-medium">
                  <button
                    type="button"
                    onClick={() => toggleSort('phone')}
                    className="flex items-center gap-1 text-left transition hover:text-amber-700"
                  >
                    SÄT
                    {sortKey === 'phone' ? <span className="text-amber-600">{sortDir === 'asc' ? 'â†‘' : 'â†“'}</span> : null}
                  </button>
                </th>
                <th className="max-w-[6.5rem] px-2 py-3 text-sm font-medium normal-case">SÄT PH</th>
                <th className="px-4 py-3 font-medium">
                  <button
                    type="button"
                    onClick={() => toggleSort('educationLevel')}
                    className="flex items-center gap-1 text-left transition hover:text-amber-700"
                  >
                    Há»‡ Ä‘Ã o táº¡o
                    {sortKey === 'educationLevel' ? (
                      <span className="text-amber-600">{sortDir === 'asc' ? 'â†‘' : 'â†“'}</span>
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
                <th className="max-w-[9rem] px-2 py-3 text-sm font-medium normal-case">
                  <button
                    type="button"
                    onClick={() => toggleSort('source')}
                    className="flex items-center gap-1 text-left transition hover:text-amber-700"
                    title="Nguồn / kênh hồ sơ"
                  >
                    Nguồn
                    {sortKey === 'source' ? <span className="text-amber-600">{sortDir === 'asc' ? '↑' : '↓'}</span> : null}
                  </button>
                </th>
                <th className="max-w-[13rem] px-2 py-3 text-sm font-medium normal-case" title="Ghi chÃº hoáº·c mÃ´ táº£ ngáº¯n trÃªn há»“ sÆ¡">
                  Ghi chÃº
                </th>
                <th className="px-4 py-3 font-medium">
                  <button
                    type="button"
                    onClick={() => toggleSort('score')}
                    className="flex flex-col items-start gap-0.5 text-left transition hover:text-amber-700"
                  >
                    <span className="flex items-center gap-1">
                      Äiá»ƒm
                      {sortKey === 'score' ? (
                        <span className="text-amber-600">{sortDir === 'asc' ? 'â†‘' : 'â†“'}</span>
                      ) : null}
                    </span>
                    {activeScoringProfile ? (
                      <span className="text-xs font-normal normal-case text-violet-700">theo profile</span>
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
                      <span className="leading-tight">Äiá»ƒm</span>
                      <span className="leading-tight">thÃ´ng tin</span>
                      {sortKey === 'mlWin' ? (
                        <span className="text-amber-600">{sortDir === 'asc' ? 'â†‘' : 'â†“'}</span>
                      ) : null}
                    </button>
                    <button
                      type="button"
                      className="rounded-full border border-violet-300/80 bg-violet-50 p-0.5 text-violet-900 shadow-sm hover:bg-violet-100"
                      title={ML_WIN_COLUMN_HINT}
                      aria-label="Giáº£i thÃ­ch cá»™t Ä‘iá»ƒm thÃ´ng tin"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <CircleHelp className="h-3 w-3" aria-hidden strokeWidth={2} />
                    </button>
                  </div>
                </th>
                <th className="px-4 py-3 font-medium">
                  <button
                    type="button"
                    onClick={() => toggleSort('priorityTag')}
                    className="flex items-center gap-1 text-left transition hover:text-amber-700"
                  >
                    NhÃ£n
                    {sortKey === 'priorityTag' ? (
                      <span className="text-amber-600">{sortDir === 'asc' ? 'â†‘' : 'â†“'}</span>
                    ) : null}
                  </button>
                </th>
                <th className="px-4 py-3 font-medium">
                  <button
                    type="button"
                    title="Giai Ä‘oáº¡n tuyá»ƒn sinh â€” khÃ¡c vá»›i cá»™t tÃ¬nh tráº¡ng tÆ° váº¥n."
                    onClick={() => toggleSort('pipelineStatus')}
                    className="flex items-center gap-1 text-left transition hover:text-amber-700"
                  >
                    Funnel
                    {sortKey === 'pipelineStatus' ? (
                      <span className="text-amber-600">{sortDir === 'asc' ? 'â†‘' : 'â†“'}</span>
                    ) : null}
                  </button>
                </th>
                <th
                  className="max-w-[7rem] px-2 py-3 text-sm font-medium normal-case"
                  title="TÃ¬nh tráº¡ng lÃ m viá»‡c TVV (tÆ° váº¥n)"
                >
                  TÆ° váº¥n
                </th>
                <th className="min-w-[6rem] max-w-[9rem] px-2 py-3 text-sm font-medium normal-case">TVV</th>
              </tr>
            </thead>
            <tbody>
              {loading
                ? Array.from({ length: 8 }).map((_, i) => (
                    <tr key={i} className="border-b border-slate-100">
                      {Array.from({ length: 15 }).map((__, j) => (
                        <td key={j} className="px-4 py-3">
                          <div className="h-4 rounded-md bg-gradient-to-r from-slate-200 via-slate-100 to-slate-200 ai-skeleton-shimmer" />
                        </td>
                      ))}
                    </tr>
                  ))
                : null}
              {!loading && !sortedFiltered.length ? (
                <tr>
                  <td colSpan={15} className="px-4 py-12 text-center text-slate-500">
                    KhÃ´ng cÃ³ há»“ sÆ¡ khá»›p bá»™ lá»c.
                  </td>
                </tr>
              ) : null}
              {pagedRows.map((l) => {
                const ev = activeScoringProfile ? scoreByLeadId.get(l.id) : undefined
                const displayScore = ev?.calculatedScore ?? l.calculatedScore
                const displayTag = ev?.priorityTag ?? l.priorityTag
                const ml = resolveMlWinDisplay(l, infoScoreRuntime)
                const descForTable = leadDescriptionForDisplay(l.description)
                return (
                <motion.tr
                  key={`${l.id}-${resolvedScoringProfileId ?? 'persisted'}`}
                  layout
                  transition={{ type: 'spring', stiffness: 380, damping: 28 }}
                  onClick={() => setSelected(l)}
                  title="Báº¥m Ä‘á»ƒ xem chi tiáº¿t: há»“ sÆ¡ sinh viÃªn, ghi chÃº, Ä‘Ã¡nh giÃ¡, lá»‹ch sá»­ tÆ°Æ¡ng tÃ¡c, AIâ€¦"
                  className="cursor-pointer border-b border-slate-100 transition-all duration-300 hover:bg-amber-50/50"
                >
                  <td className="px-2 py-3" onClick={(e) => e.stopPropagation()}>
                    {canBulkWrite ? (
                      <input
                        type="checkbox"
                        checked={selectedIds.has(l.id)}
                        onChange={() => toggleSelectId(l.id)}
                        className="h-4 w-4 rounded border-slate-300 bg-white accent-amber-500"
                        aria-label={`Chá»n ${l.fullName}`}
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
                          aria-label="ÄÃ£ Ä‘Æ°á»£c AI Ä‘Ã¡nh dáº¥u Æ°u tiÃªn"
                        />
                      ) : null}
                      <span className="min-w-0 truncate">{l.fullName || 'â€”'}</span>
                    </span>
                  </td>
                  <td className="max-w-[6.5rem] truncate px-2 py-3 text-slate-600" title={l.customerId || undefined}>
                    {l.customerId || 'â€”'}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{l.phone || 'â€”'}</td>
                  <td className="max-w-[6.5rem] truncate px-2 py-3 text-slate-600" title={l.parentPhone || undefined}>
                    {l.parentPhone || 'â€”'}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{l.educationLevel || 'â€”'}</td>
                  <td className="px-4 py-3 text-slate-600">{l.province || '—'}</td>
                  <td
                    className="max-w-[9rem] truncate px-2 py-3 text-slate-600"
                    title={(l.source ?? '').trim() || undefined}
                  >
                    {(l.source ?? '').trim() || '—'}
                  </td>
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
            aria-label="ÄÃ³ng"
            onClick={() => !bulkBusy && setBulkModal(null)}
          />
          <div className="app-glass-panel fixed left-1/2 top-1/2 z-[60] w-[min(92vw,400px)] -translate-x-1/2 -translate-y-1/2 rounded-2xl p-5 shadow-xl">
            <h3 className="app-section-heading">Giao viá»‡c hÃ ng loáº¡t</h3>
            <p className="mt-1 text-sm text-slate-600">
              GÃ¡n tÆ° váº¥n viÃªn má»›i cho {selectedIds.size} há»“ sÆ¡ Ä‘Ã£ chá»n.
              {!reassignElevated && canPeerReassignLeads ? (
                <span className="mt-1 block font-medium text-amber-800">
                  Báº¡n chá»‰ cÃ³ thá»ƒ chuyá»ƒn cÃ¡c há»“ sÆ¡ Ä‘ang gÃ¡n cho chÃ­nh báº¡n sang Ä‘á»“ng nghiá»‡p (theo quyá»n TVV).
                </span>
              ) : null}
            </p>
            <label className="mt-4 block text-sm font-medium text-slate-700">
              Phá»¥ trÃ¡ch (TVV / Admin)
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
                Há»§y
              </button>
              <button
                type="button"
                disabled={bulkBusy || !bulkReassignUid}
                onClick={() => void applyBulkReassign()}
                className="rounded-xl border border-violet-400 bg-violet-600 px-4 py-2 text-sm font-semibold text-white shadow-sm disabled:opacity-40"
              >
                {bulkBusy ? 'Äang xá»­ lÃ½â€¦' : 'Ãp dá»¥ng'}
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
            aria-label="ÄÃ³ng"
            onClick={() => !bulkBusy && setBulkModal(null)}
          />
          <div className="app-glass-panel fixed left-1/2 top-1/2 z-[60] w-[min(92vw,400px)] -translate-x-1/2 -translate-y-1/2 rounded-2xl p-5 shadow-xl">
            <h3 className="app-section-heading">Äá»•i tÃ¬nh tráº¡ng tÆ° váº¥n</h3>
            <p className="mt-1 text-sm text-slate-600">Ãp dá»¥ng cho {selectedIds.size} há»“ sÆ¡ Ä‘Ã£ chá»n.</p>
            <label className="mt-4 block text-sm font-medium text-slate-700">
              TÃ¬nh tráº¡ng tÆ° váº¥n má»›i
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
                Há»§y
              </button>
              <button
                type="button"
                disabled={bulkBusy}
                onClick={() => void applyBulkCrmStatus()}
                className="rounded-xl border border-amber-500 bg-amber-600 px-4 py-2 text-sm font-semibold text-white shadow-sm disabled:opacity-40"
              >
                {bulkBusy ? 'Äang xá»­ lÃ½â€¦' : 'Ãp dá»¥ng'}
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
                aria-label="ÄÃ³ng hÆ°á»›ng dáº«n"
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
                      AI Shortlist â€” lÃ m tháº¿ nÃ o?
                    </p>
                    <p className="mt-1 text-sm leading-relaxed text-slate-600">
                      CÃ³ <strong className="text-slate-800">hai viá»‡c khÃ¡c nhau</strong>: trÆ°á»›c háº¿t Ä‘á»ƒ AI phÃ¢n tÃ­ch vÃ 
                      lÆ°u gá»£i Ã½ lÃªn há»“ sÆ¡, sau Ä‘Ã³ (tuá»³ chá»n) dÃ¹ng nÃºt lá»c Ä‘á»ƒ chá»‰ xem nhÃ³m Ä‘Ã³.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setAiShortlistGuideOpen(false)}
                    className="shrink-0 rounded-xl border border-slate-200 bg-white p-2 text-slate-600 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-900"
                    aria-label="ÄÃ³ng"
                  >
                    <X className="h-5 w-5" strokeWidth={2} aria-hidden />
                  </button>
                </div>

                <section className="mt-5 space-y-3 rounded-xl border border-emerald-200/70 bg-emerald-50/50 p-4 text-sm leading-relaxed text-slate-800 sm:text-[15px]">
                  <p className="font-bold text-emerald-950">A. Chuáº©n bá»‹ (lÃ m má»™t láº§n hoáº·c khi Ä‘á»•i mÃ¡y)</p>
                  <ol className="list-decimal space-y-2 pl-5 marker:font-semibold marker:text-emerald-800">
                    <li>
                      VÃ o <strong>CÃ i Ä‘áº·t</strong> â†’ tab <strong>LLM</strong> â†’ má»¥c <strong>API</strong>: chá»n nhÃ  cung
                      cáº¥p, dÃ¡n khÃ³a, báº¥m <strong>LÆ°u API vÃ o trÃ¬nh duyá»‡t</strong>. Pháº£i lÆ°u trÃªn{' '}
                      <strong>Ä‘Ãºng mÃ¡y vÃ  trÃ¬nh duyá»‡t</strong> báº¡n Ä‘ang dÃ¹ng (hoáº·c cáº¥u hÃ¬nh{' '}
                      <code className="rounded bg-white/80 px-1 py-0.5 text-xs">VITE_AI_API_KEY</code> trong{' '}
                      <code className="rounded bg-white/80 px-1 py-0.5 text-xs">.env</code> khi dev/build â€” Æ°u tiÃªn
                      localStorage náº¿u Ä‘Ã£ lÆ°u).
                    </li>
                    <li>
                      Náº¿u báº¡n <strong>khÃ´ng pháº£i SiÃªu quáº£n trá»‹</strong>: nhá» quáº£n lÃ½ vÃ o <strong>Quáº£n lÃ½ nhÃ¢n sá»±</strong>,
                      má»Ÿ há»“ sÆ¡ cá»§a báº¡n vÃ  báº­t <strong>Â«Cho phÃ©p dÃ¹ng AI trÃªn há»“ sÆ¡Â»</strong>. KhÃ´ng báº­t thÃ¬ cÃ¡c nÃºt
                      cháº¡y AI sáº½ khÃ´ng hoáº¡t Ä‘á»™ng.
                    </li>
                  </ol>
                </section>

                <section className="mt-4 space-y-3 text-sm leading-relaxed text-slate-800 sm:text-[15px]">
                  <p className="font-bold text-slate-900">B. Äá»ƒ AI phÃ¢n tÃ­ch vÃ  â€œÄ‘Ã¡nh dáº¥uâ€ há»“ sÆ¡ (cÃ³ tia sÃ©t vÃ ng)</p>
                  <ol className="list-decimal space-y-2.5 pl-5 marker:font-semibold marker:text-amber-700">
                    <li>
                      á»ž trang <strong>Há»“ sÆ¡</strong>, á»Ÿ bá»™ lá»c nhÃ£n, chá»n <strong>WARM</strong> (nhÃ£n theo bá»™ cháº¥m Ä‘iá»ƒm
                      Ä‘ang báº­t á»Ÿ Ä‘áº§u trang).
                    </li>
                    <li>
                      Tick Ã´ vuÃ´ng bÃªn trÃ¡i cÃ¡c dÃ²ng báº¡n muá»‘n gá»­i cho AI (Ã­t nháº¥t má»™t dÃ²ng WARM).
                    </li>
                    <li>
                      KÃ©o xuá»‘ng <strong>thanh thao tÃ¡c hÃ ng loáº¡t</strong> dÆ°á»›i cÃ¹ng â†’ báº¥m{' '}
                      <strong>âœ¨ Cháº¡y AI PhÃ¢n tÃ­ch (Shortlist)</strong>.
                    </li>
                    <li>
                      Äá»c cá»­a sá»• kiá»ƒm tra hiá»‡n ra (tiÃªu Ä‘á» kiá»ƒu â€œtiáº¿t kiá»‡m tokenâ€) â†’ báº¥m xÃ¡c nháº­n <strong>Cháº¡y AI</strong>{' '}
                      náº¿u Ä‘á»“ng Ã½. Chá» Ä‘áº¿n khi xong; má»—i há»“ sÆ¡ Ä‘Æ°á»£c xá»­ lÃ½ sáº½ cÃ³ <strong>tia sÃ©t vÃ ng</strong> cáº¡nh tÃªn trÃªn
                      báº£ng.
                    </li>
                    <li>
                      Má»Ÿ chi tiáº¿t má»™t há»“ sÆ¡: pháº§n <strong>Â«Gá»£i Ã½ tá»« AIÂ»</strong> á»Ÿ Ä‘áº§u panel hiá»ƒn thá»‹ lÃ½ do vÃ  hÃ nh Ä‘á»™ng
                      gá»£i Ã½.
                    </li>
                  </ol>
                </section>

                <section className="mt-4 space-y-2 rounded-xl border border-amber-200/80 bg-amber-50/60 p-4 text-sm leading-relaxed text-slate-800 sm:text-[15px]">
                  <p className="font-bold text-amber-950">C. NÃºt Â«âš¡ AI ShortlistÂ» trÃªn bá»™ lá»c</p>
                  <p>
                    NÃºt nÃ y chá»‰ <strong>lá»c báº£ng</strong> Ä‘á»ƒ cÃ²n cÃ¡c há»“ sÆ¡ <strong>Ä‘Ã£ cÃ³ tia sÃ©t vÃ ng</strong> (tá»©c Ä‘Ã£
                    qua bÆ°á»›c B). <strong>KhÃ´ng</strong> gá»i AI, <strong>khÃ´ng</strong> tá»‘n phÃ­ API.
                  </p>
                  <p className="font-semibold text-amber-950">
                    Náº¿u báº­t lá»c mÃ  khÃ´ng tháº¥y dÃ²ng nÃ o: thÆ°á»ng lÃ  vÃ¬ chÆ°a ai cháº¡y bÆ°á»›c B cho cÃ¡c há»“ sÆ¡ trong pháº¡m vi báº¡n
                    Ä‘Æ°á»£c xem â€” khÃ´ng pháº£i lá»—i mÃ n hÃ¬nh.
                  </p>
                </section>

                <div className="mt-5 rounded-xl border border-slate-200/90 bg-slate-50/90 p-4 text-sm text-slate-700">
                  <p className="font-semibold text-slate-900">Táº¯t lá»c nhanh</p>
                  <p className="mt-1">
                    Dáº£i chip <strong>Â«Äang lá»cÂ»</strong> phÃ­a trÃªn cÃ³ dÃ²ng <strong>Â«Chá»‰ há»“ sÆ¡ AI Ä‘Ã£ Ä‘Ã¡nh dáº¥uÂ»</strong> â€”
                    báº¥m dáº¥u Ã— trÃªn chip Ä‘Ã³, hoáº·c báº¥m láº¡i nÃºt <strong>âš¡ AI Shortlist</strong>.
                  </p>
                </div>

                <div className="mt-6 flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-4">
                  <button
                    type="button"
                    onClick={() => setAiShortlistGuideOpen(false)}
                    className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 shadow-sm transition hover:bg-slate-50"
                  >
                    ÄÃ³ng
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
                    Chá»‰ xem há»“ sÆ¡ Ä‘Ã£ cÃ³ tia sÃ©t
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
                aria-label="ÄÃ³ng"
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
                    Kiá»ƒm tra trÆ°á»›c khi cháº¡y AI
                  </p>
                  <p className="mt-1 text-center text-[11px] font-medium uppercase tracking-wide text-slate-500">
                    GiÃºp giáº£m chi phÃ­ â€” chá»‰ gá»­i há»“ sÆ¡ Ä‘á»§ Ä‘iá»u kiá»‡n
                  </p>
                  <p className="mt-4 text-center text-base font-semibold text-slate-900">
                    Báº¡n Ä‘Ã£ chá»n {gatekeeperModal.totalSelected} há»“ sÆ¡
                    {gatekeeperModal.totalSelected !== gatekeeperModal.warmCount ? (
                      <span className="mt-1 block text-sm font-normal text-slate-600">
                        Trong Ä‘Ã³ {gatekeeperModal.warmCount} há»“ sÆ¡ cÃ³ nhÃ£n WARM Ä‘Æ°á»£c Ä‘Æ°a vÃ o bÆ°á»›c kiá»ƒm tra (chá»‰ nhÃ³m nÃ y
                        má»›i Ä‘Æ°á»£c gá»­i cho AI phÃ¢n tÃ­ch).
                      </span>
                    ) : null}
                  </p>
                  {gatekeeperModal.warmCount > 0 ? (
                    <p className="mt-4 rounded-xl border border-emerald-400/35 bg-emerald-500/10 px-4 py-3 text-sm leading-relaxed text-emerald-950">
                      ðŸ›¡ï¸ BÆ°á»›c kiá»ƒm tra tá»± Ä‘á»™ng Ä‘Ã£ loáº¡i bá»{' '}
                      <span className="font-bold tabular-nums">{gatekeeperModal.skipped}</span> há»“ sÆ¡ (ghi chÃº quÃ¡ ngáº¯n,
                      chÆ°a Ä‘á»§ tÃ­n hiá»‡u theo cÃ i Ä‘áº·t, hoáº·c chÆ°a cÃ³ tÆ°Æ¡ng tÃ¡c trong khoáº£ng thá»i gian cho phÃ©p).
                    </p>
                  ) : null}
                  {gatekeeperModal.passed.length > 0 ? (
                    <>
                      <p className="mt-4 text-center text-sm font-medium text-slate-800">
                        ðŸš€ Chá»‰ cÃ³{' '}
                        <span className="font-bold text-violet-800 tabular-nums">{gatekeeperModal.passed.length}</span>{' '}
                        há»“ sÆ¡ Ä‘áº¡t chuáº©n. Báº¡n cÃ³ muá»‘n báº¯t Ä‘áº§u cháº¡y AI cho{' '}
                        <span className="font-semibold tabular-nums">{gatekeeperModal.passed.length}</span> há»“ sÆ¡ nÃ y
                        khÃ´ng?
                        {gatekeeperModal.warmCount > 0 ? (
                          <span className="mt-2 block text-sm font-normal text-slate-600">
                            (Æ¯á»›c tÃ­nh tiáº¿t kiá»‡m ~{Math.round((gatekeeperModal.skipped / gatekeeperModal.warmCount) * 100)}
                            % chi phÃ­ so vá»›i viá»‡c gá»­i toÃ n bá»™ WARM Ä‘Ã£ chá»n.)
                          </span>
                        ) : null}
                      </p>
                      <div className="mt-6 flex flex-wrap justify-center gap-3">
                        <button
                          type="button"
                          onClick={() => setGatekeeperModal(null)}
                          className="min-h-11 rounded-xl border border-slate-300/80 bg-white/70 px-5 py-2.5 text-sm font-semibold text-slate-800 shadow-sm backdrop-blur-sm transition hover:bg-white"
                        >
                          Há»§y
                        </button>
                        <button
                          type="button"
                          onClick={() => void executeBulkAiMiner(gatekeeperModal.passed)}
                          className="min-h-11 rounded-xl border border-amber-400/90 bg-gradient-to-r from-amber-400 via-yellow-300 to-amber-500 px-5 py-2.5 text-sm font-bold text-amber-950 shadow-[0_0_24px_rgba(251,191,36,0.45)] transition hover:brightness-105"
                        >
                          Cháº¡y AI ({gatekeeperModal.passed.length} há»“ sÆ¡)
                        </button>
                      </div>
                    </>
                  ) : (
                    <p className="mt-4 text-center text-sm text-slate-700">
                      KhÃ´ng cÃ³ há»“ sÆ¡ WARM nÃ o Ä‘á»§ Ä‘iá»u kiá»‡n. Báº¡n cÃ³ thá»ƒ ná»›i quy táº¯c trong{' '}
                      <strong>CÃ i Ä‘áº·t â†’ tab LLM â†’ Â«Lá»c trÆ°á»›c khi gá»i AIÂ»</strong>, hoáº·c bá»• sung ghi chÃº / tÆ°Æ¡ng tÃ¡c rá»“i
                      thá»­ láº¡i.
                    </p>
                  )}
                  {gatekeeperModal.passed.length === 0 ? (
                    <div className="mt-6 flex justify-center">
                      <button
                        type="button"
                        onClick={() => setGatekeeperModal(null)}
                        className="min-h-11 rounded-xl border border-slate-300/80 bg-white/70 px-5 py-2.5 text-sm font-semibold text-slate-800 shadow-sm backdrop-blur-sm transition hover:bg-white"
                      >
                        ÄÃ³ng
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
              aria-label="AI Lead Miner Ä‘ang cháº¡y"
            >
              <div className="absolute inset-0 bg-slate-950/35 backdrop-blur-[2px]" />
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_30%_20%,rgba(167,139,250,0.35),transparent_50%),radial-gradient(ellipse_at_70%_80%,rgba(45,212,191,0.25),transparent_45%),radial-gradient(ellipse_at_50%_50%,rgba(251,191,36,0.2),transparent_55%)]" />
              <div className="relative w-full max-w-sm overflow-hidden rounded-2xl border border-white/40 bg-gradient-to-br from-white/30 via-violet-100/25 to-teal-100/20 p-5 shadow-[0_24px_80px_rgba(15,23,42,0.25)] backdrop-blur-2xl">
                <p className="text-center text-xs font-bold uppercase tracking-wider text-slate-600">
                  Äang phÃ¢n tÃ­ch AI theo lÃ´
                </p>
                <p className="mt-2 text-center text-base font-semibold text-slate-900">
                  {aiMinerProgress.done}/{aiMinerProgress.total} há»“ sÆ¡
                </p>
                <p className="mt-1 text-center text-xs text-slate-600">
                  Xá»­ lÃ½ theo lÃ´ â€” tá»‘i Ä‘a 12 há»“ sÆ¡ má»—i láº§n gá»i AI (giÃºp giáº£m chi phÃ­).
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
              reassignElevated={reassignElevated}
              scoringMasterBuckets={scoringMasterBuckets}
              schoolTvvSignalDefs={schoolTvvSignalDefs}
              scriptSnippets={scriptSnippets}
              scriptSnippetsLoading={scriptSnippetsLoading}
              scriptSnippetsError={scriptSnippetsErr}
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
        aria-label="ÄÃ³ng"
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
                HOT â‰¥ {profile.thresholds?.hotMinScore ?? 'â€”'} Â· WARM â‰¥ {profile.thresholds?.warmMinScore ?? 'â€”'}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 shadow-sm transition hover:border-amber-300 hover:bg-amber-50"
            >
              ÄÃ³ng
            </button>
          </div>
          <p className="mt-4 text-base leading-relaxed text-slate-700">
            {profile.description || 'KhÃ´ng cÃ³ mÃ´ táº£.'}
          </p>

          <h3 className="app-section-heading mt-6">Cáº¥u hÃ¬nh quy táº¯c</h3>
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
                      ({RULE_CATEGORY_LABELS[b.category]} Â· max {b.maxWeight} Ä‘iá»ƒm)
                    </span>
                  </p>
                  <p className="mt-1 text-xs text-slate-500">TrÆ°á»ng: {String(b.targetField)}</p>
                  <ul className="mt-2 list-inside list-disc space-y-1 text-xs text-slate-400">
                    {b.rows.map((r) => (
                      <li key={r.id}>
                        {r.condition}{' '}
                        {Array.isArray(r.value) ? r.value.join(', ') : String(r.value) || 'â€”'} â†’{' '}
                        {r.allocationKind === 'percent_of_max'
                          ? `${r.allocationValue}% max khá»‘i`
                          : `${r.allocationValue} Ä‘iá»ƒm`}
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
                  {String(r.targetField)} Â· {r.condition} Â·{' '}
                  {Array.isArray(r.value) ? r.value.join(', ') : String(r.value)} â†’ {r.points} Ä‘iá»ƒm
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-xs text-slate-500">ChÆ°a cÃ³ quy táº¯c trong profile nÃ y.</p>
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
  /** Tooltip â€” giáº£i thÃ­ch ngáº¯n khi rÃª chuá»™t lÃªn nhÃ£n lá»c. */
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
    lower.includes('tá»‘t') || lower === 'hot'
      ? 'border-emerald-400/60 bg-emerald-500/25 text-emerald-50 shadow-[0_0_14px_rgba(52,211,153,0.35)]'
      : lower.includes('trung') || lower.includes('warm')
        ? 'border-amber-400/55 bg-amber-500/20 text-amber-50'
        : lower.includes('kÃ©m') || lower.includes('cold') || lower.includes('yáº¿u')
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
    return <span className="text-sm text-slate-800">{value ? 'CÃ³' : 'KhÃ´ng'}</span>
  }
  if (typeof value === 'string') {
    return <AiValueBadge text={value} />
  }
  if (value === null || value === undefined) {
    return <span className="text-sm text-slate-500">â€”</span>
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
  /** Danh sÃ¡ch chá»n trong dropdown (Admin/TrÆ°á»Ÿng: TVV + Admin; TVV: chá»‰ TVV). */
  pickListUsers: VietMyUserProfile[]
  counselorsLoading: boolean
  /** Admin / TrÆ°á»Ÿng khoa / TrÆ°á»Ÿng ngÃ nh: má»i TVV + cÃ³ thá»ƒ bá» gÃ¡n. TVV chá»‰ Ä‘á»•i trong pháº¡m vi quyá»n Ä‘á»“ng nghiá»‡p. */
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
    if (!uid) return 'â€”'
    const u = pickListUsers.find((c) => c.id === uid) ?? counselorUsers.find((c) => c.id === uid)
    return u ? formatStaffDisplayName(u) : `${uid.slice(0, 8)}â€¦`
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
      setCrmMsg('KhÃ´ng cÃ³ thay Ä‘á»•i.')
      return
    }
    if (peerMode && !nextUid) {
      setCrmMsg('KhÃ´ng thá»ƒ bá» gÃ¡n â€” chá»n Ä‘á»“ng nghiá»‡p nháº­n há»“ sÆ¡ hoáº·c liÃªn há»‡ Admin.')
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
          description: `Cáº­p nháº­t phÃ¢n cÃ´ng: ${labelForUid(prevAssign)} â†’ ${labelForUid(nextUid)}`,
          performedBy: profile.id,
          performedByName: performer,
        })
      }
      if (!sameStatus) {
        await commitAuditLog(db, {
          leadId: lead.id,
          actionType: 'STATUS_CHANGE',
          description: `TÃ¬nh tráº¡ng tÆ° váº¥n: ${LEAD_COUNSELOR_STATUS_LABELS[prevStatus]} â†’ ${LEAD_COUNSELOR_STATUS_LABELS[crmCounselorStatus]}`,
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
      setCrmMsg('ÄÃ£ cáº­p nháº­t phÃ¢n cÃ´ng.')
    } catch (e) {
      console.error(e)
      setCrmMsg('KhÃ´ng lÆ°u Ä‘Æ°á»£c. Kiá»ƒm tra quyá»n Firestore.')
    } finally {
      setCrmBusy(false)
    }
  }

  return (
    <section
      className={
        compact
          ? 'shrink-0 rounded-lg border border-violet-200/80 bg-violet-50/50 p-3 shadow-sm'
          : 'rounded-xl border border-violet-200/80 bg-violet-50/50 p-3 shadow-sm'
      }
    >
      <h3
        className={
          compact
            ? 'text-sm font-bold uppercase tracking-wider text-slate-600 sm:text-base'
            : 'app-section-heading'
        }
      >
        PhÃ¢n cÃ´ng &amp; tÃ¬nh tráº¡ng
      </h3>
      {peerMode ? (
        <p
          className={
          compact
            ? 'mt-0.5 text-sm leading-snug text-slate-600'
            : 'mt-0.5 text-sm leading-snug text-slate-600'
          }
        >
          Chuyá»ƒn há»“ sÆ¡ cá»§a báº¡n cho Ä‘á»“ng nghiá»‡p (danh sÃ¡ch: tÃªn hiá»ƒn thá»‹ Â· email). KhÃ´ng thá»ƒ bá» gÃ¡n trá»‘ng â€” chá»n ngÆ°á»i
          nháº­n.
        </p>
      ) : null}
      <label
        className={
          compact ? 'mt-1.5 block text-sm font-semibold text-slate-700' : 'mt-2 block text-sm font-medium text-slate-700'
        }
      >
        {reassignElevated ? 'Phá»¥ trÃ¡ch (TVV / Admin)' : 'TÆ° váº¥n viÃªn'}
        <select
          value={crmAssignUid}
          onChange={(e) => setCrmAssignUid(e.target.value)}
          disabled={counselorsLoading}
          className={
            compact
              ? 'mt-1 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-violet-200 disabled:opacity-50'
              : 'mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-2 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-violet-200 disabled:opacity-50'
          }
        >
          {reassignElevated ? <option value="">â€” ChÆ°a gÃ¡n â€”</option> : null}
          {assignableCounselors.map((c) => (
            <option key={c.id} value={c.id} className="bg-white">
              {formatStaffDirectoryLabel(c)}
            </option>
          ))}
        </select>
      </label>
      <label
        className={
          compact ? 'mt-1.5 block text-sm font-semibold text-slate-700' : 'mt-2 block text-sm font-medium text-slate-700'
        }
      >
        TÃ¬nh tráº¡ng tÆ° váº¥n
        <select
          value={crmCounselorStatus}
          onChange={(e) => setCrmCounselorStatus(e.target.value as LeadCounselorStatus)}
          className={
            compact
              ? 'mt-1 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-violet-200'
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
        <p className={compact ? 'mt-1.5 text-sm text-violet-900' : 'mt-2 text-sm text-violet-900'}>{crmMsg}</p>
      ) : null}
      <button
        type="button"
        disabled={crmBusy}
        onClick={() => void save()}
        className={
          compact
            ? 'mt-2 w-full rounded-lg border border-violet-500 bg-violet-600 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-violet-700 disabled:opacity-50'
            : 'mt-3 w-full rounded-lg border border-violet-500 bg-violet-600 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-violet-700 disabled:opacity-50'
        }
      >
        {crmBusy ? 'Äang lÆ°uâ€¦' : 'LÆ°u phÃ¢n cÃ´ng'}
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
  scriptSnippets,
  scriptSnippetsLoading,
  scriptSnippetsError,
}: {
  lead: Lead
  activeScoringProfile: ScoringProfile | null
  scoringPreview?: { calculatedScore: number; priorityTag: PriorityTag }
  scoringMasterBuckets?: MasterDataBuckets
  schoolTvvSignalDefs?: ProfileCustomScoringSignal[] | null
  db: ReturnType<typeof getFirestoreDb>
  /** Ná»™i dung RAG tá»« Knowledge Base (cÃ³ thá»ƒ rá»—ng). */
  institutionalRagBlock: string
  counselorUsers: VietMyUserProfile[]
  pickListUsers: VietMyUserProfile[]
  counselorsLoading: boolean
  /** CÃ³ hiá»ƒn thá»‹ khá»‘i phÃ¢n cÃ´ng nhanh (Admin/TrÆ°á»Ÿng hoáº·c TVV cÃ³ quyá»n chuyá»ƒn Ä‘á»“ng nghiá»‡p). */
  canReassignLead: boolean
  /** Admin / TrÆ°á»Ÿng khoa / TrÆ°á»Ÿng ngÃ nh: toÃ n quyá»n gÃ¡n; TVV: chá»‰ chuyá»ƒn trong team vá»›i quyá»n peer. */
  reassignElevated: boolean
  /** ÄÃ³ng panel â€” parent cÃ³ thá»ƒ bá»c confirm khi cÃ²n dirty (Ä‘á»“ng bá»™ qua onUnsavedChange). */
  onClose: () => void
  /** BÃ¡o parent cÃ³ thay Ä‘á»•i chÆ°a lÆ°u (funnel / ghi chÃº / CRM trÃ¡i) Ä‘á»ƒ onClose há»i xÃ¡c nháº­n. */
  onUnsavedChange?: (dirty: boolean) => void
  onUpdated: (patch: Partial<Lead>) => void
  scriptSnippets: ScriptSnippet[]
  scriptSnippetsLoading: boolean
  scriptSnippetsError: string | null
}) {
  const { profile, can, canRunLlmAnalysis } = useAuth()
  const { runtime: infoScoreRuntime } = useInfoScoreRules()
  const canEditScoringSignals = canWriteLead(profile, lead, can, pickListUsers)
  const { tasksById: aiInsightTasksById } = useLeadAiInsightTasks(lead.id)
  const { interactions, loading: intLoading } = useInteractions(lead.id)
  const { playbooks } = useConsultingPlaybooks()
  const { documents: knowledgeDocs } = useKnowledgeDocuments()

  const [coreDraft, setCoreDraft] = useState(() => leadToCoreDraft(lead))
  const coreDirty = useMemo(() => isCoreDraftDirty(lead, coreDraft), [lead, coreDraft])
  const previewLeadForScore = useMemo(() => mergeCoreDraftIntoLead(lead, coreDraft), [lead, coreDraft])


  const displayScoring = useMemo(() => {
    if (activeScoringProfile && scoringMasterBuckets) {
      return evaluateLead(
        leadToEvaluationRecord(previewLeadForScore),
        activeScoringProfile,
        scoringMasterBuckets,
        schoolTvvSignalDefs,
      )
    }
    if (scoringPreview) return scoringPreview
    return { calculatedScore: lead.calculatedScore, priorityTag: lead.priorityTag }
  }, [
    previewLeadForScore,
    activeScoringProfile,
    scoringMasterBuckets,
    schoolTvvSignalDefs,
    scoringPreview,
    lead.calculatedScore,
    lead.priorityTag,
  ])

  useEffect(() => {
    setCoreDraft(leadToCoreDraft(lead))
  }, [lead.id])

  const [note, setNote] = useState('')
  const [evalTag, setEvalTag] = useState<string>(EVALUATION_TAGS[0])
  const [crmDirty, setCrmDirty] = useState<LeadCounselorStatus | null>(null)
  const crmForForm = crmDirty ?? lead.status
  const [statusDirty, setStatusDirty] = useState<LeadPipelineStatus | null>(null)
  const statusForForm = statusDirty ?? lead.pipelineStatus

  const previewLeadForMatching = useMemo(
    () =>
      mergeLeadDetailPreview(lead, coreDraft, {
        priorityTag: displayScoring.priorityTag,
        calculatedScore: displayScoring.calculatedScore,
        status: crmForForm,
        pipelineStatus: statusForForm,
      }),
    [
      lead,
      coreDraft,
      displayScoring.priorityTag,
      displayScoring.calculatedScore,
      crmForForm,
      statusForForm,
    ],
  )

  const playbookMatches = useMemo(
    () => playbooksMatchingLead(previewLeadForMatching, playbooks),
    [previewLeadForMatching, playbooks],
  )
  const playbookMatchCount = playbookMatches.length
  const knowledgeRelevantCount = useMemo(
    () => countLeadRelevantKnowledge(previewLeadForMatching, knowledgeDocs),
    [previewLeadForMatching, knowledgeDocs],
  )
  const consultingHubCount = playbookMatchCount + knowledgeRelevantCount

  const openConsultingHub = (tab: ConsultingHubTab) => {
    setConsultingHubTab(tab)
    setConsultingHubOpen(true)
  }

  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [llmPopupOpen, setLlmPopupOpen] = useState(false)
  const [assistantPopupOpen, setAssistantPopupOpen] = useState(false)
  const [consultingHubOpen, setConsultingHubOpen] = useState(false)
  const [consultingHubTab, setConsultingHubTab] = useState<ConsultingHubTab>('overview')
  const [detailLeftTab, setDetailLeftTab] = useState<'counselor' | 'profile'>('counselor')
  const [detailRightTab, setDetailRightTab] = useState<'assign' | 'history'>('history')
  useEffect(() => {
    setNote('')
    setEvalTag(EVALUATION_TAGS[0])
    setCrmDirty(null)
    setStatusDirty(null)
    setMsg(null)
    setDetailLeftTab('counselor')
    setDetailRightTab('history')
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
      if (consultingHubOpen) {
        e.preventDefault()
        setConsultingHubOpen(false)
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
      e.preventDefault()
      onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [consultingHubOpen, llmPopupOpen, assistantPopupOpen, onClose])

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

  /** Khá»‘i phÃ¢n cÃ´ng bÃªn pháº£i áº©n khi TVV peer xem há»“ sÆ¡ khÃ´ng pháº£i cá»§a mÃ¬nh â€” khi Ä‘Ã³ khÃ´ng gá»¡ CRM bÃªn trÃ¡i. */
  const peerModeForCrmBlock = !reassignElevated && Boolean(can('leads:reassign:peer'))
  const leadIsMineForCrm = (lead.assignedTo ?? lead.assignedCounselorId) === profile?.id
  const crmQuickBlockVisible =
    canReassignLead && Boolean(db) && !(peerModeForCrmBlock && !leadIsMineForCrm)

  /** Má»™t nguá»“n sá»± tháº­t: khi khá»‘i phÃ¢n cÃ´ng hiá»ƒn thá»‹ thÃ¬ chá»‰nh tÃ¬nh tráº¡ng TVV á»Ÿ Ä‘Ã³. */
  const crmEditOnRight = crmQuickBlockVisible
  const crmEditOnLeft = showCounselorProgressForm && !crmEditOnRight

  const hasUnsavedProgress = useMemo(
    () =>
      coreDirty ||
      (crmEditOnLeft && crmForForm !== lead.status) ||
      statusForForm !== lead.pipelineStatus ||
      note.trim().length > 0,
    [coreDirty, crmEditOnLeft, crmForForm, lead.status, statusForForm, lead.pipelineStatus, note],
  )

  useEffect(() => {
    onUnsavedChange?.(hasUnsavedProgress)
    return () => {
      onUnsavedChange?.(false)
    }
  }, [hasUnsavedProgress, onUnsavedChange])

  useEffect(() => {
    if (crmEditOnRight) setCrmDirty(null)
  }, [crmEditOnRight, lead.id])

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
    if (!llmPopupOpen && !assistantPopupOpen && !consultingHubOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setLlmPopupOpen(false)
        setAssistantPopupOpen(false)
        setConsultingHubOpen(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [llmPopupOpen, assistantPopupOpen, consultingHubOpen])

  const canSaveInteraction = can('interactions:create:self_assigned')
  const canRunAi = canRunLlmAnalysis
  const canUseUnifiedSave = showCounselorProgressForm || canSaveInteraction
  const saveButtonLabel =
    coreDirty && detailLeftTab === 'profile' && !note.trim() && statusForForm === lead.pipelineStatus && (!crmEditOnLeft || crmForForm === lead.status)
      ? 'LÆ°u thÃ´ng tin há»“ sÆ¡'
      : 'LÆ°u cáº­p nháº­t'

  const labelUid = useCallback(
    (uid: string) => {
      if (!uid) return 'â€”'
      const u = pickListUsers.find((c) => c.id === uid) ?? counselorUsers.find((c) => c.id === uid)
      return u ? formatStaffDisplayName(u) : `${uid.slice(0, 8)}â€¦`
    },
    [pickListUsers, counselorUsers],
  )

  const saveUnified = async () => {
    if (!db || !profile) {
      setMsg('ChÆ°a cÃ³ káº¿t ná»‘i hoáº·c chÆ°a Ä‘Äƒng nháº­p.')
      return
    }
    const canMutateLead = showCounselorProgressForm
    const noteTrim = note.trim()
    const crmChanged = crmEditOnLeft && crmForForm !== lead.status
    const pipeChanged = statusForForm !== lead.pipelineStatus
    const corePatch = buildLeadCoreFirestorePatch(lead, coreDraft)
    const coreChanged = Object.keys(corePatch).length > 0

    if (!crmChanged && !pipeChanged && !noteTrim && !coreChanged) {
      setMsg('KhÃ´ng cÃ³ thay Ä‘á»•i.')
      return
    }
    if (coreChanged && !canMutateLead) {
      setMsg('Báº¡n khÃ´ng cÃ³ quyá»n chá»‰nh thÃ´ng tin há»“ sÆ¡ nÃ y (cáº§n Admin hoáº·c TVV Ä‘Æ°á»£c gÃ¡n + quyá»n ghi há»“ sÆ¡).')
      return
    }
    if (crmChanged && !canMutateLead) {
      setMsg('Báº¡n khÃ´ng cÃ³ quyá»n Ä‘á»•i tÃ¬nh tráº¡ng tÆ° váº¥n trÃªn há»“ sÆ¡ nÃ y.')
      return
    }
    if (pipeChanged && !noteTrim && !canMutateLead) {
      setMsg(
        'Äá»ƒ chá»‰nh funnel khÃ´ng kÃ¨m ghi chÃº, cáº§n quyá»n chá»‰nh sá»­a há»“ sÆ¡ Ä‘Æ°á»£c gÃ¡n (hoáº·c nháº­p ghi chÃº rá»“i báº¥m Â«LÆ°u cáº­p nháº­tÂ»).',
      )
      return
    }
    if (noteTrim && !canSaveInteraction) {
      setMsg('Báº¡n khÃ´ng cÃ³ quyá»n ghi tÆ°Æ¡ng tÃ¡c.')
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
          description: `Cáº­p nháº­t thÃ´ng tin há»“ sÆ¡ (${Object.keys(corePatch).length} trÆ°á»ng): ${Object.keys(corePatch)
            .slice(0, 12)
            .join(', ')}${Object.keys(corePatch).length > 12 ? 'â€¦' : ''}`,
          performedBy: profile.id,
          performedByName: performer,
        })
      }

      if (crmChanged) {
        await commitAuditLog(db, {
          leadId: lead.id,
          actionType: 'STATUS_CHANGE',
          description: `TÃ¬nh tráº¡ng tÆ° váº¥n: ${LEAD_COUNSELOR_STATUS_LABELS[lead.status]} â†’ ${LEAD_COUNSELOR_STATUS_LABELS[nextCrm]}`,
          performedBy: profile.id,
          performedByName: performer,
        })
      }
      if (nextPipeFinal !== lead.pipelineStatus) {
        await commitAuditLog(db, {
          leadId: lead.id,
          actionType: 'STATUS_CHANGE',
          description: `Pipeline funnel: ${PIPELINE_LABEL[lead.pipelineStatus]} â†’ ${PIPELINE_LABEL[nextPipeFinal]}`,
          performedBy: profile.id,
          performedByName: performer,
        })
      }

      if (noteTrim) {
        const nextPriority: PriorityTag =
          (scoreFields.priorityTag as PriorityTag | undefined) ??
          scoringPreview?.priorityTag ??
          lead.priorityTag
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
          description: `Ghi chÃº tÆ°Æ¡ng tÃ¡c (${evalTag}): ${noteTrim.slice(0, 280)}${noteTrim.length > 280 ? 'â€¦' : ''}`,
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
      setMsg('ÄÃ£ lÆ°u cáº­p nháº­t.')
    } catch (e) {
      console.error(e)
      setMsg('KhÃ´ng lÆ°u Ä‘Æ°á»£c. Kiá»ƒm tra Firestore Rules.')
    } finally {
      setSaving(false)
    }
  }

  const leadForAi = previewLeadForMatching
  const contextualRagForRun = useMemo(
    () => buildLeadContextualRagBlock(leadForAi, knowledgeDocs),
    [leadForAi, knowledgeDocs],
  )
  const localInstitutionalRag = useMemo(
    () => buildLeadContextualRagBlock(previewLeadForMatching, knowledgeDocs),
    [previewLeadForMatching, knowledgeDocs],
  )
  const playbookContextForRun = useMemo(
    () => buildPlaybookContextBlock(playbookMatches.map((m) => m.playbook)),
    [playbookMatches],
  )

  const runAiLlmAnalysis = async () => {
    if (!canRunLlmAnalysis) {
      setAiErr(
        'Tư vấn AI cần được quản lý bật «Cho phép dùng AI trên hồ sơ» (Cài đặt → Quản lý nhân sự), hoặc dùng tài khoản Admin / Siêu quản trị.',
      )
      return
    }
    const config = resolveAIIntegrationConfig()
    if (!config?.apiKey?.trim()) {
      setAiErr(
        'Chưa có khóa ChatGPT / Gemini — Siêu quản trị lưu tại Cài đặt → LLM → API trên trình duyệt này, hoặc cấu hình VITE_AI_API_KEY trong .env rồi build lại.',
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
    if (!aiTasks.length) {
      setAiErr('Chưa có tác vụ AI — tạo mẫu tại Cài đặt → LLM & Tư vấn AI → Hướng dẫn.')
      return
    }
    setAiRunning(true)
    setAiErr(null)
    try {
      const extras: Record<string, unknown> = {}
      if (selectedAITask.targetFields.includes('counselorNote')) {
        extras.counselorNote = notesAgg || '(Chưa có ghi chú tương tác.)'
      }
      if (selectedAITask.targetFields.includes('calculatedScore')) {
        extras.calculatedScore = displayScoring.calculatedScore
      }
      if (selectedAITask.targetFields.includes('priorityTag')) {
        extras.priorityTag = displayScoring.priorityTag
      }
      const parsed = await runAIAnalysis(leadForAi, selectedAITask, config, extras, {
        institutionalRagBlock:
          contextualRagForRun.trim() || localInstitutionalRag.trim() || institutionalRagBlock.trim() || undefined,
        playbookContextBlock: playbookContextForRun || undefined,
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
          description: `Cháº¡y phÃ¢n tÃ­ch AI: Â«${selectedAITask.name}Â»`,
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
      setAiErr(e instanceof Error ? e.message : 'KhÃ´ng cháº¡y Ä‘Æ°á»£c phÃ¢n tÃ­ch AI.')
    } finally {
      setAiRunning(false)
    }
  }

  const interactionsHistorySection = (
    <section className="flex min-h-0 flex-1 flex-col rounded-lg border border-slate-200/80 bg-white p-2 shadow-sm">
      <h3 className="shrink-0 text-sm font-bold uppercase tracking-wider text-slate-600 sm:text-base">
        Lá»‹ch sá»­ ghi chÃº &amp; Ä‘Ã¡nh giÃ¡
      </h3>
      {intLoading ? <p className="mt-0.5 shrink-0 text-sm text-slate-500">Äang táº£iâ€¦</p> : null}
      <ul className="scroll-touch mt-1.5 min-h-0 flex-1 space-y-1.5 overflow-y-auto overscroll-contain pr-0.5">
        {interactions.map((it) => (
          <li
            key={it.id}
            className="rounded-md border border-slate-200/70 bg-slate-50/90 p-2.5 text-sm text-slate-700"
          >
            <div className="flex flex-wrap items-center justify-between gap-1 border-b border-slate-200/60 pb-1">
              <p className="font-semibold text-slate-900">
                {interactionChannelVi(it.channel)}
                {it.evaluationTag ? (
                  <span className="font-normal text-slate-600"> Â· {it.evaluationTag}</span>
                ) : null}
              </p>
              <p className="text-[11px] text-slate-500">
                {labelUid(it.authorUid)} Â· {it.timestamp?.toDate?.().toLocaleString?.('vi-VN') ?? ''}
              </p>
            </div>
            {(it.snapshotCrmStatus || it.snapshotPipelineStatus || it.snapshotPriorityTag) && (
              <div className="mt-1.5 flex flex-wrap gap-1">
                {it.snapshotCrmStatus ? (
                  <span
                    className="inline-flex max-w-full items-center rounded border border-amber-200/80 bg-amber-50 px-1.5 py-0.5 text-[11px] font-medium text-amber-950"
                    title="TÃ¬nh tráº¡ng CRM táº¡i lÃºc lÆ°u"
                  >
                    TVV: {LEAD_COUNSELOR_STATUS_LABELS[it.snapshotCrmStatus]}
                  </span>
                ) : null}
                {it.snapshotPipelineStatus ? (
                  <span
                    className="inline-flex max-w-full items-center rounded border border-sky-200/80 bg-sky-50 px-1.5 py-0.5 text-[11px] font-medium text-sky-950"
                    title="Funnel táº¡i lÃºc lÆ°u"
                  >
                    Funnel: {PIPELINE_LABEL[it.snapshotPipelineStatus]}
                  </span>
                ) : null}
                {it.snapshotPriorityTag ? (
                  <span className="inline-flex items-center gap-0.5 rounded border border-slate-200 bg-white px-1 py-0.5 text-[11px] text-slate-800">
                    NhÃ£n: <TagBadge tag={it.snapshotPriorityTag} />
                  </span>
                ) : null}
              </div>
            )}
            {it.counselorNote ? (
              <p className="mt-1.5 whitespace-pre-wrap leading-snug text-slate-800">{it.counselorNote}</p>
            ) : null}
            {it.callOutcome ? (
              <p className="mt-1 text-[11px] font-medium text-slate-600">Káº¿t quáº£: {it.callOutcome}</p>
            ) : null}
            {it.aiSentiment ? (
              <p className="mt-1 text-[11px] leading-snug text-violet-800">
                AI: {it.aiSentiment.label} ({it.aiSentiment.score}) â€” {it.aiSentiment.summary}
              </p>
            ) : null}
          </li>
        ))}
        {!intLoading && !interactions.length ? (
          <li className="text-xs text-slate-500">ChÆ°a cÃ³ tÆ°Æ¡ng tÃ¡c.</li>
        ) : null}
      </ul>
    </section>
  )

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="lead-detail-title"
      className="lead-detail-panel fixed inset-0 z-[100] flex h-[100dvh] max-h-[100dvh] w-screen max-w-[100vw] flex-col overflow-x-hidden bg-gradient-to-b from-slate-50 via-white to-slate-50/90 text-base text-slate-900 shadow-[0_-20px_80px_rgba(15,23,42,0.12)]"
    >
      <header className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-200/90 bg-white/95 px-3 py-3 shadow-sm sm:px-5 lg:px-6">
        <div className="min-w-0 flex-1">
          <p className="app-page-kicker text-slate-600">Chi tiáº¿t há»“ sÆ¡</p>
          <h2
            id="lead-detail-title"
            className="text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl"
          >
            {lead.fullName || 'ChÆ°a rÃµ tÃªn'}
          </h2>
        </div>
        <div className="flex shrink-0 flex-wrap items-stretch justify-end gap-1.5">
          <button
            type="button"
            onClick={() => openConsultingHub('overview')}
            className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-amber-400/70 bg-amber-500 px-3 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-amber-600"
          >
            <BookOpen className="h-3.5 w-3.5 shrink-0" aria-hidden strokeWidth={1.75} />
            Tư vấn & Tri thức
            {consultingHubCount > 0 ? (
              <span className="rounded-full bg-white/25 px-1.5 py-0.5 text-[11px] font-bold tabular-nums">
                {consultingHubCount}
              </span>
            ) : null}
          </button>
          {!scriptSnippetsLoading ? (
            <>
              <button
                type="button"
                onClick={() => openConsultingHub('knowledge')}
                className="hidden rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-2 text-xs font-semibold text-amber-950 hover:bg-amber-100 sm:inline-flex"
              >
                Tri thức
              </button>
              <button
                type="button"
                onClick={() => openConsultingHub('scripts')}
                className="hidden rounded-lg border border-sky-200 bg-sky-50 px-2.5 py-2 text-xs font-semibold text-sky-900 hover:bg-sky-100 sm:inline-flex"
              >
                Kịch bản
              </button>
            </>
          ) : null}
          {canRunAi ? (
            <button
              type="button"
              onClick={() => setLlmPopupOpen(true)}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-violet-400/60 bg-gradient-to-r from-violet-600 to-fuchsia-600 px-3 py-2 text-sm font-semibold text-white shadow-sm transition hover:brightness-110"
            >
              <Sparkles className="h-3.5 w-3.5 shrink-0" aria-hidden strokeWidth={1.75} />
              Tư vấn AI
            </button>
          ) : null}
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 shadow-sm transition hover:border-amber-300 hover:bg-amber-50"
          >
            <X className="h-3.5 w-3.5" aria-hidden />
            ÄÃ³ng
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
                  Gá»£i Ã½ tá»« AI (Æ°u tiÃªn chá»‘t sale)
                </p>
                {lead.aiProcessedAt?.toDate ? (
                  <p className="mt-0.5 text-xs text-amber-800/80">
                    Cáº­p nháº­t AI: {lead.aiProcessedAt.toDate().toLocaleString('vi-VN')}
                  </p>
                ) : null}
              </div>
            </div>
            <div className="min-w-0 flex-1 space-y-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-amber-900/90">PhÃ¢n tÃ­ch</p>
                <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-slate-900">
                  {lead.aiShortlistReason?.trim() || 'â€”'}
                </p>
              </div>
              <div className="rounded-xl border border-amber-300/60 bg-white/70 px-3 py-2.5 shadow-sm">
                <p className="text-xs font-bold uppercase tracking-wide text-emerald-900">HÃ nh Ä‘á»™ng Ä‘á» xuáº¥t</p>
                <p className="mt-1 text-sm font-semibold leading-snug text-emerald-950">
                  {lead.recommendedAction?.trim() || 'â€”'}
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
                  aria-label="Ná»™i dung chÃ­nh chi tiáº¿t há»“ sÆ¡"
                >
                  <button
                    type="button"
                    role="tab"
                    aria-selected={detailLeftTab === 'counselor'}
                    onClick={() => setDetailLeftTab('counselor')}
                    className={[
                      'min-h-10 rounded-lg border px-3 py-2 text-left text-sm font-semibold tracking-tight transition sm:px-4 sm:text-base',
                      detailLeftTab === 'counselor'
                        ? 'border-violet-500/55 bg-gradient-to-r from-violet-600 to-violet-700 text-white shadow-md'
                        : 'border-transparent bg-slate-50 text-slate-800 hover:border-slate-200 hover:bg-white',
                    ].join(' ')}
                  >
                    Thao tÃ¡c TVV
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={detailLeftTab === 'profile'}
                    onClick={() => setDetailLeftTab('profile')}
                    className={[
                      'min-h-10 rounded-lg border px-3 py-2 text-left text-sm font-semibold tracking-tight transition sm:px-4 sm:text-base',
                      detailLeftTab === 'profile'
                        ? 'border-slate-600/50 bg-slate-800 text-white shadow-md'
                        : 'border-transparent bg-slate-50 text-slate-800 hover:border-slate-200 hover:bg-white',
                    ].join(' ')}
                  >
                    ThÃ´ng tin há»“ sÆ¡
                  </button>
                </nav>
                <div className="scroll-touch flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain">
                  {detailLeftTab === 'profile' ? (
                    <aside className="space-y-2 text-base leading-snug text-slate-800">
                      <section className="rounded-xl border border-slate-200/90 bg-white p-3 shadow-sm sm:p-3.5">
                        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2">
                          <h3 className="text-sm font-bold uppercase tracking-wide text-slate-700 sm:text-base">
                            ThÃ´ng tin há»“ sÆ¡
                          </h3>
                          <div className="flex flex-wrap items-center gap-2 text-sm text-slate-600">
                            <span className="tabular-nums">
                              Äiá»ƒm: {String(displayScoring.calculatedScore)}
                            </span>
                            <TagBadge tag={displayScoring.priorityTag} />
                          </div>
                        </div>
                        <div className="mt-2 max-h-[min(72dvh,44rem)] min-h-[12rem] overflow-y-auto overscroll-y-contain pr-0.5 [scrollbar-width:thin] lg:max-h-[min(78dvh,48rem)]">
                          <LeadProfileCoreForm
                            draft={coreDraft}
                            onChange={setCoreDraft}
                            disabled={!showCounselorProgressForm}
                          />
                        </div>
                        {!showCounselorProgressForm ? (
                          <p className="mt-2 text-xs text-amber-800 sm:text-sm">
                            Chá»‰ xem â€” khÃ´ng cÃ³ quyá»n sá»­a thÃ´ng tin há»“ sÆ¡ (Admin hoáº·c TVV Ä‘Æ°á»£c gÃ¡n).
                          </p>
                        ) : null}
                      </section>
                    </aside>
                  ) : (
                    <aside className="space-y-2 text-base leading-snug text-slate-800">
                      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200/90 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm">
                        <span className="font-semibold text-slate-800">TÃ³m táº¯t nhanh</span>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="tabular-nums">
                            Äiá»ƒm: {String(displayScoring.calculatedScore)}
                          </span>
                          <TagBadge tag={displayScoring.priorityTag} />
                        </div>
                      </div>
                      {db ? (
                        <div className="space-y-2">
                          {showCounselorProgressForm || canSaveInteraction ? (
                            <div className="space-y-1.5 border-b border-slate-200/70 pb-2">
                              <details open className="rounded-xl border border-amber-200/90 bg-gradient-to-br from-amber-50/95 via-white to-amber-50/35 shadow-md ring-1 ring-amber-200/70">
                                <summary className="cursor-pointer list-none px-3 py-2.5 text-sm font-bold text-amber-950 marker:content-none [&::-webkit-details-marker]:hidden">
                                  Tiáº¿n Ä‘á»™ tÆ° váº¥n &amp; ghi chÃº
                                </summary>
                                <div className="space-y-2 border-t border-amber-200/60 px-3 pb-3 pt-2">
                                <div
                                  className={`grid gap-2 ${crmEditOnLeft ? 'sm:grid-cols-3' : 'sm:grid-cols-2'}`}
                                >
                                  {crmEditOnLeft ? (
                                    <label className="block text-sm font-semibold text-slate-800">
                                      TÃ¬nh tráº¡ng tÆ° váº¥n
                                      <select
                                        value={crmForForm}
                                        onChange={(e) => setCrmDirty(e.target.value as LeadCounselorStatus)}
                                        className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-amber-400/40"
                                      >
                                        {LEAD_COUNSELOR_STATUS_ORDER.map((s) => (
                                          <option key={s} value={s} className="bg-white">
                                            {LEAD_COUNSELOR_STATUS_LABELS[s]}
                                          </option>
                                        ))}
                                      </select>
                                    </label>
                                  ) : null}
                                  <label className="block text-sm font-semibold text-slate-800">
                                    Funnel tuyá»ƒn sinh
                                    <select
                                      value={statusForForm}
                                      onChange={(e) => setStatusDirty(e.target.value as LeadPipelineStatus)}
                                      className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-amber-400/40"
                                    >
                                      {(Object.keys(PIPELINE_LABEL) as LeadPipelineStatus[]).map((k) => (
                                        <option key={k} value={k} className="bg-white">
                                          {PIPELINE_LABEL[k]}
                                        </option>
                                      ))}
                                    </select>
                                  </label>
                                  <label className="block text-sm font-semibold text-slate-800">
                                    NhÃ£n Ä‘Ã¡nh giÃ¡
                                    <select
                                      value={evalTag}
                                      onChange={(e) => setEvalTag(e.target.value)}
                                      className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-amber-400/40"
                                    >
                                      {EVALUATION_TAGS.map((t) => (
                                        <option key={t} value={t} className="bg-white">
                                          {t}
                                        </option>
                                      ))}
                                    </select>
                                  </label>
                                </div>
                                <label className="mt-2 block text-sm font-semibold text-slate-800">
                                  Ghi chÃº tÆ°Æ¡ng tÃ¡c
                                  <textarea
                                    value={note}
                                    onChange={(e) => setNote(e.target.value)}
                                    rows={3}
                                    placeholder={
                                      crmEditOnRight
                                        ? 'Ghi nháº­n buá»•i lÃ m viá»‡c â€” lÆ°u kÃ¨m funnel / nhÃ£n phÃ­a trÃªnâ€¦'
                                        : 'Ghi nháº­n buá»•i lÃ m viá»‡c â€” lÆ°u kÃ¨m tÃ¬nh tráº¡ng / funnel phÃ­a trÃªnâ€¦'
                                    }
                                    className="mt-1 w-full resize-y rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-amber-400/40"
                                  />
                                </label>
                                </div>
                              </details>
                            </div>
                          ) : null}

                          <details open className="rounded-xl border border-emerald-200/90 bg-gradient-to-br from-emerald-50/45 via-white to-slate-50/90 shadow-md ring-1 ring-emerald-900/10">
                            <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2.5 marker:content-none [&::-webkit-details-marker]:hidden">
                              <span className="app-section-heading min-w-0 flex-1 leading-tight text-emerald-900">
                                TÃ­n hiá»‡u &amp; Ä‘Ã¡nh giÃ¡ tiá»m nÄƒng
                              </span>
                            </summary>
                            <div className="border-t border-emerald-200/50 px-3 pb-3 pt-2">
                            <div className="min-h-0">
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
                            </div>
                          </details>
                        </div>
                      ) : null}
                    </aside>
                  )}
                </div>
                {canUseUnifiedSave && db ? (
                  <div className="shrink-0 space-y-2 border-t border-slate-200 bg-white p-3 shadow-[0_-6px_24px_rgba(15,23,42,0.08)]">
                    {hasUnsavedProgress ? (
                      <p role="status" className="text-sm font-semibold leading-snug text-amber-900">
                        CÃ³ thay Ä‘á»•i chÆ°a lÆ°u â€” báº¥m lÆ°u Ä‘á»ƒ ghi Firestore vÃ  cáº­p nháº­t Ä‘iá»ƒm / nhÃ£n ngay.
                      </p>
                    ) : (
                      <p className="text-xs leading-snug text-slate-500">
                        Sau khi chá»‰nh thÃ´ng tin hoáº·c ghi chÃº, báº¥m lÆ°u Ä‘á»ƒ há»‡ thá»‘ng ghi nháº­n.
                      </p>
                    )}
                    {msg ? (
                      <p
                        className={`text-sm font-medium ${msg.startsWith('KhÃ´ng') || msg.includes('khÃ´ng') ? 'text-rose-800' : 'text-emerald-800'}`}
                      >
                        {msg}
                      </p>
                    ) : null}
                    <button
                      type="button"
                      disabled={
                        saving ||
                        !db ||
                        (!showCounselorProgressForm && !canSaveInteraction) ||
                        !hasUnsavedProgress
                      }
                      onClick={() => void saveUnified()}
                      className="flex w-full min-h-11 items-center justify-center gap-2 rounded-lg border border-emerald-600 bg-gradient-to-r from-emerald-600 to-teal-600 py-2.5 text-sm font-bold text-white shadow-md transition hover:brightness-105 disabled:pointer-events-none disabled:opacity-45"
                    >
                      <Save className="h-4 w-4 shrink-0" aria-hidden strokeWidth={2} />
                      {saving ? 'Äang lÆ°uâ€¦' : saveButtonLabel}
                    </button>
                  </div>
                ) : null}
              </div>

              <aside className="flex min-h-0 flex-col gap-2 border-b border-slate-200/80 p-2 sm:p-3 lg:col-span-5 lg:h-full lg:max-h-full lg:border-b-0 lg:overflow-hidden lg:overscroll-contain">
                {crmQuickBlockVisible && db ? (
                  <>
                    <nav
                      className="flex shrink-0 flex-wrap gap-2 rounded-xl border border-slate-200/90 bg-white p-2 shadow-sm"
                      role="tablist"
                      aria-label="PhÃ¢n cÃ´ng vÃ  lá»‹ch sá»­"
                    >
                      <button
                        type="button"
                        role="tab"
                        aria-selected={detailRightTab === 'assign'}
                        onClick={() => setDetailRightTab('assign')}
                        className={[
                          'min-h-10 rounded-lg border px-3 py-2 text-left text-sm font-semibold tracking-tight transition sm:px-4 sm:text-base',
                          detailRightTab === 'assign'
                            ? 'border-teal-500/55 bg-gradient-to-r from-teal-600 to-emerald-600 text-white shadow-md'
                            : 'border-transparent bg-slate-50 text-slate-800 hover:border-slate-200 hover:bg-white',
                        ].join(' ')}
                      >
                        PhÃ¢n cÃ´ng &amp; tÃ¬nh tráº¡ng
                      </button>
                      <button
                        type="button"
                        role="tab"
                        aria-selected={detailRightTab === 'history'}
                        onClick={() => setDetailRightTab('history')}
                        className={[
                          'min-h-10 rounded-lg border px-3 py-2 text-left text-sm font-semibold tracking-tight transition sm:px-4 sm:text-base',
                          detailRightTab === 'history'
                            ? 'border-sky-500/55 bg-gradient-to-r from-sky-600 to-indigo-600 text-white shadow-md'
                            : 'border-transparent bg-slate-50 text-slate-800 hover:border-slate-200 hover:bg-white',
                        ].join(' ')}
                      >
                        Lá»‹ch sá»­ &amp; ghi chÃº
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

      {consultingHubOpen ? (
        <>
          <button
            type="button"
            className="fixed inset-0 z-[110] cursor-default bg-slate-900/45 backdrop-blur-[2px]"
            aria-label="Đóng cửa sổ tư vấn & tri thức"
            onClick={() => setConsultingHubOpen(false)}
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
                    Tư vấn & Tri thức
                  </h2>
                  <p className="mt-0.5 text-xs leading-snug text-slate-600 sm:text-sm">
                    {playbookMatchCount > 0
                      ? `${playbookMatchCount} playbook khớp — xem điểm yếu, kịch bản và tra cứu tri thức.`
                      : 'Tổng quan điểm yếu hồ sơ — cấu hình playbook/tri thức trong Cài đặt → Thông tin TV.'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setConsultingHubOpen(false)}
                className="flex shrink-0 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50"
              >
                <X className="h-4 w-4" aria-hidden />
                Đóng
              </button>
            </div>
            <div className="scroll-touch min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 sm:p-6">
              <LeadConsultingHub
                lead={previewLeadForMatching}
                playbooks={playbooks}
                showDraftHint={coreDirty}
                initialTab={consultingHubTab}
                canRunAssistant={!scriptSnippetsLoading}
                infoScoreRuntime={infoScoreRuntime}
                priorityTag={displayScoring.priorityTag}
                calculatedScore={displayScoring.calculatedScore}
                onGoToProfile={() => {
                  setConsultingHubOpen(false)
                  setDetailLeftTab('profile')
                }}
                onGoToAi={() => {
                  setConsultingHubOpen(false)
                  setLlmPopupOpen(true)
                }}
              />
            </div>
          </div>
        </>
      ) : null}

      {canRunAi && llmPopupOpen ? (
        <>
          <button
            type="button"
            className="fixed inset-0 z-[110] cursor-default bg-slate-900/45 backdrop-blur-[2px]"
            aria-label="Đóng cửa sổ tư vấn AI"
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
                    PhÃ¢n tÃ­ch AI
                  </h2>
                  <p className="mt-0.5 text-xs leading-snug text-slate-600 sm:text-sm">
                    ChatGPT / Gemini (khÃ³a do SiÃªu quáº£n trá»‹ lÆ°u trong CÃ i Ä‘áº·t â†’ LLM) â€” káº¿t quáº£ lÆ°u trÃªn há»‡ thá»‘ng. Cáº§n
                    quáº£n lÃ½ báº­t Â«Cho phÃ©p dÃ¹ng AI trÃªn há»“ sÆ¡Â» cho tÃ i khoáº£n cá»§a báº¡n.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setLlmPopupOpen(false)}
                className="flex shrink-0 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50"
              >
                <X className="h-4 w-4" aria-hidden />
                ÄÃ³ng
              </button>
            </div>

            <div className="scroll-touch min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 sm:p-5">
              {aiTasksErr ? <p className="text-sm text-rose-700">{aiTasksErr}</p> : null}

              <p className="text-xs text-slate-500">
                Tri thức: {knowledgeDocs.length ? `${knowledgeDocs.length} tài liệu` : 'chưa nạp'}
                {playbookMatchCount > 0 ? ` · Playbook khớp: ${playbookMatchCount}` : ''}
                {coreDirty ? ' · Bản nháp chưa lưu' : ''}
              </p>

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
                    <option value="">Chưa có tác vụ — tạo tại Cài đặt → LLM</option>
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
                <span className="relative">{aiRunning ? 'Đang phân tích…' : 'Chạy tư vấn AI'}</span>
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
                    Kết quả tư vấn
                  </VietMyAccentHeading>
                  <AiInsightsGrid data={displayAiResult} />
                </div>
              ) : (
                <p className="mt-3 text-xs leading-relaxed text-slate-500">
                  Chọn tác vụ và bấm chạy. Cần khóa API (Cài đặt → LLM) và quyền AI. Nên nạp Kho tri thức trước để AI
                  không bịa học phí / quy chế.
                </p>
              )}
            </div>
          </div>
        </>
      ) : null}

      {!scriptSnippetsLoading && assistantPopupOpen ? (
        <>
          <button
            type="button"
            className="fixed inset-0 z-[110] cursor-default bg-slate-900/45 backdrop-blur-[2px]"
            aria-label="ÄÃ³ng cá»­a sá»• trá»£ lÃ½ ká»‹ch báº£n"
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
                    Trá»£ lÃ½ ká»‹ch báº£n
                  </h2>
                  <p className="text-sm text-slate-600 sm:text-base">Luá»“ng Script Hub theo há»“ sÆ¡</p>
                </div>
                <div
                  className="flex cursor-help items-center gap-2 rounded-xl border border-violet-200/80 bg-violet-50/80 px-2.5 py-1.5 shadow-sm"
                  title={buildMlWinHoverText(leadMl)}
                >
                  <MlWinGauge value={leadMl.mlWinProbability} title={buildMlWinHoverText(leadMl)} />
                  <div className="min-w-0">
                    <p className="text-xs font-bold uppercase tracking-wide text-violet-900">Äiá»ƒm thÃ´ng tin</p>
                    <span className="text-sm font-bold text-violet-900">{leadMl.mlWinProbability}%</span>
                    <span className="ml-1.5 rounded bg-violet-200/80 px-1 text-xs font-semibold uppercase text-violet-950">
                      {leadMl.source === 'mvp_mock' ? 'MVP' : 'ÄÃ£ lÆ°u'}
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
                ÄÃ³ng
              </button>
            </div>
            <div className="scroll-touch min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 sm:p-6">
              <ConsultingAssistantPanel
                variant="embedded"
                showHeader={false}
                lead={previewLeadForMatching}
                snippets={scriptSnippets}
                loading={scriptSnippetsLoading}
                error={scriptSnippetsError}
              />
            </div>
          </div>
        </>
      ) : null}
    </div>
  )
}
