import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  and,
  collection,
  getCountFromServer,
  getDocs,
  limit,
  or,
  orderBy,
  query,
  startAfter,
  Timestamp,
  where,
  type DocumentData,
  type Firestore,
  type Query,
  type QueryDocumentSnapshot,
  type QueryFilterConstraint,
  type QuerySnapshot,
} from 'firebase/firestore'
import type {
  Lead,
  LeadCounselorStatus,
  LeadFinanceRecord,
  LeadPaymentApprovalStatus,
  LeadPaymentLine,
  LeadPaymentSlotKey,
  LeadPipelineStatus,
  PriorityTag,
  VietMyUserProfile,
} from '../types'
import { FS_COLLECTIONS } from '../types'
import { isAdminLikeRole, isTeamLeadRole } from '../auth/roleUtils'
import { getFirestoreDb, isFirebaseConfigured } from '../services/firebase'
import { useAuth } from './useAuth'
import { useMasterData } from './useMasterData'
import {
  coerceLeadCounselorStatus,
  counselorStatusToPipeline,
  pipelineToCounselorStatus,
} from '../utils/leadIdentity'
import { parseScoringSignalsFromFirestore } from '../utils/leadScoringSignals'

const PAYMENT_KEYS: LeadPaymentSlotKey[] = [
  'deposit',
  'supplementL1',
  'supplementL2',
  'supplementL3',
  'supplementL4',
]

function parsePaymentLine(raw: unknown): LeadPaymentLine | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const o = raw as Record<string, unknown>
  const amountVnd = o.amountVnd != null ? Number(o.amountVnd) : undefined
  const collectedAt = String(o.collectedAt ?? '').trim() || undefined
  const receiptUrl = String(o.receiptUrl ?? '').trim() || undefined
  const approvalStatus = String(o.approvalStatus ?? '').trim() as LeadPaymentApprovalStatus
  const approvalNote = String(o.approvalNote ?? '').trim() || undefined
  if (!amountVnd && !collectedAt && !receiptUrl && !approvalStatus && !approvalNote) return undefined
  return {
    amountVnd: amountVnd && !Number.isNaN(amountVnd) ? amountVnd : undefined,
    collectedAt,
    receiptUrl,
    approvalStatus: approvalStatus || undefined,
    approvalNote,
  }
}

function parseFinanceFromFirestore(data: DocumentData): LeadFinanceRecord | undefined {
  const raw = data.finance
  if (!raw || typeof raw !== 'object') return undefined
  const o = raw as Record<string, unknown>
  const payments: Partial<Record<LeadPaymentSlotKey, LeadPaymentLine>> = {}
  const payRaw = o.payments
  if (payRaw && typeof payRaw === 'object') {
    for (const key of PAYMENT_KEYS) {
      const line = parsePaymentLine((payRaw as Record<string, unknown>)[key])
      if (line) payments[key] = line
    }
  }
  const declaredTotalVnd = o.declaredTotalVnd != null ? Number(o.declaredTotalVnd) : undefined
  return {
    payments: Object.keys(payments).length ? payments : undefined,
    declaredTotalVnd: declaredTotalVnd && !Number.isNaN(declaredTotalVnd) ? declaredTotalVnd : undefined,
    reqFullNe: o.reqFullNe === true,
    fullNeStatus: String(o.fullNeStatus ?? '').trim() || undefined,
    n8nStatus: String(o.n8nStatus ?? '').trim() || undefined,
    enrollmentStatus: String(o.enrollmentStatus ?? '').trim() || undefined,
  }
}

function parseScoringCustomSignalsFromFirestore(raw: unknown): Record<string, boolean> | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const o = raw as Record<string, unknown>
  const out: Record<string, boolean> = {}
  for (const [k, v] of Object.entries(o)) {
    if (k && v === true) out[k] = true
  }
  return Object.keys(out).length ? out : undefined
}

/** Số hồ sơ mỗi trang Firestore / bảng. */
export const LEADS_PAGE_SIZE = 30

/** Quét tối đa khi có ô tìm (URL q) — lọc tiếp trên client (chế độ `paged`). Giữ vừa phải để tìm nhanh. */
export const MAX_LEAD_SEARCH_SCAN = 1200

/** Một lần getDocs tối đa khi nhảy trang xa (thay cho nhiều vòng startAfter). */
const MAX_LIST_BULK_FETCH = 3600

/** Giới hạn an toàn khi `dataMode: 'fullScope'` — đọc toàn bộ phạm vi theo lô Firestore. */
export const MAX_FULL_SCOPE_LEADS = 25_000

/**
 * Giới hạn đọc fullScope trên UI Kanban / lọc nhãn theo profile (tránh đọc hàng chục nghìn doc một lần).
 * Phân tích nâng cao có thể truyền `maxFullScopeLeads` cao hơn.
 */
export const LEADS_UI_FULL_SCOPE_MAX = 4000

/** Kích thước mỗi lần đọc Firestore trong `fullScope`. */
export const FULL_SCOPE_CHUNK_SIZE = 400

const PIPELINE_KEYS = new Set<string>([
  'NEW',
  'CONTACTED',
  'QUALIFIED',
  'APPLIED',
  'ENROLLED',
  'LOST',
  'ARCHIVED',
])

function isPipelineStatusString(s: string): s is Lead['pipelineStatus'] {
  return PIPELINE_KEYS.has(s)
}

function mapLegacyPipeline(v: unknown): Lead['pipelineStatus'] {
  const s = String(v ?? '').toUpperCase()
  const map: Record<string, Lead['pipelineStatus']> = {
    NEW: 'NEW',
    CALLED: 'CONTACTED',
    CONTACTED: 'CONTACTED',
    QUALIFIED: 'QUALIFIED',
    APPLIED: 'APPLIED',
    ENROLLED: 'ENROLLED',
    DROPPED: 'LOST',
    LOST: 'LOST',
    ARCHIVED: 'ARCHIVED',
  }
  return map[s] ?? 'NEW'
}

function normPriorityTag(v: unknown): Lead['priorityTag'] {
  const s = String(v ?? '').toUpperCase()
  if (s === 'HOT' || s === 'WARM' || s === 'COLD' || s === 'LOSS') return s
  return 'COLD'
}

