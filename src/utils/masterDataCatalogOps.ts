import { doc, getDoc, setDoc, Timestamp, type Firestore } from 'firebase/firestore'
import type { MasterDataEntry } from '../types'
import { FS_COLLECTIONS } from '../types'
import { masterDataEntriesForFirestore } from './masterDataRegistry'

function normalizeLabel(label: string): string {
  return label.trim().toLowerCase()
}

export function activeMasterEntries(entries: readonly MasterDataEntry[] | undefined): MasterDataEntry[] {
  return (entries ?? []).filter((e) => e.isActive !== false)
}

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

export function majorsForTrainingProgram(
  majors: readonly MasterDataEntry[] | undefined,
  trainingProgramId: string | null,
): MasterDataEntry[] {
  const active = activeMasterEntries(majors)
  if (!trainingProgramId) return active
  return active.filter((m) => !m.departmentId || m.departmentId === trainingProgramId)
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
