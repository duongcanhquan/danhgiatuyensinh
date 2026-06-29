import type { Lead } from '../types'

/** Nguồn chính cho chấm điểm / lọc — ưu tiên Nguồn 1 (CRM mới), rồi `source` legacy. */
export function resolveLeadPrimarySource(lead: Pick<Lead, 'source' | 'source1' | 'source2'>): string {
  const source1 = String(lead.source1 ?? '').trim()
  const legacy = String(lead.source ?? '').trim()
  return source1 || legacy
}

/** Các trường nguồn đồng bộ cho engine chấm điểm và export. */
export function leadSourceFieldsForScoring(lead: Pick<Lead, 'source' | 'source1' | 'source2'>): {
  source: string
  leadSource: string
  source1: string
  source2: string
} {
  const source1 = String(lead.source1 ?? '').trim()
  const source2 = String(lead.source2 ?? '').trim()
  const primary = resolveLeadPrimarySource(lead)
  return {
    source: primary,
    leadSource: primary,
    source1,
    source2,
  }
}

/**
 * Giá trị chuỗi một `targetField` trên bản ghi chấm điểm (object phẳng).
 * Dùng chung cho engine chấm điểm, playbook và `leadToEvaluationRecord`.
 */
export function evaluationRecordFieldValue(rec: Record<string, unknown>, field: string): string {
  const f = String(field).trim()
  switch (f) {
    case 'region':
    case 'province':
      return String(rec.province ?? rec.region ?? '')
    case 'customerId':
      return String(rec.customerId ?? '')
    case 'email':
      return String(rec.customerId ?? rec.email ?? '')
    case 'fullName':
      return String(rec.fullName ?? '')
    case 'phone':
      return String(rec.phone ?? '')
    case 'parentPhone':
      return String(rec.parentPhone ?? '')
    case 'source1':
      return String(rec.source1 ?? '').trim()
    case 'source2':
      return String(rec.source2 ?? '').trim()
    case 'source':
    case 'leadSource':
      return String(rec.source1 ?? rec.source ?? rec.leadSource ?? '').trim()
    case 'academicPerformance':
      return String(rec.academicPerformance ?? rec.academicLevel ?? rec.educationLevel ?? '').trim()
    case 'educationLevel': {
      const fmt = String(rec.studyIntention ?? '').trim() || String(rec.educationLevel ?? '').trim()
      return fmt
    }
    case 'major':
    case 'majorInterest':
      return String(rec.majorInterest ?? rec.major ?? rec.educationLevel ?? '').trim()
    case 'academicLevel':
      return String(rec.academicLevel ?? rec.academicPerformance ?? rec.educationLevel ?? '').trim()
    case 'studyIntention': {
      const fmt = String(rec.studyIntention ?? '').trim() || String(rec.educationLevel ?? '').trim()
      return fmt
    }
    case 'ethnicity':
      return String(rec.ethnicity ?? '').trim()
    case 'permanentAddress':
      return String(rec.permanentAddress ?? rec.address ?? '').trim()
    case 'currentResidence':
      return String(rec.currentResidence ?? '').trim()
    case 'schoolType':
      return String(rec.schoolType ?? '')
    case 'schoolTypeKey':
      return String(rec.schoolTypeKey ?? '')
    case 'majorTrainingAlignment':
      return String(rec.majorTrainingAlignment ?? '')
    case 'financialStatus':
      return String(rec.financialStatus ?? '').trim()
    case 'hanoiArea':
      return String(rec.hanoiArea ?? '').trim()
    case 'highSchool':
    case 'highSchoolName':
      return String(rec.highSchool ?? rec.highSchoolName ?? '')
    case 'gradeClass':
      return String(rec.gradeClass ?? '')
    case 'address':
      return String(rec.permanentAddress ?? rec.address ?? '').trim()
    case 'description':
      return String(rec.description ?? '')
    case 'dateOfBirth':
      return String(rec.dateOfBirth ?? '').trim()
    case 'aspirations':
      return String(rec.aspirations ?? '').trim()
    case 'hobbies':
      return String(rec.hobbies ?? '').trim()
    case 'fieldTripNotes':
      return String(rec.fieldTripNotes ?? '').trim()
    case 'profileNote1':
      return String(rec.profileNote1 ?? '').trim()
    case 'profileNote2':
      return String(rec.profileNote2 ?? '').trim()
    case 'otherAttentionNotes':
      return String(rec.otherAttentionNotes ?? '').trim()
    case 'pipelineStatus':
      return String(rec.pipelineStatus ?? '')
    case 'status':
      return String(rec.status ?? '')
    case 'priorityTag':
      return String(rec.priorityTag ?? '')
    case 'assignedTo':
      return rec.assignedTo != null && rec.assignedTo !== '' ? String(rec.assignedTo) : ''
    case 'assignedCounselorId':
      return rec.assignedCounselorId != null && rec.assignedCounselorId !== ''
        ? String(rec.assignedCounselorId)
        : ''
    case 'studentEmail':
      return String(rec.studentEmail ?? '').trim()
    case 'nationalId':
      return String(rec.nationalId ?? '').replace(/\D/g, '')
    case 'systemCode':
      return String(rec.systemCode ?? '').trim()
    case 'fatherName':
      return String(rec.fatherName ?? '').trim()
    case 'fatherPhone':
      return String(rec.fatherPhone ?? '').trim()
    case 'motherName':
      return String(rec.motherName ?? '').trim()
    case 'motherPhone':
      return String(rec.motherPhone ?? '').trim()
    case 'guardian':
      return String(rec.guardian ?? '').trim()
    case 'scholarship1Id':
      return String(rec.scholarship1Id ?? '').trim()
    case 'scholarship2Id':
      return String(rec.scholarship2Id ?? '').trim()
    case 'aiSentimentScore':
      return rec.aiSentimentScore != null ? String(rec.aiSentimentScore) : ''
    default: {
      const v = rec[f]
      if (v === undefined || v === null) return ''
      if (typeof v === 'boolean') return v ? '1' : ''
      return String(v)
    }
  }
}

/**
 * Giá trị chuỗi một «logical field» cho playbook, script hub, và các chỗ cần đồng bộ với
 * `leadToEvaluationRecord` / đọc Firestore (`mapDoc`) — tránh đọc thiếu hoặc gộp nhầm cột.
 */
export function leadSemanticFieldValue(lead: Lead, field: string): string {
  return evaluationRecordFieldValue(lead as unknown as Record<string, unknown>, field)
}