export function mapDoc(id: string, data: Record<string, unknown>): Lead | null {
  try {
    const legacyAssigned =
      data.assignedCounselorId === null || data.assignedCounselorId === undefined
        ? null
        : String(data.assignedCounselorId)
    const assignedToRaw = data.assignedTo
    const assignedTo =
      assignedToRaw === null || assignedToRaw === undefined || assignedToRaw === ''
        ? legacyAssigned
        : String(assignedToRaw)

    const province = String(data.province ?? data.region ?? '')
    const majorInterest = String(data.majorInterest ?? data.major ?? '').trim()
    const academicPerformance =
      String(data.academicPerformance ?? '').trim() || String(data.academicLevel ?? '').trim()
    const studyIntention = String(data.studyIntention ?? '').trim()
    const financialStatus = String(data.financialStatus ?? '').trim() || undefined
    const hanoiArea = String(data.hanoiArea ?? '').trim() || undefined
    const schoolType = String(data.schoolType ?? '').trim()
    const educationLevelRaw = String(data.educationLevel ?? '').trim()
    const educationLevel =
      educationLevelRaw ||
      (!majorInterest && !studyIntention && !academicPerformance
        ? String(data.majorInterest ?? data.studyIntention ?? '').trim()
        : '')
    const highSchool = String(data.highSchool ?? data.highSchoolName ?? data.schoolName ?? '')
    const customerId = String(data.customerId ?? '')
    const systemCode = String(data.systemCode ?? '').trim() || undefined
    const fullName = String(data.fullName ?? '')
    const phone = String(data.phone ?? '')
    const parentPhone = String(data.parentPhone ?? '')
    const source = String(data.source ?? data.leadSource ?? '')
    let description = String(data.description ?? '').trim()
    const aspirationsRaw = String(data.aspirations ?? '').trim()
    const hobbiesRaw = String(data.hobbies ?? '').trim()
    const fieldTripNotesRaw = String(data.fieldTripNotes ?? '').trim()
    const profileNote1Raw = String(data.profileNote1 ?? '').trim()
    const profileNote2Raw = String(data.profileNote2 ?? '').trim()
    const otherAttentionRaw = String(data.otherAttentionNotes ?? '').trim()
    if (!description) {
      const bits = [aspirationsRaw, hobbiesRaw, fieldTripNotesRaw, profileNote1Raw, profileNote2Raw, otherAttentionRaw].filter(
        Boolean,
      )
      description = bits.join('\n---\n').trim()
    }
    const gradeClass = String(data.gradeClass ?? '')
    const addressRaw = String(data.address ?? '').trim()
    const permanentAddressRaw = String(data.permanentAddress ?? '').trim()
    const address = permanentAddressRaw || addressRaw
    const ethnicity = String(data.ethnicity ?? '').trim()
    const currentResidence = String(data.currentResidence ?? '').trim()
    const dateOfBirth = String(data.dateOfBirth ?? '').trim() || undefined

    const statusRaw = String(data.status ?? '').trim()
    const coercedCounselor = statusRaw ? coerceLeadCounselorStatus(statusRaw) : null
    let pipelineStatus: Lead['pipelineStatus']
    if (data.pipelineStatus) {
      const p = String(data.pipelineStatus).toUpperCase()
      pipelineStatus = (isPipelineStatusString(p) ? p : mapLegacyPipeline(data.pipelineStatus)) as Lead['pipelineStatus']
    } else if (coercedCounselor) {
      pipelineStatus = counselorStatusToPipeline(coercedCounselor)
    } else {
      pipelineStatus = mapLegacyPipeline(data.status)
    }
    const status: Lead['status'] = coercedCounselor ?? pipelineToCounselorStatus(pipelineStatus)

    const calculatedScore = Number(data.calculatedScore ?? data.finalScore ?? 0)
    const priorityTag = normPriorityTag(data.priorityTag ?? data.tag)

    const mlWinProbability =
      data.mlWinProbability !== undefined && data.mlWinProbability !== null
        ? Math.max(0, Math.min(100, Math.round(Number(data.mlWinProbability))))
        : undefined
    const mlExplanation =
      data.mlExplanation !== undefined && data.mlExplanation !== null
        ? String(data.mlExplanation).slice(0, 2000)
        : undefined
    const nextRaw = data.nextFollowUpDate
    const nextFollowUpDate =
      nextRaw && typeof nextRaw === 'object' && 'toMillis' in (nextRaw as object)
        ? (nextRaw as Timestamp)
        : null

    const uniqueHash = String(data.uniqueHash ?? '')
    const now = Timestamp.now()
    const createdAt = (data.createdAt as Timestamp) ?? (data.importedAt as Timestamp) ?? now
    const updatedAt = (data.updatedAt as Timestamp) ?? createdAt
    const importedAt = data.importedAt as Timestamp | undefined
    const uploadedAt = (data.uploadedAt as Timestamp) ?? importedAt ?? createdAt

    return {
      id,
      customerId,
      ...(systemCode ? { systemCode } : {}),
      fullName,
      phone,
      parentPhone,
      source,
      educationLevel,
      majorInterest: majorInterest || undefined,
      academicPerformance: academicPerformance || undefined,
      studyIntention: studyIntention || undefined,
      financialStatus,
      hanoiArea,
      schoolType: schoolType || undefined,
      assignedTo,
      assignedCounselorId: legacyAssigned ?? undefined,
      status,
      description,
      ...(aspirationsRaw ? { aspirations: aspirationsRaw } : {}),
      ...(hobbiesRaw ? { hobbies: hobbiesRaw } : {}),
      ...(fieldTripNotesRaw ? { fieldTripNotes: fieldTripNotesRaw } : {}),
      ...(profileNote1Raw ? { profileNote1: profileNote1Raw } : {}),
      ...(profileNote2Raw ? { profileNote2: profileNote2Raw } : {}),
      ...(otherAttentionRaw ? { otherAttentionNotes: otherAttentionRaw } : {}),
      ...(dateOfBirth ? { dateOfBirth } : {}),
      ...(data.nationalIdNotAvailable === true
        ? { nationalIdNotAvailable: true }
        : (() => {
            const nid = String(data.nationalId ?? '').replace(/\D/g, '')
            return nid ? { nationalId: nid } : {}
          })()),
      ...(String(data.studentEmail ?? '').trim() ? { studentEmail: String(data.studentEmail).trim() } : {}),
      ...(String(data.source1 ?? '').trim() ? { source1: String(data.source1).trim() } : {}),
      ...(String(data.source2 ?? '').trim() ? { source2: String(data.source2).trim() } : {}),
      ...(String(data.fatherName ?? '').trim() ? { fatherName: String(data.fatherName).trim() } : {}),
      ...(String(data.fatherPhone ?? '').trim() ? { fatherPhone: String(data.fatherPhone).trim() } : {}),
      ...(String(data.motherName ?? '').trim() ? { motherName: String(data.motherName).trim() } : {}),
      ...(String(data.motherPhone ?? '').trim() ? { motherPhone: String(data.motherPhone).trim() } : {}),
      ...(String(data.guardian ?? '').trim() ? { guardian: String(data.guardian).trim() } : {}),
      ...(String(data.scholarship1Id ?? '').trim() ? { scholarship1Id: String(data.scholarship1Id).trim() } : {}),
      ...(String(data.scholarship2Id ?? '').trim() ? { scholarship2Id: String(data.scholarship2Id).trim() } : {}),
      ...(() => {
        const finance = parseFinanceFromFirestore(data)
        return finance ? { finance } : {}
      })(),
      ...(String(data.inviteFolderUrl ?? '').trim()
        ? { inviteFolderUrl: String(data.inviteFolderUrl).trim() }
        : {}),
      highSchool,
      gradeClass,
      province,
      address,
      ...(ethnicity ? { ethnicity } : {}),
      ...(permanentAddressRaw || addressRaw ? { permanentAddress: permanentAddressRaw || addressRaw } : {}),
      ...(currentResidence ? { currentResidence } : {}),
      calculatedScore,
      priorityTag,
      uploadedAt,
      updatedAt,
      pipelineStatus,
      uniqueHash,
      createdAt,
      uploadedBy: data.uploadedBy !== undefined && data.uploadedBy !== null ? String(data.uploadedBy) : undefined,
      uploaderName: data.uploaderName !== undefined ? String(data.uploaderName) : undefined,
      uploadBatchId: data.uploadBatchId !== undefined ? String(data.uploadBatchId) : undefined,
      importedAt,
      lastTouchedAt:
        data.lastTouchedAt && typeof data.lastTouchedAt === 'object' && 'toMillis' in (data.lastTouchedAt as object)
          ? (data.lastTouchedAt as Timestamp)
          : undefined,
      routingMeta: data.routingMeta as Lead['routingMeta'],
      mlWinProbability,
      mlExplanation,
      nextFollowUpDate,
      aiSentimentScore:
        data.aiSentimentScore !== undefined && data.aiSentimentScore !== null
          ? Number(data.aiSentimentScore)
          : undefined,
      isAiShortlisted: data.isAiShortlisted === true,
      aiShortlistReason:
        data.aiShortlistReason !== undefined && data.aiShortlistReason !== null
          ? String(data.aiShortlistReason).slice(0, 4000)
          : undefined,
      recommendedAction:
        data.recommendedAction !== undefined && data.recommendedAction !== null
          ? String(data.recommendedAction).slice(0, 4000)
          : undefined,
      aiProcessedAt:
        data.aiProcessedAt && typeof data.aiProcessedAt === 'object' && 'toMillis' in (data.aiProcessedAt as object)
          ? (data.aiProcessedAt as Timestamp)
          : undefined,
      lastCallAiSummary:
        data.lastCallAiSummary !== undefined && data.lastCallAiSummary !== null
          ? String(data.lastCallAiSummary).slice(0, 500)
          : undefined,
      lastCallAiReadiness:
        data.lastCallAiReadiness !== undefined && data.lastCallAiReadiness !== null
          ? String(data.lastCallAiReadiness).slice(0, 64)
          : undefined,
      lastCallAiAt:
        data.lastCallAiAt && typeof data.lastCallAiAt === 'object' && 'toMillis' in (data.lastCallAiAt as object)
          ? (data.lastCallAiAt as Timestamp)
          : undefined,
      callEvalPriorityBoost:
        data.callEvalPriorityBoost !== undefined && data.callEvalPriorityBoost !== null
          ? normPriorityTag(data.callEvalPriorityBoost)
          : undefined,
      callEvalPriorityBoostAt:
        data.callEvalPriorityBoostAt &&
        typeof data.callEvalPriorityBoostAt === 'object' &&
        'toMillis' in (data.callEvalPriorityBoostAt as object)
          ? (data.callEvalPriorityBoostAt as Timestamp)
          : undefined,
      scoringSignals: parseScoringSignalsFromFirestore(data.scoringSignals),
      scoringCustomSignals: parseScoringCustomSignalsFromFirestore(data.scoringCustomSignals),
    }
  } catch {
    return null
  }
}

