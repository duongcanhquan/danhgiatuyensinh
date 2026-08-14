import {
  collection,
  doc,
  setDoc,
  Timestamp,
  type Firestore,
} from 'firebase/firestore'
import type { Lead, LeadSourceRecord, LeadWorkMode, PriorityTag, ScoringProfile } from '../types'
import { FS_COLLECTIONS } from '../types'
import { buildLeadFirestorePayload, type ExcelLeadRow } from './excelLeadMapper'
import { computeLeadUniqueHash, nationalIdHashFromInput, normalizePhoneKey } from './leadIdentity'
import {
  findExistingLeadIdByNationalIdHash,
  findExistingLeadIdByUniqueHash,
} from './leadDedupeLookup'
import { allocateSystemCodeForNewLead } from './systemLeadCode'
import type { InfoScoreRuntime } from './infoScoreRules'
import type { LeadClassificationRuntime } from './leadClassificationConfig'
import { evaluateLead, evaluationRecordFromLeadLike } from './scoring'
import { evaluateLeadWithClassification, classificationFirestorePatch } from './leadClassificationScore'
import { partialLeadFromExcelRow } from './scoringLeadInput'
import { leadCoreDraftToFirestoreFields, type LeadCoreDraft } from './leadProfileEdit'
import { studyFormatFromParts } from './studyFormatMerge'
import type { MasterDataBuckets } from './scoring'
import type { ProfileCustomScoringSignal } from '../types'
import { resolveWorkModeForLeadIntake } from './leadWorkMode'
import {
  isValidPublicDob,
  isValidPublicNationalId,
  isValidPublicPhone,
} from './publicRegistrationForm'

function norm(s: string): string {
  return s.trim()
}

export function coreDraftToExcelRow(draft: LeadCoreDraft): Partial<ExcelLeadRow> {
  const studyFormat = studyFormatFromParts(draft.studyIntention, draft.educationLevel)
  return {
    customerId: norm(draft.customerId),
    fullName: norm(draft.fullName),
    dateOfBirth: norm(draft.dateOfBirth),
    gender: norm(draft.gender),
    phone: norm(draft.phone),
    parentPhone: norm(draft.parentPhone),
    source: norm(draft.source1) || norm(draft.source),
    educationLevel: studyFormat,
    majorInterest: norm(draft.majorInterest),
    academicPerformance: norm(draft.academicPerformance),
    graduationScore: norm(draft.graduationScore),
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
    studentEmail: norm(draft.studentEmail),
    assignedToRaw: '',
  }
}

export function manualLeadCreatedOriginFields(): {
  intakeOrigin: 'public_portal'
  registrationChannel: 'public_portal'
} {
  return { intakeOrigin: 'public_portal', registrationChannel: 'public_portal' }
}

export function validateManualLeadDraft(draft: LeadCoreDraft): string | null {
  if (!norm(draft.fullName)) return 'Vui lòng nhập họ và tên.'
  if (!isValidPublicDob(draft.dateOfBirth)) {
    return 'Ngày sinh cần đúng DD/MM/YYYY và tuổi hợp lý (12–70).'
  }
  const gender = norm(draft.gender)
  if (gender !== 'Nam' && gender !== 'Nữ') return 'Vui lòng chọn giới tính Nam hoặc Nữ.'
  if (!norm(draft.placeOfBirth)) return 'Vui lòng nhập nơi sinh.'
  if (!norm(draft.ethnicity)) return 'Vui lòng nhập dân tộc.'
  if (!isValidPublicNationalId(draft.nationalId, draft.nationalIdNotAvailable)) {
    return 'CCCD/CMND: 9, 10 hoặc 12 số; hộ chiếu 7–15 ký tự chữ và số (hoặc tick «Chưa có CCCD»).'
  }
  if (!isValidPublicPhone(draft.phone)) {
    return 'SĐT Việt Nam 10 số (bắt đầu 0) hoặc quốc tế bắt đầu bằng +.'
  }
  const email = norm(draft.studentEmail)
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return 'Email không hợp lệ.'
  if (!norm(draft.permanentAddress) && !norm(draft.address)) {
    return 'Vui lòng nhập địa chỉ thường trú.'
  }
  const motherOrContact = norm(draft.motherPhone) || norm(draft.parentPhone)
  if (!isValidPublicPhone(motherOrContact)) {
    return 'SĐT mẹ hoặc điện thoại người liên hệ bắt buộc (10 số VN hoặc + quốc tế).'
  }
  if (norm(draft.fatherPhone) && !isValidPublicPhone(draft.fatherPhone)) {
    return 'SĐT cha không hợp lệ.'
  }
  if (!norm(draft.highSchool)) return 'Vui lòng nhập trường đã theo học.'
  if (!norm(draft.province)) return 'Vui lòng nhập tỉnh/thành.'
  if (!norm(draft.applicantCategory)) return 'Vui lòng chọn đối tượng dự tuyển.'
  if (!norm(draft.studyIntention) && !norm(draft.educationLevel)) {
    return 'Vui lòng chọn hệ đào tạo.'
  }
  if (!norm(draft.majorInterest)) return 'Vui lòng chọn ngành học.'
  if (!norm(draft.academicPerformance)) return 'Vui lòng chọn học lực.'
  if (!norm(draft.source1)) {
    return 'Cần nguồn tiếp nhận (Nguồn 1) trước khi lưu hồ sơ mới.'
  }
  return null
}

