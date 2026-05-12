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
import type { Lead, VietMyUserProfile } from '../types'
import { FS_COLLECTIONS } from '../types'
import { getFirestoreDb, isFirebaseConfigured } from '../services/firebase'
import { useAuth } from './useAuth'
import { useMasterData } from './useMasterData'
import {
  coerceLeadCounselorStatus,
  counselorStatusToPipeline,
  pipelineToCounselorStatus,
} from '../utils/leadIdentity'

/** Một trang realtime / cursor — giới hạn đọc Firestore mỗi lần (đồng bộ với UI ~30/trang). */
export const LEADS_PAGE_SIZE = 30

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

function mapDoc(id: string, data: Record<string, unknown>): Lead | null {
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
    const educationLevel = String(
      data.educationLevel ?? data.majorInterest ?? data.studyIntention ?? data.academicLevel ?? '',
    )
    const highSchool = String(data.highSchool ?? data.highSchoolName ?? data.schoolName ?? '')
    const customerId = String(data.customerId ?? '')
    const fullName = String(data.fullName ?? '')
    const phone = String(data.phone ?? '')
    const parentPhone = String(data.parentPhone ?? '')
    const source = String(data.source ?? data.leadSource ?? '')
    let description = String(data.description ?? '')
    if (!description.trim()) {
      const bits = [data.aspirations, data.hobbies, data.fieldTripNotes].filter(Boolean).map(String)
      description = bits.join('\n---\n')
    }
    const gradeClass = String(data.gradeClass ?? '')
    const address = String(data.address ?? '')

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
      fullName,
      phone,
      parentPhone,
      source,
      educationLevel,
      assignedTo,
      assignedCounselorId: legacyAssigned ?? undefined,
      status,
      description,
      highSchool,
      gradeClass,
      province,
      address,
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
    }
  } catch {
    return null
  }
}

function impossibleUid(): string {
  return '__no_match__'
}

function firstPageQuery(firestore: Firestore, profile: VietMyUserProfile, hoDLabels: string[]) {
  const col = collection(firestore, FS_COLLECTIONS.leads)
  const ob = orderBy('updatedAt', 'desc')
  const lim = limit(LEADS_PAGE_SIZE)

  if (profile.role === 'admin') {
    return query(col, ob, lim)
  }

  if (profile.role === 'counselor') {
    return query(
      col,
      or(where('assignedTo', '==', profile.id), where('assignedCounselorId', '==', profile.id)),
      ob,
      lim,
    )
  }

  if (profile.role === 'head_of_profession') {
    const team = (profile.managedCounselorIds ?? []).filter(Boolean)
    if (!team.length) {
      return query(col, where('assignedTo', '==', impossibleUid()), ob, lim)
    }
    const chunk = team.slice(0, 30)
    return query(
      col,
      or(where('assignedTo', 'in', chunk), where('assignedCounselorId', 'in', chunk)),
      ob,
      lim,
    )
  }

  if (profile.role === 'head_of_department') {
    const chunk = hoDLabels.filter(Boolean).slice(0, 30)
    if (!chunk.length) {
      return query(col, where('educationLevel', '==', impossibleUid()), ob, lim)
    }
    return query(col, where('educationLevel', 'in', chunk), ob, lim)
  }

  return query(col, ob, lim)
}

function pageAfterQuery(
  firestore: NonNullable<ReturnType<typeof getFirestoreDb>>,
  profile: VietMyUserProfile,
  cursor: QueryDocumentSnapshot<DocumentData>,
  hoDLabels: string[],
) {
  const col = collection(firestore, FS_COLLECTIONS.leads)
  const ob = orderBy('updatedAt', 'desc')
  const lim = limit(LEADS_PAGE_SIZE)
  const after = startAfter(cursor)

  if (profile.role === 'admin') {
    return query(col, ob, after, lim)
  }

  if (profile.role === 'counselor') {
    return query(
      col,
      or(where('assignedTo', '==', profile.id), where('assignedCounselorId', '==', profile.id)),
      ob,
      after,
      lim,
    )
  }

  if (profile.role === 'head_of_profession') {
    const team = (profile.managedCounselorIds ?? []).filter(Boolean)
    if (!team.length) {
      return query(col, where('assignedTo', '==', impossibleUid()), ob, after, lim)
    }
    const chunk = team.slice(0, 30)
    return query(
      col,
      or(where('assignedTo', 'in', chunk), where('assignedCounselorId', 'in', chunk)),
      ob,
      after,
      lim,
    )
  }

  if (profile.role === 'head_of_department') {
    const chunk = hoDLabels.filter(Boolean).slice(0, 30)
    if (!chunk.length) {
      return query(col, where('educationLevel', '==', impossibleUid()), ob, after, lim)
    }
    return query(col, where('educationLevel', 'in', chunk), ob, after, lim)
  }

  return query(col, ob, after, lim)
}

/**
 * Real-time trang đầu `leads` + RBAC (query theo vai trò).
 */
export function useLeads() {
  const { profile } = useAuth()
  const { byKind } = useMasterData()

  const hoDQueryLabels = useMemo(() => {
    const ids = profile?.managedMajorIds ?? []
    if (!ids.length) return [] as string[]
    const idSet = new Set(ids)
    const majors = byKind.majors ?? []
    return majors.filter((m) => idSet.has(m.id)).map((m) => m.label.trim()).filter(Boolean)
  }, [profile?.managedMajorIds, byKind.majors])

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
    const labelSet = new Set(hoDQueryLabels.map((x) => x.trim().toLowerCase()))
    if (profile.role === 'head_of_department' && labelSet.size) {
      return raw.filter((l) => labelSet.has(l.educationLevel.trim().toLowerCase()))
    }
    if (profile.role === 'head_of_profession') {
      const team = new Set(profile.managedCounselorIds ?? [])
      if (!team.size) return []
      return raw.filter((l) => {
        const u = l.assignedTo ?? l.assignedCounselorId
        return Boolean(u && team.has(u))
      })
    }
    return raw
  }, [raw, profile, hoDQueryLabels])

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

    const q = firstPageQuery(firestore, profile, hoDQueryLabels)

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
  }, [configured, profile, hoDQueryLabels])

  const loadMore = useCallback(async () => {
    const firestore = getFirestoreDb()
    if (!firestore || !profile || loadingMore) return
    const cursor = loadMoreTailRef.current ?? livePageTailRef.current
    if (!cursor) return
    setLoadingMore(true)
    try {
      const snap = await getDocs(pageAfterQuery(firestore, profile, cursor, hoDQueryLabels))
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
  }, [profile, loadingMore, hoDQueryLabels])

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
