import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  collection,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  or,
  query,
  startAfter,
  Timestamp,
  where,
  type DocumentData,
  type Firestore,
  type QueryDocumentSnapshot,
} from 'firebase/firestore'
import type { Lead, Permission, VietMyUserProfile } from '../types'
import { FS_COLLECTIONS } from '../types'
import { getFirestoreDb, isFirebaseConfigured } from '../services/firebase'
import { useAuth } from './useAuth'
import { hasPermission } from '../auth/permissions'
import {
  coerceLeadCounselorStatus,
  counselorStatusToPipeline,
  pipelineToCounselorStatus,
} from '../utils/leadIdentity'

/** Một trang realtime / cursor — giới hạn đọc Firestore mỗi lần. */
export const LEADS_PAGE_SIZE = 50

function asSchoolType(v: unknown): Lead['schoolType'] {
  const s = String(v ?? '').toUpperCase()
  if (s === 'PUBLIC' || s === 'PRIVATE' || s === 'INTERNATIONAL' || s === 'UNKNOWN') return s
  return 'UNKNOWN'
}

function asFinancial(v: unknown): Lead['financialStatus'] {
  const s = String(v ?? '').toUpperCase()
  const allowed: Lead['financialStatus'][] = [
    'FULL_PAY',
    'INSTALLMENT',
    'SCHOLARSHIP_SEEKING',
    'FINANCIAL_AID',
    'UNKNOWN',
  ]
  return (allowed.includes(s as Lead['financialStatus']) ? s : 'UNKNOWN') as Lead['financialStatus']
}

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

function mapDoc(id: string, data: Record<string, unknown>): Lead | null {
  try {
    const region = String(data.region ?? data.province ?? '')
    const majorInterest = String(data.majorInterest ?? data.academicPerformance ?? '')
    const highSchoolName = String(data.highSchoolName ?? data.schoolName ?? '')
    const calculatedScore = Number(data.calculatedScore ?? data.finalScore ?? 0)
    const priorityTag = (data.priorityTag ?? data.tag ?? 'COLD') as Lead['priorityTag']
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
    const assignedCounselorId =
      data.assignedCounselorId === null || data.assignedCounselorId === undefined
        ? null
        : String(data.assignedCounselorId)
    const assignedToRaw = data.assignedTo
    const assignedTo =
      assignedToRaw === null || assignedToRaw === undefined || assignedToRaw === ''
        ? assignedCounselorId
        : String(assignedToRaw)

    return {
      id,
      fullName: String(data.fullName ?? ''),
      phone: String(data.phone ?? ''),
      email: data.email !== undefined ? String(data.email) : undefined,
      parentPhone: data.parentPhone !== undefined ? String(data.parentPhone) : undefined,
      majorInterest,
      majorInterestId: data.majorInterestId ? String(data.majorInterestId) : undefined,
      academicLevel: data.academicLevel !== undefined ? String(data.academicLevel) : undefined,
      studyIntention: data.studyIntention !== undefined ? String(data.studyIntention) : undefined,
      studyIntentionId: data.studyIntentionId ? String(data.studyIntentionId) : undefined,
      region,
      regionId: data.regionId ? String(data.regionId) : undefined,
      hanoiArea: data.hanoiArea !== undefined ? String(data.hanoiArea) : undefined,
      hanoiAreaId: data.hanoiAreaId ? String(data.hanoiAreaId) : undefined,
      province: data.province !== undefined ? String(data.province) : undefined,
      gender: data.gender !== undefined ? String(data.gender) : undefined,
      highSchoolName: highSchoolName || undefined,
      highSchoolId: data.highSchoolId ? String(data.highSchoolId) : undefined,
      schoolType: asSchoolType(data.schoolType),
      financialStatus: asFinancial(data.financialStatus),
      calculatedScore,
      priorityTag,
      assignedCounselorId,
      assignedTo,
      uploadedBy: data.uploadedBy !== undefined && data.uploadedBy !== null ? String(data.uploadedBy) : undefined,
      uploaderName: data.uploaderName !== undefined ? String(data.uploaderName) : undefined,
      uploadBatchId: data.uploadBatchId !== undefined ? String(data.uploadBatchId) : undefined,
      pipelineStatus,
      status,
      mlWinProbability,
      mlExplanation,
      nextFollowUpDate,
      uniqueHash,
      source: data.source as Lead['source'],
      leadSource: data.leadSource !== undefined ? String(data.leadSource) : undefined,
      aspirations: data.aspirations !== undefined ? String(data.aspirations) : undefined,
      hobbies: data.hobbies !== undefined ? String(data.hobbies) : undefined,
      fieldTripNotes: data.fieldTripNotes !== undefined ? String(data.fieldTripNotes) : undefined,
      aiSentimentScore:
        data.aiSentimentScore !== undefined && data.aiSentimentScore !== null
          ? Number(data.aiSentimentScore)
          : undefined,
      importedAt: data.importedAt as Timestamp | undefined,
      createdAt,
      updatedAt,
      lastTouchedAt:
        data.lastTouchedAt && typeof data.lastTouchedAt === 'object' && 'toMillis' in (data.lastTouchedAt as object)
          ? (data.lastTouchedAt as Timestamp)
          : undefined,
      routingMeta: data.routingMeta as Lead['routingMeta'],
      // aiInsights: chỉ tải trong chi tiết qua sub-collection `aiInsightTasks` (xem useLeadAiInsightTasks).
    }
  } catch {
    return null
  }
}

