/**
 * Bảng học phí kỳ 1 theo ngành — orgSettings/{orgId}/settings/financeTuitionCatalog
 */
import { doc, getDoc, setDoc, Timestamp, type Firestore } from 'firebase/firestore'
import { FS_COLLECTIONS } from '../types'
import { orgSettingsDocSegments } from '../tenancy/orgSettingsPaths'
import { DEFAULT_ORG_ID } from '../tenancy/orgConstants'

export const FINANCE_TUITION_CATALOG_DOC_ID = 'financeTuitionCatalog' as const

export type MajorTuitionRow = {
  id: string
  /** Khớp `lead.majorInterest` (không phân biệt hoa thường, trim). */
  majorLabel: string
  /** Tuỳ chọn — nếu có thì chỉ khớp khi cùng hệ đào tạo. */
  educationLevel?: string
  tuitionTerm1Vnd: number
  isActive?: boolean
}

export type FinanceTuitionCatalog = {
  rows: MajorTuitionRow[]
  updatedAt?: string
  updatedBy?: string
}

export function defaultFinanceTuitionCatalog(): FinanceTuitionCatalog {
  return { rows: [] }
}

function positiveInt(v: unknown, fallback = 0): number {
  const n = typeof v === 'number' ? v : Number(v)
  if (!Number.isFinite(n) || n < 0) return fallback
  return Math.round(n)
}

function foldLabel(s: string): string {
  return String(s || '')
    .normalize('NFC')
    .trim()
    .toLowerCase()
}

export function parseFinanceTuitionCatalog(
  data: Record<string, unknown> | undefined,
): FinanceTuitionCatalog {
  if (!data) return defaultFinanceTuitionCatalog()
  const raw = Array.isArray(data.rows) ? data.rows : []
  const rows: MajorTuitionRow[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const o = item as Record<string, unknown>
    const majorLabel = String(o.majorLabel ?? '').trim()
    if (!majorLabel) continue
    const id = String(o.id ?? '').trim() || `row_${rows.length + 1}`
    rows.push({
      id,
      majorLabel,
      educationLevel: String(o.educationLevel ?? '').trim() || undefined,
      tuitionTerm1Vnd: positiveInt(o.tuitionTerm1Vnd, 0),
      isActive: o.isActive === false ? false : true,
    })
  }
  return {
    rows,
    updatedAt: data.updatedAt != null ? String(data.updatedAt) : undefined,
    updatedBy: data.updatedBy != null ? String(data.updatedBy) : undefined,
  }
}

/** Ưu tiên khớp ngành + hệ; không có hệ trên dòng giá → khớp mọi hệ cùng ngành. */
export function resolveTuitionTerm1FromCatalog(
  majorInterest: string | undefined,
  educationLevel: string | undefined,
  catalog: FinanceTuitionCatalog,
): { tuitionTerm1Vnd: number; row: MajorTuitionRow | null; missing: boolean } {
  const major = foldLabel(majorInterest || '')
  if (!major) return { tuitionTerm1Vnd: 0, row: null, missing: true }
  const edu = foldLabel(educationLevel || '')
  const active = catalog.rows.filter((r) => r.isActive !== false)
  const withEdu = edu
    ? active.find((r) => foldLabel(r.majorLabel) === major && foldLabel(r.educationLevel || '') === edu)
    : undefined
  if (withEdu) return { tuitionTerm1Vnd: withEdu.tuitionTerm1Vnd, row: withEdu, missing: false }
  const anyMajor = active.find(
    (r) => foldLabel(r.majorLabel) === major && !String(r.educationLevel || '').trim(),
  )
  if (anyMajor) return { tuitionTerm1Vnd: anyMajor.tuitionTerm1Vnd, row: anyMajor, missing: false }
  const loose = active.find((r) => foldLabel(r.majorLabel) === major)
  if (loose) return { tuitionTerm1Vnd: loose.tuitionTerm1Vnd, row: loose, missing: false }
  return { tuitionTerm1Vnd: 0, row: null, missing: true }
}

let cache: FinanceTuitionCatalog | null = null
let cacheOrgId: string | null = null

export function setFinanceTuitionCatalogCache(
  orgId: string,
  next: FinanceTuitionCatalog | null,
): void {
  cacheOrgId = orgId
  cache = next
}

export function activeFinanceTuitionCatalog(expectedOrgId?: string): FinanceTuitionCatalog {
  if (expectedOrgId && cacheOrgId && cacheOrgId !== expectedOrgId) {
    return defaultFinanceTuitionCatalog()
  }
  return cache ?? defaultFinanceTuitionCatalog()
}

export async function loadFinanceTuitionCatalog(
  db: Firestore,
  orgId: string = DEFAULT_ORG_ID,
): Promise<FinanceTuitionCatalog> {
  const id = orgId.trim() || DEFAULT_ORG_ID
  try {
    const snap = await getDoc(doc(db, ...orgSettingsDocSegments(id, FINANCE_TUITION_CATALOG_DOC_ID)))
    const parsed = parseFinanceTuitionCatalog(
      snap.exists() ? (snap.data() as Record<string, unknown>) : undefined,
    )
    setFinanceTuitionCatalogCache(id, parsed)
    return parsed
  } catch (e) {
    console.warn('[loadFinanceTuitionCatalog]', id, e)
    const d = defaultFinanceTuitionCatalog()
    setFinanceTuitionCatalogCache(id, d)
    return d
  }
}

export async function saveFinanceTuitionCatalog(
  db: Firestore,
  orgId: string,
  catalog: FinanceTuitionCatalog,
  updatedBy: string,
): Promise<FinanceTuitionCatalog> {
  const id = orgId.trim() || DEFAULT_ORG_ID
  const parsed = parseFinanceTuitionCatalog(catalog as unknown as Record<string, unknown>)
  const payload: FinanceTuitionCatalog = {
    ...parsed,
    updatedAt: new Date().toISOString(),
    updatedBy,
  }
  await setDoc(
    doc(db, ...orgSettingsDocSegments(id, FINANCE_TUITION_CATALOG_DOC_ID)),
    { ...payload, orgId: id, updatedAtServer: Timestamp.now() },
    { merge: true },
  )
  await setDoc(doc(db, FS_COLLECTIONS.orgSettings, id), { orgId: id, updatedAt: Timestamp.now() }, { merge: true })
  setFinanceTuitionCatalogCache(id, payload)
  return payload
}
