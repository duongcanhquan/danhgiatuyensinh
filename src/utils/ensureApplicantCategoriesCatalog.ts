import { doc, getDoc, setDoc, Timestamp, type Firestore } from 'firebase/firestore'
import { FS_COLLECTIONS, MASTER_DATA_REGISTRY_DOC_ID, type MasterCatalogDefinition } from '../types'
import {
  APPLICANT_CATEGORIES_CATALOG_ID,
  DEFAULT_APPLICANT_CATEGORY_ENTRIES,
} from './applicantCategoryCatalog'
import {
  masterDataEntriesForFirestore,
  parseCatalogsFromRegistryData,
  parseEntriesFromDoc,
} from './masterDataRegistry'

const CATALOG_DEF: MasterCatalogDefinition = {
  id: APPLICANT_CATEGORIES_CATALOG_ID,
  label: 'Đối tượng dự tuyển',
  order: 45,
  ruleCategory: 'academic',
}

/**
 * Đảm bảo danh mục đối tượng dự tuyển tồn tại (seed nếu trống) và có trong `_registry`.
 * Gọi khi admin mở tab hồ sơ / cổng đăng ký — an toàn gọi nhiều lần.
 */
export async function ensureApplicantCategoriesCatalog(db: Firestore): Promise<void> {
  const catRef = doc(db, FS_COLLECTIONS.masterData, APPLICANT_CATEGORIES_CATALOG_ID)
  const catSnap = await getDoc(catRef)
  const existing = catSnap.exists()
    ? parseEntriesFromDoc(catSnap.data() as Record<string, unknown>)
    : []
  if (existing.length === 0) {
    await setDoc(
      catRef,
      {
        id: APPLICANT_CATEGORIES_CATALOG_ID,
        entries: masterDataEntriesForFirestore([...DEFAULT_APPLICANT_CATEGORY_ENTRIES]),
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
  if (current.some((c) => c.id === APPLICANT_CATEGORIES_CATALOG_ID)) return

  const nextOrder = current.reduce((m, c) => Math.max(m, c.order), 0) + 10
  const catalogs = [
    ...current,
    { ...CATALOG_DEF, order: current.length ? nextOrder : CATALOG_DEF.order },
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