function filterByPermissions(
  leads: Lead[],
  perms: readonly Permission[],
  profile: VietMyUserProfile | null,
): Lead[] {
  if (!profile) return []
  if (hasPermission(perms, 'leads:read:global')) return leads
  if (hasPermission(perms, 'leads:read:self_assigned')) {
    return leads.filter((l) => l.assignedCounselorId === profile.id)
  }
  if (hasPermission(perms, 'leads:read:profession_scope')) {
    const team = profile.managedCounselorIds ?? []
    if (!team.length) return []
    return leads.filter((l) => Boolean(l.assignedCounselorId && team.includes(l.assignedCounselorId)))
  }
  if (hasPermission(perms, 'leads:read:department_scope')) {
    const majors = profile.managedMajorIds ?? []
    if (!majors.length) return []
    return leads.filter((l) => Boolean(l.majorInterestId && majors.includes(l.majorInterestId)))
  }
  return []
}

/** Admin / Trưởng khoa / Trưởng ngành — xem toàn bộ lead (query không giới hạn). */
function isElevatedLeadViewer(profile: VietMyUserProfile): boolean {
  return (
    profile.role === 'admin' ||
    profile.role === 'head_of_department' ||
    profile.role === 'head_of_profession'
  )
}

/** Counselor — chỉ lead do chính họ upload (`uploadedBy`). */
function isCounselorOwnDataScope(profile: VietMyUserProfile): boolean {
  return profile.role === 'counselor'
}

function firstPageQuery(firestore: Firestore, profile: VietMyUserProfile) {
  const col = collection(firestore, FS_COLLECTIONS.leads)
  if (isCounselorOwnDataScope(profile)) {
    return query(
      col,
      or(where('assignedCounselorId', '==', profile.id), where('uploadedBy', '==', profile.id)),
      orderBy('updatedAt', 'desc'),
      limit(LEADS_PAGE_SIZE),
    )
  }
  return query(col, orderBy('updatedAt', 'desc'), limit(LEADS_PAGE_SIZE))
}

function pageAfterQuery(
  firestore: NonNullable<ReturnType<typeof getFirestoreDb>>,
  profile: VietMyUserProfile,
  cursor: QueryDocumentSnapshot<DocumentData>,
) {
  const col = collection(firestore, FS_COLLECTIONS.leads)
  if (isCounselorOwnDataScope(profile)) {
    return query(
      col,
      or(where('assignedCounselorId', '==', profile.id), where('uploadedBy', '==', profile.id)),
      orderBy('updatedAt', 'desc'),
      startAfter(cursor),
      limit(LEADS_PAGE_SIZE),
    )
  }
  return query(col, orderBy('updatedAt', 'desc'), startAfter(cursor), limit(LEADS_PAGE_SIZE))
}

/**
 * Real-time trang đầu `leads` (tối đa {@link LEADS_PAGE_SIZE} bản ghi) + RBAC.
 * Các trang sau: `loadMore()` (getDocs + cursor) để giữ đọc có giới hạn.
 */
