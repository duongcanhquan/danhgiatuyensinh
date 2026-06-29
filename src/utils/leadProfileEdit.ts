import type { Lead, LeadCounselorStatus, LeadPipelineStatus, PriorityTag } from '../types'
import { studyFormatFromParts } from './studyFormatMerge'

/** Trường chỉnh trên panel chi tiết — đồng bộ Firestore + chấm điểm qua `leadToEvaluationRecord`. */
export type LeadCoreDraft = {
  fullName: string
  systemCode: string
  customerId: string
  dateOfBirth: string
  phone: string
  parentPhone: string
  source: string
  province: string
  address: string
  ethnicity: string
  permanentAddress: string
  currentResidence: string
  highSchool: string
  gradeClass: string
  educationLevel: string
  majorInterest: string
  academicPerformance: string
  studyIntention: string
  schoolType: string
  financialStatus: string
  hanoiArea: string
  description: string
  aspirations: string
  hobbies: string
  fieldTripNotes: string
  profileNote1: string
  profileNote2: string
  otherAttentionNotes: string
  nationalId: string
  nationalIdNotAvailable: boolean
  studentEmail: string
  source1: string
  source2: string
  fatherName: string
  fatherPhone: string
  motherName: string
  motherPhone: string
  guardian: string
  scholarship1Id: string
  scholarship2Id: string
}

export function emptyLeadCoreDraft(): LeadCoreDraft {
  return {
    fullName: '',
    systemCode: '',
    customerId: '',
    dateOfBirth: '',
    phone: '',
    parentPhone: '',
    source: '',
    province: '',
    address: '',
    ethnicity: '',
    permanentAddress: '',
    currentResidence: '',
    highSchool: '',
    gradeClass: '',
    educationLevel: '',
    majorInterest: '',
    academicPerformance: '',
    studyIntention: '',
    schoolType: '',
    financialStatus: '',
    hanoiArea: '',
    description: '',
    aspirations: '',
    hobbies: '',
    fieldTripNotes: '',
    profileNote1: '',
    profileNote2: '',
    otherAttentionNotes: '',
    nationalId: '',
    nationalIdNotAvailable: false,
    studentEmail: '',
    source1: '',
    source2: '',
    fatherName: '',
    fatherPhone: '',
    motherName: '',
    motherPhone: '',
    guardian: '',
    scholarship1Id: '',
    scholarship2Id: '',
  }
}

export function leadToCoreDraft(lead: Lead): LeadCoreDraft {
  return {
    fullName: lead.fullName ?? '',
    systemCode: lead.systemCode ?? '',
    customerId: lead.customerId ?? '',
    dateOfBirth: lead.dateOfBirth ?? '',
    phone: lead.phone ?? '',
    parentPhone: lead.parentPhone ?? '',
    source: lead.source1 ?? lead.source ?? '',
    province: lead.province ?? '',
    address: lead.permanentAddress?.trim() || lead.address || '',
    ethnicity: lead.ethnicity ?? '',
    permanentAddress: lead.permanentAddress?.trim() || lead.address || '',
    currentResidence: lead.currentResidence ?? '',
    highSchool: lead.highSchool ?? '',
    gradeClass: lead.gradeClass ?? '',
    ...(() => {
      const fmt = studyFormatFromParts(lead.studyIntention, lead.educationLevel)
      return { educationLevel: fmt, studyIntention: fmt }
    })(),
    majorInterest: lead.majorInterest ?? '',
    academicPerformance: lead.academicPerformance ?? '',
    schoolType: lead.schoolType ?? '',
    financialStatus: lead.financialStatus ?? '',
    hanoiArea: lead.hanoiArea ?? '',
    description: lead.description ?? '',
    aspirations: lead.aspirations ?? '',
    hobbies: lead.hobbies ?? '',
    fieldTripNotes: lead.fieldTripNotes ?? '',
    profileNote1: lead.profileNote1 ?? '',
    profileNote2: lead.profileNote2 ?? '',
    otherAttentionNotes: lead.otherAttentionNotes ?? '',
    nationalId: lead.nationalId ?? '',
    nationalIdNotAvailable: Boolean(lead.nationalIdNotAvailable),
    studentEmail: lead.studentEmail ?? '',
    source1: lead.source1 ?? lead.source ?? '',
    source2: lead.source2 ?? '',
    fatherName: lead.fatherName ?? '',
    fatherPhone: lead.fatherPhone ?? '',
    motherName: lead.motherName ?? '',
    motherPhone: lead.motherPhone ?? '',
    guardian: lead.guardian ?? '',
    scholarship1Id: lead.scholarship1Id ?? '',
    scholarship2Id: lead.scholarship2Id ?? '',
  }
}

