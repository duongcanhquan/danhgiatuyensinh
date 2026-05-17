import { collection, doc, setDoc, Timestamp, writeBatch, type Firestore } from 'firebase/firestore'
import { FS_COLLECTIONS } from '../types'
import { DEFAULT_LEAD_SOURCE_LABELS, DEFAULT_SCHOLARSHIP_SEEDS } from './leadProfileCatalogDefaults'

export async function seedDefaultLeadSources(db: Firestore): Promise<number> {
  const batch = writeBatch(db)
  let n = 0
  DEFAULT_LEAD_SOURCE_LABELS.forEach((label, i) => {
    const ref = doc(collection(db, FS_COLLECTIONS.leadSources))
    batch.set(ref, {
      label,
      sortOrder: (i + 1) * 10,
      isActive: true,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    })
    n++
  })
  await batch.commit()
  return n
}

export async function seedDefaultScholarships(db: Firestore): Promise<number> {
  const batch = writeBatch(db)
  let n = 0
  DEFAULT_SCHOLARSHIP_SEEDS.forEach((row, i) => {
    const ref = doc(collection(db, FS_COLLECTIONS.scholarships))
    batch.set(ref, {
      label: row.label,
      category: row.category,
      amountVnd: row.amountVnd,
      sortOrder: (i + 1) * 10,
      isActive: true,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    })
    n++
  })
  await batch.commit()
  return n
}

export async function saveLeadSourceRow(
  db: Firestore,
  id: string | null,
  payload: { label: string; sortOrder: number; isActive: boolean },
): Promise<string> {
  const ref = id ? doc(db, FS_COLLECTIONS.leadSources, id) : doc(collection(db, FS_COLLECTIONS.leadSources))
  const now = Timestamp.now()
  await setDoc(
    ref,
    {
      label: payload.label.trim(),
      sortOrder: payload.sortOrder,
      isActive: payload.isActive,
      updatedAt: now,
      ...(id ? {} : { createdAt: now }),
    },
    { merge: true },
  )
  return ref.id
}

export async function saveScholarshipRow(
  db: Firestore,
  id: string | null,
  payload: {
    label: string
    category: 'phcd' | 'cdcq'
    amountVnd: number
    sortOrder: number
    isActive: boolean
  },
): Promise<string> {
  const ref = id ? doc(db, FS_COLLECTIONS.scholarships, id) : doc(collection(db, FS_COLLECTIONS.scholarships))
  const now = Timestamp.now()
  await setDoc(
    ref,
    {
      label: payload.label.trim(),
      category: payload.category,
      amountVnd: Math.max(0, payload.amountVnd),
      sortOrder: payload.sortOrder,
      isActive: payload.isActive,
      updatedAt: now,
      ...(id ? {} : { createdAt: now }),
    },
    { merge: true },
  )
  return ref.id
}
