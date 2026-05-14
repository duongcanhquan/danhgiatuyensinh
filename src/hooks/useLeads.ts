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
import type { Lead, LeadCounselorStatus, LeadPipelineStatus, PriorityTag, VietMyUserProfile } from '../types'
import { FS_COLLECTIONS } from '../types'
import { getFirestoreDb, isFirebaseConfigured } from '../services/firebase'
import { useAuth } from './useAuth'
import { useMasterData } from './useMasterData'
import {
  coerceLeadCounselorStatus,
  counselorStatusToPipeline,
  pipelineToCounselorStatus,
} from '../utils/leadIdentity'
import { parseScoringSignalsFromFirestore } from '../utils/leadScoringSignals'

/** Số hồ sơ mỗi trang Firestore / bảng. */
export const LEADS_PAGE_SIZE = 30

/** Quét tối đa khi có ô tìm (URL q) — lọc tiếp trên client (chế độ `paged`). Giữ vừa phải để tìm nhanh. */
export const MAX_LEAD_SEARCH_SCAN = 1200

/** Một lần getDocs tối đa khi nhảy trang xa (thay cho nhiều vòng startAfter). */
const MAX_LIST_BULK_FETCH = 3600

/** Giới hạn an toàn khi `dataMode: 'fullScope'` — đọc toàn bộ phạm vi theo lô Firestore. */
export const MAX_FULL_SCOPE_LEADS = 25_000

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
      scoringSignals: parseScoringSignalsFromFirestore(data.scoringSignals),
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
}

function rbacConstraint(profile: VietMyUserProfile, hoDLabels: string[]): QueryFilterConstraint | null {
  if (profile.role === 'admin') return null

  if (profile.role === 'counselor') {
    return or(where('assignedTo', '==', profile.id), where('assignedCounselorId', '==', profile.id))
  }

  if (profile.role === 'head_of_profession') {
    const team = (profile.managedCounselorIds ?? []).filter(Boolean)
    if (!team.length) return where('assignedTo', '==', impossibleUid())
    const chunk = team.slice(0, 30)
    return or(where('assignedTo', 'in', chunk), where('assignedCounselorId', 'in', chunk))
  }

  if (profile.role === 'head_of_department') {
    const chunk = hoDLabels.filter(Boolean).slice(0, 30)
    if (!chunk.length) return where('educationLevel', '==', impossibleUid())
    return where('educationLevel', 'in', chunk)
  }

  return null
}

function filterConstraints(f: LeadListServerFilters | undefined, profile: VietMyUserProfile): QueryFilterConstraint[] {
  if (!f) return []
  const c: QueryFilterConstraint[] = []
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
  if (f.assignedCounselorIn?.length && profile.role === 'admin') {
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
  if (profile.role === 'head_of_department' && labelSet.size) {
    return rows.filter((l) => labelSet.has(l.educationLevel.trim().toLowerCase()))
  }
  if (profile.role === 'head_of_profession') {
    const team = new Set(profile.managedCounselorIds ?? [])
    if (!team.size) return []
    return rows.filter((l) => {
      const u = l.assignedTo ?? l.assignedCounselorId
      return Boolean(u && team.has(u))
    })
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
  const major = (l.educationLevel ?? '').toLowerCase()
  const reg = (l.province ?? '').toLowerCase()
  const school = (l.highSchool ?? '').toLowerCase()
  const addr = (l.address ?? '').toLowerCase()
  const src = (l.source ?? '').toLowerCase()
  const desc = (l.description ?? '').toLowerCase()
  const uid = l.assignedTo ?? l.assignedCounselorId
  const tv = uid ? (directoryLabels?.get(uid) ?? '').toLowerCase() : ''
  const uploadLbl = l.uploadedBy
    ? (directoryLabels?.get(l.uploadedBy) ?? (l.uploaderName ?? '')).toLowerCase()
    : (l.uploaderName ?? '').toLowerCase()
  const hay = `${name} ${phone} ${email} ${parent} ${major} ${reg} ${school} ${addr} ${src} ${desc} ${tv} ${uploadLbl}`
  return hay.includes(q)
}

const TAG_KEYS: PriorityTag[] = ['HOT', 'WARM', 'COLD', 'LOSS']

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
  const [searchScanTruncated, setSearchScanTruncated] = useState(false)
  const [searchHitTotal, setSearchHitTotal] = useState<number | null>(null)
  const [scopeFetchTruncated, setScopeFetchTruncated] = useState(false)

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
        setSearchHitTotal(null)
        setScopeFetchTruncated(false)
      })
      return
    }

    let cancelled = false
    const fkChanged = lastDataFilterKey.current !== filterKey
    if (fkChanged) {
      lastDataFilterKey.current = filterKey
      pageEndSnaps.current = []
      searchBucketRef.current = null
      totalRef.current = null
      setCurrentPageState(1)
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
        const tagEntries = await Promise.all(
          TAG_KEYS.map(async (t) => {
            const qTag = buildPriorityTagCountQuery(firestore, profile, hoDQueryLabels, serverFilters, t)
            const n = (await getCountFromServer(qTag)).data().count
            return [t, n] as const
          }),
        )
        if (cancelled) return
        if (serverFilters?.priorityTagsIn && serverFilters.priorityTagsIn.length > 1) {
          setScopeTagCounts(null)
        } else {
          setScopeTagCounts({
            HOT: tagEntries.find(([k]) => k === 'HOT')?.[1] ?? 0,
            WARM: tagEntries.find(([k]) => k === 'WARM')?.[1] ?? 0,
            COLD: tagEntries.find(([k]) => k === 'COLD')?.[1] ?? 0,
            LOSS: tagEntries.find(([k]) => k === 'LOSS')?.[1] ?? 0,
          })
        }
      } catch (e) {
        console.error(e)
        if (!cancelled) setScopeTagCounts(null)
      }
    }

    const runAggregations = async (): Promise<number | null> => {
      const total = await fetchTotalOnly()
      if (cancelled || total == null) return null
      await fetchTagCountsOnly()
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
          if (fkChanged || totalRef.current == null) {
            await runAggregations()
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
            void fetchTagCountsOnly()
          } else {
            await loadSearchBucketAndSlice(pageToLoad, false)
          }
          setLoading(false)
          setLoadingPage(false)
          return
        }

        let total = totalRef.current
        if (fkChanged || total == null) {
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
          void fetchTagCountsOnly()
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

  return {
    leads,
    rawLeads: leads,
    totalLeadCount,
    totalLeadCountError,
    refreshTotalLeadCount,
    scopeTagCounts,
    searchScanTruncated,
    searchHitTotal,
    scopeFetchTruncated,
    currentPage,
    totalPages,
    setPage,
    loading,
    loadingPage,
    error,
    configured,
  }
}
