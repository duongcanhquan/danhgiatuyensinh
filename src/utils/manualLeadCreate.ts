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
import type { Lead, PriorityTag, ScoringProfile } from '../types'
import { FS_COLLECTIONS } from '../types'
import { buildLeadFirestorePayload, type ExcelLeadRow } from './excelLeadMapper'
import { computeLeadUniqueHash, normalizePhoneKey } from './leadIdentity'
import { allocateSystemCodeForNewLead } from './systemLeadCode'
import type { InfoScoreRuntime } from './infoScoreRules'
import type { LeadClassificationRuntime } from './leadClassificationConfig'
import { evaluateLead, evaluationRecordFromLeadLike } from './scoring'
import { evaluateLeadWithClassification, classificationFirestorePatch } from './leadClassificationScore'
import { partialLeadFromExcelRow } from './scoringLeadInput'
import { leadCoreDraftToFirestoreFields, type LeadCoreDraft } from './leadProfileEdit'
import { studyFormatFromParts } from './studyFormatMerge'
import { validateNationalIdInput } from './leadProfileCatalog'
import type { MasterDataBuckets } from './scoring'
import type { ProfileCustomScoringSignal } from '../types'

function norm(s: string): string {
  return s.trim()
}

export function coreDraftToExcelRow(draft: LeadCoreDraft): Partial<ExcelLeadRow> {
  const studyFormat = studyFormatFromParts(draft.studyIntention, draft.educationLevel)
  return {
    customerId: norm(draft.customerId),
    fullName: norm(draft.fullName),
    dateOfBirth: norm(draft.dateOfBirth),
    phone: norm(draft.phone),
    parentPhone: norm(draft.parentPhone),
    source: norm(draft.source1) || norm(draft.source),
    educationLevel: studyFormat,
    majorInterest: norm(draft.majorInterest),
    academicPerformance: norm(draft.academicPerformance),
    studyIntention: studyFormat,
    schoolType: norm(draft.schoolType),
    financialStatus: norm(draft.financialStatus),
    hanoiArea: norm(draft.hanoiArea),
    highSchool: norm(draft.highSchool),
    gradeClass: norm(draft.gradeClass),
    province: norm(draft.province),
    address: norm(draft.permanentAddress) || norm(draft.address),
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
  if (!norm(draft.source1)) {
    return 'Cần chọn Nguồn 1 trước khi lưu hồ sơ mới.'
  }
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
    infoScoreRuntime?: InfoScoreRuntime | null
    classificationRuntime?: LeadClassificationRuntime | null
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

  const record = evaluationRecordFromLeadLike({
    ...partialLeadFromExcelRow(rowWithCode),
    source1: norm(input.draft.source1) || undefined,
    source2: norm(input.draft.source2) || undefined,
    ethnicity: norm(input.draft.ethnicity) || undefined,
    currentResidence: norm(input.draft.currentResidence) || undefined,
    financialStatus: norm(input.draft.financialStatus) || undefined,
    hanoiArea: norm(input.draft.hanoiArea) || undefined,
    profileNote1: norm(input.draft.profileNote1) || undefined,
    profileNote2: norm(input.draft.profileNote2) || undefined,
    otherAttentionNotes: norm(input.draft.otherAttentionNotes) || undefined,
  })

  const ownership = {
    uploadedBy: input.createdByUid,
    uploaderName: input.createdByName,
    uploadBatchId: `manual-${input.createdByUid.slice(0, 8)}-${Date.now()}`,
  }

  const now = Timestamp.now()
  const base = buildLeadFirestorePayload(
    rowWithCode as ExcelLeadRow,
    0,
    'COLD',
    input.assignedCounselorId,
    ownership,
    { uniqueHash: hash },
  )
  const provisionalLead = {
    id: '',
    ...base,
    createdAt: now,
    updatedAt: now,
    uploadedAt: now,
  } as Lead

  const cls = scoring.classificationRuntime?.enabled ? scoring.classificationRuntime : null
  let calculatedScore: number
  let priorityTag: PriorityTag
  let pillarPatch: Partial<Lead> = {}
  if (cls) {
    const r = evaluateLeadWithClassification(
      provisionalLead,
      scoring.profile,
      cls,
      scoring.masterBuckets,
      [...scoring.schoolTvvSignalDefs],
      { infoScoreRuntime: scoring.infoScoreRuntime },
    )
    calculatedScore = r.calculatedScore
    priorityTag = r.priorityTag
    pillarPatch = classificationFirestorePatch(r)
  } else {
    const ev = evaluateLead(record, scoring.profile, scoring.masterBuckets, [...scoring.schoolTvvSignalDefs], {
      infoScoreRuntime: scoring.infoScoreRuntime,
      includeAuxScores: true,
    })
    calculatedScore = ev.calculatedScore
    priorityTag = ev.priorityTag
  }

  const ref = doc(collection(db, FS_COLLECTIONS.leads))
  await setDoc(ref, {
    ...base,
    ...leadCoreDraftToFirestoreFields({ ...input.draft, customerId, systemCode }),
    calculatedScore,
    priorityTag,
    ...pillarPatch,
    createdAt: now,
    updatedAt: now,
    uploadedAt: now,
    lastTouchedAt: now,
  })

  return { id: ref.id }
}
