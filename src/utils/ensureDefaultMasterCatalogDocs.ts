import { doc, getDoc, setDoc, Timestamp, type Firestore } from 'firebase/firestore'
import {
  DEFAULT_MASTER_CATALOGS,
  FS_COLLECTIONS,
  MASTER_DATA_REGISTRY_DOC_ID,
  type MasterCatalogDefinition,
} from '../types'
import { seedEntriesForMasterCatalog, shouldSeedEmptyMasterCatalog } from './masterCatalogSeed'
import {
  masterDataEntriesForFirestore,
  parseCatalogsFromRegistryData,
  parseEntriesFromDoc,
} from './masterDataRegistry'

/**
 * Đồng bộ mọi catalog trong `DEFAULT_MASTER_CATALOGS` lên Firestore:
 * - tạo doc nếu thiếu
 * - seed đối tượng dự tuyển nếu doc trống
 * - bổ sung `_registry` nếu thiếu id
 *
 * Gọi khi mở Cài đặt → Hồ sơ / Cổng đăng ký (idempotent).
 */
export async function ensureDefaultMasterCatalogDocs(db: Firestore): Promise<void> {
  for (const def of DEFAULT_MASTER_CATALOGS) {
    const catRef = doc(db, FS_COLLECTIONS.masterData, def.id)
    const catSnap = await getDoc(catRef)
    const existing = catSnap.exists()
      ? parseEntriesFromDoc(catSnap.data() as Record<string, unknown>)
      : []
    const needsWrite = !catSnap.exists() || shouldSeedEmptyMasterCatalog(def.id, existing.length)
    if (!needsWrite) continue
    const entries = existing.length > 0 ? existing : seedEntriesForMasterCatalog(def.id)
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
