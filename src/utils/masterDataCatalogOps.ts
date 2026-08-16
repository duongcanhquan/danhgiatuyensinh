import { doc, getDoc, setDoc, Timestamp, type Firestore } from 'firebase/firestore'
import type { MasterDataEntry } from '../types'
import { FS_COLLECTIONS } from '../types'
import { masterDataEntriesForFirestore } from './masterDataRegistry'

function normalizeLabel(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .replace(/[đĐ]/g, 'd')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/\s+/g, ' ')
}

export function activeMasterEntries(entries: readonly MasterDataEntry[] | undefined): MasterDataEntry[] {
  return (entries ?? []).filter((e) => e.isActive !== false)
}

/** Khớp nhãn (không phân biệt hoa thường / dấu). */
export function findMasterEntryByLabel(
  entries: readonly MasterDataEntry[],
  label: string,
): MasterDataEntry | undefined {
  const n = normalizeLabel(label)
  if (!n) return undefined
  return entries.find((e) => normalizeLabel(e.label) === n)
}

export async function upsertMasterEntryByLabel(
  db: Firestore,
  catalogId: string,
  label: string,
  extra?: Partial<MasterDataEntry>,
): Promise<MasterDataEntry> {
  const trimmed = label.trim()
  if (!trimmed) throw new Error('Nhãn danh mục không được để trống.')

  const ref = doc(db, FS_COLLECTIONS.masterData, catalogId)
  const snap = await getDoc(ref)
  const raw = snap.exists() ? snap.data().entries : []
  const entries: MasterDataEntry[] = Array.isArray(raw) ? (raw as MasterDataEntry[]) : []

  const existing = findMasterEntryByLabel(entries, trimmed)
  if (existing) return existing

  const newEntry: MasterDataEntry = {
    id: crypto.randomUUID(),
    label: trimmed,
    isActive: true,
    ...extra,
  }
  const next = [...entries, newEntry]
  await setDoc(
    ref,
    {
      id: catalogId,
      entries: masterDataEntriesForFirestore(next),
      updatedAt: Timestamp.now(),
    },
    { merge: true },
  )
  return newEntry
}

export function labelsFromEntries(entries: readonly MasterDataEntry[] | undefined): string[] {
  return activeMasterEntries(entries)
    .map((e) => e.label)
    .sort((a, b) => a.localeCompare(b, 'vi'))
}

/** Id hệ gắn với chuyên ngành (gộp `departmentIds` + legacy `departmentId`). */
export function majorLinkedProgramIds(
  entry: Pick<MasterDataEntry, 'departmentId' | 'departmentIds'> | null | undefined,
): string[] {
  if (!entry) return []
  const out: string[] = []
  const seen = new Set<string>()
  for (const raw of [...(entry.departmentIds ?? []), entry.departmentId]) {
    const id = String(raw ?? '').trim()
    if (!id || seen.has(id)) continue
    seen.add(id)
    out.push(id)
  }
  return out
}

export function majorBelongsToTrainingProgram(
  entry: Pick<MasterDataEntry, 'departmentId' | 'departmentIds'>,
  trainingProgramId: string | null | undefined,
): boolean {
  const want = String(trainingProgramId ?? '').trim()
  if (!want) return true
  const linked = majorLinkedProgramIds(entry)
  if (linked.length === 0) return true
  return linked.includes(want)
}

export function majorsForTrainingProgram(
  majors: readonly MasterDataEntry[] | undefined,
  trainingProgramId: string | null,
): MasterDataEntry[] {
  const active = activeMasterEntries(majors)
  if (!trainingProgramId) return active
  return active.filter((m) => majorBelongsToTrainingProgram(m, trainingProgramId))
}

/** Ghi patch khi admin chọn nhiều hệ cho ngành. */
export function patchMajorTrainingPrograms(programIds: readonly string[]): Pick<
  MasterDataEntry,
  'departmentId' | 'departmentIds'
> {
  const ids = [...new Set(programIds.map((x) => String(x).trim()).filter(Boolean))]
  if (ids.length === 0) {
    return { departmentId: undefined, departmentIds: undefined }
  }
  return { departmentIds: ids, departmentId: ids[0] }
}

export function resolveTrainingProgramId(
  programs: readonly MasterDataEntry[] | undefined,
  educationLevelLabel: string,
): string | null {
  const n = normalizeLabel(educationLevelLabel)
  if (!n) return null
  const hit = (programs ?? []).find(
    (p) => normalizeLabel(p.label) === n || p.id === educationLevelLabel.trim(),
  )
  return hit?.id ?? null
}