function norm(s: string): string {
  return s.trim()
}

function normNationalId(draft: LeadCoreDraft): string {
  if (draft.nationalIdNotAvailable) return ''
  return draft.nationalId.replace(/\D/g, '').slice(0, 10)
}

/** Payload mở rộng cho tạo / cập nhật Firestore (gồm boolean). */
export function leadCoreDraftToFirestoreFields(draft: LeadCoreDraft): Record<string, unknown> {
  const source1 = norm(draft.source1)
  const sourcePrimary = source1 || norm(draft.source)
  const o: Record<string, unknown> = {
    fullName: norm(draft.fullName),
    customerId: norm(draft.customerId),
    ...(norm(draft.systemCode) ? { systemCode: norm(draft.systemCode) } : {}),
    dateOfBirth: norm(draft.dateOfBirth),
    phone: norm(draft.phone),
    parentPhone: norm(draft.parentPhone),
    source: sourcePrimary,
    province: norm(draft.province),
    address: norm(draft.permanentAddress) || norm(draft.address),
    highSchool: norm(draft.highSchool),
    gradeClass: norm(draft.gradeClass),
    ...(() => {
      const fmt = studyFormatFromParts(draft.studyIntention, draft.educationLevel)
      return { educationLevel: fmt, studyIntention: fmt }
    })(),
    description: norm(draft.description),
    nationalIdNotAvailable: draft.nationalIdNotAvailable,
    studentEmail: norm(draft.studentEmail),
    source1,
    source2: norm(draft.source2),
    fatherName: norm(draft.fatherName),
    fatherPhone: norm(draft.fatherPhone),
    motherName: norm(draft.motherName),
    motherPhone: norm(draft.motherPhone),
    guardian: norm(draft.guardian),
    scholarship1Id: norm(draft.scholarship1Id),
    scholarship2Id: norm(draft.scholarship2Id),
  }
  const nid = normNationalId(draft)
  if (draft.nationalIdNotAvailable) o.nationalId = ''
  else if (nid) o.nationalId = nid
  else o.nationalId = ''

  const opt = (k: keyof LeadCoreDraft, key: string) => {
    const v = norm(String(draft[k] ?? ''))
    if (v) o[key] = v
  }
  opt('majorInterest', 'majorInterest')
  opt('academicPerformance', 'academicPerformance')
  opt('ethnicity', 'ethnicity')
  opt('permanentAddress', 'permanentAddress')
  opt('currentResidence', 'currentResidence')
  opt('schoolType', 'schoolType')
  opt('financialStatus', 'financialStatus')
  opt('hanoiArea', 'hanoiArea')
  opt('aspirations', 'aspirations')
  opt('hobbies', 'hobbies')
  opt('fieldTripNotes', 'fieldTripNotes')
  opt('profileNote1', 'profileNote1')
  opt('profileNote2', 'profileNote2')
  opt('otherAttentionNotes', 'otherAttentionNotes')
  return o
}

/**
 * Chỉ các field đổi so với `before` — dùng `updateDoc` (không gửi field không đổi).
 */
export function buildLeadCoreFirestorePatch(before: Lead, draft: LeadCoreDraft): Record<string, unknown> {
  const next = leadCoreDraftToFirestoreFields(draft)
  const patch: Record<string, unknown> = {}
  const keys = Object.keys(next)
  for (const k of keys) {
    const nv = next[k]
    let bv: unknown = (before as unknown as Record<string, unknown>)[k]
    if (k === 'nationalId') {
      bv = before.nationalIdNotAvailable ? '' : (before.nationalId ?? '').replace(/\D/g, '')
      const nn = draft.nationalIdNotAvailable ? '' : normNationalId(draft)
      if (nn !== bv || Boolean(before.nationalIdNotAvailable) !== draft.nationalIdNotAvailable) {
        patch.nationalId = nn
        patch.nationalIdNotAvailable = draft.nationalIdNotAvailable
      }
      continue
    }
    if (k === 'nationalIdNotAvailable') continue
    const bs = typeof bv === 'string' ? bv.trim() : bv
    const ns = typeof nv === 'string' ? nv.trim() : nv
    if (bs !== ns) patch[k] = nv
  }
  if (
    Boolean(before.nationalIdNotAvailable) !== draft.nationalIdNotAvailable &&
    patch.nationalIdNotAvailable === undefined
  ) {
    patch.nationalIdNotAvailable = draft.nationalIdNotAvailable
  }
  return patch
}