function impossibleUid(): string {
  return '__no_match__'
}

export type LeadListServerFilters = {
  pipelineStatus?: LeadPipelineStatus
  crmStatus?: LeadCounselorStatus
  priorityTag?: PriorityTag
  /** Admin: nhiều nhãn — Firestore `in` (tối đa 10). */
  priorityTagsIn?: PriorityTag[]
  province?: string
  educationLevel?: string
  source?: string
  scoreMin?: number
  scoreMax?: number
  uploadedByIn?: string[]
  provinceIn?: string[]
  assignedCounselorIn?: string[]
  highSchoolIn?: string[]
  adminDateField?: 'created' | 'updated' | 'imported'
  adminDateFromMs?: number
  adminDateToMs?: number
  /** Chỉ lead đã được AI đánh dấu shortlist (`isAiShortlisted === true`). */
  aiShortlistedOnly?: boolean
}

/**
 * Bản sao bộ lọc server **không** gồm `priorityTag` / `priorityTagsIn`.
 * Dùng khi đếm phân bổ HOT/WARM/COLD/LOSS (mỗi nhãn một truy vấn) trong cùng phạm vi các lọc khác.
 */
export function serverFiltersForTagDistribution(
  f: LeadListServerFilters | undefined,
): LeadListServerFilters | undefined {
  if (!f) return undefined
  const slim = Object.fromEntries(
    Object.entries(f).filter(([key, val]) => {
      if (key === 'priorityTag' || key === 'priorityTagsIn') return false
      return val !== undefined
    }),
  ) as LeadListServerFilters
  return Object.keys(slim).length ? slim : undefined
}

/** Bỏ một trường lọc (vd. `source`) khi quét danh mục giá trị trong cùng phạm vi RBAC. */
export function serverFiltersOmitField(
  f: LeadListServerFilters | undefined,
  omit: keyof LeadListServerFilters,
): LeadListServerFilters | undefined {
  if (!f) return undefined
  const slim = Object.fromEntries(
    Object.entries(f).filter(([key, val]) => key !== omit && val !== undefined),
  ) as LeadListServerFilters
  return Object.keys(slim).length ? slim : undefined
}

const SOURCE_CATALOG_BATCH = 800

