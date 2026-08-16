import { collection, deleteField, doc, setDoc, Timestamp, writeBatch, type Firestore } from 'firebase/firestore'
import type {
  LeadWorkMode,
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
  /** Bắt buộc khi tạo mới — query danh mục theo trường. */
  orgId?: string
  /** Liên kết `training_programs` (nhiều hệ) — quyết định số kỳ & lọc trên hồ sơ. */
  trainingProgramIds?: string[]
  /** Legacy / phần tử đầu của `trainingProgramIds`. */
  trainingProgramId?: string
  validFrom?: string
  validTo?: string
  applySlots?: ScholarshipApplySlot[]
  audienceTags?: ScholarshipAudienceTag[]
  targetAudience?: string
  eligibilityNotes?: string
  adminNotes?: string
  applicationMethod?: string
  quantityLimit?: number
  /** Số kỳ phân bổ học bổng. */
  termCount?: number
  /** Tiền từng kỳ (kỳ 1 = phần trừ học phí kỳ đầu). */
  termAllocationsVnd?: number[]
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

export async function seedDefaultLeadSources(db: Firestore, orgId: string): Promise<number> {
  const org = orgId.trim()
  if (!org) throw new Error('Thiếu orgId khi nạp nguồn lead.')
  const batch = writeBatch(db)
  let n = 0
  DEFAULT_LEAD_SOURCE_LABELS.forEach((label, i) => {
    const ref = doc(collection(db, FS_COLLECTIONS.leadSources))
    batch.set(ref, {
      orgId: org,
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

export type LeadSourceSavePayload = {
  label: string
  sortOrder: number
  isActive: boolean
  /** Bắt buộc khi tạo mới / luôn ghi để query theo org. */
  orgId: string
  /** Pass null to clear playbook mode. */
  defaultWorkMode?: LeadWorkMode | null
  defaultScoringProfileId?: string | null
  allowProfileSwitchOnList?: boolean
}

export async function saveLeadSourceRow(
  db: Firestore,
  id: string | null,
  payload: LeadSourceSavePayload,
): Promise<string> {
  const org = payload.orgId.trim()
  if (!org) throw new Error('Thiếu orgId khi lưu nguồn lead.')
  const ref = id ? doc(db, FS_COLLECTIONS.leadSources, id) : doc(collection(db, FS_COLLECTIONS.leadSources))
  const now = Timestamp.now()
  const body: Record<string, unknown> = {
    orgId: org,
    label: payload.label.trim(),
    sortOrder: payload.sortOrder,
    isActive: payload.isActive,
    updatedAt: now,
    ...(id ? {} : { createdAt: now }),
  }
  if (payload.defaultWorkMode !== undefined) {
    body.defaultWorkMode = payload.defaultWorkMode ?? deleteField()
  }
  if (payload.defaultScoringProfileId !== undefined) {
    body.defaultScoringProfileId = payload.defaultScoringProfileId
  }
  if (payload.allowProfileSwitchOnList !== undefined) {
    body.allowProfileSwitchOnList = payload.allowProfileSwitchOnList
  }
  await setDoc(ref, body, { merge: true })
  return ref.id
}

export async function saveScholarshipRow(
  db: Firestore,
  id: string | null,
  payload: ScholarshipSavePayload,
): Promise<string> {
  const ref = id ? doc(db, FS_COLLECTIONS.scholarships, id) : doc(collection(db, FS_COLLECTIONS.scholarships))
  const now = Timestamp.now()
  const org = String(payload.orgId ?? '').trim()
  if (!id && !org) throw new Error('Thiếu mã trường khi thêm học bổng.')
  const body: Record<string, unknown> = {
    label: payload.label.trim(),
    category: payload.category,
    amountVnd: Math.max(0, payload.amountVnd),
    sortOrder: payload.sortOrder,
    isActive: payload.isActive,
    updatedAt: now,
    ...(id ? {} : { createdAt: now }),
    ...(org ? { orgId: org } : {}),
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
  const termCount = Math.round(Number(payload.termCount) || 0)
  if (termCount > 0) body.termCount = termCount
  else if (id) body.termCount = null
  if (payload.termAllocationsVnd?.length) {
    body.termAllocationsVnd = payload.termAllocationsVnd.map((n) => Math.max(0, Math.round(Number(n) || 0)))
  } else if (id) body.termAllocationsVnd = null
  const fromArr = (payload.trainingProgramIds ?? []).map((x) => String(x ?? '').trim()).filter(Boolean)
  const single = String(payload.trainingProgramId ?? '').trim()
  const seen = new Set<string>()
  const trainingProgramIds: string[] = []
  for (const raw of [...fromArr, single]) {
    if (!raw || seen.has(raw)) continue
    seen.add(raw)
    trainingProgramIds.push(raw)
  }
  if (trainingProgramIds.length) {
    body.trainingProgramIds = trainingProgramIds
    body.trainingProgramId = trainingProgramIds[0]
  } else if (id) {
    body.trainingProgramIds = null
    body.trainingProgramId = null
  }
  await setDoc(ref, body, { merge: true })
  return ref.id
}