export function isCoreDraftDirty(before: Lead, draft: LeadCoreDraft): boolean {
  return Object.keys(buildLeadCoreFirestorePatch(before, draft)).length > 0
}

/** Trường CRM / nhãn chấm điểm trên panel — đồng bộ với playbook & tri thức khi chưa lưu. */
export type LeadDetailMatchOverrides = {
  priorityTag?: PriorityTag
  calculatedScore?: number
  status?: LeadCounselorStatus
  pipelineStatus?: LeadPipelineStatus
}

/** Gộp bản nháp form vào lead — dùng preview chấm điểm trước khi lưu. */
export function mergeCoreDraftIntoLead(lead: Lead, draft: LeadCoreDraft): Lead {
  const base = leadCoreDraftToFirestoreFields(draft)
  const merged: Lead = {
    ...lead,
    ...(base as Partial<Lead>),
    nationalId: draft.nationalIdNotAvailable ? undefined : normNationalId(draft) || undefined,
    nationalIdNotAvailable: draft.nationalIdNotAvailable || undefined,
    majorInterest: norm(draft.majorInterest) || undefined,
    academicPerformance: norm(draft.academicPerformance) || undefined,
    ...(() => {
      const fmt = studyFormatFromParts(draft.studyIntention, draft.educationLevel)
      return {
        educationLevel: fmt || lead.educationLevel,
        studyIntention: fmt || undefined,
      }
    })(),
    ethnicity: norm(draft.ethnicity) || undefined,
    permanentAddress: norm(draft.permanentAddress) || norm(draft.address) || undefined,
    currentResidence: norm(draft.currentResidence) || undefined,
    address: norm(draft.permanentAddress) || norm(draft.address) || lead.address,
    schoolType: norm(draft.schoolType) || undefined,
    financialStatus: norm(draft.financialStatus) || undefined,
    hanoiArea: norm(draft.hanoiArea) || undefined,
    aspirations: norm(draft.aspirations) || undefined,
    hobbies: norm(draft.hobbies) || undefined,
    fieldTripNotes: norm(draft.fieldTripNotes) || undefined,
    profileNote1: norm(draft.profileNote1) || undefined,
    profileNote2: norm(draft.profileNote2) || undefined,
    otherAttentionNotes: norm(draft.otherAttentionNotes) || undefined,
    studentEmail: norm(draft.studentEmail) || undefined,
    source1: norm(draft.source1) || undefined,
    source2: norm(draft.source2) || undefined,
    source: norm(draft.source1) || norm(draft.source) || lead.source,
    fatherName: norm(draft.fatherName) || undefined,
    fatherPhone: norm(draft.fatherPhone) || undefined,
    motherName: norm(draft.motherName) || undefined,
    motherPhone: norm(draft.motherPhone) || undefined,
    guardian: norm(draft.guardian) || undefined,
    scholarship1Id: norm(draft.scholarship1Id) || undefined,
    scholarship2Id: norm(draft.scholarship2Id) || undefined,
    dateOfBirth: norm(draft.dateOfBirth) || undefined,
  }
  return merged
}

/** Lead dùng khớp playbook / tri thức / kịch bản — gồm form hồ sơ + nhãn preview + CRM chưa lưu. */
export function mergeLeadDetailPreview(
  lead: Lead,
  draft: LeadCoreDraft,
  overrides?: LeadDetailMatchOverrides,
): Lead {
  const merged = mergeCoreDraftIntoLead(lead, draft)
  if (!overrides) return merged
  return {
    ...merged,
    ...(overrides.priorityTag !== undefined ? { priorityTag: overrides.priorityTag } : {}),
    ...(overrides.calculatedScore !== undefined ? { calculatedScore: overrides.calculatedScore } : {}),
    ...(overrides.status !== undefined ? { status: overrides.status } : {}),
    ...(overrides.pipelineStatus !== undefined ? { pipelineStatus: overrides.pipelineStatus } : {}),
  }
}