function collectDistinctSources(rows: Lead[]): string[] {
  const s = new Set<string>()
  for (const l of rows) {
    const src = (l.source ?? '').trim()
    if (src) s.add(src)
  }
  return [...s].sort((a, b) => a.localeCompare(b, 'vi'))
}

export type UseLeadsOptions = {
  serverFilters?: LeadListServerFilters
  searchText?: string
  directoryLabels?: Map<string, string>
  /** `paged`: Firestore từng trang. `fullScope`: đọc hết phạm vi (theo lô) rồi trả về đủ mảng. `batch`: một lần getDocs giới hạn. */
  dataMode?: 'paged' | 'batch' | 'fullScope'
  batchLimit?: number
  /** Mặc định {@link FULL_SCOPE_CHUNK_SIZE}. */
  fullScopeChunkSize?: number
  /** Mặc định {@link MAX_FULL_SCOPE_LEADS}. */
  maxFullScopeLeads?: number
  /**
   * Khi true: gọi thêm getCount theo từng nhãn `priorityTag` (4 lần) — tốn chi phí aggregation.
   * Chỉ bật nơi thật sự dùng `scopeTagCounts` (vd. Phân tích nâng cao). Mặc định false.
   */
  includeScopeTagCounts?: boolean
  /**
   * Quét tối đa {@link SOURCE_CATALOG_BATCH} hồ sơ (cùng RBAC, bỏ lọc `source`) để gợi ý giá trị Nguồn.
   */
  includeScopeSourceOptions?: boolean
}

function rbacConstraint(profile: VietMyUserProfile, hoDLabels: string[]): QueryFilterConstraint | null {
  if (isAdminLikeRole(profile.role)) return null

  if (profile.role === 'counselor') {
    return or(where('assignedTo', '==', profile.id), where('assignedCounselorId', '==', profile.id))
  }

  if (isTeamLeadRole(profile.role)) {
    const team = (profile.managedCounselorIds ?? []).filter(Boolean)
    if (team.length) {
      const chunk = team.slice(0, 30)
      return or(where('assignedTo', 'in', chunk), where('assignedCounselorId', 'in', chunk))
    }
    const chunk = hoDLabels.filter(Boolean).slice(0, 30)
    if (chunk.length) return where('educationLevel', 'in', chunk)
    return where('assignedTo', '==', impossibleUid())
  }

  return null
}

function filterConstraints(f: LeadListServerFilters | undefined, profile: VietMyUserProfile): QueryFilterConstraint[] {
  if (!f) return []
  const c: QueryFilterConstraint[] = []
  if (f.pipelineStatus) {
    c.push(where('pipelineStatus', '==', f.pipelineStatus))
  }
  if (f.crmStatus) {
    c.push(where('status', '==', f.crmStatus))
  }
  if (f.priorityTagsIn?.length) {
    const t = f.priorityTagsIn.slice(0, 10)
    if (t.length === 1) c.push(where('priorityTag', '==', t[0]))
    else c.push(where('priorityTag', 'in', t))
  } else if (f.priorityTag) {
    c.push(where('priorityTag', '==', f.priorityTag))
  }
  if (f.province?.trim()) c.push(where('province', '==', f.province.trim()))
  if (f.educationLevel?.trim()) c.push(where('educationLevel', '==', f.educationLevel.trim()))
  if (f.source?.trim()) c.push(where('source', '==', f.source.trim()))
  if (f.highSchoolIn?.length) {
    const h = f.highSchoolIn.map((x) => x.trim()).filter(Boolean).slice(0, 10)
    if (h.length === 1) c.push(where('highSchool', '==', h[0]))
    else if (h.length > 1) c.push(where('highSchool', 'in', h))
  }
  if (f.scoreMin != null && Number.isFinite(f.scoreMin)) c.push(where('calculatedScore', '>=', f.scoreMin))
  if (f.scoreMax != null && Number.isFinite(f.scoreMax)) c.push(where('calculatedScore', '<=', f.scoreMax))
  if (f.aiShortlistedOnly) c.push(where('isAiShortlisted', '==', true))
  if (f.uploadedByIn?.length) {
    const u = f.uploadedByIn.filter(Boolean).slice(0, 10)
    if (u.length === 1) c.push(where('uploadedBy', '==', u[0]))
    else if (u.length > 1) c.push(where('uploadedBy', 'in', u))
  }
  if (f.provinceIn?.length) {
    const p = f.provinceIn.map((x) => x.trim()).filter(Boolean).slice(0, 10)
    if (p.length === 1) c.push(where('province', '==', p[0]))
    else if (p.length > 1) c.push(where('province', 'in', p))
  }
  if (f.assignedCounselorIn?.length && isAdminLikeRole(profile.role)) {
    const ids = f.assignedCounselorIn.filter(Boolean).slice(0, 10)
    if (ids.length === 1) {
      c.push(or(where('assignedTo', '==', ids[0]), where('assignedCounselorId', '==', ids[0])))
    } else if (ids.length > 1) {
      c.push(or(where('assignedTo', 'in', ids), where('assignedCounselorId', 'in', ids)))
    }
  }
  const fromMs = f.adminDateFromMs
  const toMs = f.adminDateToMs
  if (fromMs != null || toMs != null) {
    const field =
      f.adminDateField === 'imported'
        ? 'importedAt'
        : f.adminDateField === 'updated'
          ? 'updatedAt'
          : 'createdAt'
    if (fromMs != null) c.push(where(field, '>=', Timestamp.fromMillis(fromMs)))
    if (toMs != null) c.push(where(field, '<=', Timestamp.fromMillis(toMs)))
  }
  return c
}

function composeQuery(col: ReturnType<typeof collection>, parts: QueryFilterConstraint[]): Query {
  if (parts.length === 0) return query(col)
  const composed: QueryFilterConstraint =
    parts.length === 1
      ? parts[0]!
      : and(...(parts as [QueryFilterConstraint, ...QueryFilterConstraint[]]))
  return query(col, composed as unknown as Parameters<typeof query>[1])
}

function buildListDataQuery(
  firestore: Firestore,
  profile: VietMyUserProfile,
  hoDLabels: string[],
  filters?: LeadListServerFilters,
): Query {
  const col = collection(firestore, FS_COLLECTIONS.leads)
  const rbac = rbacConstraint(profile, hoDLabels)
  const extras = filterConstraints(filters, profile)
  const parts: QueryFilterConstraint[] = []
  if (rbac) parts.push(rbac)
  parts.push(...extras)
  return composeQuery(col, parts)
}

