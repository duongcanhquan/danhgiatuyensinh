import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  and,
  collection,
  documentId,
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
import { asFirestoreTimestamp } from '../utils/firestoreTimestamp'
import { parseLeadWorkMode } from '../utils/leadWorkMode'
import { parseLeadIntakeOrigin } from '../utils/leadIntakeOrigin'
import type {
  Lead,
  LeadCounselorStatus,
  LeadFinanceRecord,
  LeadIntakeOrigin,
  LeadPaymentApprovalStatus,
  LeadPaymentLine,
  LeadPaymentSlotKey,
  LeadPipelineStatus,
  PriorityTag,
  VietMyUserProfile,
} from '../types'
import { FS_COLLECTIONS } from '../types'
import { isAdminLikeRole, isFieldStaffRole, isSuperAdminRole, isTeamLeadRole } from '../auth/roleUtils'
import { getFirestoreDb, isFirebaseConfigured } from '../services/firebase'
import { useAuth } from './useAuth'
import { useOrg } from './useOrg'
import { useMasterData } from './useMasterData'
import {
  orgIdEqualityConstraint,
  leadBelongsToOrg,
  shouldUseLegacyMissingOrgIdRead,
} from '../tenancy/orgQuery'
import {
  coerceLeadCounselorStatus,
  counselorStatusToPipeline,
  pipelineToCounselorStatus,
} from '../utils/leadIdentity'
import { parseScoringSignalsFromFirestore } from '../utils/leadScoringSignals'
import { resolveLeadPrimarySource } from '../utils/leadSemanticFieldValue'
import { pickFirstFirestoreString, readLeadSemanticFieldsFromFirestore } from '../utils/leadFirestoreFieldRead'
import { firestoreReadErrorMessage } from '../utils/firestoreReadError'

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
    fullNeAt: String(o.fullNeAt ?? '').trim() || undefined,
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
export const LEADS_UI_FULL_SCOPE_MAX = 1500

/**
 * Chỉ dùng khi lọc «Chưa gắn chương trình» (thiếu field — không query server được).
 * Trần quét vừa đủ tìm hồ sơ cũ, tránh treo UI với hàng trăm nghìn getDocs.
 */
export const LEADS_UI_PROGRAM_SCAN_MAX = 3_000

/** Cap riêng cho Dashboard TVV — chỉ khi lọc client bắt buộc (follow-up / HOT SLA / chưa gán). */
export const DASHBOARD_FULL_SCOPE_MAX = 1000

