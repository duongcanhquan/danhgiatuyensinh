import { doc, getDoc, setDoc, Timestamp, type Firestore } from 'firebase/firestore'
import {
  DEFAULT_MASTER_CATALOGS,
  FS_COLLECTIONS,
  MASTER_DATA_REGISTRY_DOC_ID,
  type MasterCatalogDefinition,
  type MasterDataEntry,
} from '../types'
import {
  APPLICANT_CATEGORIES_CATALOG_ID,
  DEFAULT_APPLICANT_CATEGORY_ENTRIES,
} from './applicantCategoryCatalog'
import {
  masterDataEntriesForFirestore,
  parseCatalogsFromRegistryData,
  parseEntriesFromDoc,
} from './masterDataRegistry'

function seedEntriesForCatalog(catalogId: string): MasterDataEntry[] {
  if (catalogId === APPLICANT_CATEGORIES_CATALOG_ID) {
    return DEFAULT_APPLICANT_CATEGORY_ENTRIES.map((e) => ({ ...e }))
  }
  return []
}

/**
 * Đồng bộ catalog mặc định (đối tượng, cơ sở, niên khóa…) vào Firestore:
 * - tạo doc nếu thiếu / seed đối tượng nếu trống
 * - bổ sung `_registry` nếu thiếu id
 *
 * An toàn gọi nhiều lần (mở Cài đặt hồ sơ / cổng đăng ký).
 */
export async function ensureDefaultMasterCatalogDocs(db: Firestore): Promise<void> {
  for (const def of DEFAULT_MASTER_CATALOGS) {
    const catRef = doc(db, FS_COLLECTIONS.masterData, def.id)
    const catSnap = await getDoc(catRef)
    const existing = catSnap.exists()
      ? parseEntriesFromDoc(catSnap.data() as Record<string, unknown>)
      : []
    const needsSeed =
      !catSnap.exists() ||
      (def.id === APPLICANT_CATEGORIES_CATALOG_ID && existing.length === 0)
    if (!needsSeed) continue
    const entries = existing.length > 0 ? existing : seedEntriesForCatalog(def.id)
    await setDoc(
      catRef,
      {
        id: def.id,
        entries: masterDataEntriesForFirestore(entries),
        updatedAt: Timestamp.now(),
      },
      { merge: true },
    )
  }

  const regRef = doc(db, FS_COLLECTIONS.masterData, MASTER_DATA_REGISTRY_DOC_ID)
  const regSnap = await getDoc(regRef)
  const current =
    parseCatalogsFromRegistryData(
      regSnap.exists() ? (regSnap.data() as Record<string, unknown>) : undefined,
    ) ?? []
  const known = new Set(current.map((c) => c.id))
  const missing: MasterCatalogDefinition[] = DEFAULT_MASTER_CATALOGS.filter((d) => !known.has(d.id))
  if (missing.length === 0) return

  let nextOrder = current.reduce((m, c) => Math.max(m, c.order), 0) + 10
  const catalogs = [
    ...current,
    ...missing.map((d) => {
      const row = { ...d, order: current.length ? nextOrder : d.order }
      nextOrder += 10
      return row
    }),
  ].sort((a, b) => a.order - b.order || a.id.localeCompare(b.id))

  await setDoc(
    regRef,
    {
      catalogs: catalogs.map((c) => ({
        id: c.id,
        label: c.label,
        order: c.order,
        ...(c.ruleCategory ? { ruleCategory: c.ruleCategory } : {}),
        ...(c.valueKind ? { valueKind: c.valueKind } : {}),
        ...(c.defaultMatchMode ? { defaultMatchMode: c.defaultMatchMode } : {}),
      })),
      updatedAt: Timestamp.now(),
    },
    { merge: true },
  )
}

/** @deprecated Dùng `ensureDefaultMasterCatalogDocs` — giữ alias để không gãy import cũ. */
export async function ensureApplicantCategoriesCatalog(db: Firestore): Promise<void> {
  await ensureDefaultMasterCatalogDocs(db)
}