function buildPriorityTagCountQuery(
  firestore: Firestore,
  profile: VietMyUserProfile,
  hoDLabels: string[],
  filters: LeadListServerFilters | undefined,
  tag: PriorityTag,
): Query {
  const col = collection(firestore, FS_COLLECTIONS.leads)
  const rbac = rbacConstraint(profile, hoDLabels)
  const extras = [...filterConstraints(filters, profile), where('priorityTag', '==', tag)]
  const parts: QueryFilterConstraint[] = []
  if (rbac) parts.push(rbac)
  parts.push(...extras)
  return composeQuery(col, parts)
}

function applyRoleClientFilter(rows: Lead[], profile: VietMyUserProfile, hoDQueryLabels: string[]): Lead[] {
  const labelSet = new Set(hoDQueryLabels.map((x) => x.trim().toLowerCase()))
  if (isTeamLeadRole(profile.role)) {
    const team = new Set(profile.managedCounselorIds ?? [])
    if (team.size) {
      return rows.filter((l) => {
        const u = l.assignedTo ?? l.assignedCounselorId
        return Boolean(u && team.has(u))
      })
    }
    if (labelSet.size) {
      return rows.filter((l) => labelSet.has(l.educationLevel.trim().toLowerCase()))
    }
    return []
  }
  if (profile.role === 'counselor' && profile.id) {
    return rows.filter((l) => {
      const u = l.assignedTo ?? l.assignedCounselorId
      return u === profile.id
    })
  }
  return rows
}

/** So khớp ô tìm (chuỗi đã lowercase) với các trường lead — dùng chung Pipeline & Quản lý hồ sơ. */
export function leadMatchesClientSearch(
  l: Lead,
  q: string,
  directoryLabels: Map<string, string> | undefined,
): boolean {
  const name = (l.fullName ?? '').toLowerCase()
  const phone = (l.phone ?? '').toLowerCase()
  const email = (l.customerId ?? '').toLowerCase()
  const parent = (l.parentPhone ?? '').toLowerCase()
  const edu = (l.educationLevel ?? '').toLowerCase()
  const majorI = (l.majorInterest ?? '').toLowerCase()
  const academic = (l.academicPerformance ?? '').toLowerCase()
  const reg = (l.province ?? '').toLowerCase()
  const school = (l.highSchool ?? '').toLowerCase()
  const grade = (l.gradeClass ?? '').toLowerCase()
  const dob = (l.dateOfBirth ?? '').toLowerCase()
  const addr = (l.address ?? '').toLowerCase()
  const src = (l.source ?? '').toLowerCase()
  const desc = (l.description ?? '').toLowerCase()
  const asp = (l.aspirations ?? '').toLowerCase()
  const hob = (l.hobbies ?? '').toLowerCase()
  const n1 = (l.profileNote1 ?? '').toLowerCase()
  const n2 = (l.profileNote2 ?? '').toLowerCase()
  const nO = (l.otherAttentionNotes ?? '').toLowerCase()
  const uid = l.assignedTo ?? l.assignedCounselorId
  const tv = uid ? (directoryLabels?.get(uid) ?? '').toLowerCase() : ''
  const uploadLbl = l.uploadedBy
    ? (directoryLabels?.get(l.uploadedBy) ?? (l.uploaderName ?? '')).toLowerCase()
    : (l.uploaderName ?? '').toLowerCase()
  const hay = `${name} ${phone} ${email} ${parent} ${edu} ${majorI} ${academic} ${reg} ${school} ${grade} ${dob} ${addr} ${src} ${desc} ${asp} ${hob} ${n1} ${n2} ${nO} ${tv} ${uploadLbl}`
  return hay.includes(q)
}

const TAG_KEYS: PriorityTag[] = ['HOT', 'WARM', 'COLD', 'LOSS']

function deriveStoredPriorityTagCounts(rows: Lead[]): { HOT: number; WARM: number; COLD: number; LOSS: number } {
  const c = { HOT: 0, WARM: 0, COLD: 0, LOSS: 0 }
  for (const l of rows) {
    const t = l.priorityTag
    if (t === 'HOT' || t === 'WARM' || t === 'COLD' || t === 'LOSS') c[t]++
  }
  return c
}