/** Giới hạn đọc fullScope trên màn Phân tích nâng cao (thay vì 25k). */
export const ANALYTICS_FULL_SCOPE_MAX = 2500

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
    const semantic = readLeadSemanticFieldsFromFirestore(data)
    const legacyAssigned =
      data.assignedCounselorId === null || data.assignedCounselorId === undefined
        ? null
        : String(data.assignedCounselorId)
    const assignedToRaw = data.assignedTo
    const assignedTo =
      assignedToRaw === null || assignedToRaw === undefined || assignedToRaw === ''
        ? legacyAssigned
        : String(assignedToRaw)

    const province = semantic.province
    const majorInterest = semantic.majorInterest
    const academicPerformance = semantic.academicPerformance
    const graduationScore = semantic.graduationScore
    const studyIntention = semantic.studyIntention
    const financialStatus = semantic.financialStatus || undefined
    const hanoiArea = semantic.hanoiArea || undefined
    const schoolType = semantic.schoolType
    const educationLevelRaw = semantic.educationLevelRaw
    const educationLevel =
      educationLevelRaw ||
      studyIntention ||
      (!majorInterest && !academicPerformance
        ? pickFirstFirestoreString(data, ['majorInterest', 'major'])
        : '')
    const highSchool = semantic.highSchool
    const customerId = String(data.customerId ?? '')
    const systemCode = String(data.systemCode ?? '').trim() || undefined
    const fullName = String(data.fullName ?? '')
    const phone = String(data.phone ?? '')
    const parentPhone = String(data.parentPhone ?? '')
    const source2Raw = semantic.source2Raw
    const sourcePrimary = semantic.sourcePrimary
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
    const addressRaw = semantic.addressRaw
    const permanentAddressRaw = semantic.permanentAddressRaw
    const address = semantic.address
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
    const nextFollowUpDate = asFirestoreTimestamp(data.nextFollowUpDate) ?? null

    const uniqueHash = String(data.uniqueHash ?? '')
    const now = Timestamp.now()
    // Legacy import / REST đôi khi ghi string hoặc {seconds} — không cast thô (sẽ crash Dashboard .toDate()).
    const createdAt =
      asFirestoreTimestamp(data.createdAt) ?? asFirestoreTimestamp(data.importedAt) ?? now
    const updatedAt = asFirestoreTimestamp(data.updatedAt) ?? createdAt
    const importedAt = asFirestoreTimestamp(data.importedAt)
    const uploadedAt = asFirestoreTimestamp(data.uploadedAt) ?? importedAt ?? createdAt

    return {
      id,
      orgId: data.orgId != null && String(data.orgId).trim() ? String(data.orgId).trim() : undefined,
      customerId,
      ...(systemCode ? { systemCode } : {}),
      fullName,
      phone,
      parentPhone,
      source: sourcePrimary,
      educationLevel,
      majorInterest: majorInterest || undefined,
      academicPerformance: academicPerformance || undefined,
      ...(graduationScore ? { graduationScore } : {}),
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
      ...(String(data.placeOfBirth ?? '').trim()
        ? { placeOfBirth: String(data.placeOfBirth).trim().slice(0, 120) }
        : {}),
      ...(String(data.applicantCategory ?? '').trim()
        ? { applicantCategory: String(data.applicantCategory).trim().slice(0, 120) }
        : {}),
      ...(String(data.gender ?? '').trim()
        ? { gender: String(data.gender).trim().slice(0, 32) }
        : {}),
      ...(data.nationalIdNotAvailable === true
        ? { nationalIdNotAvailable: true }
        : (() => {
            const raw = String(data.nationalId ?? '').trim().toUpperCase()
            if (!raw || raw === 'CHƯA CÓ') return {}
            if (/^\d+$/.test(raw)) return { nationalId: raw.slice(0, 12) }
            const passport = raw.replace(/[^A-Z0-9]/g, '').slice(0, 15)
            return passport ? { nationalId: passport } : {}
          })()),
      ...(String(data.nationalIdHash ?? '').trim()
        ? { nationalIdHash: String(data.nationalIdHash).trim() }
        : {}),
      ...(String(data.studentEmail ?? '').trim() ? { studentEmail: String(data.studentEmail).trim() } : {}),
      ...(sourcePrimary ? { source1: sourcePrimary } : {}),
      ...(source2Raw ? { source2: source2Raw } : {}),
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
      intakeOrigin: parseLeadIntakeOrigin(data.intakeOrigin),
      ...(String(data.registrationChannel ?? '').trim()
        ? { registrationChannel: String(data.registrationChannel).trim().slice(0, 64) }
        : {}),
      ...(String(data.intakeProgram ?? '').trim()
        ? { intakeProgram: String(data.intakeProgram).trim().slice(0, 120) }
        : {}),
      importedAt,
      lastTouchedAt: asFirestoreTimestamp(data.lastTouchedAt),
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
      aiProcessedAt: asFirestoreTimestamp(data.aiProcessedAt),
      lastCallAiSummary:
        data.lastCallAiSummary !== undefined && data.lastCallAiSummary !== null
          ? String(data.lastCallAiSummary).slice(0, 500)
          : undefined,
      lastCallAiReadiness:
        data.lastCallAiReadiness !== undefined && data.lastCallAiReadiness !== null
          ? String(data.lastCallAiReadiness).slice(0, 64)
          : undefined,
      lastCallAiAt: asFirestoreTimestamp(data.lastCallAiAt),
      lastCallAt: asFirestoreTimestamp(data.lastCallAt),
      lastCounselorNote:
        data.lastCounselorNote !== undefined && data.lastCounselorNote !== null
          ? String(data.lastCounselorNote).slice(0, 500)
          : undefined,
      lastInteractionAt: asFirestoreTimestamp(data.lastInteractionAt),
      lastInteractionKind: (() => {
        const k = data.lastInteractionKind
        return k === 'call' || k === 'note' || k === 'profile' || k === 'system' ? k : undefined
      })(),
      lastInteractionSummary:
        data.lastInteractionSummary !== undefined && data.lastInteractionSummary !== null
          ? String(data.lastInteractionSummary).slice(0, 500)
          : undefined,
      lastCalledByLabel:
        data.lastCalledByLabel !== undefined && data.lastCalledByLabel !== null
          ? String(data.lastCalledByLabel).slice(0, 120)
          : undefined,
      lastCallOutcome: (() => {
        const o = data.lastCallOutcome
        const ok = ['NO_ANSWER', 'CONNECTED', 'FOLLOW_UP', 'DISQUALIFIED', 'APPOINTMENT_SET', 'OTHER'] as const
        return typeof o === 'string' && (ok as readonly string[]).includes(o)
          ? (o as Lead['lastCallOutcome'])
          : undefined
      })(),
      callWorkBucket: (() => {
        const b = data.callWorkBucket
        return b === 'uncalled' || b === 'callback' || b === 'called' ? b : undefined
      })(),
      workMode: parseLeadWorkMode(data.workMode),
      callAttemptCount:
        data.callAttemptCount !== undefined && data.callAttemptCount !== null
          ? Math.max(0, Math.floor(Number(data.callAttemptCount)))
          : undefined,
      lastCallDispositionId:
        data.lastCallDispositionId !== undefined && data.lastCallDispositionId !== null
          ? String(data.lastCallDispositionId).slice(0, 64)
          : undefined,
      lastCallDispositionLabel:
        data.lastCallDispositionLabel !== undefined && data.lastCallDispositionLabel !== null
          ? String(data.lastCallDispositionLabel).slice(0, 120)
          : undefined,
      callEvalPriorityBoost:
        data.callEvalPriorityBoost !== undefined && data.callEvalPriorityBoost !== null
          ? normPriorityTag(data.callEvalPriorityBoost)
          : undefined,
      callEvalPriorityBoostAt: asFirestoreTimestamp(data.callEvalPriorityBoostAt),
      lastCallBehaviorScore:
        data.lastCallBehaviorScore !== undefined && data.lastCallBehaviorScore !== null
          ? Math.max(0, Math.min(100, Math.round(Number(data.lastCallBehaviorScore))))
          : undefined,
      lastCallEnrollmentSignalId:
        data.lastCallEnrollmentSignalId !== undefined && data.lastCallEnrollmentSignalId !== null
          ? String(data.lastCallEnrollmentSignalId).slice(0, 64)
          : undefined,
      lastCallReadinessId:
        data.lastCallReadinessId !== undefined && data.lastCallReadinessId !== null
          ? String(data.lastCallReadinessId).slice(0, 64)
          : undefined,
      leadScoreProfilePart:
        data.leadScoreProfilePart !== undefined && data.leadScoreProfilePart !== null
          ? Math.max(0, Math.min(100, Math.round(Number(data.leadScoreProfilePart))))
          : undefined,
      leadScoreEngagementPart:
        data.leadScoreEngagementPart !== undefined && data.leadScoreEngagementPart !== null
          ? Math.max(0, Math.min(100, Math.round(Number(data.leadScoreEngagementPart))))
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
  /** Chương trình / đợt nhập — khớp exact `intakeProgram`. */
  intakeProgram?: string
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
  /** Nguồn nhập đã ghi trên doc (`intakeOrigin`). */
  intakeOrigin?: LeadIntakeOrigin
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
    const src = resolveLeadPrimarySource(l)
    if (src) s.add(src)
  }
  return [...s].sort((a, b) => a.localeCompare(b, 'vi'))
}

function collectDistinctIntakePrograms(rows: Lead[]): string[] {
  const byLower = new Map<string, string>()
  for (const l of rows) {
    const p = (l.intakeProgram ?? '').trim()
    if (!p) continue
    const k = p.toLowerCase()
    if (!byLower.has(k)) byLower.set(k, p)
  }
  return [...byLower.values()].sort((a, b) => a.localeCompare(b, 'vi'))
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
   * fullScope: sắp theo `updatedAt` (mặc định) hoặc `docId` (quét đều, không bỏ lỡ hồ sơ cũ).
   */
  fullScopeOrderMode?: 'updatedAt' | 'docId'
  /**
   * fullScope: trần số document quét khi có `fullScopeKeepMatch` (mặc định = maxFullScopeLeads).
   */
  maxFullScopeScanDocs?: number
  /**
   * fullScope: chỉ giữ hồ sơ khớp (vd. chưa gắn chương trình). Cần kèm `fullScopeMatchKey` ổn định.
   */
  fullScopeKeepMatch?: (lead: Lead) => boolean
  /** Khóa ổn định cho `fullScopeKeepMatch` (đưa vào filterKey). */
  fullScopeMatchKey?: string
  /**
   * Khi true: gọi thêm getCount theo từng nhãn `priorityTag` (4 lần) — tốn chi phí aggregation.
   * Chỉ bật nơi thật sự dùng `scopeTagCounts` (vd. Phân tích nâng cao). Mặc định false.
   */
  includeScopeTagCounts?: boolean
  /**
   * Quét tối đa {@link SOURCE_CATALOG_BATCH} hồ sơ (cùng RBAC, bỏ lọc `source`) để gợi ý giá trị Nguồn.
   */
  includeScopeSourceOptions?: boolean
  /**
   * Quét tối đa {@link SOURCE_CATALOG_BATCH} hồ sơ (cùng RBAC, bỏ lọc `intakeProgram`) để gợi ý chương trình / đợt.
   */
  includeScopeProgramOptions?: boolean
  /**
   * Khi false: không gọi Firestore (vd. admin Tổng kết chỉ dùng aggregates).
   * Mặc định true.
   */
  enabled?: boolean
}

