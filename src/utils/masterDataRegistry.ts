import type {
  MasterCatalogDefinition,
  MasterCatalogValueKind,
  MasterDataEntry,
  MasterEntryMatchMode,
} from '../types'
import { DEFAULT_MASTER_CATALOGS, MASTER_DATA_REGISTRY_DOC_ID } from '../types'

/** Document legacy → bucket chuẩn (không hiển thị như một danh mục riêng). */
const LEGACY_MERGE_INTO: Record<string, string> = {
  partner_schools: 'high_schools',
  priority_regions: 'regions',
}

function norm(s: string): string {
  return s.trim().toLowerCase()
}

function entryFromLabel(label: string): MasterDataEntry {
  const n = norm(label)
  const id = n.replace(/\s+/g, '-').slice(0, 120)
  return { id: id || crypto.randomUUID(), label: label.trim() }
}

/**
 * Chuẩn hoá từng mục trước khi `setDoc` — Firestore không chấp nhận field có giá trị `undefined`.
 * (Dữ liệu đọc qua `parseEntriesFromDoc` vẫn có thể gán optional = undefined trong bộ nhớ.)
 */
export function masterDataEntriesForFirestore(entries: MasterDataEntry[]): Record<string, unknown>[] {
  return entries.map((e) => {
    const row: Record<string, unknown> = {
      id: e.id,
      label: e.label,
    }
    if (e.isActive === false) row.isActive = false
    if (Array.isArray(e.synonyms) && e.synonyms.length > 0) {
      row.synonyms = e.synonyms.map(String)
    }
    if (e.departmentId) row.departmentId = e.departmentId
    if (e.annualCapacity !== undefined && Number.isFinite(Number(e.annualCapacity))) {
      row.annualCapacity = Number(e.annualCapacity)
    }
    if (e.matchMode) row.matchMode = e.matchMode
    if (e.numericMin !== undefined && Number.isFinite(Number(e.numericMin))) {
      row.numericMin = Number(e.numericMin)
    }
    if (e.numericMax !== undefined && Number.isFinite(Number(e.numericMax))) {
      row.numericMax = Number(e.numericMax)
    }
    return row
  })
}

export function parseEntriesFromDoc(data: Record<string, unknown>): MasterDataEntry[] {
  const raw = data.entries
  if (Array.isArray(raw)) {
    return raw
      .map((x) => {
        if (x && typeof x === 'object' && 'label' in x) {
          const o = x as Record<string, unknown>
          const matchModeRaw = o.matchMode
          const matchMode =
            matchModeRaw === 'exact_norm' ||
            matchModeRaw === 'fuzzy_contains' ||
            matchModeRaw === 'gte' ||
            matchModeRaw === 'lte' ||
            matchModeRaw === 'between'
              ? (matchModeRaw as MasterEntryMatchMode)
              : undefined
          const numericMin = o.numericMin !== undefined ? Number(o.numericMin) : undefined
          const numericMax = o.numericMax !== undefined ? Number(o.numericMax) : undefined
          return {
            id: String(o.id ?? crypto.randomUUID()),
            label: String(o.label ?? ''),
            synonyms: Array.isArray(o.synonyms) ? o.synonyms.map(String) : undefined,
            matchMode,
            numericMin: Number.isFinite(numericMin) ? numericMin : undefined,
            numericMax: Number.isFinite(numericMax) ? numericMax : undefined,
            departmentId: o.departmentId ? String(o.departmentId) : undefined,
            annualCapacity: o.annualCapacity !== undefined ? Number(o.annualCapacity) : undefined,
            isActive: o.isActive !== false,
          } as MasterDataEntry
        }
        return null
      })
      .filter((x): x is MasterDataEntry => Boolean(x?.label))
  }
  const legacy = data.dataArray
  if (Array.isArray(legacy)) {
    return legacy.map((x) => entryFromLabel(String(x))).filter((e) => e.label)
  }
  return []
}

function dedupeEntries(list: MasterDataEntry[]): MasterDataEntry[] {
  const seen = new Set<string>()
  const out: MasterDataEntry[] = []
  for (const e of list) {
    const k = norm(e.label)
    if (!k || seen.has(k)) continue
    seen.add(k)
    out.push(e)
  }
  return out
}

export function isReservedCatalogSlug(slug: string): boolean {
  const s = slug.trim().toLowerCase()
  if (s === MASTER_DATA_REGISTRY_DOC_ID) return true
  if (LEGACY_MERGE_INTO[s]) return true
  return false
}

