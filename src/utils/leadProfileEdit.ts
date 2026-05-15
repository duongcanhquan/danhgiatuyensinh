import type { Lead } from '../types'

/** Trường chỉnh trên panel chi tiết — đồng bộ Firestore + chấm điểm qua `leadToEvaluationRecord`. */
export type LeadCoreDraft = {
  fullName: string
  customerId: string
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
}

export function leadToCoreDraft(lead: Lead): LeadCoreDraft {
  return {
    fullName: lead.fullName ?? '',
    customerId: lead.customerId ?? '',
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