function rbacConstraint(
  profile: VietMyUserProfile,
  hoDLabels: string[],
  canReadGlobal: boolean,
): QueryFilterConstraint | null {
  if (isSuperAdminRole(profile.role)) return null
  if (isAdminLikeRole(profile.role)) {
    if (canReadGlobal) return null
    return or(where('assignedTo', '==', profile.id), where('assignedCounselorId', '==', profile.id))
  }

  if (isFieldStaffRole(profile.role)) {
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

function filterConstraints(
  f: LeadListServerFilters | undefined,
  profile: VietMyUserProfile,
  canReadGlobal: boolean,
): QueryFilterConstraint[] {
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
  if (f.intakeProgram?.trim()) c.push(where('intakeProgram', '==', f.intakeProgram.trim()))
  if (f.highSchoolIn?.length) {
    const h = f.highSchoolIn.map((x) => x.trim()).filter(Boolean).slice(0, 10)
    if (h.length === 1) c.push(where('highSchool', '==', h[0]))
    else if (h.length > 1) c.push(where('highSchool', 'in', h))
  }
  if (f.scoreMin != null && Number.isFinite(f.scoreMin)) c.push(where('calculatedScore', '>=', f.scoreMin))
  if (f.scoreMax != null && Number.isFinite(f.scoreMax)) c.push(where('calculatedScore', '<=', f.scoreMax))
  if (f.aiShortlistedOnly) c.push(where('isAiShortlisted', '==', true))
  if (f.intakeOrigin) c.push(where('intakeOrigin', '==', f.intakeOrigin))
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
  if (f.assignedCounselorIn?.length) {
    const canFilterByAssignee = isSuperAdminRole(profile.role) || canReadGlobal
    if (canFilterByAssignee) {
      const ids = f.assignedCounselorIn.filter(Boolean).slice(0, 10)
      if (ids.length === 1) {
        c.push(or(where('assignedTo', '==', ids[0]), where('assignedCounselorId', '==', ids[0])))
      } else if (ids.length > 1) {
        c.push(or(where('assignedTo', 'in', ids), where('assignedCounselorId', 'in', ids)))
      }
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

/**
 * Superadmin / Quản lý trường xem VietMy: bỏ where(orgId) để lấy cả hồ sơ cũ thiếu orgId.
 * (Rules `matchesOrgData` cho phép đọc doc thiếu orgId khi resolvedOrgId == vietmy;
 *  query `orgId==vietmy` thì không trả các doc đó — trông như «mất dữ liệu».)
 * Mọi trường hợp khác: luôn where(orgId==) — nếu bỏ lọc, multi-tenant Rules từ chối cả query.
 */
function shouldOmitOrgServerFilter(
  profile: VietMyUserProfile,
  orgId: string | undefined,
  orgFilter: 'auto' | 'strict',
): boolean {
  if (orgFilter === 'strict') return false
  if (!orgId || !shouldUseLegacyMissingOrgIdRead(orgId)) return false
  return isSuperAdminRole(profile.role) || isAdminLikeRole(profile.role)
}

function buildListDataQuery(
  firestore: Firestore,
  profile: VietMyUserProfile,
  hoDLabels: string[],
  filters: LeadListServerFilters | undefined,
  orgId: string | undefined,
  canReadGlobal: boolean,
  orgFilter: 'auto' | 'strict' = 'auto',
): Query {
  const col = collection(firestore, FS_COLLECTIONS.leads)
  const rbac = rbacConstraint(profile, hoDLabels, canReadGlobal)
  const extras = filterConstraints(filters, profile, canReadGlobal)
  const parts: QueryFilterConstraint[] = []
  if (orgId && !shouldOmitOrgServerFilter(profile, orgId, orgFilter)) {
    parts.push(orgIdEqualityConstraint(orgId))
  }
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
  orgId: string | undefined,
  canReadGlobal: boolean,
): Query {
  const col = collection(firestore, FS_COLLECTIONS.leads)
  const rbac = rbacConstraint(profile, hoDLabels, canReadGlobal)
  const extras = [...filterConstraints(filters, profile, canReadGlobal), where('priorityTag', '==', tag)]
  const parts: QueryFilterConstraint[] = []
  // Count luôn strict — tránh đếm lẫn trường khác khi Superadmin bỏ lọc list
  if (orgId) parts.push(orgIdEqualityConstraint(orgId))
  if (rbac) parts.push(rbac)
  parts.push(...extras)
  return composeQuery(col, parts)
}

function isFsPermissionDenied(e: unknown): boolean {
  if (!e || typeof e !== 'object') return false
  const code = 'code' in e ? String((e as { code: unknown }).code) : ''
  return code === 'permission-denied' || code === 'permissions-denied'
}

/** List query: Superadmin+VietMy thử đọc không lọc org (legacy); luôn có đường orgId== dự phòng. */
async function getDocsListWithOrgFallback(
  firestore: Firestore,
  profile: VietMyUserProfile,
  hoDLabels: string[],
  filters: LeadListServerFilters | undefined,
  orgId: string | undefined,
  canReadGlobal: boolean,
  withConstraints: (base: Query) => Query,
): Promise<QuerySnapshot<DocumentData>> {
  const allowLegacy = shouldOmitOrgServerFilter(profile, orgId, 'auto')
  const scopedQ = withConstraints(
    buildListDataQuery(firestore, profile, hoDLabels, filters, orgId, canReadGlobal, 'strict'),
  )

  if (!allowLegacy) {
    try {
      return await getDocs(scopedQ)
    } catch (e) {
      if (!isFsPermissionDenied(e)) throw e
      throw e instanceof Error ? e : new Error('Không đọc được danh sách hồ sơ.')
    }
  }

  // Ưu tiên query có orgId; chỉ đọc legacy không scope khi chunk scoped thật sự rỗng.
  let scopedSnap: QuerySnapshot<DocumentData>
  try {
    scopedSnap = await getDocs(scopedQ)
  } catch (e) {
    if (!isFsPermissionDenied(e)) throw e
    throw e instanceof Error ? e : new Error('Không đọc được danh sách hồ sơ.')
  }
  if (scopedSnap.docs.length > 0) return scopedSnap

  const legacyQ = withConstraints(
    buildListDataQuery(firestore, profile, hoDLabels, filters, orgId, canReadGlobal, 'auto'),
  )
  try {
    return await getDocs(legacyQ)
  } catch (e) {
    console.warn('[useLeads] legacy VietMy unscoped failed — dùng kết quả orgId== rỗng', orgId, e)
    return scopedSnap
  }
}

function applyRoleClientFilter(
  rows: Lead[],
  profile: VietMyUserProfile,
  hoDQueryLabels: string[],
  canReadGlobal: boolean,
  orgId?: string,
): Lead[] {
  const scoped = orgId ? rows.filter((l) => leadBelongsToOrg(l, orgId)) : rows
  const labelSet = new Set(hoDQueryLabels.map((x) => x.trim().toLowerCase()))
  if (isTeamLeadRole(profile.role)) {
    const team = new Set(profile.managedCounselorIds ?? [])
    if (team.size) {
      return scoped.filter((l) => {
        const u = l.assignedTo ?? l.assignedCounselorId
        return Boolean(u && team.has(u))
      })
    }
    if (labelSet.size) {
      return scoped.filter((l) => labelSet.has(l.educationLevel.trim().toLowerCase()))
    }
    return []
  }
  if (isFieldStaffRole(profile.role) && profile.id) {
    return scoped.filter((l) => {
      const u = l.assignedTo ?? l.assignedCounselorId
      return u === profile.id
    })
  }
  // Admin không còn module hồ sơ toàn trường → chỉ hồ sơ gán cho mình
  if (isAdminLikeRole(profile.role) && !isSuperAdminRole(profile.role) && !canReadGlobal && profile.id) {
    return scoped.filter((l) => {
      const u = l.assignedTo ?? l.assignedCounselorId
      return u === profile.id
    })
  }
  return scoped
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

/** Bỏ lọc điểm/nhãn đã lưu — dùng trước khi tính lại điểm hàng loạt. */
export function serverFiltersForBulkRescore(
  f: LeadListServerFilters | undefined,
): LeadListServerFilters | undefined {
  if (!f) return undefined
  const slim = Object.fromEntries(
    Object.entries(f).filter(([key, val]) => {
      if (key === 'priorityTag' || key === 'priorityTagsIn' || key === 'scoreMin' || key === 'scoreMax') {
        return false
      }
      return val !== undefined
    }),
  ) as LeadListServerFilters
  return Object.keys(slim).length ? slim : undefined
}

/**
 * Đọc toàn bộ hồ sơ trong phạm vi RBAC + bộ lọc (theo lô) để tính lại điểm hàng loạt.
 */
export async function fetchLeadsInScopeForRescore(
  firestore: Firestore,
  profile: VietMyUserProfile,
  hoDQueryLabels: string[],
  filters: LeadListServerFilters | undefined,
  opts?: { maxLeads?: number; chunkSize?: number; orgId?: string; canReadGlobal?: boolean },
): Promise<{ leads: Lead[]; truncated: boolean }> {
  const maxLeads = Math.min(100_000, Math.max(LEADS_PAGE_SIZE, opts?.maxLeads ?? LEADS_UI_FULL_SCOPE_MAX))
  const chunkSize = Math.min(500, Math.max(50, opts?.chunkSize ?? FULL_SCOPE_CHUNK_SIZE))
  const canReadGlobal = Boolean(opts?.canReadGlobal)
  let lastSnap: QueryDocumentSnapshot<DocumentData> | null = null
  const acc: Lead[] = []
  let hitCap = false

  while (acc.length < maxLeads) {
    const snap: QuerySnapshot<DocumentData> = await getDocsListWithOrgFallback(
      firestore,
      profile,
      hoDQueryLabels,
      filters,
      opts?.orgId,
      canReadGlobal,
      (base) =>
        lastSnap === null
          ? query(base, orderBy('updatedAt', 'desc'), limit(chunkSize))
          : query(base, orderBy('updatedAt', 'desc'), startAfter(lastSnap), limit(chunkSize)),
    )
    if (!snap.docs.length) break
    for (const d of snap.docs) {
      const row = mapDoc(d.id, d.data() as Record<string, unknown>)
      if (row) acc.push(row)
    }
    lastSnap = snap.docs[snap.docs.length - 1]!
    if (snap.docs.length < chunkSize) break
    if (acc.length >= maxLeads) {
      hitCap = true
      break
    }
  }

  const leads = applyRoleClientFilter(acc, profile, hoDQueryLabels, canReadGlobal, opts?.orgId)
  leads.sort((a, b) => b.updatedAt.toMillis() - a.updatedAt.toMillis())
  return { leads, truncated: hitCap }
}

/**
 * Quét phạm vi theo con trỏ, chỉ giữ id khớp `match` — dùng xóa cả lô (không kẹt cap UI 1500).
 * `orderByDocId`: duyệt theo id (không bỏ lỡ lô cũ như orderBy updatedAt).
 */
export async function collectMatchingLeadIdsInScope(
  firestore: Firestore,
  profile: VietMyUserProfile,
  hoDQueryLabels: string[],
  filters: LeadListServerFilters | undefined,
  match: (lead: Lead) => boolean,
  opts?: {
    maxMatchIds?: number
    maxScanDocs?: number
    chunkSize?: number
    orgId?: string
    canReadGlobal?: boolean
    /** `docId` = quét hết collection theo id (khuyến nghị khi xóa theo chương trình). */
    orderMode?: 'updatedAt' | 'docId'
    onProgress?: (scanned: number, matched: number) => void
  },
): Promise<{ ids: string[]; scanTruncated: boolean; matchTruncated: boolean; scanned: number }> {
  const maxMatchIds = Math.min(100_000, Math.max(1, opts?.maxMatchIds ?? 100_000))
  // Trần quét cao — xóa cả lô cần duyệt sâu, không cắt ở 200k.
  const maxScanDocs = Math.min(1_000_000, Math.max(maxMatchIds, opts?.maxScanDocs ?? 100_000))
  const chunkSize = Math.min(500, Math.max(50, opts?.chunkSize ?? FULL_SCOPE_CHUNK_SIZE))
  const canReadGlobal = Boolean(opts?.canReadGlobal)
  const byDocId = opts?.orderMode === 'docId'
  let lastSnap: QueryDocumentSnapshot<DocumentData> | null = null
  const ids: string[] = []
  let scanned = 0
  let scanTruncated = false
  let matchTruncated = false

  while (scanned < maxScanDocs && ids.length < maxMatchIds) {
    const snap: QuerySnapshot<DocumentData> = await getDocsListWithOrgFallback(
      firestore,
      profile,
      hoDQueryLabels,
      filters,
      opts?.orgId,
      canReadGlobal,
      (base) => {
        if (byDocId) {
          return lastSnap === null
            ? query(base, orderBy(documentId()), limit(chunkSize))
            : query(base, orderBy(documentId()), startAfter(lastSnap), limit(chunkSize))
        }
        return lastSnap === null
          ? query(base, orderBy('updatedAt', 'desc'), limit(chunkSize))
          : query(base, orderBy('updatedAt', 'desc'), startAfter(lastSnap), limit(chunkSize))
      },
    )
    if (!snap.docs.length) break
    const mapped: Lead[] = []
    for (const d of snap.docs) {
      const row = mapDoc(d.id, d.data() as Record<string, unknown>)
      if (row) mapped.push(row)
    }
    const filtered = applyRoleClientFilter(mapped, profile, hoDQueryLabels, canReadGlobal, opts?.orgId)
    scanned += snap.docs.length
    for (const lead of filtered) {
      if (!match(lead)) continue
      ids.push(lead.id)
      if (ids.length >= maxMatchIds) {
        matchTruncated = true
        break
      }
    }
    opts?.onProgress?.(scanned, ids.length)
    lastSnap = snap.docs[snap.docs.length - 1]!
    if (snap.docs.length < chunkSize) break
    if (scanned >= maxScanDocs) {
      scanTruncated = true
      break
    }
    if (matchTruncated) break
  }

  return { ids, scanTruncated, matchTruncated, scanned }
}

const EMPTY_HOD_LABELS: string[] = []

export function useLeads(opts?: UseLeadsOptions) {
  const { profile, can } = useAuth()
  const canReadGlobal = Boolean(
    profile &&
      (can('leads:read:global') ||
        profile.role === 'super_admin' ||
        // Vai trò Quản lý trường luôn xem hồ sơ toàn trường (kể cả khi capability doc cũ thiếu module).
        profile.role === 'admin'),
  )
  const { effectiveOrgId } = useOrg()
  const { byKind } = useMasterData()
  const serverFilters = opts?.serverFilters
  const searchText = (opts?.searchText ?? '').trim().toLowerCase()
  const directoryLabels = opts?.directoryLabels
  const dataMode = opts?.dataMode ?? 'paged'
  const batchLimit = Math.min(500, Math.max(LEADS_PAGE_SIZE, opts?.batchLimit ?? 120))
  const fullScopeChunkSize = Math.min(500, Math.max(50, opts?.fullScopeChunkSize ?? FULL_SCOPE_CHUNK_SIZE))
  const maxFullScopeLeads = Math.min(100_000, Math.max(LEADS_PAGE_SIZE, opts?.maxFullScopeLeads ?? MAX_FULL_SCOPE_LEADS))
  const fullScopeOrderMode = opts?.fullScopeOrderMode === 'docId' ? 'docId' : 'updatedAt'
  const maxFullScopeScanDocs = Math.min(
    1_000_000,
    Math.max(maxFullScopeLeads, opts?.maxFullScopeScanDocs ?? maxFullScopeLeads),
  )
  const fullScopeMatchKey = opts?.fullScopeMatchKey ?? ''
  const fullScopeKeepMatchRef = useRef(opts?.fullScopeKeepMatch)
  useEffect(() => {
    fullScopeKeepMatchRef.current = opts?.fullScopeKeepMatch
  }, [opts?.fullScopeKeepMatch])
  const includeScopeTagCounts = Boolean(opts?.includeScopeTagCounts)
  const includeScopeSourceOptions = Boolean(opts?.includeScopeSourceOptions)
  const includeScopeProgramOptions = Boolean(opts?.includeScopeProgramOptions)
  const fetchEnabled = opts?.enabled !== false

  const hoDQueryLabels = useMemo(() => {
    const ids = profile?.managedMajorIds ?? []
    if (!ids.length) return EMPTY_HOD_LABELS
    const idSet = new Set(ids)
    const majors = byKind.majors ?? []
    return majors.filter((m) => idSet.has(m.id)).map((m) => m.label.trim()).filter(Boolean)
  }, [profile?.managedMajorIds, byKind.majors])

  /** Chỉ đổi khi quyền đọc list thực sự đổi — tránh refetch vì snapshot users/{uid} đổi identity. */
  const profileListKey = profile
    ? `${profile.id}|${profile.role}|${(profile.managedMajorIds ?? []).join(',')}|${(profile.managedCounselorIds ?? []).join(',')}`
    : ''

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
    // directoryLabels chỉ ảnh hưởng tìm kiếm — không refetch list khi directory vừa tải xong.
    const dirKey = searchText ? directoryLabelsKey : ''
    const b = `${serverFiltersKey}|${searchText}|${dataMode}|${batchLimit}|${hoDKey}|${dirKey}|g:${canReadGlobal ? 1 : 0}|org:${effectiveOrgId}|p:${profileListKey}`
    if (dataMode === 'fullScope') {
      return `${b}|fsc:${fullScopeChunkSize}|cap:${maxFullScopeLeads}|om:${fullScopeOrderMode}|scan:${maxFullScopeScanDocs}|mk:${fullScopeMatchKey}`
    }
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
    fullScopeOrderMode,
    maxFullScopeScanDocs,
    fullScopeMatchKey,
    canReadGlobal,
    effectiveOrgId,
    profileListKey,
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
  const [scopeProgramOptions, setScopeProgramOptions] = useState<string[]>([])
  const [searchScanTruncated, setSearchScanTruncated] = useState(false)
  const [searchHitTotal, setSearchHitTotal] = useState<number | null>(null)
  const [scopeFetchTruncated, setScopeFetchTruncated] = useState(false)
  /** Tăng khi gọi `refetchLeads` — ép chạy lại tải danh sách cùng bộ lọc (sau bulk, v.v.). */
  const [manualRefreshKey, setManualRefreshKey] = useState(0)
  const pendingManualRefetchRef = useRef(false)
  const fetchGenRef = useRef(0)

  const refetchLeads = useCallback(() => {
    pendingManualRefetchRef.current = true
    setManualRefreshKey((k) => k + 1)
  }, [])

  const fetchScopeSourceOptions = useCallback(async () => {
    const firestore = getFirestoreDb()
    if (!firestore || !profile) return
    try {
      const distFilters = serverFiltersOmitField(serverFilters, 'source')
      const snap = await getDocsListWithOrgFallback(
        firestore,
        profile,
        hoDQueryLabels,
        distFilters,
        effectiveOrgId,
        canReadGlobal,
        (base) => query(base, orderBy('updatedAt', 'desc'), limit(SOURCE_CATALOG_BATCH)),
      )
      const rows: Lead[] = []
      snap.forEach((d) => {
        const row = mapDoc(d.id, d.data() as Record<string, unknown>)
        if (row) rows.push(row)
      })
      const filtered = applyRoleClientFilter(rows, profile, hoDQueryLabels, canReadGlobal, effectiveOrgId)
      setScopeSourceOptions(collectDistinctSources(filtered))
    } catch (e) {
      console.error(e)
      setScopeSourceOptions([])
    }
  }, [profile, hoDQueryLabels, serverFilters, effectiveOrgId, canReadGlobal])

  const fetchScopeProgramOptions = useCallback(async () => {
    const firestore = getFirestoreDb()
    if (!firestore || !profile) return
    try {
      const distFilters = serverFiltersOmitField(serverFilters, 'intakeProgram')
      const snap = await getDocsListWithOrgFallback(
        firestore,
        profile,
        hoDQueryLabels,
        distFilters,
        effectiveOrgId,
        canReadGlobal,
        (base) => query(base, orderBy('updatedAt', 'desc'), limit(SOURCE_CATALOG_BATCH)),
      )
      const rows: Lead[] = []
      snap.forEach((d) => {
        const row = mapDoc(d.id, d.data() as Record<string, unknown>)
        if (row) rows.push(row)
      })
      const filtered = applyRoleClientFilter(rows, profile, hoDQueryLabels, canReadGlobal, effectiveOrgId)
      setScopeProgramOptions(collectDistinctIntakePrograms(filtered))
    } catch (e) {
      console.error(e)
      setScopeProgramOptions([])
    }
  }, [profile, hoDQueryLabels, serverFilters, effectiveOrgId, canReadGlobal])

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

    if (!fetchEnabled) {
      queueMicrotask(() => {
        setLoading(false)
        setLoadingPage(false)
        setLeads([])
        setError(null)
        setTotalLeadCount(null)
        setTotalLeadCountError(null)
        setScopeTagCounts(null)
        setScopeSourceOptions([])
        setScopeProgramOptions([])
        setSearchHitTotal(null)
        setScopeFetchTruncated(false)
        setTotalPages(1)
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
    const gen = ++fetchGenRef.current
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
        const strictBase = buildListDataQuery(
          firestore,
          profile,
          hoDQueryLabels,
          serverFilters,
          effectiveOrgId,
          canReadGlobal,
          'strict',
        )
        let total = (await getCountFromServer(strictBase)).data().count
        // VietMy + hồ sơ cũ thiếu orgId: đếm scoped = 0 dù data còn — thử đếm không lọc org.
        if (
          total === 0 &&
          shouldOmitOrgServerFilter(profile, effectiveOrgId, 'auto')
        ) {
          try {
            const legacyBase = buildListDataQuery(
              firestore,
              profile,
              hoDQueryLabels,
              serverFilters,
              effectiveOrgId,
              canReadGlobal,
              'auto',
            )
            total = (await getCountFromServer(legacyBase)).data().count
          } catch (legacyErr) {
            console.warn('[useLeads] legacy count failed', legacyErr)
          }
        }
        if (cancelled) return null
        setTotalLeadCount(total)
        setTotalLeadCountError(null)
        totalRef.current = total
        return total
      } catch (e) {
        console.error(e)
        if (!cancelled) {
          setTotalLeadCount(null)
          setTotalLeadCountError(firestoreReadErrorMessage(e, 'Không đếm được tổng hồ sơ'))
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
            const qTag = buildPriorityTagCountQuery(firestore, profile, hoDQueryLabels, distFilters, t, effectiveOrgId, canReadGlobal)
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
        const snap = await getDocsListWithOrgFallback(
          firestore,
          profile,
          hoDQueryLabels,
          distFilters,
          effectiveOrgId,
          canReadGlobal,
          (base) => query(base, orderBy('updatedAt', 'desc'), limit(SOURCE_CATALOG_BATCH)),
        )
        if (cancelled) return
        const rows: Lead[] = []
        snap.forEach((d) => {
          const row = mapDoc(d.id, d.data() as Record<string, unknown>)
          if (row) rows.push(row)
        })
        const filtered = applyRoleClientFilter(rows, profile, hoDQueryLabels, canReadGlobal, effectiveOrgId)
        setScopeSourceOptions(collectDistinctSources(filtered))
      } catch (e) {
        console.error(e)
        if (!cancelled) setScopeSourceOptions([])
      }
    }

    const fetchProgramCatalog = async () => {
      try {
        const distFilters = serverFiltersOmitField(serverFilters, 'intakeProgram')
        const snap = await getDocsListWithOrgFallback(
          firestore,
          profile,
          hoDQueryLabels,
          distFilters,
          effectiveOrgId,
          canReadGlobal,
          (base) => query(base, orderBy('updatedAt', 'desc'), limit(SOURCE_CATALOG_BATCH)),
        )
        if (cancelled) return
        const rows: Lead[] = []
        snap.forEach((d) => {
          const row = mapDoc(d.id, d.data() as Record<string, unknown>)
          if (row) rows.push(row)
        })
        const filtered = applyRoleClientFilter(rows, profile, hoDQueryLabels, canReadGlobal, effectiveOrgId)
        setScopeProgramOptions(collectDistinctIntakePrograms(filtered))
      } catch (e) {
        console.error(e)
        if (!cancelled) setScopeProgramOptions([])
      }
    }

    const runAggregations = async (): Promise<number | null> => {
      const total = await fetchTotalOnly()
      if (cancelled || total == null) return null
      const side: Promise<void>[] = []
      if (includeScopeTagCounts) side.push(fetchTagCountsOnly())
      if (includeScopeSourceOptions) side.push(fetchSourceCatalog())
      if (includeScopeProgramOptions) side.push(fetchProgramCatalog())
      if (side.length) await Promise.all(side)
      return total
    }

    const loadFirestorePage = async (page: number, total: number | null) => {
      const snaps = pageEndSnaps.current
      const pg = Math.max(1, Math.floor(page))

      const prev = pg <= 1 ? null : snaps[pg - 2]
      const canSingleStep = pg === 1 || (prev !== undefined && prev !== null)

      const fetchOnePage = async (after: QueryDocumentSnapshot<DocumentData> | null) => {
        const snap = await getDocsListWithOrgFallback(
          firestore,
          profile,
          hoDQueryLabels,
          serverFilters,
          effectiveOrgId,
          canReadGlobal,
          (base) =>
            after === null
              ? query(base, orderBy('updatedAt', 'desc'), limit(LEADS_PAGE_SIZE))
              : query(base, orderBy('updatedAt', 'desc'), startAfter(after), limit(LEADS_PAGE_SIZE)),
        )
        if (cancelled) return
        const mapped: Lead[] = []
        snap.forEach((d) => {
          const row = mapDoc(d.id, d.data() as Record<string, unknown>)
          if (row) mapped.push(row)
        })
        mapped.sort((a, b) => b.updatedAt.toMillis() - a.updatedAt.toMillis())
        setLeads(applyRoleClientFilter(mapped, profile, hoDQueryLabels, canReadGlobal, effectiveOrgId))
        snaps[pg - 1] = snap.docs.length ? snap.docs[snap.docs.length - 1]! : null
      }

      if (canSingleStep) {
        await fetchOnePage(pg <= 1 ? null : (prev as QueryDocumentSnapshot<DocumentData>))
      } else if (pg * LEADS_PAGE_SIZE <= MAX_LIST_BULK_FETCH) {
        const bulkLimit = pg * LEADS_PAGE_SIZE
        const snap = await getDocsListWithOrgFallback(
          firestore,
          profile,
          hoDQueryLabels,
          serverFilters,
          effectiveOrgId,
          canReadGlobal,
          (base) => query(base, orderBy('updatedAt', 'desc'), limit(bulkLimit)),
        )
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
        setLeads(applyRoleClientFilter(pageRows, profile, hoDQueryLabels, canReadGlobal, effectiveOrgId))
      } else {
        for (let p = 1; p < pg; p++) {
          if (snaps[p - 1] !== undefined && snaps[p - 1] !== null) continue
          const prevEnd = p === 1 ? null : snaps[p - 2] ?? null
          const snap = await getDocsListWithOrgFallback(
            firestore,
            profile,
            hoDQueryLabels,
            serverFilters,
            effectiveOrgId,
            canReadGlobal,
            (base) =>
              prevEnd === null
                ? query(base, orderBy('updatedAt', 'desc'), limit(LEADS_PAGE_SIZE))
                : query(base, orderBy('updatedAt', 'desc'), startAfter(prevEnd), limit(LEADS_PAGE_SIZE)),
          )
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
      const snap = await getDocsListWithOrgFallback(
        firestore,
        profile,
        hoDQueryLabels,
        serverFilters,
        effectiveOrgId,
        canReadGlobal,
        (base) => query(base, orderBy('updatedAt', 'desc'), limit(MAX_LEAD_SEARCH_SCAN)),
      )
      if (cancelled) return
      let mapped: Lead[] = []
      snap.forEach((d) => {
        const row = mapDoc(d.id, d.data() as Record<string, unknown>)
        if (row) mapped.push(row)
      })
      mapped = applyRoleClientFilter(mapped, profile, hoDQueryLabels, canReadGlobal, effectiveOrgId)
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
      const snap = await getDocsListWithOrgFallback(
        firestore,
        profile,
        hoDQueryLabels,
        serverFilters,
        effectiveOrgId,
        canReadGlobal,
        (base) => query(base, orderBy('updatedAt', 'desc'), limit(batchLimit)),
      )
      if (cancelled) return
      const mapped: Lead[] = []
      snap.forEach((d) => {
        const row = mapDoc(d.id, d.data() as Record<string, unknown>)
        if (row) mapped.push(row)
      })
      mapped.sort((a, b) => b.updatedAt.toMillis() - a.updatedAt.toMillis())
      setLeads(applyRoleClientFilter(mapped, profile, hoDQueryLabels, canReadGlobal, effectiveOrgId))
      setTotalPages(1)
    }

    const loadFullScope = async () => {
      let lastSnap: QueryDocumentSnapshot<DocumentData> | null = null
      const acc: Lead[] = []
      let scanned = 0
      let hitCap = false
      const keepMatch = fullScopeKeepMatchRef.current
      const byDocId = fullScopeOrderMode === 'docId'
      const scanCap = keepMatch ? maxFullScopeScanDocs : maxFullScopeLeads
      while (acc.length < maxFullScopeLeads && scanned < scanCap) {
        const snap: QuerySnapshot<DocumentData> = await getDocsListWithOrgFallback(
          firestore,
          profile,
          hoDQueryLabels,
          serverFilters,
          effectiveOrgId,
          canReadGlobal,
          (base) => {
            if (byDocId) {
              return lastSnap === null
                ? query(base, orderBy(documentId()), limit(fullScopeChunkSize))
                : query(base, orderBy(documentId()), startAfter(lastSnap), limit(fullScopeChunkSize))
            }
            return lastSnap === null
              ? query(base, orderBy('updatedAt', 'desc'), limit(fullScopeChunkSize))
              : query(base, orderBy('updatedAt', 'desc'), startAfter(lastSnap), limit(fullScopeChunkSize))
          },
        )
        if (cancelled) return
        if (!snap.docs.length) break
        scanned += snap.docs.length
        const mappedChunk: Lead[] = []
        for (const d of snap.docs) {
          const row = mapDoc(d.id, d.data() as Record<string, unknown>)
          if (row) mappedChunk.push(row)
        }
        const roleFiltered = applyRoleClientFilter(
          mappedChunk,
          profile,
          hoDQueryLabels,
          canReadGlobal,
          effectiveOrgId,
        )
        for (const row of roleFiltered) {
          if (keepMatch && !keepMatch(row)) continue
          acc.push(row)
          if (acc.length >= maxFullScopeLeads) break
        }
        lastSnap = snap.docs[snap.docs.length - 1]!
        if (snap.docs.length < fullScopeChunkSize) break
        if (acc.length >= maxFullScopeLeads) {
          // Còn có thể có khớp phía sau — đánh dấu cắt khi đang lọc keepMatch hoặc đã đầy cửa sổ.
          hitCap = true
          break
        }
        if (scanned >= scanCap) {
          hitCap = true
          break
        }
      }
      if (cancelled) return
      let mapped = acc
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
      if (includeScopeProgramOptions && !cancelled) {
        setScopeProgramOptions(collectDistinctIntakePrograms(mapped))
      }
    }

    void (async () => {
      const showFullSpinner = fkChanged || pageToLoad <= 1
      if (showFullSpinner) setLoading(true)
      else setLoadingPage(true)
      setError(null)
      try {
        const applyEmptyList = () => {
          setLeads([])
          setTotalPages(1)
          setSearchHitTotal(null)
          setScopeFetchTruncated(false)
          setScopeTagCounts(null)
          if (includeScopeSourceOptions) setScopeSourceOptions([])
          if (includeScopeProgramOptions) setScopeProgramOptions([])
        }

        if (dataMode === 'batch') {
          await runAggregations()
          if (cancelled) return
          await loadBatch()
          return
        }

        if (dataMode === 'fullScope') {
          if (fkChanged || totalRef.current == null || manualRefetch) {
            const total = await fetchTotalOnly()
            if (cancelled) return
            if (total === 0) {
              applyEmptyList()
              return
            }
          } else if (totalRef.current === 0) {
            applyEmptyList()
            return
          }
          await loadFullScope()
          return
        }

        if (searchText) {
          if (fkChanged || totalRef.current == null) {
            await Promise.all([fetchTotalOnly(), loadSearchBucketAndSlice(pageToLoad, fkChanged)])
            if (cancelled) return
            if (includeScopeTagCounts) void fetchTagCountsOnly()
            if (includeScopeSourceOptions) void fetchSourceCatalog()
            if (includeScopeProgramOptions) void fetchProgramCatalog()
          } else {
            await loadSearchBucketAndSlice(pageToLoad, manualRefetch)
            if (manualRefetch && includeScopeTagCounts) void fetchTagCountsOnly()
            if (manualRefetch && includeScopeSourceOptions) void fetchSourceCatalog()
            if (manualRefetch && includeScopeProgramOptions) void fetchProgramCatalog()
          }
          return
        }

        let total = totalRef.current
        if (fkChanged || total == null || manualRefetch) {
          const tentativePage = fkChanged ? 1 : Math.max(1, pageToLoad)
          await Promise.all([fetchTotalOnly(), loadFirestorePage(tentativePage, null)])
          if (cancelled) return
          total = totalRef.current
          if (total === 0) {
            applyEmptyList()
            return
          }
          const tp = total != null && total > 0 ? Math.max(1, Math.ceil(total / LEADS_PAGE_SIZE)) : 1
          setTotalPages(tp)
          const safePage = Math.min(Math.max(1, tentativePage), tp)
          if (safePage !== tentativePage) {
            setCurrentPageState(safePage)
            await loadFirestorePage(safePage, total)
          }
          if (includeScopeTagCounts) void fetchTagCountsOnly()
          if (includeScopeSourceOptions) void fetchSourceCatalog()
          if (includeScopeProgramOptions) void fetchProgramCatalog()
        } else {
          if (total === 0) {
            applyEmptyList()
            return
          }
          const tp = total != null && total > 0 ? Math.max(1, Math.ceil(total / LEADS_PAGE_SIZE)) : 1
          setTotalPages(tp)
          const safePage = Math.min(Math.max(1, pageToLoad), tp)
          if (safePage !== pageToLoad) setCurrentPageState(safePage)
          await loadFirestorePage(safePage, total)
          if (manualRefetch && includeScopeProgramOptions) void fetchProgramCatalog()
        }
      } catch (e) {
        console.error(e)
        if (!cancelled) {
          setError(firestoreReadErrorMessage(e, 'Không đọc được danh sách hồ sơ.'))
          setLeads([])
          setScopeFetchTruncated(false)
        }
      } finally {
        // Chỉ tắt spinner nếu đây vẫn là lần tải mới nhất (tránh kẹt khi effect bị hủy giữa chừng).
        if (gen === fetchGenRef.current) {
          setLoading(false)
          setLoadingPage(false)
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [
    configured,
    profileListKey,
    hoDKey,
    serverFiltersKey,
    searchText,
    dataMode,
    batchLimit,
    fullScopeChunkSize,
    maxFullScopeLeads,
    fullScopeOrderMode,
    maxFullScopeScanDocs,
    fullScopeMatchKey,
    filterKey,
    directoryLabelsKey,
    pagedFirestoreDep,
    includeScopeTagCounts,
    includeScopeSourceOptions,
    includeScopeProgramOptions,
    fetchEnabled,
    manualRefreshKey,
    effectiveOrgId,
    canReadGlobal,
  ])

  const refreshTotalLeadCount = useCallback(async () => {
    const firestore = getFirestoreDb()
    if (!firestore || !profile) return
    try {
      const cq = buildListDataQuery(
        firestore,
        profile,
        hoDQueryLabels,
        serverFilters,
        effectiveOrgId,
        canReadGlobal,
        'strict',
      )
      const agg = await getCountFromServer(cq)
      setTotalLeadCount(agg.data().count)
      setTotalLeadCountError(null)
      totalRef.current = agg.data().count
    } catch (e) {
      console.error(e)
      setTotalLeadCount(null)
      setTotalLeadCountError(e instanceof Error ? e.message : 'Không đếm được tổng hồ sơ')
    }
  }, [profile, hoDQueryLabels, serverFilters, effectiveOrgId, canReadGlobal])

  const applyLocalLeadPatch = useCallback((id: string, patch: Partial<Lead>) => {
    const mergeRow = (row: Lead): Lead => {
      const next = { ...row, ...patch } as Lead
      for (const [k, v] of Object.entries(patch)) {
        if (v === undefined) delete (next as unknown as Record<string, unknown>)[k]
      }
      return next
    }
    setLeads((rows) => {
      const idx = rows.findIndex((r) => r.id === id)
      if (idx === -1) return rows
      const next = [...rows]
      next[idx] = mergeRow(next[idx]!)
      return next
    })
    const bucket = searchBucketRef.current
    if (bucket?.length) {
      const idx = bucket.findIndex((r) => r.id === id)
      if (idx !== -1) {
        searchBucketRef.current = bucket.map((r, i) => (i === idx ? mergeRow(r) : r))
      }
    }
  }, [])

  /** Bỏ hồ sơ khỏi danh sách local ngay sau khi xóa trên Firestore (trước khi refetch). */
  const removeLocalLeads = useCallback((ids: readonly string[]) => {
    if (!ids.length) return
    const drop = new Set(ids)
    setLeads((rows) => rows.filter((r) => !drop.has(r.id)))
    const bucket = searchBucketRef.current
    if (bucket?.length) {
      searchBucketRef.current = bucket.filter((r) => !drop.has(r.id))
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
    fetchScopeSourceOptions,
    scopeProgramOptions,
    fetchScopeProgramOptions,
    searchScanTruncated,
    searchHitTotal,
    scopeFetchTruncated,
    applyLocalLeadPatch,
    removeLocalLeads,
    currentPage,
    totalPages,
    setPage,
    loading,
    loadingPage,
    error,
    configured,
  }
}
