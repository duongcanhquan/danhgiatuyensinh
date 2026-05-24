import { collection, doc, setDoc, Timestamp, writeBatch, type Firestore } from 'firebase/firestore'
import type {
  ScholarshipApplySlot,
  ScholarshipAudienceTag,
  ScholarshipCategoryId,
} from '../types'
import { FS_COLLECTIONS } from '../types'
import {
  DEFAULT_LEAD_SOURCE_LABELS,
  DEFAULT_SCHOLARSHIP_SEEDS,
  scholarshipStableDocId,
  type DefaultScholarshipSeed,
} from './leadProfileCatalogDefaults'

export type ScholarshipSavePayload = {
  label: string
  category: ScholarshipCategoryId
  amountVnd: number
  sortOrder: number
  isActive: boolean
  validFrom?: string
  validTo?: string
  applySlots?: ScholarshipApplySlot[]
  audienceTags?: ScholarshipAudienceTag[]
  targetAudience?: string
  eligibilityNotes?: string
  adminNotes?: string
  applicationMethod?: string
  quantityLimit?: number
}

function seedToPayload(row: DefaultScholarshipSeed, sortOrder: number): ScholarshipSavePayload {
  return {
    label: row.label,
    category: row.category,
    amountVnd: row.amountVnd,
    sortOrder: row.sortOrder ?? sortOrder,
    isActive: true,
    validFrom: row.validFrom,
    validTo: row.validTo,
    applySlots: row.applySlots ?? ['slot1', 'slot2'],
    audienceTags: row.audienceTags,
    targetAudience: row.targetAudience,
    applicationMethod: row.applicationMethod,
    quantityLimit: row.quantityLimit,
  }
}

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

/** Thêm bản ghi mới (không ghi đè). */
export async function seedDefaultScholarships(db: Firestore): Promise<number> {
  const batch = writeBatch(db)
  let n = 0
  DEFAULT_SCHOLARSHIP_SEEDS.forEach((row, i) => {
    const ref = doc(collection(db, FS_COLLECTIONS.scholarships))
    const payload = seedToPayload(row, (i + 1) * 10)
    batch.set(ref, {
      ...payload,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    })
    n++
  })
  await batch.commit()
  return n
}

/** Đồng bộ / thay thế theo bảng chuẩn — cập nhật doc cố định theo mã hệ + tên. */
export async function syncDefaultScholarships(db: Firestore): Promise<number> {
  const now = Timestamp.now()
  let n = 0
  for (const row of DEFAULT_SCHOLARSHIP_SEEDS) {
    const id = scholarshipStableDocId(row.category, row.label)
    const payload = seedToPayload(row, row.sortOrder ?? (n + 1) * 10)
    const ref = doc(db, FS_COLLECTIONS.scholarships, id)
    await setDoc(
      ref,
      {
        ...payload,
        updatedAt: now,
        createdAt: now,
      },
      { merge: true },
    )
    n++
  }
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
  payload: ScholarshipSavePayload,
): Promise<string> {
  const ref = id ? doc(db, FS_COLLECTIONS.scholarships, id) : doc(collection(db, FS_COLLECTIONS.scholarships))
  const now = Timestamp.now()
  const body: Record<string, unknown> = {
    label: payload.label.trim(),
    category: payload.category,
    amountVnd: Math.max(0, payload.amountVnd),
    sortOrder: payload.sortOrder,
    isActive: payload.isActive,
    updatedAt: now,
    ...(id ? {} : { createdAt: now }),
  }
  const optionalStrings = ['validFrom', 'validTo', 'targetAudience', 'eligibilityNotes', 'adminNotes', 'applicationMethod'] as const
  for (const key of optionalStrings) {
    const v = payload[key]?.trim()
    if (v) body[key] = v
    else if (id) body[key] = null
  }
  if (payload.quantityLimit != null && payload.quantityLimit >= 0) body.quantityLimit = payload.quantityLimit
  else if (id) body.quantityLimit = null
  if (payload.applySlots?.length) body.applySlots = payload.applySlots
  else if (id) body.applySlots = null
  if (payload.audienceTags?.length) body.audienceTags = payload.audienceTags
  else if (id) body.audienceTags = null
  await setDoc(ref, body, { merge: true })
  return ref.id
}