/** Slug an toàn cho id document Firestore (chữ thường, số, gạch dưới). */
export function normalizeCatalogSlug(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_')
    .slice(0, 64)
}

export function defaultLabelForCatalogId(id: string): string {
  const d = DEFAULT_MASTER_CATALOGS.find((c) => c.id === id)
  return d?.label ?? id.replace(/_/g, ' ')
}

export function parseCatalogsFromRegistryData(
  data: Record<string, unknown> | undefined,
): MasterCatalogDefinition[] | null {
  if (!data) return null
  const raw = data.catalogs
  if (!Array.isArray(raw) || raw.length === 0) return null
  const out: MasterCatalogDefinition[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const o = item as Record<string, unknown>
    const id = String(o.id ?? '').trim()
    const label = String(o.label ?? id).trim() || id
    const order = Number(o.order)
    if (!id || isReservedCatalogSlug(id)) continue
    if (!/^([a-z][a-z0-9_]{0,63})$/.test(id)) continue
    const vk = o.valueKind
    const valueKind: MasterCatalogValueKind | undefined =
      vk === 'number' || vk === 'text' ? vk : undefined
    const dm = o.defaultMatchMode
    const defaultMatchMode: MasterEntryMatchMode | undefined =
      dm === 'exact_norm' ||
      dm === 'fuzzy_contains' ||
      dm === 'gte' ||
      dm === 'lte' ||
      dm === 'between'
        ? dm
        : undefined
    out.push({
      id,
      label,
      order: Number.isFinite(order) ? order : out.length * 10,
      ...(valueKind ? { valueKind } : {}),
      ...(defaultMatchMode ? { defaultMatchMode } : {}),
    })
  }
  return out.length ? out.sort((a, b) => a.order - b.order || a.id.localeCompare(b.id)) : null
}

function synthesizeRegistry(bucketKeys: string[]): MasterCatalogDefinition[] {
  const defs: MasterCatalogDefinition[] = DEFAULT_MASTER_CATALOGS.map((c) => ({ ...c }))
  const seen = new Set(defs.map((d) => d.id))
  let order = 1000
  for (const id of [...bucketKeys].sort((a, b) => a.localeCompare(b))) {
    if (seen.has(id)) continue
    defs.push({ id, label: defaultLabelForCatalogId(id), order })
    order += 10
    seen.add(id)
  }
  return defs.sort((a, b) => a.order - b.order || a.id.localeCompare(b.id))
}

/**
 * Đọc toàn bộ snapshot `masterData` → danh sách catalog (thứ tự UI) + map mục theo id catalog.
 */
export function processMasterDataDocs(
  docs: Array<{ id: string; data: Record<string, unknown> }>,
): { catalogs: MasterCatalogDefinition[]; byKind: Record<string, MasterDataEntry[]> } {
  const buckets: Record<string, MasterDataEntry[]> = {}

  const push = (targetId: string, entries: MasterDataEntry[]) => {
    if (!buckets[targetId]) buckets[targetId] = []
    buckets[targetId].push(...entries)
  }

  for (const { id, data } of docs) {
    if (id === MASTER_DATA_REGISTRY_DOC_ID) continue
    const entries = parseEntriesFromDoc(data)
    const target = LEGACY_MERGE_INTO[id] ?? id
    push(target, entries)
  }

  for (const k of Object.keys(buckets)) {
    buckets[k] = dedupeEntries(buckets[k])
  }

  const registryDoc = docs.find((d) => d.id === MASTER_DATA_REGISTRY_DOC_ID)?.data
  const fromFirestore = parseCatalogsFromRegistryData(registryDoc)

  const bucketKeys = Object.keys(buckets)
  let catalogs: MasterCatalogDefinition[]

  if (fromFirestore?.length) {
    const known = new Set(fromFirestore.map((c) => c.id))
    const merged = [...fromFirestore]
    let nextOrder = merged.reduce((m, c) => Math.max(m, c.order), 0) + 10
    for (const id of bucketKeys.sort((a, b) => a.localeCompare(b))) {
      if (known.has(id)) continue
      merged.push({ id, label: defaultLabelForCatalogId(id), order: nextOrder })
      nextOrder += 10
      known.add(id)
    }
    catalogs = merged.sort((a, b) => a.order - b.order || a.id.localeCompare(b.id))
  } else {
    catalogs = synthesizeRegistry(bucketKeys)
  }

  for (const c of catalogs) {
    if (!buckets[c.id]) buckets[c.id] = []
  }

  return { catalogs, byKind: buckets }
}
