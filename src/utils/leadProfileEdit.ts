import type { Lead, LeadCounselorStatus, LeadPipelineStatus, PriorityTag } from '../types'

/** Trường chỉnh trên panel chi tiết — đồng bộ Firestore + chấm điểm qua `leadToEvaluationRecord`. */
export type LeadCoreDraft = {
  fullName: string
  customerId: string
  dateOfBirth: string
  phone: string
  parentPhone: string
  source: string
  province: string
  address: string
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
}

export function leadToCoreDraft(lead: Lead): LeadCoreDraft {
  return {
    fullName: lead.fullName ?? '',
    customerId: lead.customerId ?? '',
    dateOfBirth: lead.dateOfBirth ?? '',
    phone: lead.phone ?? '',
    parentPhone: lead.parentPhone ?? '',
    source: lead.source ?? '',
    province: lead.province ?? '',
    address: lead.address ?? '',
    highSchool: lead.highSchool ?? '',
    gradeClass: lead.gradeClass ?? '',
    educationLevel: lead.educationLevel ?? '',
    majorInterest: lead.majorInterest ?? '',
    academicPerformance: lead.academicPerformance ?? '',
    studyIntention: lead.studyIntention ?? '',
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
  }
}

function norm(s: string): string {
  return s.trim()
}

/**
 * Chỉ các field đổi so với `before` — dùng `updateDoc` (không gửi field không đổi).
 * Chuỗi tùy chọn: gửi `''` khi xoá nội dung (Firestore chấp nhận).
 */
export function buildLeadCoreFirestorePatch(before: Lead, draft: LeadCoreDraft): Record<string, unknown> {
  const patch: Record<string, unknown> = {}
  const fields: (keyof LeadCoreDraft)[] = [
    'fullName',
    'customerId',
    'dateOfBirth',
    'phone',
    'parentPhone',
    'source',
    'province',
    'address',
    'highSchool',
    'gradeClass',
    'educationLevel',
    'majorInterest',
    'academicPerformance',
    'studyIntention',
    'schoolType',
    'financialStatus',
    'hanoiArea',
    'description',
    'aspirations',
    'hobbies',
    'fieldTripNotes',
    'profileNote1',
    'profileNote2',
    'otherAttentionNotes',
  ]
  for (const k of fields) {
    if (norm(draft[k]) !== norm(String(before[k as keyof Lead] ?? ''))) {
      patch[k] = norm(draft[k])
    }
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
  return {
    ...lead,
    fullName: norm(draft.fullName),
    customerId: norm(draft.customerId),
    dateOfBirth: norm(draft.dateOfBirth) || undefined,
    phone: norm(draft.phone),
    parentPhone: norm(draft.parentPhone),
    source: norm(draft.source),
    province: norm(draft.province),
    address: norm(draft.address),
    highSchool: norm(draft.highSchool),
    gradeClass: norm(draft.gradeClass),
    educationLevel: norm(draft.educationLevel),
    majorInterest: norm(draft.majorInterest) || undefined,
    academicPerformance: norm(draft.academicPerformance) || undefined,
    studyIntention: norm(draft.studyIntention) || undefined,
    schoolType: norm(draft.schoolType) || undefined,
    financialStatus: norm(draft.financialStatus) || undefined,
    hanoiArea: norm(draft.hanoiArea) || undefined,
    description: norm(draft.description),
    aspirations: norm(draft.aspirations) || undefined,
    hobbies: norm(draft.hobbies) || undefined,
    fieldTripNotes: norm(draft.fieldTripNotes) || undefined,
    profileNote1: norm(draft.profileNote1) || undefined,
    profileNote2: norm(draft.profileNote2) || undefined,
    otherAttentionNotes: norm(draft.otherAttentionNotes) || undefined,
  }
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
