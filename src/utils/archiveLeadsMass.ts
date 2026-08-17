import {
  Timestamp,
  collection,
  doc,
  getCountFromServer,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  startAfter,
  where,
  writeBatch,
  type DocumentData,
  type Firestore,
  type Query,
  type QueryDocumentSnapshot,
} from 'firebase/firestore'
import { FS_COLLECTIONS } from '../types'
import {
  LEAD_ARCHIVE_EXPORT_MAX,
  LEAD_ARCHIVE_PAGE_SIZE,
  LEAD_ARCHIVE_QUERY_PAGE,
  LEAD_ARCHIVE_WRITE_CHUNK,
  assertArchiveScope,
  archiveScopeLabel,
  leadFieldMillis,
  leadMatchesArchiveScope,
  resolveArchiveUploadedRange,
  stripArchiveMetadata,
  type LeadArchiveScope,
} from './leadArchive'

export type ArchiveQueryDateField = 'uploadedAt' | 'createdAt' | 'updatedAt'

function newBatchId(): string {
  return `arc_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

export function resolveArchiveQueryDateField(
  scope: LeadArchiveScope,
  override?: ArchiveQueryDateField,
): ArchiveQueryDateField {
  if (override) return override
  return resolveArchiveUploadedRange(scope) ? 'uploadedAt' : 'updatedAt'
}

export function buildLiveLeadsArchiveQuery(
  db: Firestore,
  orgId: string,
  scope: LeadArchiveScope,
  pageSize = LEAD_ARCHIVE_QUERY_PAGE,
  after?: QueryDocumentSnapshot<DocumentData>,
  dateField: ArchiveQueryDateField = 'updatedAt',
): Query<DocumentData> {
  const col = collection(db, FS_COLLECTIONS.leads)
  const constraints: Parameters<typeof query>[1][] = [where('orgId', '==', orgId)]
  const program = String(scope.intakeProgram ?? '').trim()
  const source = String(scope.source ?? '').trim()
  if (program) constraints.push(where('intakeProgram', '==', program))
  else if (source) constraints.push(where('source', '==', source))

  const range = resolveArchiveUploadedRange(scope)
  if (range && (dateField === 'uploadedAt' || dateField === 'createdAt')) {
    constraints.push(where(dateField, '>=', Timestamp.fromDate(range.start)))
    constraints.push(where(dateField, '<', Timestamp.fromDate(range.endExclusive)))
    constraints.push(orderBy(dateField, 'asc'))
  } else {
    constraints.push(orderBy('updatedAt', 'desc'))
  }
  if (after) constraints.push(startAfter(after))
  constraints.push(limit(pageSize))
  return query(col, ...constraints)
}

export async function countLeadsMatchingArchiveScope(
  db: Firestore,
  orgId: string,
  scope: LeadArchiveScope,
): Promise<number> {
  const err = assertArchiveScope(scope)
  if (err) throw new Error(err)
  const ids = [...new Set((scope.ids ?? []).map((id) => id.trim()).filter(Boolean))]
  if (ids.length) return ids.length
  const col = collection(db, FS_COLLECTIONS.leads)
  const constraints: Parameters<typeof query>[1][] = [where('orgId', '==', orgId)]
  const program = String(scope.intakeProgram ?? '').trim()
  const source = String(scope.source ?? '').trim()
  if (program) constraints.push(where('intakeProgram', '==', program))
  else if (source) constraints.push(where('source', '==', source))
  const range = resolveArchiveUploadedRange(scope)
  if (range) {
    constraints.push(where('uploadedAt', '>=', Timestamp.fromDate(range.start)))
    constraints.push(where('uploadedAt', '<', Timestamp.fromDate(range.endExclusive)))
  }
  const snap = await getCountFromServer(query(col, ...constraints))
  return snap.data().count
}

async function archiveLeadIds(
  db: Firestore,
  leadIds: string[],
  meta: {
    orgId: string
    uid: string
    label: string
    batchId: string
    scopeKind: string
    scopeValue: string
  },
  onProgress?: (done: number, total: number) => void,
): Promise<number> {
  const ids = [...new Set(leadIds.map((id) => id.trim()).filter(Boolean))]
  let done = 0
  for (let i = 0; i < ids.length; i += LEAD_ARCHIVE_WRITE_CHUNK) {
    const slice = ids.slice(i, i + LEAD_ARCHIVE_WRITE_CHUNK)
    const snaps = await Promise.all(slice.map((id) => getDoc(doc(db, FS_COLLECTIONS.leads, id))))
    const batch = writeBatch(db)
    let ops = 0
    for (const snap of snaps) {
      if (!snap.exists()) continue
      const data = snap.data() as Record<string, unknown>
      if (!leadMatchesArchiveScope(data, meta.orgId, { ids: [snap.id] })) continue
      const org = String(data.orgId ?? '').trim() || meta.orgId
      batch.set(doc(db, FS_COLLECTIONS.leadsArchive, snap.id), {
        ...data,
        orgId: org,
        lifecycle: 'archived',
        archivedAt: Timestamp.now(),
        archivedBy: meta.uid,
        archiveLabel: meta.label,
        archiveBatchId: meta.batchId,
        archiveScopeKind: meta.scopeKind,
        archiveScopeValue: meta.scopeValue,
      })
      batch.delete(doc(db, FS_COLLECTIONS.leads, snap.id))
      ops += 2
    }
    if (ops) await batch.commit()
    done += ops / 2
    onProgress?.(done, ids.length)
  }
  return done
}

/**
 * Cất hồ sơ khỏi `leads` → `leads_archive` (lô nhỏ, không quét cả kho).
 * Gọi lặp đến khi `hasMore === false`.
 */
export async function archiveLeadsMass(
  db: Firestore,
  orgId: string,
  uid: string,
  scope: LeadArchiveScope,
  opts?: {
    onProgress?: (done: number, totalHint: number) => void
    batchId?: string
    after?: QueryDocumentSnapshot<DocumentData>
    dateField?: ArchiveQueryDateField
  },
): Promise<{
  archived: number
  hasMore: boolean
  batchId: string
  label: string
  after?: QueryDocumentSnapshot<DocumentData>
  dateField: ArchiveQueryDateField
}> {
  const scopeErr = assertArchiveScope(scope)
  if (scopeErr) throw new Error(scopeErr)
  const label = archiveScopeLabel(scope)
  const batchId = opts?.batchId ?? newBatchId()
  const ids = [...new Set((scope.ids ?? []).map((id) => id.trim()).filter(Boolean))]
  const range = resolveArchiveUploadedRange(scope)
  const dateField = resolveArchiveQueryDateField(scope, opts?.dateField)
  const meta = {
    orgId,
    uid,
    label,
    batchId,
    scopeKind: ids.length ? 'ids' : scope.year ? 'year' : scope.intakeProgram ? 'intakeProgram' : scope.source ? 'source' : 'uploadedRange',
    scopeValue: ids.length ? String(ids.length) : String(scope.year ?? scope.intakeProgram ?? scope.source ?? label),
  }

  if (ids.length) {
    const archived = await archiveLeadIds(db, ids, meta, opts?.onProgress)
    return { archived, hasMore: false, batchId, label, dateField }
  }

  let after = opts?.after
  const maxPages = 12
  for (let page = 0; page < maxPages; page += 1) {
    const snap = await getDocs(
      buildLiveLeadsArchiveQuery(db, orgId, scope, LEAD_ARCHIVE_QUERY_PAGE, after, dateField),
    )
    if (!snap.docs.length) {
      if (dateField === 'uploadedAt' && range) {
        return { archived: 0, hasMore: true, batchId, label, dateField: 'createdAt' }
      }
      return { archived: 0, hasMore: false, batchId, label, dateField }
    }
    const last = snap.docs[snap.docs.length - 1]
    after = last
    const pageIds = snap.docs
      .filter((d) => {
        const data = d.data() as Record<string, unknown>
        if (!leadMatchesArchiveScope(data, orgId, scope)) return false
        if (dateField === 'createdAt' && leadFieldMillis(data.uploadedAt) != null) return false
        return true
      })
      .map((d) => d.id)
    const moreThisField = snap.docs.length >= LEAD_ARCHIVE_QUERY_PAGE
    if (pageIds.length) {
      const archived = await archiveLeadIds(db, pageIds, meta, opts?.onProgress)
      if (moreThisField) {
        return { archived, hasMore: true, batchId, label, after: last, dateField }
      }
      if (dateField === 'uploadedAt' && range) {
        return { archived, hasMore: true, batchId, label, dateField: 'createdAt' }
      }
      return { archived, hasMore: false, batchId, label, dateField }
    }
    if (!moreThisField) {
      if (dateField === 'uploadedAt' && range) {
        return { archived: 0, hasMore: true, batchId, label, dateField: 'createdAt' }
      }
      return { archived: 0, hasMore: false, batchId, label, dateField }
    }
  }
  return { archived: 0, hasMore: true, batchId, label, after, dateField }
}

export async function restoreArchivedLeads(
  db: Firestore,
  archiveIds: string[],
  opts?: { onProgress?: (done: number, total: number) => void },
): Promise<{ restored: number; skipped: number }> {
  const ids = [...new Set(archiveIds.map((id) => id.trim()).filter(Boolean))]
  let restored = 0
  let skipped = 0
  for (let i = 0; i < ids.length; i += LEAD_ARCHIVE_WRITE_CHUNK) {
    const slice = ids.slice(i, i + LEAD_ARCHIVE_WRITE_CHUNK)
    const snaps = await Promise.all(slice.map((id) => getDoc(doc(db, FS_COLLECTIONS.leadsArchive, id))))
    const liveSnaps = await Promise.all(slice.map((id) => getDoc(doc(db, FS_COLLECTIONS.leads, id))))
    const liveById = new Map(liveSnaps.map((s) => [s.id, s]))
    const batch = writeBatch(db)
    let ops = 0
    for (const snap of snaps) {
      if (!snap.exists()) {
        skipped += 1
        continue
      }
      if (liveById.get(snap.id)?.exists()) {
        skipped += 1
        continue
      }
      const restoredDoc = stripArchiveMetadata(snap.data() as Record<string, unknown>)
      batch.set(doc(db, FS_COLLECTIONS.leads, snap.id), {
        ...restoredDoc,
        lifecycle: 'active',
        restoredAt: Timestamp.now(),
      })
      batch.delete(doc(db, FS_COLLECTIONS.leadsArchive, snap.id))
      ops += 2
      restored += 1
    }
    if (ops) await batch.commit()
    opts?.onProgress?.(restored + skipped, ids.length)
  }
  return { restored, skipped }
}

export function buildArchiveListQuery(
  db: Firestore,
  orgId: string,
  after?: QueryDocumentSnapshot<DocumentData>,
  pageSize = LEAD_ARCHIVE_PAGE_SIZE,
): Query<DocumentData> {
  const col = collection(db, FS_COLLECTIONS.leadsArchive)
  const parts: Parameters<typeof query>[1][] = [
    where('orgId', '==', orgId),
    orderBy('archivedAt', 'desc'),
    limit(pageSize),
  ]
  if (after) parts.splice(2, 0, startAfter(after))
  return query(col, ...parts)
}

export async function loadArchivedLeadsPage(
  db: Firestore,
  orgId: string,
  after?: QueryDocumentSnapshot<DocumentData>,
): Promise<{ docs: QueryDocumentSnapshot<DocumentData>[] }> {
  const snap = await getDocs(buildArchiveListQuery(db, orgId, after))
  return { docs: snap.docs }
}

export async function loadArchivedLeadsForExport(
  db: Firestore,
  orgId: string,
  max = LEAD_ARCHIVE_EXPORT_MAX,
): Promise<{ docs: QueryDocumentSnapshot<DocumentData>[]; truncated: boolean }> {
  const acc: QueryDocumentSnapshot<DocumentData>[] = []
  let after: QueryDocumentSnapshot<DocumentData> | undefined
  while (acc.length < max) {
    const snap = await getDocs(buildArchiveListQuery(db, orgId, after, Math.min(LEAD_ARCHIVE_QUERY_PAGE, max - acc.length)))
    if (!snap.docs.length) return { docs: acc, truncated: false }
    acc.push(...snap.docs)
    after = snap.docs[snap.docs.length - 1]
    if (snap.docs.length < LEAD_ARCHIVE_QUERY_PAGE) return { docs: acc, truncated: false }
  }
  return { docs: acc, truncated: true }
}
