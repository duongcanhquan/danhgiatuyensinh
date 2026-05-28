import {
  collection,
  doc,
  getDocs,
  limit,
  query,
  setDoc,
  Timestamp,
  where,
  type Firestore,
} from 'firebase/firestore'
import type { ScoringProfile } from '../types'
import { FS_COLLECTIONS } from '../types'
import { buildLeadFirestorePayload, type ExcelLeadRow } from './excelLeadMapper'
import { computeLeadUniqueHash, normalizePhoneKey } from './leadIdentity'
import { allocateSystemCodeForNewLead } from './systemLeadCode'
import { evaluateLead } from './scoring'
import { leadCoreDraftToFirestoreFields, type LeadCoreDraft } from './leadProfileEdit'
import { validateNationalIdInput } from './leadProfileCatalog'
import type { MasterDataBuckets } from './scoring'
import type { ProfileCustomScoringSignal } from '../types'

function norm(s: string): string {
  return s.trim()
}

export function coreDraftToExcelRow(draft: LeadCoreDraft): Partial<ExcelLeadRow> {
  return {
    customerId: norm(draft.customerId),
    fullName: norm(draft.fullName),
    dateOfBirth: norm(draft.dateOfBirth),
    phone: norm(draft.phone),
    parentPhone: norm(draft.parentPhone),
    source: norm(draft.source),
    educationLevel: norm(draft.educationLevel),
    majorInterest: norm(draft.majorInterest),
    academicPerformance: norm(draft.academicPerformance),
    studyIntention: norm(draft.studyIntention),
    schoolType: norm(draft.schoolType),
    financialStatus: norm(draft.financialStatus),
    hanoiArea: norm(draft.hanoiArea),
    highSchool: norm(draft.highSchool),
    gradeClass: norm(draft.gradeClass),
    province: norm(draft.province),
    address: norm(draft.address),
    description: norm(draft.description),
    aspirations: norm(draft.aspirations),
    hobbies: norm(draft.hobbies),
    fieldTripNotes: norm(draft.fieldTripNotes),
    profileNote1: norm(draft.profileNote1),
    profileNote2: norm(draft.profileNote2),
    otherAttentionNotes: norm(draft.otherAttentionNotes),
    assignedToRaw: '',
  }
}

export function validateManualLeadDraft(draft: LeadCoreDraft): string | null {
  const name = norm(draft.fullName)
  const phoneKey = normalizePhoneKey(draft.phone, draft.parentPhone)
  if (!name && phoneKey.length < 9) {
    return 'Nhập ít nhất họ tên hoặc số điện thoại hợp lệ (≥ 9 chữ số).'
  }
  const cccdErr = validateNationalIdInput(draft.nationalId, draft.nationalIdNotAvailable)
  if (cccdErr) return cccdErr
  return null
}

export class DuplicateLeadError extends Error {
  readonly existingId: string

  constructor(existingId: string) {
    super('Đã có hồ sơ trùng trên hệ thống (cùng SĐT hoặc fingerprint).')
    this.name = 'DuplicateLeadError'
    this.existingId = existingId
  }
}

export type CreateManualLeadInput = {
  draft: LeadCoreDraft
  assignedCounselorId: string | null
  createdByUid: string
  createdByName: string
}

async function findExistingLeadIdByHash(db: Firestore, hash: string): Promise<string | null> {
  const snap = await getDocs(
    query(collection(db, FS_COLLECTIONS.leads), where('uniqueHash', '==', hash), limit(1)),
  )
  return snap.docs[0]?.id ?? null
}

export async function createManualLead(
  db: Firestore,
  input: CreateManualLeadInput,
  scoring: {
    profile: ScoringProfile
    masterBuckets: MasterDataBuckets
    schoolTvvSignalDefs: readonly ProfileCustomScoringSignal[]
  },
): Promise<{ id: string }> {
  const validationErr = validateManualLeadDraft(input.draft)
  if (validationErr) throw new Error(validationErr)

  const row = coreDraftToExcelRow(input.draft)
  const customerId = norm(row.customerId ?? '')
  const systemCode = await allocateSystemCodeForNewLead(db)
  const rowWithCode = { ...row, customerId }
  const hash = computeLeadUniqueHash(rowWithCode)
  const existingId = await findExistingLeadIdByHash(db, hash)
  if (existingId) throw new DuplicateLeadError(existingId)

  const record = {
    customerId,
    fullName: row.fullName,
    phone: row.phone,
    parentPhone: row.parentPhone,
    source: row.source,
    educationLevel: row.educationLevel,
    ...(row.majorInterest?.trim() ? { majorInterest: row.majorInterest.trim() } : {}),
    ...(row.academicPerformance?.trim() ? { academicPerformance: row.academicPerformance.trim() } : {}),
    ...(row.schoolType?.trim() ? { schoolType: row.schoolType.trim() } : {}),
    ...(row.studyIntention?.trim() ? { studyIntention: row.studyIntention.trim() } : {}),
    province: row.province,
    highSchool: row.highSchool,
    gradeClass: row.gradeClass,
    address: row.address,
    description: row.description,
    ...(row.aspirations?.trim() ? { aspirations: row.aspirations.trim() } : {}),
    ...(row.hobbies?.trim() ? { hobbies: row.hobbies.trim() } : {}),
    ...(row.fieldTripNotes?.trim() ? { fieldTripNotes: row.fieldTripNotes.trim() } : {}),
  } as Record<string, unknown>

  const { calculatedScore, priorityTag } = evaluateLead(
    record,
    scoring.profile,
    scoring.masterBuckets,
    [...scoring.schoolTvvSignalDefs],
  )

  const ownership = {
    uploadedBy: input.createdByUid,
    uploaderName: input.createdByName,
    uploadBatchId: `manual-${input.createdByUid.slice(0, 8)}-${Date.now()}`,
  }

  const base = buildLeadFirestorePayload(
    rowWithCode as ExcelLeadRow,
    calculatedScore,
    priorityTag,
    input.assignedCounselorId,
    ownership,
    { uniqueHash: hash },
  )

  const now = Timestamp.now()
  const ref = doc(collection(db, FS_COLLECTIONS.leads))
  await setDoc(ref, {
    ...base,
    ...leadCoreDraftToFirestoreFields({ ...input.draft, customerId, systemCode }),
    createdAt: now,
    updatedAt: now,
    uploadedAt: now,
    lastTouchedAt: now,
  })

  return { id: ref.id }
}