export function useLeads() {
  const { profile, permissions } = useAuth()
  const [livePage, setLivePage] = useState<Lead[]>([])
  const [olderLeads, setOlderLeads] = useState<Lead[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const configured = useMemo(() => isFirebaseConfigured(), [])

  const livePageTailRef = useRef<QueryDocumentSnapshot<DocumentData> | null>(null)
  const loadMoreTailRef = useRef<QueryDocumentSnapshot<DocumentData> | null>(null)

  const raw = useMemo(() => {
    const byId = new Map<string, Lead>()
    for (const l of olderLeads) byId.set(l.id, l)
    for (const l of livePage) byId.set(l.id, l)
    return [...byId.values()].sort((a, b) => b.updatedAt.toMillis() - a.updatedAt.toMillis())
  }, [olderLeads, livePage])

  const leads = useMemo(() => {
    if (!profile) return []
    if (isCounselorOwnDataScope(profile)) return raw
    if (isElevatedLeadViewer(profile) || hasPermission(permissions, 'leads:read:global')) return raw
    return filterByPermissions(raw, permissions, profile)
  }, [raw, profile, permissions])

  useEffect(() => {
    livePageTailRef.current = null
    loadMoreTailRef.current = null
    setLivePage([])
    setOlderLeads([])
    setHasMore(false)

    const firestore = getFirestoreDb()
    if (!firestore) {
      queueMicrotask(() => {
        setLoading(false)
        setError(
          configured
            ? null
            : 'Chưa cấu hình Firebase. Thêm biến môi trường theo .env.example.',
        )
      })
      return
    }

    if (!profile) {
      queueMicrotask(() => {
        setLoading(false)
        setError(null)
      })
      return
    }

    const q = firstPageQuery(firestore, profile)

    const unsub = onSnapshot(
      q,
      (snap) => {
        const next: Lead[] = []
        snap.forEach((docSnap) => {
          const row = mapDoc(docSnap.id, docSnap.data() as Record<string, unknown>)
          if (row) next.push(row)
        })
        next.sort((a, b) => b.updatedAt.toMillis() - a.updatedAt.toMillis())
        setLivePage(next)
        setOlderLeads((prev) => prev.filter((l) => !next.some((x) => x.id === l.id)))
        const tail = snap.docs.length ? snap.docs[snap.docs.length - 1]! : null
        livePageTailRef.current = tail
        if (!loadMoreTailRef.current) {
          setHasMore(snap.docs.length >= LEADS_PAGE_SIZE)
        }
        setLoading(false)
        setError(null)
      },
      (err) => {
        console.error(err)
        setError(err.message || 'Lỗi đọc danh sách hồ sơ')
        setLoading(false)
      },
    )
    return () => unsub()
  }, [configured, profile])

  const loadMore = useCallback(async () => {
    const firestore = getFirestoreDb()
    if (!firestore || !profile || loadingMore) return
    const cursor = loadMoreTailRef.current ?? livePageTailRef.current
    if (!cursor) return
    setLoadingMore(true)
    try {
      const snap = await getDocs(pageAfterQuery(firestore, profile, cursor))
      if (!snap.docs.length) {
        setHasMore(false)
        return
      }
      const chunk: Lead[] = []
      snap.forEach((d) => {
        const row = mapDoc(d.id, d.data() as Record<string, unknown>)
        if (row) chunk.push(row)
      })
      chunk.sort((a, b) => b.updatedAt.toMillis() - a.updatedAt.toMillis())
      setOlderLeads((prev) => {
        const m = new Map<string, Lead>()
        for (const l of prev) m.set(l.id, l)
        for (const l of chunk) m.set(l.id, l)
        return [...m.values()].sort((a, b) => b.updatedAt.toMillis() - a.updatedAt.toMillis())
      })
      loadMoreTailRef.current = snap.docs[snap.docs.length - 1] ?? cursor
      setHasMore(snap.docs.length >= LEADS_PAGE_SIZE)
    } catch (e) {
      console.error(e)
      setError(e instanceof Error ? e.message : 'Lỗi tải thêm hồ sơ')
    } finally {
      setLoadingMore(false)
    }
  }, [profile, loadingMore])

  return {
    leads,
    rawLeads: raw,
    loading,
    loadingMore,
    hasMore,
    loadMore,
    error,
    configured,
  }
}
