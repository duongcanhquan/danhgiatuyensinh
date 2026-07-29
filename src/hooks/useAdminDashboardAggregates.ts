import { useEffect, useState } from 'react'
import {
  collection,
  getCountFromServer,
  query,
  Timestamp,
  where,
} from 'firebase/firestore'
import { getFirestoreDb, isFirebaseConfigured } from '../services/firebase'
import type { LeadPipelineStatus, PriorityTag } from '../types'
import { FS_COLLECTIONS } from '../types'
import { useOrg } from './useOrg'
import { DEFAULT_ORG_ID } from '../tenancy/orgConstants'

const PIPELINE_STACK: LeadPipelineStatus[] = [
  'NEW',
  'CONTACTED',
  'QUALIFIED',
  'APPLIED',
  'ENROLLED',
  'LOST',
  'ARCHIVED',
]

const TAG_KEYS: PriorityTag[] = ['HOT', 'WARM', 'COLD', 'LOSS']

const AGG_CACHE_TTL_MS = 5 * 60_000
let aggCache: { at: number; orgId: string; data: AdminDashboardAggregateData } | null = null
let aggInflight: { orgId: string; promise: Promise<AdminDashboardAggregateData> } | null = null

export type AdminDashboardAggregateData = {
  pipeline: Record<LeadPipelineStatus, number>
  tags: Record<PriorityTag, number>
  yieldGauge: { name: string; value: number; fill: string }[]
  summerMeltSeries: { month: string; melt: number }[]
  /** Một hàng xếp chồng pipeline — thay biểu đồ theo tháng (cần quét toàn bộ). */
  cohortStack: Array<Record<string, string | number>>
}

async function loadAdminDashboardAggregates(
  firestore: NonNullable<ReturnType<typeof getFirestoreDb>>,
  orgId: string,
): Promise<AdminDashboardAggregateData> {
  const col = collection(firestore, FS_COLLECTIONS.leads)
  const orgW = where('orgId', '==', orgId)

  const pipelineEntries = await Promise.all(
    PIPELINE_STACK.map(async (s) => {
      const n = (await getCountFromServer(query(col, orgW, where('pipelineStatus', '==', s)))).data()
        .count
      return [s, n] as const
    }),
  )
  const pipeline = Object.fromEntries(pipelineEntries) as Record<LeadPipelineStatus, number>

  const tagEntries = await Promise.all(
    TAG_KEYS.map(async (t) => {
      const n = (await getCountFromServer(query(col, orgW, where('priorityTag', '==', t)))).data().count
      return [t, n] as const
    }),
  )
  const tags = Object.fromEntries(tagEntries) as Record<PriorityTag, number>

  const enrolled = (await getCountFromServer(query(col, orgW, where('status', '==', 'ENROLLED')))).data()
    .count
  const committed = (
    await getCountFromServer(
      query(col, orgW, where('status', 'in', ['DEPOSIT_PAID', 'ENROLLED', 'SUMMER_MELT'])),
    )
  ).data().count
  const pct = committed ? Math.round((enrolled / committed) * 1000) / 10 : 0
  const yieldGauge = [{ name: 'Tỷ lệ nhập học', value: Math.min(100, pct), fill: '#c9a227' }]

  const summerMeltSeries: { month: string; melt: number }[] = []
  const now = new Date()
  try {
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const y = d.getFullYear()
      const m = d.getMonth()
      const start = Timestamp.fromDate(new Date(y, m, 1))
      const end = Timestamp.fromDate(new Date(y, m + 1, 1))
      const melt = (
        await getCountFromServer(
          query(
            col,
            orgW,
            where('status', '==', 'SUMMER_MELT'),
            where('updatedAt', '>=', start),
            where('updatedAt', '<', end),
          ),
        )
      ).data().count
      summerMeltSeries.push({
        month: d.toLocaleDateString('vi-VN', { month: 'short', year: 'numeric' }),
        melt,
      })
    }
  } catch (e) {
    console.warn('[admin aggregates] summer melt monthly counts skipped', e)
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      summerMeltSeries.push({
        month: d.toLocaleDateString('vi-VN', { month: 'short', year: 'numeric' }),
        melt: 0,
      })
    }
  }

  const row: Record<string, string | number> = { monthLabel: 'Theo trường đang chọn' }
  for (const p of PIPELINE_STACK) row[p] = pipeline[p] ?? 0

  return { pipeline, tags, yieldGauge, summerMeltSeries, cohortStack: [row] }
}

/**
 * Đếm tổng hợp báo cáo admin theo `orgId` đang làm việc.
 * Cache RAM 5 phút theo org — tránh ~25 count queries mỗi lần chuyển tab Tổng kết.
 */
export function useAdminDashboardAggregates(enabled: boolean) {
  const { effectiveOrgId } = useOrg()
  const orgId = effectiveOrgId || DEFAULT_ORG_ID
  const [data, setData] = useState<AdminDashboardAggregateData | null>(() =>
    enabled && aggCache && aggCache.orgId === orgId && Date.now() - aggCache.at < AGG_CACHE_TTL_MS
      ? aggCache.data
      : null,
  )
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!enabled) {
      setData(null)
      setError(null)
      setLoading(false)
      return
    }

    const firestore = getFirestoreDb()
    if (!firestore || !isFirebaseConfigured()) {
      setData(null)
      setError(null)
      setLoading(false)
      return
    }

    if (aggCache && aggCache.orgId === orgId && Date.now() - aggCache.at < AGG_CACHE_TTL_MS) {
      setData(aggCache.data)
      setError(null)
      setLoading(false)
      return
    }

    let cancelled = false

    void (async () => {
      setLoading(true)
      setError(null)
      try {
        if (!aggInflight || aggInflight.orgId !== orgId) {
          const promise = loadAdminDashboardAggregates(firestore, orgId).finally(() => {
            if (aggInflight?.orgId === orgId) aggInflight = null
          })
          aggInflight = { orgId, promise }
        }
        const next = await aggInflight.promise
        aggCache = { at: Date.now(), orgId, data: next }
        if (cancelled) return
        setData(next)
        setError(null)
      } catch (e) {
        console.error(e)
        if (!cancelled) {
          setData(null)
          setError(e instanceof Error ? e.message : 'Không tải được thống kê admin')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [enabled, orgId])

  return { data, loading, error }
}

/** Xóa cache sau bulk import / rescore — gọi từ màn admin nếu cần số mới ngay. */
export function invalidateAdminDashboardAggregatesCache(): void {
  aggCache = null
}