export function useLeads(opts?: UseLeadsOptions) {
  const { profile } = useAuth()
  const { byKind } = useMasterData()
  const serverFilters = opts?.serverFilters
  const searchText = (opts?.searchText ?? '').trim().toLowerCase()
  const directoryLabels = opts?.directoryLabels
  const dataMode = opts?.dataMode ?? 'paged'
  const batchLimit = Math.min(500, Math.max(LEADS_PAGE_SIZE, opts?.batchLimit ?? 120))
  const fullScopeChunkSize = Math.min(500, Math.max(50, opts?.fullScopeChunkSize ?? FULL_SCOPE_CHUNK_SIZE))
  const maxFullScopeLeads = Math.min(100_000, Math.max(LEADS_PAGE_SIZE, opts?.maxFullScopeLeads ?? MAX_FULL_SCOPE_LEADS))
  const includeScopeTagCounts = Boolean(opts?.includeScopeTagCounts)
  const includeScopeSourceOptions = Boolean(opts?.includeScopeSourceOptions)

  const hoDQueryLabels = useMemo(() => {
    const ids = profile?.managedMajorIds ?? []
    if (!ids.length) return [] as string[]
    const idSet = new Set(ids)
    const majors = byKind.majors ?? []
    return majors.filter((m) => idSet.has(m.id)).map((m) => m.label.trim()).filter(Boolean)
  }, [profile?.managedMajorIds, byKind.majors])

  const hoDKey = hoDQueryLabels.join('\u0001')
  const serverFiltersKey = useMemo(() => JSON.stringify(serverFilters ?? {}), [serverFilters])
  const directoryLabelsKey = useMemo(() => {
    if (!directoryLabels?.size) return ''
    return [...directoryLabels.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([k, v]) => `${k}:${v}`)
      .join('|')
  }, [directoryLabels])
  const filterKey = useMemo(() => {
    const b = `${serverFiltersKey}|${searchText}|${dataMode}|${batchLimit}|${hoDKey}|${directoryLabelsKey}`
    if (dataMode === 'fullScope') return `${b}|fsc:${fullScopeChunkSize}|cap:${maxFullScopeLeads}`
    return b
  }, [
    serverFiltersKey,
    searchText,
    dataMode,
    batchLimit,
    hoDKey,
    directoryLabelsKey,
    fullScopeChunkSize,
    maxFullScopeLeads,
  ])

  const [leads, setLeads] = useState<Lead[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingPage, setLoadingPage] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [totalLeadCount, setTotalLeadCount] = useState<number | null>(null)
  const [totalLeadCountError, setTotalLeadCountError] = useState<string | null>(null)
  const [currentPage, setCurrentPageState] = useState(1)
  const currentPageRef = useRef(currentPage)
  const [totalPages, setTotalPages] = useState(1)
  const [scopeTagCounts, setScopeTagCounts] = useState<{ HOT: number; WARM: number; COLD: number; LOSS: number } | null>(
    null,
  )
  const [scopeSourceOptions, setScopeSourceOptions] = useState<string[]>([])
  const [searchScanTruncated, setSearchScanTruncated] = useState(false)
  const [searchHitTotal, setSearchHitTotal] = useState<number | null>(null)
  const [scopeFetchTruncated, setScopeFetchTruncated] = useState(false)
  /** Tăng khi gọi `refetchLeads` — ép chạy lại tải danh sách cùng bộ lọc (sau bulk, v.v.). */
  const [manualRefreshKey, setManualRefreshKey] = useState(0)
  const pendingManualRefetchRef = useRef(false)

  const refetchLeads = useCallback(() => {
    pendingManualRefetchRef.current = true
    setManualRefreshKey((k) => k + 1)
  }, [])

  const configured = useMemo(() => isFirebaseConfigured(), [])
  const pageEndSnaps = useRef<(QueryDocumentSnapshot<DocumentData> | null)[]>([])
  const searchBucketRef = useRef<Lead[] | null>(null)
  const lastDataFilterKey = useRef<string>('')
  const totalRef = useRef<number | null>(null)

  const setPage = useCallback((p: number) => {
    setCurrentPageState(() => Math.max(1, Math.floor(p)))
  }, [])

  const pagedFirestoreDep = dataMode === 'paged' ? currentPage : 0

  useLayoutEffect(() => {
    currentPageRef.current = currentPage
  }, [currentPage])

  useEffect(() => {
    const firestore = getFirestoreDb()
    if (!firestore) {
      queueMicrotask(() => {
        setLoading(false)
        setLoadingPage(false)
        setLeads([])
        setTotalLeadCount(null)
        setTotalLeadCountError(null)
        setScopeTagCounts(null)
        setScopeSourceOptions([])
        setSearchHitTotal(null)
        setScopeFetchTruncated(false)
        setError(
          configured ? null : 'Chưa cấu hình Firebase. Thêm biến môi trường theo .env.example.',
        )
      })
      return
    }

    if (!profile) {
      queueMicrotask(() => {
        setLoading(false)
        setLoadingPage(false)
        setLeads([])
        setError(null)
        setTotalLeadCount(null)
        setTotalLeadCountError(null)
        setScopeTagCounts(null)
        setScopeSourceOptions([])
        setSearchHitTotal(null)
        setScopeFetchTruncated(false)
      })
      return
    }

    let cancelled = false
    const fkChanged = lastDataFilterKey.current !== filterKey
    const manualRefetch = pendingManualRefetchRef.current
    if (manualRefetch) pendingManualRefetchRef.current = false
    if (fkChanged) {
      lastDataFilterKey.current = filterKey
      pageEndSnaps.current = []
      searchBucketRef.current = null
      totalRef.current = null
      setCurrentPageState(1)
      setScopeTagCounts(null)
    }

    const pageToLoad = fkChanged ? 1 : currentPageRef.current

    const fetchTotalOnly = async (): Promise<number | null> => {
      try {
        const base = buildListDataQuery(firestore, profile, hoDQueryLabels, serverFilters)
        const total = (await getCountFromServer(base)).data().count
        if (cancelled) return null
        setTotalLeadCount(total)
        setTotalLeadCountError(null)
        totalRef.current = total
        return total
      } catch (e) {
        console.error(e)
        if (!cancelled) {
          setTotalLeadCount(null)
          setTotalLeadCountError(e instanceof Error ? e.message : 'Không đếm được tổng hồ sơ')
          totalRef.current = null
        }
        return null
      }
    }

    const fetchTagCountsOnly = async () => {
      try {
        const distFilters = serverFiltersForTagDistribution(serverFilters)
        const tagEntries = await Promise.all(
          TAG_KEYS.map(async (t) => {
            const qTag = buildPriorityTagCountQuery(firestore, profile, hoDQueryLabels, distFilters, t)
            const n = (await getCountFromServer(qTag)).data().count
            return [t, n] as const
          }),
        )
        if (cancelled) return
        setScopeTagCounts({
          HOT: tagEntries.find(([k]) => k === 'HOT')?.[1] ?? 0,
          WARM: tagEntries.find(([k]) => k === 'WARM')?.[1] ?? 0,
          COLD: tagEntries.find(([k]) => k === 'COLD')?.[1] ?? 0,
          LOSS: tagEntries.find(([k]) => k === 'LOSS')?.[1] ?? 0,
        })
      } catch (e) {
        console.error(e)
        if (!cancelled) setScopeTagCounts(null)
      }
    }

    const fetchSourceCatalog = async () => {
      try {
        const distFilters = serverFiltersOmitField(serverFilters, 'source')
        const qy = query(
          buildListDataQuery(firestore, profile, hoDQueryLabels, distFilters),
          orderBy('updatedAt', 'desc'),
          limit(SOURCE_CATALOG_BATCH),
        )
        const snap = await getDocs(qy)
        if (cancelled) return
        const rows: Lead[] = []
        snap.forEach((d) => {
          const row = mapDoc(d.id, d.data() as Record<string, unknown>)
          if (row) rows.push(row)
        })
        const filtered = applyRoleClientFilter(rows, profile, hoDQueryLabels)
        setScopeSourceOptions(collectDistinctSources(filtered))
      } catch (e) {
        console.error(e)
        if (!cancelled) setScopeSourceOptions([])
      }
    }

    const runAggregations = async (): Promise<number | null> => {
      const total = await fetchTotalOnly()
      if (cancelled || total == null) return null
      const side: Promise<void>[] = []
      if (includeScopeTagCounts) side.push(fetchTagCountsOnly())
      if (includeScopeSourceOptions) side.push(fetchSourceCatalog())
      if (side.length) await Promise.all(side)
      return total
    }

    const loadFirestorePage = async (page: number, total: number | null) => {
      const base = () => buildListDataQuery(firestore, profile, hoDQueryLabels, serverFilters)
      const snaps = pageEndSnaps.current
      const pg = Math.max(1, Math.floor(page))

      const prev = pg <= 1 ? null : snaps[pg - 2]
      const canSingleStep = pg === 1 || (prev !== undefined && prev !== null)

      const fetchOnePage = async (after: QueryDocumentSnapshot<DocumentData> | null) => {
        const qy =
          after === null
            ? query(base(), orderBy('updatedAt', 'desc'), limit(LEADS_PAGE_SIZE))
            : query(base(), orderBy('updatedAt', 'desc'), startAfter(after), limit(LEADS_PAGE_SIZE))
        const snap = await getDocs(qy)
        if (cancelled) return
        const mapped: Lead[] = []
        snap.forEach((d) => {
          const row = mapDoc(d.id, d.data() as Record<string, unknown>)
          if (row) mapped.push(row)
        })
        mapped.sort((a, b) => b.updatedAt.toMillis() - a.updatedAt.toMillis())
        setLeads(applyRoleClientFilter(mapped, profile, hoDQueryLabels))
        snaps[pg - 1] = snap.docs.length ? snap.docs[snap.docs.length - 1]! : null
      }

      if (canSingleStep) {
        await fetchOnePage(pg <= 1 ? null : (prev as QueryDocumentSnapshot<DocumentData>))
      } else if (pg * LEADS_PAGE_SIZE <= MAX_LIST_BULK_FETCH) {
        const bulkLimit = pg * LEADS_PAGE_SIZE
        const qy = query(base(), orderBy('updatedAt', 'desc'), limit(bulkLimit))
        const snap = await getDocs(qy)
        if (cancelled) return
        const docs = snap.docs
        for (let p = 1; p <= pg; p++) {
          const endIdx = p * LEADS_PAGE_SIZE - 1
          if (endIdx < docs.length) snaps[p - 1] = docs[endIdx]!
          else if ((p - 1) * LEADS_PAGE_SIZE < docs.length) snaps[p - 1] = docs[docs.length - 1]!
          else snaps[p - 1] = null
        }
        const startDocSlice = (pg - 1) * LEADS_PAGE_SIZE
        const sliceDocs = docs.slice(startDocSlice, startDocSlice + LEADS_PAGE_SIZE)
        const pageRows: Lead[] = []
        sliceDocs.forEach((d) => {
          const row = mapDoc(d.id, d.data() as Record<string, unknown>)
          if (row) pageRows.push(row)
        })
        pageRows.sort((a, b) => b.updatedAt.toMillis() - a.updatedAt.toMillis())
        setLeads(applyRoleClientFilter(pageRows, profile, hoDQueryLabels))
      } else {
        for (let p = 1; p < pg; p++) {
          if (snaps[p - 1] !== undefined && snaps[p - 1] !== null) continue
          const prevEnd = p === 1 ? null : snaps[p - 2] ?? null
          const qy =
            prevEnd === null
              ? query(base(), orderBy('updatedAt', 'desc'), limit(LEADS_PAGE_SIZE))
              : query(base(), orderBy('updatedAt', 'desc'), startAfter(prevEnd), limit(LEADS_PAGE_SIZE))
          const snap = await getDocs(qy)
          if (cancelled) return
          snaps[p - 1] = snap.docs.length ? snap.docs[snap.docs.length - 1]! : null
          if (!snap.docs.length) break
        }
        const afterSnap = pg <= 1 ? null : (snaps[pg - 2] as QueryDocumentSnapshot<DocumentData> | null)
        await fetchOnePage(afterSnap)
      }

      const tp = total != null && total > 0 ? Math.max(1, Math.ceil(total / LEADS_PAGE_SIZE)) : 1
      setTotalPages(tp)
    }

    const rebuildSearchBucket = async () => {
      const base = buildListDataQuery(firestore, profile, hoDQueryLabels, serverFilters)
      const qy = query(base, orderBy('updatedAt', 'desc'), limit(MAX_LEAD_SEARCH_SCAN))
      const snap = await getDocs(qy)
      if (cancelled) return
      let mapped: Lead[] = []
      snap.forEach((d) => {
        const row = mapDoc(d.id, d.data() as Record<string, unknown>)
        if (row) mapped.push(row)
      })
      mapped = applyRoleClientFilter(mapped, profile, hoDQueryLabels)
      setSearchScanTruncated(snap.docs.length >= MAX_LEAD_SEARCH_SCAN)
      if (searchText) {
        mapped = mapped.filter((l) => leadMatchesClientSearch(l, searchText, directoryLabels))
      }
      searchBucketRef.current = mapped
      setSearchHitTotal(mapped.length)
    }

    const sliceSearchPage = (page: number) => {
      const mapped = searchBucketRef.current ?? []
      const tp = Math.max(1, Math.ceil(mapped.length / LEADS_PAGE_SIZE))
      setTotalPages(tp)
      const safePage = Math.min(Math.max(1, page), tp)
      if (safePage !== page) setCurrentPageState(safePage)
      setLeads(mapped.slice((safePage - 1) * LEADS_PAGE_SIZE, safePage * LEADS_PAGE_SIZE))
    }

    const loadSearchBucketAndSlice = async (page: number, mustRebuild: boolean) => {
      if (mustRebuild || searchBucketRef.current === null) {
        await rebuildSearchBucket()
        if (cancelled) return
      }
      sliceSearchPage(page)
    }

    const loadBatch = async () => {
      const base = buildListDataQuery(firestore, profile, hoDQueryLabels, serverFilters)
      const qy = query(base, orderBy('updatedAt', 'desc'), limit(batchLimit))
      const snap = await getDocs(qy)
      if (cancelled) return
      const mapped: Lead[] = []
      snap.forEach((d) => {
        const row = mapDoc(d.id, d.data() as Record<string, unknown>)
        if (row) mapped.push(row)
      })
      mapped.sort((a, b) => b.updatedAt.toMillis() - a.updatedAt.toMillis())
      setLeads(applyRoleClientFilter(mapped, profile, hoDQueryLabels))
      setTotalPages(1)
    }

    const loadFullScope = async () => {
      const baseQy = buildListDataQuery(firestore, profile, hoDQueryLabels, serverFilters)
      let lastSnap: QueryDocumentSnapshot<DocumentData> | null = null
      const acc: Lead[] = []
      let hitCap = false
      while (acc.length < maxFullScopeLeads) {
        let qy: Query
        if (lastSnap === null) {
          qy = query(baseQy, orderBy('updatedAt', 'desc'), limit(fullScopeChunkSize))
        } else {
          qy = query(baseQy, orderBy('updatedAt', 'desc'), startAfter(lastSnap), limit(fullScopeChunkSize))
        }
        const snap: QuerySnapshot<DocumentData> = await getDocs(qy)
        if (cancelled) return
        if (!snap.docs.length) break
        for (const d of snap.docs) {
          const row = mapDoc(d.id, d.data() as Record<string, unknown>)
          if (row) acc.push(row)
        }
        lastSnap = snap.docs[snap.docs.length - 1]!
        if (snap.docs.length < fullScopeChunkSize) break
        if (acc.length >= maxFullScopeLeads) {
          hitCap = true
          break
        }
      }
      if (cancelled) return
      let mapped = applyRoleClientFilter(acc, profile, hoDQueryLabels)
      mapped.sort((a, b) => b.updatedAt.toMillis() - a.updatedAt.toMillis())
      setScopeFetchTruncated(hitCap)
      setSearchScanTruncated(false)
      if (searchText) {
        mapped = mapped.filter((l) => leadMatchesClientSearch(l, searchText, directoryLabels))
        setSearchHitTotal(mapped.length)
      } else {
        setSearchHitTotal(null)
      }
      setLeads(mapped)
      setTotalPages(1)
      if (includeScopeTagCounts) {
        if (!hitCap) setScopeTagCounts(deriveStoredPriorityTagCounts(mapped))
        else if (!cancelled) await fetchTagCountsOnly()
      } else if (!cancelled) {
        setScopeTagCounts(null)
      }
      if (includeScopeSourceOptions && !cancelled) {
        setScopeSourceOptions(collectDistinctSources(mapped))
      }
    }

    void (async () => {
      const showFullSpinner = fkChanged || pageToLoad <= 1
      if (showFullSpinner) setLoading(true)
      else setLoadingPage(true)
      setError(null)
      try {
        if (dataMode === 'batch') {
          await runAggregations()
          if (cancelled) return
          await loadBatch()
          if (cancelled) return
          setLoading(false)
          setLoadingPage(false)
          return
        }

        if (dataMode === 'fullScope') {
          if (fkChanged || totalRef.current == null || manualRefetch) {
            await fetchTotalOnly()
            if (cancelled) return
          }
          await loadFullScope()
          if (cancelled) return
          setLoading(false)
          setLoadingPage(false)
          return
        }

        if (searchText) {
          if (fkChanged || totalRef.current == null) {
            await Promise.all([fetchTotalOnly(), loadSearchBucketAndSlice(pageToLoad, fkChanged)])
            if (cancelled) return
            if (includeScopeTagCounts) void fetchTagCountsOnly()
            if (includeScopeSourceOptions) void fetchSourceCatalog()
          } else {
            await loadSearchBucketAndSlice(pageToLoad, manualRefetch)
            if (manualRefetch && includeScopeTagCounts) void fetchTagCountsOnly()
            if (manualRefetch && includeScopeSourceOptions) void fetchSourceCatalog()
          }
          setLoading(false)
          setLoadingPage(false)
          return
        }

        let total = totalRef.current
        if (fkChanged || total == null || manualRefetch) {
          const tentativePage = fkChanged ? 1 : Math.max(1, pageToLoad)
          await Promise.all([fetchTotalOnly(), loadFirestorePage(tentativePage, null)])
          if (cancelled) return
          total = totalRef.current
          const tp = total != null && total > 0 ? Math.max(1, Math.ceil(total / LEADS_PAGE_SIZE)) : 1
          setTotalPages(tp)
          const safePage = Math.min(Math.max(1, tentativePage), tp)
          if (safePage !== tentativePage) {
            setCurrentPageState(safePage)
            await loadFirestorePage(safePage, total)
          }
          if (includeScopeTagCounts) void fetchTagCountsOnly()
          if (includeScopeSourceOptions) void fetchSourceCatalog()
        } else {
          const tp = total != null && total > 0 ? Math.max(1, Math.ceil(total / LEADS_PAGE_SIZE)) : 1
          setTotalPages(tp)
          const safePage = Math.min(Math.max(1, pageToLoad), tp)
          if (safePage !== pageToLoad) setCurrentPageState(safePage)
          await loadFirestorePage(safePage, total)
        }
        setLoading(false)
        setLoadingPage(false)
      } catch (e) {
        console.error(e)
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Lỗi đọc danh sách hồ sơ')
          setLeads([])
          setScopeFetchTruncated(false)
        }
        setLoading(false)
        setLoadingPage(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [
    configured,
    profile,
    hoDKey,
    serverFiltersKey,
    searchText,
    dataMode,
    batchLimit,
    fullScopeChunkSize,
    maxFullScopeLeads,
    filterKey,
    serverFilters,
    directoryLabels,
    hoDQueryLabels,
    pagedFirestoreDep,
    includeScopeTagCounts,
    includeScopeSourceOptions,
    manualRefreshKey,
  ])

  const refreshTotalLeadCount = useCallback(async () => {
    const firestore = getFirestoreDb()
    if (!firestore || !profile) return
    try {
      const cq = buildListDataQuery(firestore, profile, hoDQueryLabels, serverFilters)
      const agg = await getCountFromServer(cq)
      setTotalLeadCount(agg.data().count)
      setTotalLeadCountError(null)
      totalRef.current = agg.data().count
    } catch (e) {
      console.error(e)
      setTotalLeadCount(null)
      setTotalLeadCountError(e instanceof Error ? e.message : 'Không đếm được tổng hồ sơ')
    }
  }, [profile, hoDQueryLabels, serverFilters])

  const applyLocalLeadPatch = useCallback((id: string, patch: Partial<Lead>) => {
    setLeads((rows) => {
      const idx = rows.findIndex((r) => r.id === id)
      if (idx === -1) return rows
      const next = [...rows]
      next[idx] = { ...next[idx]!, ...patch }
      return next
    })
    const bucket = searchBucketRef.current
    if (bucket?.length) {
      const idx = bucket.findIndex((r) => r.id === id)
      if (idx !== -1) {
        searchBucketRef.current = bucket.map((r, i) => (i === idx ? { ...r, ...patch } : r))
      }
    }
  }, [])

  return {
    leads,
    rawLeads: leads,
    totalLeadCount,
    totalLeadCountError,
    refreshTotalLeadCount,
    refetchLeads,
    scopeTagCounts,
    scopeSourceOptions,
    searchScanTruncated,
    searchHitTotal,
    scopeFetchTruncated,
    applyLocalLeadPatch,
    currentPage,
    totalPages,
    setPage,
    loading,
    loadingPage,
    error,
    configured,
  }
}
