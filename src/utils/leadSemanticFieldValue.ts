import type { Lead } from '../types'

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
    case 'source':
    case 'leadSource':
      return String(rec.source ?? rec.leadSource ?? '')
    case 'educationLevel':
      return String(rec.educationLevel ?? '')
    case 'major':
    case 'majorInterest':
      return String(rec.majorInterest ?? rec.major ?? rec.educationLevel ?? '').trim()
    case 'academicLevel':
      return String(rec.academicLevel ?? rec.academicPerformance ?? rec.educationLevel ?? '').trim()
    case 'studyIntention':
      return String(rec.studyIntention ?? '').trim()
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
      return String(rec.address ?? '')
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