export class DuplicateLeadError extends Error {
  readonly existingId: string
  readonly reason: 'phone' | 'nationalId' | 'fingerprint'

  constructor(existingId: string, reason: 'phone' | 'nationalId' | 'fingerprint' = 'fingerprint') {
    const msg =
      reason === 'nationalId'
        ? 'Đã có hồ sơ trùng trên hệ thống (cùng CCCD/Passport).'
        : reason === 'phone'
          ? 'Đã có hồ sơ trùng trên hệ thống (cùng số điện thoại).'
          : 'Đã có hồ sơ trùng trên hệ thống (cùng SĐT hoặc fingerprint).'
    super(msg)
    this.name = 'DuplicateLeadError'
    this.existingId = existingId
    this.reason = reason
  }
}

export type CreateManualLeadInput = {
  draft: LeadCoreDraft
  assignedCounselorId: string | null
  createdByUid: string
  createdByName: string
  /** School tenant — required Phase 1 */
  orgId: string
  /** Explicit workMode, or omit to resolve from leadSources by source1. */
  workMode?: LeadWorkMode
  /** Catalog used when workMode is not passed explicitly. */
  leadSources?: readonly Pick<LeadSourceRecord, 'label' | 'defaultWorkMode'>[]
}

async function findExistingLeadIdByHash(db: Firestore, hash: string, orgId: string): Promise<string | null> {
  return findExistingLeadIdByUniqueHash(db, hash, orgId)
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

  const motherOrContact = norm(input.draft.motherPhone) || norm(input.draft.parentPhone)
  const draft: LeadCoreDraft = {
    ...input.draft,
    motherPhone: motherOrContact,
    parentPhone: norm(input.draft.parentPhone) || motherOrContact,
  }

  const row = coreDraftToExcelRow(draft)
  const customerId = norm(row.customerId ?? '')
  const systemCode = await allocateSystemCodeForNewLead(db)
  const rowWithCode = { ...row, customerId }
  const hash = computeLeadUniqueHash(rowWithCode)
  const existingId = await findExistingLeadIdByHash(db, hash, input.orgId)
  if (existingId) {
    const phoneKey = normalizePhoneKey(draft.phone, draft.parentPhone)
    throw new DuplicateLeadError(existingId, phoneKey.length >= 9 ? 'phone' : 'fingerprint')
  }

  const nidHash = nationalIdHashFromInput(draft.nationalId, draft.nationalIdNotAvailable)
  if (nidHash) {
    const existingById = await findExistingLeadIdByNationalIdHash(db, nidHash, input.orgId)
    if (existingById) throw new DuplicateLeadError(existingById, 'nationalId')
  }

  const record = evaluationRecordFromLeadLike({
    ...partialLeadFromExcelRow(rowWithCode),
    source1: norm(draft.source1) || undefined,
    source2: norm(draft.source2) || undefined,
    ethnicity: norm(draft.ethnicity) || undefined,
    currentResidence: norm(draft.currentResidence) || undefined,
    financialStatus: norm(draft.financialStatus) || undefined,
    hanoiArea: norm(draft.hanoiArea) || undefined,
    profileNote1: norm(draft.profileNote1) || undefined,
    profileNote2: norm(draft.profileNote2) || undefined,
    otherAttentionNotes: norm(draft.otherAttentionNotes) || undefined,
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
    { uniqueHash: hash, ...(nidHash ? { nationalIdHash: nidHash } : {}) },
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
  const source1 = norm(draft.source1) || norm(draft.source)
  const workMode = resolveWorkModeForLeadIntake({
    workMode: input.workMode,
    source1,
    sources: input.leadSources,
  })
  await setDoc(ref, {
    ...base,
    ...leadCoreDraftToFirestoreFields({ ...draft, customerId, systemCode }),
    orgId: input.orgId,
    calculatedScore,
    priorityTag,
    ...pillarPatch,
    ...(workMode ? { workMode } : {}),
    ...manualLeadCreatedOriginFields(),
    createdAt: now,
    updatedAt: now,
    uploadedAt: now,
    lastTouchedAt: now,
  })

  const { dispatchOutboundEvent } = await import('../integrations/dispatchOutbound')
  const { triggerCommsAutomation } = await import('./commsAutomationDispatch')
  const email =
    String(draft.studentEmail ?? '').trim() ||
    (customerId.includes('@') ? customerId : undefined)
  const payload = {
    leadId: ref.id,
    fullName: draft.fullName,
    phone: draft.phone,
    email,
    assignedTo: input.assignedCounselorId,
  }
  void dispatchOutboundEvent({
    orgId: input.orgId,
    event: 'lead.created',
    payload,
  }).catch((e) => console.warn('[lead.created hub]', e))
  triggerCommsAutomation(input.orgId, 'lead.created', {
    id: ref.id,
    fullName: draft.fullName,
    phone: draft.phone,
    email,
    parentPhone: draft.parentPhone,
    majorInterest: draft.majorInterest,
    province: draft.province,
    highSchool: draft.highSchool,
    source: draft.source1 || draft.source,
  })

  return { id: ref.id }
}
