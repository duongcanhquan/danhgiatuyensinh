/**
 * Ngưỡng LPXT / cọc — parity Apps Script (150k / 1tr / 2tr hệ 9+), có thể ghi đè theo org.
 */
import { doc, getDoc, setDoc, Timestamp, type Firestore } from 'firebase/firestore'
import { FS_COLLECTIONS } from '../types'
import { orgSettingsDocSegments } from '../tenancy/orgSettingsPaths'
import { DEFAULT_ORG_ID } from '../tenancy/orgConstants'

export const FINANCE_THRESHOLDS_DOC_ID = 'financeThresholds' as const

export type FinanceDepositThresholds = {
  /** Ngưỡng báo cáo LPXT (không áp dụng hệ 9+). */
  lpxtMinVnd: number
  /** Ngưỡng cọc hệ thường. */
  depositStandardVnd: number
  /** Ngưỡng cọc khi educationLevel chứa `9+`. */
  depositNinePlusVnd: number
  updatedAt?: string
  updatedBy?: string
}

export function defaultFinanceDepositThresholds(): FinanceDepositThresholds {
  return {
    lpxtMinVnd: 150_000,
    depositStandardVnd: 1_000_000,
    depositNinePlusVnd: 2_000_000,
  }
}

function positiveInt(v: unknown, fallback: number): number {
  const n = typeof v === 'number' ? v : Number(v)
  if (!Number.isFinite(n) || n <= 0) return fallback
  return Math.round(n)
}

export function parseFinanceDepositThresholds(
  data: Record<string, unknown> | undefined,
): FinanceDepositThresholds {
  const base = defaultFinanceDepositThresholds()
  if (!data) return base
  return {
    lpxtMinVnd: positiveInt(data.lpxtMinVnd, base.lpxtMinVnd),
    depositStandardVnd: positiveInt(data.depositStandardVnd, base.depositStandardVnd),
    depositNinePlusVnd: positiveInt(data.depositNinePlusVnd, base.depositNinePlusVnd),
    updatedAt: data.updatedAt != null ? String(data.updatedAt) : undefined,
    updatedBy: data.updatedBy != null ? String(data.updatedBy) : undefined,
  }
}

export function isNinePlusEducationLevel(educationLevel: string): boolean {
  return String(educationLevel || '')
    .toUpperCase()
    .includes('9+')
}

export function resolveDepositThresholdVnd(
  educationLevel: string,
  thresholds: FinanceDepositThresholds = defaultFinanceDepositThresholds(),
): number {
  return isNinePlusEducationLevel(educationLevel)
    ? thresholds.depositNinePlusVnd
    : thresholds.depositStandardVnd
}

export function resolveLpxtMinVnd(
  thresholds: FinanceDepositThresholds = defaultFinanceDepositThresholds(),
): number {
  return thresholds.lpxtMinVnd
}

let cache: FinanceDepositThresholds | null = null
let cacheOrgId: string | null = null

export function setFinanceThresholdsCache(
  orgId: string,
  next: FinanceDepositThresholds | null,
): void {
  cacheOrgId = orgId
  cache = next
}

export function getFinanceThresholdsCache(): {
  orgId: string | null
  thresholds: FinanceDepositThresholds | null
} {
  return { orgId: cacheOrgId, thresholds: cache }
}

/** Runtime: ưu tiên cache org đang active. */
export function activeFinanceDepositThresholds(expectedOrgId?: string): FinanceDepositThresholds {
  if (expectedOrgId && cacheOrgId && cacheOrgId !== expectedOrgId) {
    return defaultFinanceDepositThresholds()
  }
  return cache ?? defaultFinanceDepositThresholds()
}

export async function loadFinanceDepositThresholds(
  db: Firestore,
  orgId: string = DEFAULT_ORG_ID,
): Promise<FinanceDepositThresholds> {
  const id = orgId.trim() || DEFAULT_ORG_ID
  try {
    const snap = await getDoc(doc(db, ...orgSettingsDocSegments(id, FINANCE_THRESHOLDS_DOC_ID)))
    const parsed = parseFinanceDepositThresholds(
      snap.exists() ? (snap.data() as Record<string, unknown>) : undefined,
    )
    setFinanceThresholdsCache(id, parsed)
    return parsed
  } catch (e) {
    console.warn('[loadFinanceDepositThresholds]', id, e)
    const d = defaultFinanceDepositThresholds()
    setFinanceThresholdsCache(id, d)
    return d
  }
}

export async function saveFinanceDepositThresholds(
  db: Firestore,
  orgId: string,
  thresholds: FinanceDepositThresholds,
  updatedBy: string,
): Promise<FinanceDepositThresholds> {
  const id = orgId.trim() || DEFAULT_ORG_ID
  const parsed = parseFinanceDepositThresholds(thresholds as unknown as Record<string, unknown>)
  const payload: FinanceDepositThresholds = {
    ...parsed,
    updatedAt: new Date().toISOString(),
    updatedBy,
  }
  await setDoc(
    doc(db, ...orgSettingsDocSegments(id, FINANCE_THRESHOLDS_DOC_ID)),
    { ...payload, orgId: id, updatedAtServer: Timestamp.now() },
    { merge: true },
  )
  await setDoc(doc(db, FS_COLLECTIONS.orgSettings, id), { orgId: id, updatedAt: Timestamp.now() }, { merge: true })
  setFinanceThresholdsCache(id, payload)
  return payload
}
